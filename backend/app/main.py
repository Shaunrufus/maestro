# backend/app/main.py
# MAESTRO Backend — FastAPI
# Deploy to: Railway (recommended for solo dev) or Vercel
#
# Local dev:
#   cd backend
#   pip install -r requirements.txt
#   uvicorn app.main:app --reload --port 8000
#
# Test: curl http://localhost:8000/health

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os

from app.services.autotune  import apply_autotune_pipeline
from app.services.guru      import analyze_with_guru_ai

from app.routes import guru_routes
# from app.routes import autotune_routes # TODO: implement autotune router

app = FastAPI(
    title       = "MAESTRO Backend",
    description = "Virtual Studio AI services — auto-tune, Guru AI, audio processing",
    version     = "1.0.0",
)

# CORS — allow Expo/React Native to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],  # tighten in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─── Include Routers ──────────────────────────────────────────────────────
app.include_router(guru_routes.router, prefix="/guru", tags=["Guru AI"])

# ─── Health check ──────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "MAESTRO Backend"}


# ─── Auto-tune endpoint (keeping legacy until router implemented) ─────────
@app.post("/audio/autotune")
async def autotune(
    file:     UploadFile = File(...),
    strength: int        = Form(78),   # 0 = natural, 100 = robotic
    key:      str        = Form("C"),
    scale:    str        = Form("major"),
):

    """
    Accepts a WAV file and returns pitch-corrected audio URL.
    Uses CREPE for pitch detection + librosa for pitch shifting.
    """
    if not file.filename.endswith(('.wav', '.mp3', '.m4a')):
        raise HTTPException(status_code=400, detail="Unsupported file format")

    audio_bytes = await file.read()

    result = await apply_autotune_pipeline(
        audio_bytes = audio_bytes,
        strength    = strength / 100.0,  # normalize 0–1
        key         = key,
        scale       = scale,
    )
    return result


# ─── Guru AI analysis ────────────────────────────────────────────────────
@app.post("/guru/analyze")
async def guru_analyze(
    file: UploadFile = File(...),
    note: str        = Form(""),
):
    """
    Guru AI: analyze vocal recording and return coaching feedback.
    Uses CREPE pitch data + Claude API for natural language coaching.
    """
    audio_bytes = await file.read()
    result = await analyze_with_guru_ai(audio_bytes, session_note=note)
    return result


# ─── Lyrics endpoint ──────────────────────────────────────────────────────
@app.post("/guru/lyrics")
async def guru_lyrics(
    prompt:   str = Form(...),
    language: str = Form("english"),   # english | hindi | telugu
    mood:     str = Form("upbeat"),
    lines:    int = Form(4),
):
    """
    Guru Lyrics Agent: generate/continue song lyrics.
    """
    from app.services.guru import generate_lyrics
    result = await generate_lyrics(prompt=prompt, language=language, mood=mood, lines=lines)
    return result
