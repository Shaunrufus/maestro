"""
backend/app/routes/audio_routes.py
MAESTRO — Audio Processing Routes v3

POST /audio/autotune         — Real PYIN + PSOLA pitch correction
POST /audio/analyze          — Pitch + BPM + key stats (no modification)
GET  /audio/autotune/test    — Health check + live autotune smoke test
"""

import base64
import io
import logging
import time
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audio", tags=["audio"])

ALLOWED_EXTS   = {"m4a", "mp3", "wav", "aac", "ogg", "flac", "mp4"}
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB


def _get_ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else "m4a"


# ─── POST /audio/autotune ─────────────────────────────────────────────────────

@router.post("/autotune")
async def autotune_endpoint(
    file:                UploadFile   = File(...),
    correction_strength: float        = Form(0.8),   # 0.0–1.0
    strength:            float        = Form(-1.0),  # legacy param (0-100 or 0-1)
    scale:               Optional[str]= Form(None),
    root_note:           Optional[int]= Form(None),
    add_effect:          bool         = Form(False),
    key:                 str          = Form("C"),   # legacy param
    scale_type:          str          = Form("major"),# legacy param
):
    """
    Pitch-correct an uploaded vocal recording using PYIN + PSOLA.
    Returns WAV bytes directly (not base64) with metadata in headers.
    Also supports legacy base64 response mode.
    """
    start = time.time()

    # Resolve legacy strength param
    if strength >= 0:
        if strength > 1.0:
            strength = strength / 100.0
        correction_strength = max(0.0, min(1.0, strength))

    correction_strength = max(0.0, min(1.0, correction_strength))

    # Resolve legacy scale/key params
    if scale is None:
        scale = scale_type
    if root_note is None:
        key_map = {"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,
                   "F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11}
        root_note = key_map.get(key.strip().capitalize(), None)

    ext         = _get_ext(file.filename or "audio.m4a")
    audio_bytes = await file.read()
    file_mb     = len(audio_bytes) / 1_048_576

    logger.info(f"[/autotune] {file_mb:.2f}MB .{ext} | strength={correction_strength}")

    if len(audio_bytes) < 500:
        raise HTTPException(400, "File too small")
    if len(audio_bytes) > MAX_FILE_BYTES:
        raise HTTPException(413, "File too large (max 50MB)")
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported format: {ext}")

    try:
        from app.services.autotune import autotune_audio
        wav_bytes, metadata = autotune_audio(
            audio_bytes         = audio_bytes,
            input_format        = ext,
            correction_strength = correction_strength,
            scale_name          = scale,
            root_note           = root_note,
            add_effect          = add_effect,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        logger.error(f"[/autotune] {e}")
        raise HTTPException(500, f"Audio processing failed: {e}")
    except Exception as e:
        logger.exception(f"[/autotune] Unexpected: {e}")
        raise HTTPException(500, "Internal error during pitch correction")

    elapsed = round(time.time() - start, 2)
    logger.info(f"[/autotune] Done in {elapsed}s — engine={metadata.get('engine')}")

    # Also include base64 in JSON body for React Native compatibility
    audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")

    # Return JSON with both base64 audio AND status metadata
    return {
        "status":             "ok",
        "audio_base64":       audio_b64,
        "avg_correction":     metadata.get("auto_tune_pct", 0),
        "key":                metadata.get("key", "?"),
        "scale":              metadata.get("scale", "major"),
        "vocal_pct":          metadata.get("vocal_pct", 0),
        "duration_s":         metadata.get("duration_s", 0),
        "strength":           correction_strength,
        "autotune_engine":    metadata.get("engine", "psola_v3"),
        "process_time_s":     elapsed,
    }


# ─── GET /audio/autotune/test ─────────────────────────────────────────────────

@router.get("/autotune/test")
async def autotune_test():
    """
    Health check endpoint — confirms autotune is fully operational.
    Generates a 440Hz sine wave and runs it through the full pipeline.
    """
    try:
        import librosa
        import numpy as np
        import soundfile

        sr  = 22050
        t   = np.linspace(0, 1, sr)
        # Add slight pitch wobble to simulate a real singer
        wobble  = np.sin(2 * np.pi * 5 * t) * 5   # 5Hz vibrato, ±5Hz
        freq    = 440 + wobble
        phase   = np.cumsum(2 * np.pi * freq / sr)
        tone    = (0.4 * np.sin(phase)).astype(np.float32)

        buf = io.BytesIO()
        soundfile.write(buf, tone, sr, format="WAV")

        from app.services.autotune import autotune_audio
        tuned, meta = autotune_audio(
            buf.getvalue(),
            input_format        = "wav",
            correction_strength = 0.8,
        )

        return {
            "status":          "ok",
            "librosa_version": librosa.__version__,
            "numpy_version":   np.__version__,
            "engine":          meta.get("engine"),
            "key_detected":    meta.get("key"),
            "vocal_pct":       meta.get("vocal_pct"),
            "auto_tune_pct":   meta.get("auto_tune_pct"),
            "output_bytes":    len(tuned),
            "message":         "AutoTune v3 (pure PYIN+PSOLA) is operational 🎤",
        }
    except Exception as e:
        logger.exception(f"[/autotune/test] {e}")
        return {"status": "error", "error": str(e)}


# ─── POST /audio/analyze ──────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """Return pitch, loudness, key, BPM stats without modifying audio."""
    audio_bytes = await file.read()
    ext         = _get_ext(file.filename or "audio.m4a")

    try:
        import librosa
        import numpy as np
        import tempfile
        from pathlib import Path

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            y, sr = librosa.load(tmp_path, sr=None, mono=True)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        f0, voiced_flag, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sr,
        )
        valid = [f for f, v in zip(f0, voiced_flag) if v and f and not np.isnan(f)]
        avg_pitch = float(np.mean(valid)) if valid else 0.0
        note      = librosa.hz_to_note(avg_pitch) if avg_pitch > 0 else "N/A"
        rms       = float(np.sqrt(np.mean(y ** 2)))
        db        = round(20 * np.log10(max(rms, 1e-9)), 1)
        tempo, _  = librosa.beat.beat_track(y=y, sr=sr)

        return {
            "duration_sec":   round(len(y) / sr, 2),
            "avg_pitch_hz":   round(avg_pitch, 1),
            "avg_pitch_note": note,
            "voiced_pct":     round(100 * len(valid) / max(len(f0), 1), 1),
            "rms_db":         db,
            "bpm":            round(float(tempo), 1),
        }
    except Exception as e:
        logger.error(f"[/analyze] {e}")
        raise HTTPException(500, f"Analysis failed: {e}")
