# backend/app/services/band_synthesizer.py
# MAESTRO — Pure-Python Band Synthesizer (No FluidSynth required)
#
# Uses additive synthesis (sine/sawtooth/triangle waves) with ADSR envelopes
# to emulate different instruments. This runs on ANY server without system libs.
#
# Instrument models:
#   Piano    — bright attack, rapid decay, moderate sustain
#   Guitar   — plucked (Karplus–Strong algorithm) 
#   Tabla    — pitched drum with exponential decay
#   Sitar    — nasal, buzzy timbre via sawtooth + harmonics
#   Strings  — slow attack, bowing model via sawtooth
#   Flute    — breathy sine + slight vibrato
#
# FluidSynth is still attempted first; falls back to pure Python if unavailable.

import io
import os
import base64
import math
import struct
import wave
from typing import Dict, List, Optional

import numpy as np

try:
    from pydub import AudioSegment
    PYDUB_OK = True
except ImportError:
    PYDUB_OK = False

try:
    import fluidsynth
    FLUID_OK = True
except ImportError:
    FLUID_OK = False

SR = 44100   # sample rate


# ─── Arrangement definitions ──────────────────────────────────────────────────
ARRANGEMENTS = [
    {
        "id":    "bollywood_pop",
        "label": "Output A",
        "emoji": "🎬",
        "desc":  "Piano · Tabla · Strings",
        "color": "#FF6B35",
        "metadata": {"tempo": 102, "feel": "energetic", "instruments": ["Piano", "Tabla", "Strings"]}
    },
    {
        "id":    "folk",
        "label": "Output B",
        "emoji": "🎸",
        "desc":  "Guitar · Flute · Bass",
        "color": "#4CAF50",
        "metadata": {"tempo": 90, "feel": "acoustic", "instruments": ["Guitar", "Flute", "Bass"]}
    },
    {
        "id":    "lofi",
        "label": "Output C",
        "emoji": "🌙",
        "desc":  "Electric Piano · Pad · Bass",
        "color": "#7C4DFF",
        "metadata": {"tempo": 76, "feel": "chill", "instruments": ["Electric Piano", "Pad", "Bass"]}
    },
    {
        "id":    "classical_teentaal",
        "label": "Output D",
        "emoji": "🪗",
        "desc":  "Sitar · Tabla · Tanpura",
        "color": "#FF9800",
        "metadata": {"tempo": 110, "feel": "classical", "instruments": ["Sitar", "Tabla", "Tanpura"]}
    },
    {
        "id":    "classical_ektal",
        "label": "Output E",
        "emoji": "🪕",
        "desc":  "Sitar · Tabla (12-beat)",
        "color": "#FF5722",
        "metadata": {"tempo": 85, "feel": "classical", "instruments": ["Sitar", "Tabla"]}
    },
    {
        "id":    "orchestral",
        "label": "Output F",
        "emoji": "🎻",
        "desc":  "Strings · Piano · Brass",
        "color": "#2196F3",
        "metadata": {"tempo": 95, "feel": "epic", "instruments": ["Strings", "Piano", "Brass"]}
    },
    {
        "id":    "rnb",
        "label": "Output G",
        "emoji": "✨",
        "desc":  "Keys · Bass · Pad",
        "color": "#E91E63",
        "metadata": {"tempo": 88, "feel": "smooth", "instruments": ["Electric Piano", "Bass", "Drums"]}
    },
]


# ─── ADSR envelope ───────────────────────────────────────────────────────────
def _adsr(n_samples: int, attack: float, decay: float, sustain: float,
           release: float, sr: int = SR) -> np.ndarray:
    env = np.ones(n_samples)
    a = int(attack * sr);  d = int(decay * sr);  r = int(release * sr)
    s_start = a + d;       s_end = max(s_start, n_samples - r)
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if d > 0 and a + d <= n_samples:
        env[a:a+d] = np.linspace(1, sustain, d)
    env[s_start:s_end] = sustain
    if r > 0 and s_end < n_samples:
        env[s_end:] = np.linspace(sustain, 0, n_samples - s_end)
    return env


# ─── Individual instrument synthesizers ─────────────────────────────────────
def _synth_piano(freq: float, duration: float, velocity: float = 0.7) -> np.ndarray:
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    # Piano: fundamental + harmonics with brightness
    wave = (np.sin(2*np.pi*freq*t) * 0.6 +
            np.sin(2*np.pi*freq*2*t) * 0.25 +
            np.sin(2*np.pi*freq*3*t) * 0.1 +
            np.sin(2*np.pi*freq*4*t) * 0.05)
    env = _adsr(n, 0.003, 0.15, 0.4, 0.3)
    return wave * env * velocity


def _synth_guitar(freq: float, duration: float, velocity: float = 0.7) -> np.ndarray:
    """Karplus-Strong plucked string synthesis."""
    n = int(duration * SR)
    delay = int(SR / freq)
    buf = np.random.randn(delay) * 0.5
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % delay]
        buf[i % delay] = 0.996 * 0.5 * (buf[i % delay] + buf[(i + 1) % delay])
    return out * velocity


def _synth_tabla(freq: float, duration: float, velocity: float = 0.8) -> np.ndarray:
    """Tabla: pitched membrane drum — quick decay, characteristic ring."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    # Sweeping pitch for 'baya' effect
    pitch_sweep = freq * np.exp(-8 * t)
    wave = np.sin(2 * np.pi * np.cumsum(pitch_sweep) / SR)
    env = np.exp(-12 * t)
    return wave * env * velocity


def _synth_sitar(freq: float, duration: float, velocity: float = 0.65) -> np.ndarray:
    """Sitar: nasal, buzzy timbre with sympathetic string shimmer."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    # Buzz = many close harmonics
    wave = sum(np.sin(2*np.pi*freq*k*t) / k for k in range(1, 12))
    # Sympathetic shimmer (drone strings)
    shimmer = 0.15 * np.sin(2*np.pi*freq*1.01*t) + 0.1 * np.sin(2*np.pi*freq*0.99*t)
    env = _adsr(n, 0.005, 0.08, 0.3, 0.5)
    return (wave + shimmer) * env * velocity * 0.15


def _synth_strings(freq: float, duration: float, velocity: float = 0.65) -> np.ndarray:
    """Bowed strings: slow attack, sawtooth timbre."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    # Sawtooth = rich harmonics
    saw = 2 * (t * freq - np.floor(t * freq + 0.5))
    # Subtle vibrato
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.5 * t)
    wave = saw * vib
    env = _adsr(n, 0.18, 0.1, 0.7, 0.4)
    return wave * env * velocity * 0.4


def _synth_flute(freq: float, duration: float, velocity: float = 0.6) -> np.ndarray:
    """Flute: breathy sine with gentle vibrato."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 4.5 * t)
    wave = (np.sin(2*np.pi*freq*vib*t) * 0.7 +
            np.sin(2*np.pi*freq*2*t) * 0.2 +
            np.random.randn(n) * 0.03)  # breath noise
    env = _adsr(n, 0.06, 0.05, 0.75, 0.25)
    return wave * env * velocity


def _synth_bass(freq: float, duration: float, velocity: float = 0.8) -> np.ndarray:
    """Electric bass: rounded bottom, fast attack."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    wave = (np.sin(2*np.pi*freq*t) * 0.7 +
            np.sin(2*np.pi*freq*2*t) * 0.2 +
            np.sin(2*np.pi*freq*3*t) * 0.1)
    env = _adsr(n, 0.01, 0.1, 0.6, 0.2)
    return wave * env * velocity


def _synth_brass(freq: float, duration: float, velocity: float = 0.7) -> np.ndarray:
    """Brass: bright sawtooth with medium attack."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    saw = sum(np.sin(2*np.pi*freq*k*t) / k for k in range(1, 8))
    env = _adsr(n, 0.04, 0.08, 0.7, 0.15)
    return saw * env * velocity * 0.15


def _synth_pad(freq: float, duration: float, velocity: float = 0.5) -> np.ndarray:
    """Warm pad: slow attack, detuned sines."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    wave = (np.sin(2*np.pi*freq*1.00*t) * 0.5 +
            np.sin(2*np.pi*freq*1.003*t) * 0.3 +
            np.sin(2*np.pi*freq*0.997*t) * 0.2)
    env = _adsr(n, 0.35, 0.1, 0.75, 0.4)
    return wave * env * velocity * 0.5


def _synth_drum_kick(duration: float, velocity: float = 0.9) -> np.ndarray:
    """Kick drum: sine-sweep with heavy decay."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    freq_sweep = 80 * np.exp(-30 * t) + 40
    wave = np.sin(2 * np.pi * np.cumsum(freq_sweep) / SR)
    env = np.exp(-10 * t)
    return wave * env * velocity


def _synth_drum_snare(duration: float, velocity: float = 0.7) -> np.ndarray:
    """Snare: noise burst with pitched snap."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)
    noise = np.random.randn(n)
    snap  = np.sin(2*np.pi*200*t)
    env   = np.exp(-25 * t)
    return (noise * 0.7 + snap * 0.3) * env * velocity


# Instrument key → synth function + octave mapping
SYNTH_MAP = {
    'keys':          lambda f, d: _synth_piano(f, d),
    'piano':         lambda f, d: _synth_piano(f, d),
    'electric_piano':lambda f, d: _synth_piano(f, d, 0.65),
    'guitar':        lambda f, d: _synth_guitar(f, d),
    'acoustic_guitar': lambda f, d: _synth_guitar(f, d),
    'tabla':         lambda f, d: _synth_tabla(f, d),
    'sitar':         lambda f, d: _synth_sitar(f, d),
    'strings':       lambda f, d: _synth_strings(f, d),
    'flute':         lambda f, d: _synth_flute(f, d),
    'bass':          lambda f, d: _synth_bass(f / 2, d),  # bass is one octave lower
    'brass':         lambda f, d: _synth_brass(f, d),
    'pad':           lambda f, d: _synth_pad(f, d),
    'tanpura':       lambda f, d: _synth_pad(f / 2, d, 0.4),  # drone
}


# ─── Note → frequency ─────────────────────────────────────────────────────────
NOTE_FREQS = {
    'C': 261.63, 'C#': 277.18, 'Db': 277.18,
    'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'Gb': 369.99,
    'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
    'A': 440.00, 'A#': 466.16, 'Bb': 466.16,
    'B': 493.88,
}

def _chord_to_freqs(chord: str) -> List[float]:
    """Parse chord string to list of frequencies (root + 3rd + 5th)."""
    root = chord.replace('m', '').replace('7', '').replace('maj', '').replace('sus', '').strip()
    is_minor = 'm' in chord and 'maj' not in chord
    root_freq = NOTE_FREQS.get(root, 261.63)
    third = root_freq * (2 ** ((3 if is_minor else 4) / 12))
    fifth = root_freq * (2 ** (7 / 12))
    return [root_freq, third, fifth]


# ─── Generate backing track for one arrangement ───────────────────────────────
def _generate_backing_track(
    chord_sequence: List[Dict],
    arrangement_id: str,
    bpm: int,
    duration_sec: float,
    user_instruments: Optional[List[str]] = None,
) -> np.ndarray:
    """
    Generate a full backing track as numpy array.
    Uses pure Python additive synthesis — no FluidSynth needed.
    """
    n_samples = int(duration_sec * SR)
    mix = np.zeros(n_samples)

    # Determine instruments for this arrangement
    arrangement_instrument_map = {
        'bollywood_pop':     ['keys', 'tabla', 'strings'],
        'folk':              ['guitar', 'flute', 'bass'],
        'lofi':              ['electric_piano', 'pad', 'bass'],
        'classical_teentaal':['sitar', 'tabla', 'tanpura'],
        'classical_ektal':   ['sitar', 'tabla'],
        'orchestral':        ['strings', 'keys', 'brass'],
        'rnb':               ['electric_piano', 'bass', 'pad'],
    }

    instruments = user_instruments or arrangement_instrument_map.get(arrangement_id, ['keys'])

    # Rhythm patterns in beats (offset within beat, velocity)
    beat_sec = 60.0 / bpm
    bar_sec  = beat_sec * 4

    # Chord sequence fallback
    if not chord_sequence:
        chord_sequence = [
            {"chord": "C", "start": 0, "end": duration_sec / 4},
            {"chord": "G", "start": duration_sec / 4, "end": duration_sec / 2},
            {"chord": "Am", "start": duration_sec / 2, "end": 3 * duration_sec / 4},
            {"chord": "F", "start": 3 * duration_sec / 4, "end": duration_sec},
        ]

    # Tabla/drum patterns (beat offsets in seconds within a bar)
    tabla_pattern = [0, beat_sec * 0.5, beat_sec, beat_sec * 1.5,
                     beat_sec * 2, beat_sec * 2.5, beat_sec * 3, beat_sec * 3.5]
    kick_pattern  = [0, beat_sec * 2]
    snare_pattern = [beat_sec, beat_sec * 3]

    for instr in instruments:
        instr_key = instr.lower().replace(' ', '_')
        synth_fn  = SYNTH_MAP.get(instr_key)
        if not synth_fn:
            # Fuzzy match
            for k in SYNTH_MAP:
                if k in instr_key or instr_key in k:
                    synth_fn = SYNTH_MAP[k]
                    break
        if not synth_fn:
            continue

        is_percussion = instr_key in ('tabla', 'drums', 'kick', 'snare')

        # Determine chord pattern timing
        for chord_info in chord_sequence:
            c_start = chord_info.get("start", 0)
            c_end   = min(chord_info.get("end", c_start + beat_sec * 4), duration_sec)
            chord   = chord_info.get("chord", "C")
            freqs   = _chord_to_freqs(chord)
            c_dur   = c_end - c_start

            if is_percussion and instr_key == 'tabla':
                # Play tabla pattern over the chord duration
                bar_start = c_start
                while bar_start < c_end:
                    for offset in tabla_pattern:
                        t_pos = bar_start + offset
                        if t_pos >= c_end:
                            break
                        note_dur = min(0.15, c_end - t_pos)
                        velocity = 0.7 if (offset == 0) else 0.5
                        note_samples = _synth_tabla(freqs[0], note_dur, velocity)
                        start_idx = int(t_pos * SR)
                        end_idx   = min(start_idx + len(note_samples), n_samples)
                        mix[start_idx:end_idx] += note_samples[:end_idx - start_idx] * 0.6
                    bar_start += bar_sec
            else:
                # Harmonic instrument: play chord tones
                # Bass plays root, others play full chord
                if 'bass' in instr_key:
                    note_freqs_to_play = [freqs[0] / 2]  # root, octave down
                    note_dur = c_dur * 0.9
                    start_times = [c_start, c_start + c_dur * 0.5]
                else:
                    note_freqs_to_play = freqs
                    # Arpeggiate or strum based on instrument
                    if 'guitar' in instr_key:
                        start_times = [c_start + i * 0.025 for i in range(len(freqs))]
                        note_dur = c_dur * 0.85
                    elif 'tabla' not in instr_key and instr_key in ('sitar',):
                        note_dur = c_dur * 0.6
                        start_times = [c_start + i * beat_sec * 0.5 for i in range(min(4, int(c_dur / (beat_sec * 0.5))))]
                    else:
                        note_dur = c_dur * 0.9
                        start_times = [c_start]

                for st in start_times:
                    if st >= duration_sec:
                        break
                    actual_dur = min(note_dur, duration_sec - st)
                    if actual_dur < 0.05:
                        continue
                    for freq in note_freqs_to_play:
                        note_arr = synth_fn(freq, actual_dur)
                        start_idx = int(st * SR)
                        end_idx   = min(start_idx + len(note_arr), n_samples)
                        mix[start_idx:end_idx] += note_arr[:end_idx - start_idx] * 0.35

    # Normalise
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.7
    return mix


def _ndarray_to_wav_bytes(arr: np.ndarray, sr: int = SR) -> bytes:
    """Convert float32 numpy array to 16-bit WAV bytes."""
    arr16 = (np.clip(arr, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(arr16.tobytes())
    return buf.getvalue()


# ─── Mix vocals + backing ─────────────────────────────────────────────────────
def _mix_vocal_with_backing(
    vocal_bytes:   bytes,
    backing_arr:   np.ndarray,
    vocal_vol:     float = 0.75,
    backing_vol:   float = 0.55,
) -> bytes:
    """Mix vocal bytes (any format) with backing numpy array. Returns WAV bytes."""
    try:
        if PYDUB_OK:
            vocal_seg = AudioSegment.from_file(io.BytesIO(vocal_bytes))
            vocal_seg = vocal_seg.set_frame_rate(SR).set_channels(1).set_sample_width(2)
            vocal_arr = np.array(vocal_seg.get_array_of_samples(), dtype=np.float32) / 32768.0
        else:
            import soundfile as sf
            vocal_arr, _ = sf.read(io.BytesIO(vocal_bytes), dtype='float32')
            if vocal_arr.ndim > 1:
                vocal_arr = vocal_arr.mean(axis=1)
    except Exception as e:
        print(f"[Mix] Could not load vocal: {e} — using backing track only")
        return _ndarray_to_wav_bytes(backing_arr)

    # Match lengths
    n = max(len(vocal_arr), len(backing_arr))
    v = np.zeros(n, dtype=np.float32);  v[:len(vocal_arr)]   = vocal_arr * vocal_vol
    b = np.zeros(n, dtype=np.float32);  b[:len(backing_arr)] = backing_arr * backing_vol

    mixed = v + b
    peak = np.max(np.abs(mixed))
    if peak > 0.98:
        mixed = mixed * (0.98 / peak)

    return _ndarray_to_wav_bytes(mixed)


# ─── Main public API ─────────────────────────────────────────────────────────
async def generate_all_arrangements(
    vocal_bytes:          bytes,
    chord_sequence:       List[Dict],
    bpm:                  int = 90,
    duration_sec:         float = 30.0,
    selected_styles:      Optional[List[str]] = None,
    selected_instruments: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Generate multiple arrangement versions.
    Each arrangement has distinct instrumentation — fully functional even without FluidSynth.
    """
    styles_to_generate = selected_styles or [a["id"] for a in ARRANGEMENTS]

    # Map frontend keys to readable names
    instr_label_map = {
        'keys':'Piano','guitar':'Guitar','tabla':'Tabla',
        'flute':'Flute','sitar':'Sitar','strings':'Strings','bass':'Bass',
        'electric_piano':'Electric Piano','pad':'Pad','brass':'Brass',
    }
    user_instr_labels = (
        [instr_label_map.get(i.lower(), i.capitalize()) for i in selected_instruments]
        if selected_instruments else None
    )

    results = []

    for arr in ARRANGEMENTS:
        if arr["id"] not in styles_to_generate:
            continue
        try:
            # Generate the backing track using pure Python synthesis
            backing_arr = _generate_backing_track(
                chord_sequence   = chord_sequence,
                arrangement_id   = arr["id"],
                bpm              = bpm,
                duration_sec     = duration_sec,
                user_instruments = selected_instruments,
            )

            # Mix with vocal
            mixed_wav = _mix_vocal_with_backing(vocal_bytes, backing_arr)

            audio_b64 = base64.b64encode(mixed_wav).decode("utf-8")

            meta = dict(arr.get("metadata", {}))
            if user_instr_labels:
                meta["instruments"] = user_instr_labels
            meta["tempo"] = bpm

            results.append({
                **arr,
                "metadata":     meta,
                "audio_base64": audio_b64,
                "mime_type":    "audio/wav",
                "duration_sec": duration_sec,
                "has_audio":    True,
            })

        except Exception as e:
            print(f"[BandSynth] Failed {arr['id']}: {e}")
            results.append({
                **arr,
                "audio_base64": None,
                "mime_type":    None,
                "duration_sec": 0,
                "has_audio":    False,
                "error":        str(e),
            })

    return results
