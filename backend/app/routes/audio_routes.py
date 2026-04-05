# backend/app/routes/audio_routes.py
# MAESTRO — Audio Processing Routes
# POST /audio/autotune  — REAL pitch correction via pYIN + PSOLA
# POST /audio/analyze   — pitch + timing stats via librosa

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/audio", tags=["Audio"])

ALLOWED_TYPES = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a",
                 "audio/aac", "audio/ogg", "application/octet-stream"}

try:
    import io
    import base64
    import numpy as np
    import librosa
    AUDIO_LIBS_OK = True
except ImportError:
    AUDIO_LIBS_OK = False


@router.post("/autotune")
async def autotune(
    file:     UploadFile = File(...),
    strength: float      = Form(0.78),   # 0.0–1.0; UI sends 0–100, we normalise below
    key:      str        = Form("C"),
    scale:    str        = Form("major"),
):
    """
    Pitch-correct an uploaded audio file using pYIN + TD-PSOLA.
    Returns base64-encoded corrected WAV + correction stats.
    """
    audio_bytes = await file.read()
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50MB)")

    # UI may send strength as 0–100 integer; normalise to 0.0–1.0
    if strength > 1.0:
        strength = strength / 100.0
    strength = max(0.0, min(1.0, strength))

    from app.services.autotune import apply_autotune_pipeline, get_autotune_status
    result_bytes = await apply_autotune_pipeline(
        audio_bytes = audio_bytes,
        strength    = strength,
        key         = key,
        scale_type  = scale,
    )

    audio_b64 = base64.b64encode(result_bytes).decode("utf-8")
    at_status = get_autotune_status()

    return {
        "status":        "ok",
        "audio_base64":  audio_b64,
        "avg_correction": round(strength * 100, 1),
        "key":           key,
        "scale":         scale,
        "strength":      strength,
        "autotune_engine": at_status,
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
