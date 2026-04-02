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

SCALE_ALIASES = {
    'C major':   'C:maj',   'C minor':   'C:min',
    'D major':   'D:maj',   'D minor':   'D:min',
    'E major':   'E:maj',   'E minor':   'E:min',
    'F major':   'F:maj',   'F minor':   'F:min',
    'G major':   'G:maj',   'G minor':   'G:min',
    'A major':   'A:maj',   'A minor':   'A:min',
    'B major':   'B:maj',   'B minor':   'B:min',
    'C# major':  'C#:maj',  'C# minor':  'C#:min',
    'D# major':  'D#:maj',  'Eb major':  'Eb:maj',
    'Chromatic': None,
}


def _snap_to_nearest_scale_note(
    pitch_hz:   float,
    scale:      Optional[str],
    strength:   float = 1.0,
) -> float:
    if np.isnan(pitch_hz) or pitch_hz <= 0:
        return pitch_hz

    if scale is None:
        midi = librosa.hz_to_midi(pitch_hz)
        snapped_midi = round(midi)
        target_hz = librosa.midi_to_hz(snapped_midi)
    else:
        degrees = librosa.key_to_degrees(scale)
        degrees = np.concatenate([degrees, [degrees[0] + SEMITONES_IN_OCTAVE]])
        midi = librosa.hz_to_midi(pitch_hz)
        degree = midi % SEMITONES_IN_OCTAVE
        closest_idx = np.argmin(np.abs(degrees - degree))
        correction  = degree - degrees[closest_idx]
        target_midi = midi - correction
        target_hz   = librosa.midi_to_hz(target_midi)

    blended_hz = pitch_hz * (1 - strength) + target_hz * strength
    return blended_hz


def _correct_pitch_contour(
    f0:       np.ndarray,
    scale:    Optional[str],
    strength: float,
    smooth:   bool = True,
) -> np.ndarray:
    corrected = np.zeros_like(f0)
    for i, pitch in enumerate(f0):
        if np.isnan(pitch):
            corrected[i] = pitch
        else:
            corrected[i] = _snap_to_nearest_scale_note(pitch, scale, strength)

    if smooth:
        nan_mask    = np.isnan(corrected)
        temp        = np.where(nan_mask, 0.0, corrected)
        smoothed    = medfilt(temp, kernel_size=5)
        corrected   = np.where(nan_mask, np.nan, smoothed)

    return corrected


async def apply_autotune_pipeline(
    audio_bytes: bytes,
    strength:    float = 0.78,
    key:         str   = 'C',
    scale_type:  str   = 'major',
) -> dict:
    if not AUTOTUNE_OK:
        return _simulation_response(audio_bytes)

    try:
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)

        if len(y) < sr * 0.5:
            return _simulation_response(audio_bytes)

        scale_key = f"{key} {scale_type}"
        librosa_scale = SCALE_ALIASES.get(scale_key, f"{key}:maj")
        if scale_type.lower() in ('minor', 'min'):
            librosa_scale = f"{key}:min"

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
            return _wav_response(y, sr, 0.0, 'no_pitch_detected', voiced_pct)

        corrected_f0 = _correct_pitch_contour(f0, librosa_scale, strength)

        valid_orig = f0[voiced_flag & ~np.isnan(f0)]
        valid_corr = corrected_f0[voiced_flag & ~np.isnan(corrected_f0)]
        if len(valid_orig) > 0 and len(valid_corr) > 0:
            orig_midi = librosa.hz_to_midi(valid_orig[valid_orig > 0])
            corr_midi = librosa.hz_to_midi(valid_corr[valid_corr > 0])
            min_len   = min(len(orig_midi), len(corr_midi))
            avg_correction = float(np.mean(np.abs(corr_midi[:min_len] - orig_midi[:min_len])))
        else:
            avg_correction = 0.0

        try:
            tuned_audio = psola.vocode(
                y,
                sample_rate=int(sr),
                target_pitch=corrected_f0,
                fmin=fmin,
                fmax=fmax,
            )
            mode = 'psola'
        except Exception as psola_err:
            print(f"[AutoTune] PSOLA failed ({psola_err}), using librosa fallback")
            tuned_audio = _librosa_pitch_shift_fallback(y, sr, f0, corrected_f0, voiced_flag)
            mode = 'librosa_fallback'

        blended = (1 - strength) * y + strength * tuned_audio

        peak = np.max(np.abs(blended))
        if peak > 0.98:
            blended = blended * (0.98 / peak)

        return _wav_response(blended, sr, avg_correction, mode, voiced_pct)

    except Exception as e:
        print(f"[AutoTune] Pipeline error: {e}")
        return _simulation_response(audio_bytes)


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


def _wav_response(
    audio:          np.ndarray,
    sr:             int,
    avg_correction: float,
    mode:           str,
    voiced_pct:     float,
) -> dict:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format='WAV', subtype='PCM_16')
    audio_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return {
        'audio_base64':   audio_b64,
        'avg_correction': round(avg_correction, 2),
        'mode':           mode,
        'voiced_pct':     round(voiced_pct, 1),
        'sample_rate':    sr,
    }


def _simulation_response(audio_bytes: bytes) -> dict:
    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
    return {
        'audio_base64':   audio_b64,
        'avg_correction': 0.0,
        'mode':           'simulation',
        'voiced_pct':     0.0,
        'note':           'Install psola + parselmouth for real pitch correction',
    }
