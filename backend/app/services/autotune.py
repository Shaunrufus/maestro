# backend/app/services/autotune.py
# MAESTRO — Production-Grade Auto-Tune Engine
#
# Algorithm stack (same as commercial auto-tune tools):
#   1. pYIN  — probabilistic YIN pitch detection (most accurate for vocals)
#   2. Chromatic scale snapping — nearest scale note with configurable strength
#   3. TD-PSOLA via `psola` package (wraps Praat) — formant-preserving pitch shift
#      This prevents the "Mickey Mouse" effect that plagues naive pitch shifting.
#   4. Smoothing — median filter on pitch contour to remove micro-jitter
#   5. Strength blend — 0% = dry original, 100% = fully corrected

import base64
import io
import os
from typing import Optional

import numpy as np

try:
    import librosa
    import soundfile as sf
    import psola
    from scipy.signal import medfilt
    AUTOTUNE_OK = True
except ImportError as e:
    print(f"[AutoTune] Missing package: {e}. Running in simulation mode.")
    AUTOTUNE_OK = False

SEMITONES_IN_OCTAVE = 12

# ─── Scale definitions ────────────────────────────────────────────────────
SCALE_ALIASES = {
    # Common names → librosa scale strings
    'C major':   'C:maj',   'C minor':   'C:min',
    'D major':   'D:maj',   'D minor':   'D:min',
    'E major':   'E:maj',   'E minor':   'E:min',
    'F major':   'F:maj',   'F minor':   'F:min',
    'G major':   'G:maj',   'G minor':   'G:min',
    'A major':   'A:maj',   'A minor':   'A:min',
    'B major':   'B:maj',   'B minor':   'B:min',
    'C# major':  'C#:maj',  'C# minor':  'C#:min',
    'D# major':  'D#:maj',  'Eb major':  'Eb:maj',
    'Chromatic': None,       # snap to all 12 notes
}


# ─── Core pitch snapping ──────────────────────────────────────────────────
def _snap_to_nearest_scale_note(
    pitch_hz:   float,
    scale:      Optional[str],
    strength:   float = 1.0,
) -> float:
    """
    Snap a pitch (Hz) toward the nearest note in the given scale.
    strength = 0.0 → no correction (natural)
    strength = 1.0 → full correction (perfect pitch)
    """
    if np.isnan(pitch_hz) or pitch_hz <= 0:
        return pitch_hz

    if scale is None:
        # Chromatic: snap to nearest semitone
        midi = librosa.hz_to_midi(pitch_hz)
        snapped_midi = round(midi)
        target_hz = librosa.midi_to_hz(snapped_midi)
    else:
        # Get scale degree pitches relative to root
        degrees = librosa.key_to_degrees(scale)
        # Extend to next octave for wrapping
        degrees = np.concatenate([degrees, [degrees[0] + SEMITONES_IN_OCTAVE]])
        midi = librosa.hz_to_midi(pitch_hz)
        degree = midi % SEMITONES_IN_OCTAVE
        closest_idx = np.argmin(np.abs(degrees - degree))
        correction  = degree - degrees[closest_idx]
        target_midi = midi - correction
        target_hz   = librosa.midi_to_hz(target_midi)

    # Blend: interpolate between original and corrected pitch
    # strength=0 → original, strength=1 → fully snapped
    blended_hz = pitch_hz * (1 - strength) + target_hz * strength
    return blended_hz


def _correct_pitch_contour(
    f0:       np.ndarray,
    scale:    Optional[str],
    strength: float,
    smooth:   bool = True,
) -> np.ndarray:
    """
    Apply pitch correction to an entire pitch contour array.
    Returns corrected f0 array (same shape).
    """
    corrected = np.zeros_like(f0)
    for i, pitch in enumerate(f0):
        if np.isnan(pitch):
            corrected[i] = pitch
        else:
            corrected[i] = _snap_to_nearest_scale_note(pitch, scale, strength)

    # Smooth the corrected contour to avoid abrupt jumps
    if smooth:
        # Replace NaNs with 0 for median filter, then restore
        nan_mask    = np.isnan(corrected)
        temp        = np.where(nan_mask, 0.0, corrected)
        smoothed    = medfilt(temp, kernel_size=5)
        corrected   = np.where(nan_mask, np.nan, smoothed)

    return corrected


# ─── Main pipeline ────────────────────────────────────────────────────────
async def apply_autotune_pipeline(
    audio_bytes: bytes,
    strength:    float = 0.75,  # Studio 75%
    key:         str   = 'C',
    scale_type:  str   = 'major',
) -> bytes:
    """
    Full auto-tune pipeline. 
    Returns:
        audio_bytes:  autotuned WAV bytes
    """
    if not AUTOTUNE_OK:
        return audio_bytes

    try:
        # ── 1. Load audio ─────────────────────────────────────────────
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)

        if len(y) < sr * 0.5:  # less than 0.5 seconds — too short
            return audio_bytes

        # ── 2. Resolve scale ──────────────────────────────────────────
        scale_key = f"{key} {scale_type}"
        librosa_scale = SCALE_ALIASES.get(scale_key, f"{key}:maj")
        if scale_type.lower() in ('minor', 'min'):
            librosa_scale = f"{key}:min"

        # ── 3. pYIN pitch detection ───────────────────────────────────
        fmin = librosa.note_to_hz('C2')
        fmax = librosa.note_to_hz('C6')

        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=fmin,
            fmax=fmax,
            sr=sr,
            frame_length=2048,
            hop_length=512,
        )

        voiced_pct = float(np.mean(voiced_flag) * 100)
        if voiced_pct < 5:
            return audio_bytes

        # ── 4. Calculate corrected pitch contour ──────────────────────
        corrected_f0 = _correct_pitch_contour(f0, librosa_scale, strength)

        # ── 5. PSOLA pitch shifting (formant-preserving) ──────────────
        try:
            tuned_audio = psola.vocode(
                y,
                sample_rate=int(sr),
                target_pitch=corrected_f0,
                fmin=fmin,
                fmax=fmax,
            )
        except Exception as psola_err:
            print(f"[AutoTune] PSOLA failed ({psola_err}), using librosa fallback")
            tuned_audio = _librosa_pitch_shift_fallback(y, sr, f0, corrected_f0, voiced_flag)

        # ── 6. Blend dry + wet signal (strength controls mix) ─────────
        blended = (1 - strength) * y + strength * tuned_audio

        # Normalize to prevent clipping
        peak = np.max(np.abs(blended))
        if peak > 0.98:
            blended = blended * (0.98 / peak)

        buf_out = io.BytesIO()
        sf.write(buf_out, blended, sr, format='WAV', subtype='PCM_16')
        return buf_out.getvalue()

    except Exception as e:
        print(f"[AutoTune] Pipeline error: {e}")
        return audio_bytes


# ─── Librosa fallback ─────────────────────────────────────────────────────
def _librosa_pitch_shift_fallback(
    y:            np.ndarray,
    sr:           int,
    orig_f0:      np.ndarray,
    corrected_f0: np.ndarray,
    voiced_flag:  np.ndarray,
) -> np.ndarray:
    valid_orig = orig_f0[voiced_flag & ~np.isnan(orig_f0) & (orig_f0 > 0)]
    valid_corr = corrected_f0[voiced_flag & ~np.isnan(corrected_f0) & (corrected_f0 > 0)]

    if len(valid_orig) == 0 or len(valid_corr) == 0:
        return y

    avg_orig_midi = float(np.mean(librosa.hz_to_midi(valid_orig)))
    avg_corr_midi = float(np.mean(librosa.hz_to_midi(valid_corr)))
    n_steps       = avg_corr_midi - avg_orig_midi

    if abs(n_steps) < 0.01:
        return y

    return librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)
