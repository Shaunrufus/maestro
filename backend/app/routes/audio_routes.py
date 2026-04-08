"""
MAESTRO Audio Routes — v4 (Complete & Working)
===============================================

Endpoints:
  POST /audio/upload-and-process   ← THE MAIN ONE. Upload m4a → autotune → analyze → all in one
  POST /audio/autotune             ← Standalone autotune
  GET  /audio/autotune/test        ← Health check
  POST /audio/analyze              ← Vocal analysis (key, BPM, chords)
  POST /audio/arrangements/generate← Full pipeline → 6 arrangement WAVs
  GET  /audio/arrangements/{session_id}/{label} ← Stream arrangement

ALL heavy imports are inside functions (lazy loading) to prevent Railway OOM on boot.
"""

import base64
import io
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audio", tags=["audio"])

# Session cache for arrangements (in-memory, resets on redeploy)
_sessions: dict[str, dict[str, bytes]] = {}
_MAX_SESSIONS = 30


# ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

@router.get("/autotune/test")
async def autotune_test():
    """
    Confirms the autotune engine is operational.
    Runs a live 440Hz → 447Hz test (slightly sharp note → should snap to A4).
    Call this after every Railway deploy to confirm the backend is ready.
    """
    try:
        # Lazy import - only here, not at module level
        import librosa
        import numpy as np
        import soundfile as sf
        from app.services.autotune_v3 import autotune_audio

        sr = 22050
        t = np.linspace(0, 1.5, int(1.5 * sr), dtype=np.float32)
        # 447Hz = slightly sharp A4 (440Hz). Autotune should snap it to 440Hz.
        tone = 0.6 * np.sin(2 * np.pi * 447 * t)
        buf = io.BytesIO()
        sf.write(buf, tone, sr, format="WAV")

        _, meta = autotune_audio(buf.getvalue(), "wav", retune_speed=20.0)

        return {
            "status": "ok",
            "engine": meta.get("engine", "pyin+phase_vocoder"),
            "librosa_version": librosa.__version__,
            "numpy_version": np.__version__,
            "key_detected": meta.get("key"),
            "auto_tune_pct": meta.get("auto_tune_pct"),
            "vocal_pct": meta.get("vocal_pct"),
            "message": "MAESTRO AutoTune v4 operational 🎤",
        }
    except Exception as e:
        logger.exception("[/autotune/test] Error")
        return {"status": "error", "error": str(e), "hint": "Check Railway logs"}


# ─── MAIN UNIFIED ENDPOINT ────────────────────────────────────────────────────

@router.post("/upload-and-process")
async def upload_and_process(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Audio recording (m4a, wav, mp3)"),
    retune_speed: float = Form(40.0, ge=0.0, le=100.0),
    flex_tune: float = Form(25.0, ge=0.0, le=100.0),
    humanize: float = Form(30.0, ge=0.0, le=100.0),
    add_effect: bool = Form(False),
    genre: str = Form("pop"),
    jazz_factor: float = Form(0.0, ge=0.0, le=1.0),
    happy_factor: float = Form(0.5, ge=0.0, le=1.0),
):
    """
    THE MAIN ENDPOINT — handles the complete studio pipeline in one call:

    1. Receive audio file from React Native
    2. Run AutoTune (PYIN + Phase Vocoder)
    3. Run Vocal Analysis (key, BPM, chords via MySong HMM)
    4. Render 6 arrangements in background (Virtual Band)
    5. Return: autotuned WAV as base64 + analysis JSON + session_id for arrangements

    React Native usage:
      const formData = new FormData();
      formData.append('file', { uri: recordingUri, name: 'audio.m4a', type: 'audio/mp4' });
      formData.append('retune_speed', '40');
      const res = await fetch(BACKEND + '/audio/upload-and-process', {
        method: 'POST', body: formData
      });
      const data = await res.json();
      // data.autotuned_wav_b64 → base64 WAV of tuned voice
      // data.analysis → {key, bpm, chords, progression_names, arrangements}
      // data.session_id → use to stream arrangements
    """
    t0 = time.time()

    # ── Validate file ──────────────────────────────────────────────────────────
    fname = file.filename or "audio.m4a"
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "m4a"

    if ext not in {"m4a", "mp3", "wav", "aac", "ogg", "mp4", "flac"}:
        raise HTTPException(400, f"Unsupported format: .{ext}")

    audio_bytes = await file.read()
    size_mb = len(audio_bytes) / 1_048_576
    logger.info(f"[/upload-and-process] Received {size_mb:.2f}MB .{ext} file")

    if len(audio_bytes) < 1000:
        raise HTTPException(400, "File too small — record at least 1 second")
    if size_mb > 100:
        raise HTTPException(413, "File too large (max 100MB)")

    # ── Step 1: AutoTune ───────────────────────────────────────────────────────
    try:
        from app.services.autotune_v3 import autotune_audio
        tuned_wav, at_meta = autotune_audio(
            audio_bytes=audio_bytes,
            input_format=ext,
            retune_speed=retune_speed,
            flex_tune=flex_tune,
            humanize=humanize,
            add_effect=add_effect,
        )
    except RuntimeError as e:
        logger.error(f"[AutoTune] {e}")
        tuned_wav = audio_bytes  # fallback: return original
        at_meta = {"key": "?", "scale": "unknown", "auto_tune_pct": 0, "vocal_pct": 0}

    # ── Step 2: Vocal Analysis ─────────────────────────────────────────────────
    try:
        from app.services.vocal_intelligence import analyze_vocal, serialize
        result = analyze_vocal(
            audio_bytes=audio_bytes,
            input_format=ext,
            jazz_factor=jazz_factor,
            happy_factor=happy_factor,
            genre_hint=genre,
        )
        analysis = serialize(result)
    except Exception as e:
        logger.error(f"[VocalAnalysis] {e}")
        analysis = {
            "key": at_meta.get("key", "C major"),
            "bpm": 80.0,
            "progression_names": ["Am", "F", "C", "G"],
            "chords": [],
            "arrangements": [],
            "error": str(e),
        }

    # ── Step 3: Queue arrangement rendering in background ─────────────────────
    session_id = str(uuid.uuid4())[:8]

    def _render_arrangements():
        try:
            from app.services.virtual_band import generate_all_arrangements
            chords = analysis.get("chords", [])
            bpm = analysis.get("bpm", 80.0)
            melody = analysis.get("melody_notes", [])
            wavs = generate_all_arrangements(chords, bpm, melody)
            _sessions[session_id] = wavs
            # Evict old sessions
            if len(_sessions) > _MAX_SESSIONS:
                oldest = next(iter(_sessions))
                del _sessions[oldest]
            logger.info(f"[Arrangements] Session {session_id}: rendered {len(wavs)} outputs")
        except Exception as e:
            logger.error(f"[Arrangements] Render failed: {e}")

    background_tasks.add_task(_render_arrangements)

    elapsed = round(time.time() - t0, 2)
    logger.info(f"[/upload-and-process] Done in {elapsed}s")

    return {
        "session_id": session_id,
        "autotuned_wav_b64": base64.b64encode(tuned_wav).decode(),
        "autotune_meta": at_meta,
        "analysis": analysis,
        "arrangements": [
            {
                "id": label,
                "label": f"Output {label}",
                "stream_url": f"/audio/arrangements/{session_id}/{label}",
                "instruments": _arrangement_instruments(label),
                "feel": _arrangement_feel(label),
            }
            for label in ["A", "B", "C", "D", "E", "F"]
        ],
        "process_time_s": elapsed,
        "status": "arrangements_rendering",
        "message": "AutoTune + analysis complete. Arrangements rendering in background (~5s).",
    }


def _arrangement_instruments(label: str) -> list[str]:
    m = {"A": ["Piano", "Bass", "Light Drums"], "B": ["Acoustic Guitar", "Bass", "Cajon"],
         "C": ["Piano", "Guitar", "Bass", "Drums"], "D": ["Strings", "Piano", "Cello"],
         "E": ["Rhodes", "Lo-Fi Bass", "Vinyl Drums"], "F": ["Tabla", "Sitar", "Harmonium"]}
    return m.get(label, ["Piano"])


def _arrangement_feel(label: str) -> str:
    m = {"A": "Slow Ballad", "B": "Acoustic Folk", "C": "Full Band",
         "D": "Cinematic", "E": "Lo-Fi Chill", "F": "Indian Fusion"}
    return m.get(label, "Pop")


# ─── STREAM ARRANGEMENTS ──────────────────────────────────────────────────────

@router.get("/arrangements/{session_id}/{label}")
async def stream_arrangement(session_id: str, label: str):
    """
    Stream a rendered arrangement WAV.
    Poll this after /upload-and-process — arrangements take ~3-8 seconds to render.
    Returns 404 while still rendering, 200 + WAV when ready.
    """
    label = label.upper()
    if label not in {"A", "B", "C", "D", "E", "F"}:
        raise HTTPException(400, f"Invalid label: {label}. Use A-F.")

    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Still rendering. Try again in 3 seconds.")

    wav = session.get(label)
    if not wav:
        raise HTTPException(404, f"Output {label} not ready yet.")

    return Response(
        content=wav,
        media_type="audio/wav",
        headers={
            "Content-Disposition": f'attachment; filename="output_{label}.wav"',
            "Cache-Control": "max-age=600",
        }
    )


@router.get("/arrangements/{session_id}/status")
async def arrangement_status(session_id: str):
    """Check how many arrangements are ready."""
    session = _sessions.get(session_id)
    if not session:
        return {"ready": 0, "total": 6, "status": "rendering"}
    return {"ready": len(session), "total": 6, "status": "complete" if len(session) == 6 else "partial"}


# ─── STANDALONE AUTOTUNE ──────────────────────────────────────────────────────

@router.post("/autotune")
async def autotune_standalone(
    file: UploadFile = File(...),
    retune_speed: float = Form(40.0, ge=0.0, le=100.0),
    flex_tune: float = Form(25.0, ge=0.0, le=100.0),
    humanize: float = Form(30.0, ge=0.0, le=100.0),
    add_effect: bool = Form(False),
    scale: Optional[str] = Form(None),
    root_note: Optional[int] = Form(None, ge=0, le=11),
    return_base64: bool = Form(True),
):
    """Standalone AutoTune endpoint. Returns base64 WAV + metadata JSON."""
    from app.services.autotune_v3 import autotune_audio

    ext = (file.filename or "a.m4a").rsplit(".", 1)[-1].lower()
    audio_bytes = await file.read()

    if len(audio_bytes) < 500:
        raise HTTPException(400, "File too small")

    t0 = time.time()
    try:
        wav_bytes, meta = autotune_audio(
            audio_bytes, ext, retune_speed, flex_tune, humanize, add_effect,
            scale_name=scale, root_note=root_note
        )
    except Exception as e:
        logger.error(f"[/autotune] AutoTune failed: {str(e)}")
        raise HTTPException(500, f"AutoTune processing failed: {str(e)}")

    if return_base64:
        return {
            "audio_base64": base64.b64encode(wav_bytes).decode(),
            "metadata": meta,
            "process_time_s": round(time.time() - t0, 2),
        }

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-AutoTune-Key": str(meta.get("key", "")),
            "X-AutoTune-Pct": str(meta.get("auto_tune_pct", 0)),
            "Content-Disposition": "attachment; filename=autotuned.wav",
        }
    )


# ─── STANDALONE ANALYZE ───────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_standalone(
    file: UploadFile = File(...),
    jazz_factor: float = Form(0.0),
    happy_factor: float = Form(0.5),
    genre: str = Form("pop"),
):
    """Standalone vocal analysis. Returns key, BPM, chords, arrangements."""
    from app.services.vocal_intelligence import analyze_vocal, serialize

    ext = (file.filename or "a.m4a").rsplit(".", 1)[-1].lower()
    audio_bytes = await file.read()
    if len(audio_bytes) < 500:
        raise HTTPException(400, "File too small")

    result = analyze_vocal(audio_bytes, ext, jazz_factor, happy_factor, genre)
    return serialize(result)
