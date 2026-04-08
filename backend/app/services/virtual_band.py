"""
MAESTRO Virtual Band Engine v2
================================
Pure NumPy/SciPy instrument synthesis.
Zero external downloads. Zero ML models. Railway-safe.

Instruments:
  - Piano    → additive synthesis with 8 harmonics + decay envelope
  - Guitar   → Karplus-Strong physical model (plucked string)
  - Tabla    → membrane resonance model (two-resonator)
  - Bass     → sine + octave harmonic + ADSR
  - Strings  → bowed string approximation (sawtooth + vibrato + slow attack)

Output: PCM float32 WAV bytes at 22050Hz
"""

from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
import scipy.signal
import soundfile as sf

logger = logging.getLogger(__name__)

SR = 22050  # sample rate — low enough for Railway, good enough for music

# ─── ADSR Envelope ────────────────────────────────────────────────────────────

def adsr(n_samples: int, attack: float, decay: float, sustain: float,
         release: float, note_end: int) -> np.ndarray:
    """Build ADSR envelope curve."""
    env = np.zeros(n_samples)
    a = int(attack * SR)
    d = int(decay * SR)
    r = int(release * SR)

    # Attack
    env[:min(a, n_samples)] = np.linspace(0, 1, min(a, n_samples))
    # Decay to sustain level
    if a < n_samples:
        dend = min(a + d, n_samples)
        env[a:dend] = np.linspace(1, sustain, dend - a)
    # Sustain
    if a + d < note_end:
        env[a + d:min(note_end, n_samples)] = sustain
    # Release
    if note_end < n_samples:
        rend = min(note_end + r, n_samples)
        env[note_end:rend] = np.linspace(sustain, 0, rend - note_end)

    return env.astype(np.float32)


# ─── Instrument Synthesizers ──────────────────────────────────────────────────

def synth_piano(freq: float, duration: float, velocity: float = 0.7) -> np.ndarray:
    """
    Additive synthesis piano with 8 harmonics.
    Amplitude envelope: fast attack, medium decay, ~0.4 sustain.
    Higher harmonics decay faster (inharmonicity).
    """
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)

    # Harmonic partial amplitudes (based on piano spectral analysis)
    partials = [1.0, 0.5, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05]
    # Harmonic decay rates (higher partials die faster)
    decay_rates = [1.5, 2.0, 2.8, 3.5, 4.5, 5.5, 7.0, 9.0]

    wave = np.zeros(n, dtype=np.float64)
    for k, (amp, decay) in enumerate(zip(partials, decay_rates)):
        harmonic_freq = freq * (k + 1)
        if harmonic_freq > SR / 2.1:  # Nyquist limit
            break
        # Amplitude decay envelope for this partial
        env = amp * np.exp(-decay * t)
        wave += env * np.sin(2 * math.pi * harmonic_freq * t)

    # Overall ADSR
    env_adsr = adsr(n, attack=0.005, decay=0.15, sustain=0.45, release=0.6,
                    note_end=int(duration * SR * 0.8))
    wave *= env_adsr

    return (wave * velocity).astype(np.float32)


def synth_guitar_ks(freq: float, duration: float, velocity: float = 0.75) -> np.ndarray:
    """
    Karplus-Strong plucked string model.
    Gold standard for realistic guitar-like tones without samples.
    """
    n = int(duration * SR)
    period = int(SR / freq)
    if period < 2:
        period = 2

    # Initialize delay line with white noise (the "pluck")
    delay_line = (np.random.rand(period) * 2 - 1).astype(np.float64)

    output = np.zeros(n, dtype=np.float64)
    ptr = 0

    for i in range(n):
        output[i] = delay_line[ptr]
        # Low-pass averaging filter (string stiffness)
        next_ptr = (ptr + 1) % period
        delay_line[ptr] = 0.499 * (delay_line[ptr] + delay_line[next_ptr])
        ptr = next_ptr

    # Simple amplitude decay
    env = np.exp(-0.8 * np.linspace(0, duration, n))
    output *= env * velocity

    return output.astype(np.float32)


def synth_tabla(freq: float, duration: float, velocity: float = 0.8) -> np.ndarray:
    """
    Tabla synthesis using two-resonator model.
    Tabla has a distinctive pitch bend (downward glide) on the bayan (bass drum).
    Treble (dayan) has more tonal quality.
    """
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)

    # Dayan (high pitch drum) — tonal resonance
    dayan_freq = freq
    dayan = np.sin(2 * math.pi * dayan_freq * t)
    # Pitch downglide (characteristic tabla sound)
    pitch_env = np.exp(-15 * t)  # fast pitch decay
    dayan_glide = np.sin(2 * math.pi * dayan_freq * (1 + 0.3 * pitch_env) * t)

    # Bayan (bass drum) — lower, rounder
    bayan_freq = freq * 0.5
    bayan = np.sin(2 * math.pi * bayan_freq * t)

    # Membrane noise component
    noise = np.random.randn(n) * 0.1

    wave = 0.5 * dayan_glide + 0.3 * bayan + 0.1 * noise + 0.1 * dayan

    # Short, punchy envelope
    attack = int(0.003 * SR)
    env = np.concatenate([
        np.linspace(0, 1, attack),
        np.exp(-8 * np.linspace(0, duration, n - attack))
    ])[:n]

    wave *= env * velocity

    # Resonance filter (tabla has specific timbral quality)
    b, a = scipy.signal.butter(4, [100 / (SR / 2), 4000 / (SR / 2)], btype='band')
    wave = scipy.signal.filtfilt(b, a, wave)

    return wave.astype(np.float32)


def synth_bass(freq: float, duration: float, velocity: float = 0.8) -> np.ndarray:
    """Electric bass: sine fundamental + octave sub + ADSR."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)

    # Fundamental + sub octave
    wave = (
        0.7 * np.sin(2 * math.pi * freq * t) +
        0.3 * np.sin(2 * math.pi * freq * 2 * t) +
        0.1 * np.sin(2 * math.pi * freq * 0.5 * t)
    )

    env = adsr(n, attack=0.02, decay=0.1, sustain=0.75, release=0.3,
               note_end=int(n * 0.85))
    wave *= env * velocity

    # Low-pass filter to keep it warm
    b, a = scipy.signal.butter(4, 800 / (SR / 2), btype='low')
    wave = scipy.signal.filtfilt(b, a, wave)

    return wave.astype(np.float32)


def synth_strings(freq: float, duration: float, velocity: float = 0.6) -> np.ndarray:
    """Bowed string approximation: sawtooth with vibrato and slow attack."""
    n = int(duration * SR)
    t = np.linspace(0, duration, n, endpoint=False)

    # Slow vibrato (4-6 Hz, ±20 cents)
    vibrato_rate = 5.0
    vibrato_depth = freq * 0.011  # ≈ 20 cents
    vibrato_env = np.where(t > 0.3, 1.0, t / 0.3)  # vibrato fades in
    freq_mod = freq + vibrato_depth * vibrato_env * np.sin(2 * math.pi * vibrato_rate * t)

    # Phase-accumulation for frequency-modulated oscillator
    phase = np.cumsum(2 * math.pi * freq_mod / SR)
    # Sawtooth = first 6 harmonics
    wave = np.zeros(n, dtype=np.float64)
    for k in range(1, 7):
        wave += (1.0 / k) * np.sin(k * phase)

    env = adsr(n, attack=0.3, decay=0.2, sustain=0.8, release=0.8,
               note_end=int(n * 0.85))
    wave *= env * velocity

    # Warm band-pass filter
    b, a = scipy.signal.butter(3, [200 / (SR / 2), 5000 / (SR / 2)], btype='band')
    wave = scipy.signal.filtfilt(b, a, wave)

    return wave.astype(np.float32)


# ─── Instrument Router ────────────────────────────────────────────────────────

def synth_note(instrument: str, midi_note: int, duration: float,
               velocity: float = 0.7) -> np.ndarray:
    """Synthesize a single note for the given instrument."""
    freq = 440.0 * 2 ** ((midi_note - 69) / 12)

    if instrument == "piano":
        return synth_piano(freq, duration, velocity)
    elif instrument in ("guitar", "acoustic_guitar", "electric_guitar"):
        return synth_guitar_ks(freq, duration, velocity)
    elif instrument in ("tabla", "drums", "percussion"):
        return synth_tabla(freq, duration, velocity)
    elif instrument in ("bass", "electric_bass"):
        return synth_bass(freq, duration, velocity)
    elif instrument in ("strings", "cello", "violin"):
        return synth_strings(freq, duration, velocity)
    else:
        # Default: simple sine with ADSR
        n = int(duration * SR)
        t = np.linspace(0, duration, n)
        wave = np.sin(2 * math.pi * freq * t).astype(np.float32)
        env = adsr(n, 0.01, 0.1, 0.6, 0.3, int(n * 0.85))
        return wave * env * velocity


# ─── Chord Renderer ──────────────────────────────────────────────────────────

def render_chord(instrument: str, midi_notes: list[int], duration: float,
                 style: str = "block", bpm: float = 80.0) -> np.ndarray:
    """
    Render a chord with a specific playing style.

    style options:
      "block"    — all notes at once (piano-style)
      "arpeggio" — notes staggered up (harp/guitar sweep)
      "strum"    — quick stagger (guitar strumming)
      "bass_chord" — bass note first, then upper voices
    """
    n = int(duration * SR)
    result = np.zeros(n, dtype=np.float32)

    beat_duration = 60.0 / bpm

    if style == "block":
        for midi in midi_notes:
            result += synth_note(instrument, midi, duration)[:n]

    elif style == "arpeggio":
        stagger = beat_duration / len(midi_notes)
        for i, midi in enumerate(midi_notes):
            note_start = int(i * stagger * SR)
            note_wave = synth_note(instrument, midi, duration - i * stagger)
            end = min(note_start + len(note_wave), n)
            result[note_start:end] += note_wave[:end - note_start]

    elif style == "strum":
        stagger = 0.02  # 20ms stagger = guitar strum
        for i, midi in enumerate(midi_notes):
            note_start = int(i * stagger * SR)
            note_wave = synth_note(instrument, midi, duration)
            end = min(note_start + len(note_wave), n)
            result[note_start:end] += note_wave[:end - note_start]

    elif style == "bass_chord":
        # Bass note first (longer, lower)
        bass_midi = min(midi_notes)
        bass_wave = synth_note("bass", bass_midi - 12, duration * 0.9)
        result[:len(bass_wave)] += bass_wave[:n]
        # Upper voices strum
        upper = [m for m in midi_notes if m != bass_midi]
        stagger = 0.025
        for i, midi in enumerate(upper):
            ns = int((0.05 + i * stagger) * SR)
            nw = synth_note(instrument, midi, duration - 0.05)
            end = min(ns + len(nw), n)
            result[ns:end] += nw[:end - ns] * 0.7

    # Mix level: normalize multiple notes
    peak = np.max(np.abs(result))
    if peak > 0.9:
        result *= 0.85 / peak

    return result


# ─── Pattern Generators ──────────────────────────────────────────────────────

def tabla_pattern(bpm: float, n_bars: int = 4, taal: str = "teentaal") -> np.ndarray:
    """
    Generate a tabla rhythm pattern.

    taal = "teentaal" (16-beat) or "keharwa" (8-beat) or "dadra" (6-beat)
    """
    beat_dur = 60.0 / bpm
    beats_map = {"teentaal": 16, "keharwa": 8, "dadra": 6}
    n_beats = beats_map.get(taal, 16)

    total_dur = beat_dur * n_beats * n_bars
    n = int(total_dur * SR)
    result = np.zeros(n, dtype=np.float32)

    # Teentaal stroke pattern (simplified): X . . . 2 . . . 3 . . . - . . .
    # X = strong (dha), 2,3 = medium, - = empty
    if taal == "teentaal":
        # Beat positions (1-indexed): 1(X), 5(2), 9(3), 13(-khali)
        strong_beats = {1, 2, 5, 9, 10, 13}
        medium_beats = {3, 6, 11, 14}
        light_beats = {4, 7, 8, 12, 15, 16}
    else:
        strong_beats = {1, 5}
        medium_beats = {3, 7}
        light_beats = {2, 4, 6, 8}

    for bar in range(n_bars):
        for beat in range(1, n_beats + 1):
            global_beat = bar * n_beats + beat
            sample_pos = int((bar * n_beats + beat - 1) * beat_dur * SR)

            if beat in strong_beats:
                freq, vel = 220.0, 0.9
            elif beat in medium_beats:
                freq, vel = 180.0, 0.65
            else:
                freq, vel = 320.0, 0.45

            hit = synth_tabla(freq, min(beat_dur * 0.8, 0.3), vel)
            end = min(sample_pos + len(hit), n)
            result[sample_pos:end] += hit[:end - sample_pos]

    return result


# ─── Full Band Arrangement ────────────────────────────────────────────────────

@dataclass
class BandConfig:
    """Configuration for one arrangement output."""
    label: str
    instruments: list[str]
    chord_style: str
    add_bass: bool
    add_tabla: bool
    tabla_taal: str
    tempo_factor: float


BAND_CONFIGS: list[BandConfig] = [
    BandConfig("A", ["piano"],         "arpeggio",  True, False, "teentaal", 0.8),
    BandConfig("B", ["guitar"],        "strum",     True, False, "keharwa",  1.0),
    BandConfig("C", ["piano","guitar"],"block",     True, True,  "teentaal", 1.1),
    BandConfig("D", ["strings"],       "block",     True, False, "teentaal", 0.7),
    BandConfig("E", ["piano"],         "arpeggio",  True, False, "dadra",    0.85),
    BandConfig("F", ["strings"],       "block",     True, True,  "teentaal", 1.0),
]


def render_arrangement(
    chord_events: list[dict],
    bpm: float,
    config: BandConfig,
    melody_notes: list[int] = None,
) -> bytes:
    """
    Render a full arrangement to WAV bytes.

    chord_events: [{"name": "Am", "notes": [69,72,76], "start_beat": 0, "duration_beats": 4}]
    """
    if not chord_events:
        return _silence_wav(4.0)

    actual_bpm = bpm * config.tempo_factor
    beat_dur = 60.0 / actual_bpm
    beats_per_bar = 4.0

    # Total duration
    last_event = max(chord_events, key=lambda c: c["start_beat"] + c["duration_beats"])
    total_beats = last_event["start_beat"] + last_event["duration_beats"]
    total_secs = total_beats * beat_dur
    n = int(total_secs * SR)
    mix = np.zeros(n, dtype=np.float32)

    # Render chords
    for inst in config.instruments:
        for chord in chord_events:
            start_s = chord["start_beat"] * beat_dur
            dur_s = chord["duration_beats"] * beat_dur
            start_samp = int(start_s * SR)
            notes = chord.get("notes", [60, 64, 67])

            chord_wave = render_chord(
                instrument=inst,
                midi_notes=notes,
                duration=dur_s,
                style=config.chord_style,
                bpm=actual_bpm,
            )
            end = min(start_samp + len(chord_wave), n)
            mix[start_samp:end] += chord_wave[:end - start_samp] * 0.5

    # Add bass line
    if config.add_bass:
        for chord in chord_events:
            start_s = chord["start_beat"] * beat_dur
            dur_s = chord["duration_beats"] * beat_dur
            start_samp = int(start_s * SR)
            root_midi = min(chord.get("notes", [48])) - 12
            bass_wave = synth_note("bass", root_midi, dur_s, velocity=0.75)
            end = min(start_samp + len(bass_wave), n)
            mix[start_samp:end] += bass_wave[:end - start_samp] * 0.4

    # Add tabla
    if config.add_tabla:
        n_bars = max(1, int(total_beats / beats_per_bar))
        tabla_audio = tabla_pattern(actual_bpm, n_bars=n_bars, taal=config.tabla_taal)
        mix_len = min(len(tabla_audio), n)
        mix[:mix_len] += tabla_audio[:mix_len] * 0.35

    # Normalize
    peak = np.max(np.abs(mix))
    if peak > 0.0:
        mix = mix * (0.88 / peak)

    buf = io.BytesIO()
    sf.write(buf, mix, SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _silence_wav(duration_s: float) -> bytes:
    n = int(duration_s * SR)
    silence = np.zeros(n, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, silence, SR, format="WAV")
    return buf.getvalue()


# ─── API Entry Point ─────────────────────────────────────────────────────────

def generate_all_arrangements(
    chord_events: list[dict],
    bpm: float,
    melody_notes: list[int] = None,
) -> dict[str, bytes]:
    """
    Generate all 6 arrangements (Output A-F) as WAV bytes.
    Each takes ~0.5-2 seconds on Railway CPU.
    """
    results = {}
    for config in BAND_CONFIGS:
        try:
            wav = render_arrangement(chord_events, bpm, config, melody_notes)
            results[config.label] = wav
            logger.info(f"[VB] Rendered Output {config.label}: {len(wav)} bytes")
        except Exception as e:
            logger.error(f"[VB] Failed Output {config.label}: {e}")
            results[config.label] = _silence_wav(4.0)
    return results
