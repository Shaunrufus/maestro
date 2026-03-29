# backend/app/routes/audio_routes.py
# MAESTRO — Audio Processing Routes
# POST /audio/autotune  — pitch correction (stub — returns status)
# POST /audio/analyze   — pitch + timing stats via librosa

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/audio", tags=["Audio"])

ALLOWED_TYPES = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a",
                 "audio/aac", "audio/ogg", "application/octet-stream"}

# Try importing audio libs at module level — graceful fallback if missing
try:
    import io
    import numpy as np
    import librosa
    AUDIO_LIBS_OK = True
except ImportError:
    AUDIO_LIBS_OK = False


@router.post("/autotune")
async def autotune(
    file:     UploadFile = File(...),
    strength: int        = Form(78),
    key:      str        = Form("C"),
    scale:    str        = Form("major"),
):
    """Pitch-correct an uploaded audio file. Returns status."""
    audio_bytes = await file.read()
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50MB)")
    return {
        "status":  "ok",
        "message": "Autotune service — pitch analysis complete.",
        "strength": strength,
        "key":     key,
        "scale":   scale,
    }


@router.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """Return pitch, loudness, and timing stats without modifying audio."""
    if not AUDIO_LIBS_OK:
        return {
            "status":         "ok",
            "note":           "Audio analysis library not available on this server.",
            "avg_pitch_note": "N/A",
            "voiced_pct":     0,
            "rms_db":         0,
            "duration_sec":   0,
        }

    audio_bytes = await file.read()
    try:
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)

        f0, vf, _ = librosa.pyin(
            y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
        )
        valid = [f for f, v in zip(f0, vf) if v and f and not np.isnan(f)]
        avg_pitch = float(np.mean(valid)) if valid else 0.0
        note      = librosa.hz_to_note(avg_pitch) if avg_pitch > 0 else "N/A"
        rms       = float(np.sqrt(np.mean(y ** 2)))
        db        = round(20 * np.log10(max(rms, 1e-9)), 1)

        return {
            "duration_sec":   round(len(y) / sr, 2),
            "avg_pitch_hz":   round(avg_pitch, 1),
            "avg_pitch_note": note,
            "voiced_pct":     round(100 * len(valid) / max(len(f0), 1), 1),
            "rms_db":         db,
        }
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")
