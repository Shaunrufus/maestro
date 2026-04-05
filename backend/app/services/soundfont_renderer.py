# backend/app/services/soundfont_renderer.py
# ─────────────────────────────────────────────────────────────────────────────
# Renders MIDI note data → WAV audio using py-meltysynth (pure Python SoundFont
# synthesizer). Falls back to improved additive synthesis if no SoundFont found.
#
# Usage:
#   from app.services.soundfont_renderer import render_notes
#   wav_bytes = render_notes(notes, sample_rate=44100)
#
# Where `notes` is a list of dicts:
#   [{"channel": 0, "program": 0, "note": 60, "velocity": 100,
#     "start_sec": 0.0, "end_sec": 1.0}, ...]
# ─────────────────────────────────────────────────────────────────────────────

import io
import os
import struct
import wave
import math
from typing import List, Dict, Optional

import numpy as np

# ─── Try to load meltysynth + SoundFont ──────────────────────────────────────
MELTYSYNTH_OK = False
_synthesizer = None
_sf_path = None

try:
    from app.services.meltysynth import SoundFont, Synthesizer, SynthesizerSettings, create_buffer
    from app.services.download_soundfont import get_soundfont_path

    _sf_path = get_soundfont_path()
    if _sf_path and os.path.isfile(_sf_path):
        _sound_font = SoundFont.from_file(_sf_path)
        _settings = SynthesizerSettings(44100)
        _synthesizer = Synthesizer(_sound_font, _settings)
        MELTYSYNTH_OK = True
        print(f"[Renderer] ✓ MeltySynth loaded with {_sf_path}")
    else:
        print("[Renderer] ✗ No SoundFont file found — using fallback synthesis")
except Exception as e:
    print(f"[Renderer] ✗ MeltySynth init failed: {e} — using fallback synthesis")

SR = 44100


# ─── GM Program Numbers for common instruments ──────────────────────────────
GM_PROGRAMS = {
    'piano':           0,   # Acoustic Grand Piano
    'keys':            0,
    'electric_piano':  4,   # Electric Piano 1
    'guitar':         25,   # Acoustic Guitar (steel)
    'acoustic_guitar':25,
    'electric_guitar': 27,  # Electric Guitar (clean)
    'bass':           33,   # Electric Bass (finger)
    'strings':        48,   # String Ensemble 1
    'violin':         40,   # Violin
    'cello':          42,   # Cello
    'flute':          73,   # Flute
    'sitar':         104,   # Sitar
    'tabla':         116,   # Taiko Drum (closest to tabla)
    'tanpura':        48,   # String Ensemble (drone approx)
    'brass':          61,   # Brass Section
    'pad':            88,   # Pad 1 (new age)
    'organ':          19,   # Church Organ
    'drums':         128,   # Channel 10 percussion
}


def _get_gm_program(instrument_name: str) -> int:
    """Map instrument name to GM program number."""
    key = instrument_name.lower().replace(' ', '_')
    if key in GM_PROGRAMS:
        return GM_PROGRAMS[key]
    # Fuzzy match
    for k, v in GM_PROGRAMS.items():
        if k in key or key in k:
            return v
    return 0  # Default: piano


# ─── MeltySynth Rendering ───────────────────────────────────────────────────
def render_notes_meltysynth(notes: List[Dict], duration_sec: float, sr: int = SR) -> np.ndarray:
    """
    Render notes using MeltySynth SoundFont synthesizer.
    Each note: {channel, program, note, velocity, start_sec, end_sec}
    """
    global _synthesizer
    if not MELTYSYNTH_OK or _synthesizer is None:
        raise RuntimeError("MeltySynth not available")

    # Re-create synthesizer for clean state
    _synth = Synthesizer(_sound_font, _settings)

    # Sort notes by start time
    events = []
    for n in notes:
        ch   = n.get('channel', 0)
        prog = n.get('program', 0)
        note = n.get('note', 60)
        vel  = n.get('velocity', 100)
        t_on = n.get('start_sec', 0.0)
        t_off= n.get('end_sec', t_on + 0.5)

        events.append(('prog', t_on - 0.001, ch, prog))
        events.append(('on',   t_on, ch, note, vel))
        events.append(('off',  t_off, ch, note))

    events.sort(key=lambda e: e[1])

    # Render in small blocks, processing events as we go
    total_samples = int(duration_sec * sr)
    output_left  = []
    output_right = []

    current_sample = 0
    event_idx = 0

    BLOCK_SIZE = 1024

    # Set up program changes first
    prog_set = set()
    for ev in events:
        if ev[0] == 'prog':
            key = (ev[2], ev[3])
            if key not in prog_set:
                ch = ev[2]
                if ch != 9:  # Don't program change channel 10 (drums)
                    _synth.process_midi_message(ch, 0xC0, ev[3], 0)
                prog_set.add(key)

    while current_sample < total_samples:
        current_time = current_sample / sr

        # Process events occurring before this block
        while event_idx < len(events):
            ev = events[event_idx]
            if ev[1] > current_time + BLOCK_SIZE / sr:
                break

            if ev[0] == 'on':
                _synth.note_on(ev[2], ev[3], ev[4])
            elif ev[0] == 'off':
                _synth.note_off(ev[2], ev[3])

            event_idx += 1

        # Render block
        block_len = min(BLOCK_SIZE, total_samples - current_sample)
        left  = create_buffer(block_len)
        right = create_buffer(block_len)
        _synth.render(left, right)

        output_left.extend(left)
        output_right.extend(right)
        current_sample += block_len

    # Mix to mono (normalized)
    left_arr  = np.array(output_left,  dtype=np.float32)
    right_arr = np.array(output_right, dtype=np.float32)
    mono = (left_arr + right_arr) * 0.5

    peak = np.max(np.abs(mono))
    if peak > 0:
        mono = mono / peak * 0.85

    return mono


# ─── Improved Fallback Synthesis (no SoundFont) ─────────────────────────────
# Uses Karplus-Strong for strings/guitar, FM synthesis for keys/brass,
# and filtered noise for drums — much better than basic sine waves.

def _karplus_strong(freq: float, duration: float, decay: float = 0.996,
                    brightness: float = 0.5, sr: int = SR) -> np.ndarray:
    """Karplus-Strong plucked string: physically modeled string vibration."""
    n = int(duration * sr)
    delay = max(2, int(sr / freq))
    # Initial excitation: mix of noise + wavetable for brightness control
    buf = np.random.randn(delay) * brightness + np.sin(np.linspace(0, 2 * np.pi, delay)) * (1 - brightness)
    buf *= 0.5
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % delay]
        # Two-point average lowpass filter with decay
        buf[i % delay] = decay * 0.5 * (buf[i % delay] + buf[(i + 1) % delay])
    return out


def _fm_synth(freq: float, duration: float, mod_ratio: float = 2.0,
              mod_index: float = 3.0, sr: int = SR) -> np.ndarray:
    """FM synthesis — rich, evolving timbres for keys, brass, bells."""
    n = int(duration * sr)
    t = np.linspace(0, duration, n, endpoint=False)
    # Modulator with decaying index for natural timbre evolution
    mod_env = np.exp(-2.5 * t) * mod_index
    modulator = mod_env * np.sin(2 * np.pi * freq * mod_ratio * t)
    carrier = np.sin(2 * np.pi * freq * t + modulator)
    # ADSR envelope
    env = _adsr_env(n, 0.01, 0.15, 0.5, 0.3, sr)
    return carrier * env


def _adsr_env(n: int, a: float, d: float, s_level: float, r: float, sr: int = SR) -> np.ndarray:
    """ADSR envelope generator."""
    env = np.ones(n)
    a_s = int(a * sr); d_s = int(d * sr); r_s = int(r * sr)
    s_start = a_s + d_s
    s_end = max(s_start, n - r_s)
    if a_s > 0:
        env[:min(a_s, n)] = np.linspace(0, 1, min(a_s, n))
    if d_s > 0 and s_start <= n:
        env[a_s:min(s_start, n)] = np.linspace(1, s_level, min(d_s, n - a_s))
    if s_start < n:
        env[s_start:s_end] = s_level
    if r_s > 0 and s_end < n:
        env[s_end:] = np.linspace(s_level, 0, n - s_end)
    return env


def _tabla_hit(freq: float, duration: float, sr: int = SR) -> np.ndarray:
    """Tabla: pitched membrane with characteristic bend + ring."""
    n = int(duration * sr)
    t = np.linspace(0, duration, n, endpoint=False)
    # Fundamental with pitch bend
    bend = freq * (1 + 2.0 * np.exp(-30 * t))
    phase = 2 * np.pi * np.cumsum(bend) / sr
    wave = np.sin(phase) * 0.7 + np.sin(phase * 2.02) * 0.3  # overtone
    env = np.exp(-8 * t) * (1 + 0.3 * np.sin(2 * np.pi * 15 * t) * np.exp(-20 * t))
    return wave * env


def _sitar_note(freq: float, duration: float, sr: int = SR) -> np.ndarray:
    """Sitar: buzzy jawari bridge characteristic + sympathetic drone."""
    n = int(duration * sr)
    t = np.linspace(0, duration, n, endpoint=False)
    # Main string (Karplus-Strong with low decay for sustain)
    main = _karplus_strong(freq, duration, decay=0.9985, brightness=0.8, sr=sr)
    # Buzz simulation: clipping to simulate jawari bridge
    buzz = np.tanh(main * 4.0) * 0.4
    # Sympathetic strings (subtle)
    symp = 0.08 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-1.5 * t)
    env = _adsr_env(n, 0.005, 0.1, 0.6, 0.4, sr)
    return (buzz + symp) * env


def _note_to_freq(midi_note: int) -> float:
    """MIDI note number to frequency."""
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


# Fallback instrument synthesizers
FALLBACK_SYNTHS = {
    'piano':          lambda f, d: _fm_synth(f, d, mod_ratio=1.0, mod_index=2.5),
    'keys':           lambda f, d: _fm_synth(f, d, mod_ratio=1.0, mod_index=2.5),
    'electric_piano': lambda f, d: _fm_synth(f, d, mod_ratio=3.5, mod_index=4.0),
    'guitar':         lambda f, d: _karplus_strong(f, d, decay=0.997, brightness=0.6),
    'acoustic_guitar':lambda f, d: _karplus_strong(f, d, decay=0.997, brightness=0.5),
    'bass':           lambda f, d: _fm_synth(f / 2, d, mod_ratio=1.0, mod_index=1.0),
    'strings':        lambda f, d: _karplus_strong(f, d, decay=0.9995, brightness=0.2),
    'flute':          lambda f, d: _fm_synth(f, d, mod_ratio=1.0, mod_index=0.5),
    'sitar':          lambda f, d: _sitar_note(f, d),
    'tabla':          lambda f, d: _tabla_hit(f, d),
    'brass':          lambda f, d: _fm_synth(f, d, mod_ratio=1.0, mod_index=5.0),
    'pad':            lambda f, d: _fm_synth(f, d, mod_ratio=2.0, mod_index=1.0),
}


def render_notes_fallback(notes: List[Dict], duration_sec: float, sr: int = SR) -> np.ndarray:
    """Render notes using improved additive / physical modeling synthesis."""
    n_samples = int(duration_sec * sr)
    mix = np.zeros(n_samples, dtype=np.float32)

    for note_info in notes:
        midi_note = note_info.get('note', 60)
        freq = _note_to_freq(midi_note)
        t_on = note_info.get('start_sec', 0.0)
        t_off = note_info.get('end_sec', t_on + 0.5)
        vel = note_info.get('velocity', 100) / 127.0

        # Determine instrument from program number
        program = note_info.get('program', 0)
        channel = note_info.get('channel', 0)
        instr_name = note_info.get('instrument', '')

        duration = min(t_off - t_on, duration_sec - t_on)
        if duration < 0.02:
            continue

        # Select synth function
        synth_fn = None
        if instr_name:
            key = instr_name.lower().replace(' ', '_')
            synth_fn = FALLBACK_SYNTHS.get(key)
            if not synth_fn:
                for k, v in FALLBACK_SYNTHS.items():
                    if k in key or key in k:
                        synth_fn = v
                        break

        if not synth_fn:
            # Map GM program to synth
            if channel == 9 or program >= 112:
                synth_fn = FALLBACK_SYNTHS['tabla']
            elif program <= 7:
                synth_fn = FALLBACK_SYNTHS['piano']
            elif program <= 15:
                synth_fn = FALLBACK_SYNTHS['electric_piano']
            elif program <= 31:
                synth_fn = FALLBACK_SYNTHS['guitar']
            elif program <= 39:
                synth_fn = FALLBACK_SYNTHS['bass']
            elif program <= 55:
                synth_fn = FALLBACK_SYNTHS['strings']
            elif program <= 63:
                synth_fn = FALLBACK_SYNTHS['brass']
            elif program <= 79:
                synth_fn = FALLBACK_SYNTHS['flute']
            elif program <= 95:
                synth_fn = FALLBACK_SYNTHS['pad']
            else:
                synth_fn = FALLBACK_SYNTHS['piano']

        try:
            samples = synth_fn(freq, duration)
            start_idx = int(t_on * sr)
            end_idx = min(start_idx + len(samples), n_samples)
            actual_len = end_idx - start_idx
            mix[start_idx:end_idx] += samples[:actual_len] * vel * 0.4
        except Exception as e:
            print(f"[FallbackSynth] Note {midi_note} failed: {e}")

    # Normalize
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.80

    return mix


# ─── Public API ──────────────────────────────────────────────────────────────

def render_notes(notes: List[Dict], duration_sec: float, sr: int = SR) -> np.ndarray:
    """
    Render a list of note events to a numpy audio array.
    Uses MeltySynth (SoundFont) if available, falls back to improved synthesis.
    """
    if MELTYSYNTH_OK:
        try:
            print(f"[Renderer] Using MeltySynth ({len(notes)} notes, {duration_sec:.1f}s)")
            return render_notes_meltysynth(notes, duration_sec, sr)
        except Exception as e:
            print(f"[Renderer] MeltySynth render failed: {e} — falling back")

    print(f"[Renderer] Using fallback synthesis ({len(notes)} notes, {duration_sec:.1f}s)")
    return render_notes_fallback(notes, duration_sec, sr)


def get_renderer_info() -> Dict:
    """Return info about the current renderer for diagnostics."""
    return {
        "engine": "meltysynth" if MELTYSYNTH_OK else "fallback",
        "soundfont": _sf_path if MELTYSYNTH_OK else None,
        "gm_instruments": len(GM_PROGRAMS),
    }


def ndarray_to_wav_bytes(arr: np.ndarray, sr: int = SR) -> bytes:
    """Convert float32 numpy array to 16-bit WAV bytes."""
    arr16 = (np.clip(arr, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(arr16.tobytes())
    return buf.getvalue()
