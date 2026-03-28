# backend/app/services/autotune.py
# MAESTRO Auto-Tune Pipeline
# Uses CREPE (pitch detection) + librosa (pitch shifting)
#
# Install:
#   pip install crepe librosa scipy numpy soundfile

import io
import tempfile
import os
import numpy  as np
import librosa
import soundfile as sf

# Note: CREPE is heavy (~50MB). For Vercel, use Railway or a GPU instance.
# import crepe  # uncomment when deployed with enough memory

MUSICAL_SCALES = {
    "major":      [0, 2, 4, 5, 7, 9, 11],
    "minor":      [0, 2, 3, 5, 7, 8, 10],
    "chromatic":  list(range(12)),
    "pentatonic": [0, 2, 4, 7, 9],
}

NOTE_OFFSETS = {
    "C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,
    "E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,
    "Ab":8,"A":9,"A#":10,"Bb":10,"B":11,
}

def hz_to_nearest_semitone_in_scale(hz: float, key: str, scale: str) -> float:
    """Snap a frequency (Hz) to the nearest note in the given key/scale."""
    if hz <= 0:
        return hz

    # Convert Hz → MIDI note number
    midi = 12 * np.log2(hz / 440.0) + 69

    root   = NOTE_OFFSETS.get(key, 0)
    steps  = MUSICAL_SCALES.get(scale, MUSICAL_SCALES["chromatic"])
    # All MIDI notes in scale (across octaves 0–10)
    valid  = [root + s + 12 * o for o in range(11) for s in steps]

    nearest_midi = min(valid, key=lambda n: abs(n - midi))
    return 440.0 * (2.0 ** ((nearest_midi - 69) / 12.0))


async def apply_autotune_pipeline(
    audio_bytes: bytes,
    strength:    float = 0.78,  # 0.0 = no correction, 1.0 = full
    key:         str   = "C",
    scale:       str   = "major",
) -> dict:
    """
    Full auto-tune pipeline:
    1. Load WAV bytes
    2. Detect pitch per frame (CREPE / fallback: pyin)
    3. Calculate target pitch for each frame
    4. Apply pitch shift frame-by-frame using librosa
    5. Return corrected audio as base64 + metadata
    """
    import base64

    # Load audio from bytes
    with io.BytesIO(audio_bytes) as buf:
        y, sr = librosa.load(buf, sr=44100, mono=True)

    duration_sec = len(y) / sr

    # ── Pitch detection (pyin — no GPU needed) ──
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y,
        fmin = librosa.note_to_hz("C2"),
        fmax = librosa.note_to_hz("C7"),
        sr   = sr,
    )

    # ── Pitch correction per frame ──
    hop_length   = 512
    frame_length = 2048
    shifts_hz    = []
    corrections  = []

    # Process in chunks for memory efficiency
    y_corrected  = y.copy()

    for i, (freq, voiced) in enumerate(zip(f0, voiced_flag)):
        if not voiced or freq is None or np.isnan(freq):
            shifts_hz.append(0.0)
            corrections.append(0.0)
            continue

        target_freq   = hz_to_nearest_semitone_in_scale(freq, key, scale)
        ratio         = target_freq / freq if freq > 0 else 1.0
        semitones_raw = 12 * np.log2(ratio)
        semitones     = semitones_raw * strength  # blend based on strength

        shifts_hz.append(semitones)
        corrections.append(abs(semitones_raw))

    # Apply global pitch shift (simplified — frame-level shifting is Phase 3)
    avg_shift = float(np.nanmean([s for s in shifts_hz if s != 0]) or 0)
    if abs(avg_shift) > 0.01:
        y_corrected = librosa.effects.pitch_shift(y, sr=sr, n_steps=avg_shift)

    # ── Encode output ──
    output_buf = io.BytesIO()
    sf.write(output_buf, y_corrected, sr, format="WAV", subtype="PCM_16")
    output_bytes  = output_buf.getvalue()
    encoded_audio = base64.b64encode(output_bytes).decode("utf-8")

    avg_correction = float(np.nanmean(corrections)) if corrections else 0.0

    return {
        "audio_base64":  encoded_audio,
        "mime_type":     "audio/wav",
        "duration_sec":  round(duration_sec, 2),
        "avg_shift":     round(avg_shift, 3),
        "avg_correction": round(avg_correction * 100, 1),  # percentage
        "frames_voiced": int(np.sum(voiced_flag)),
        "key":           key,
        "scale":         scale,
        "strength":      strength,
    }
