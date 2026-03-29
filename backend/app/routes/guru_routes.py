# backend/app/routes/guru_routes.py
# MAESTRO — AI Guru Routes (Claude-powered vocal coach)
# POST /guru/chat     — general music coaching chat
# POST /guru/analyze  — analyze uploaded recording
# POST /guru/lyrics   — generate AI lyrics

import os
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/guru", tags=["Guru AI"])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are GURU — the world's most advanced AI music teacher and vocal coach, 
specializing in Indian classical, Bollywood, and contemporary music. 
You give specific, practical, encouraging feedback. Keep responses under 200 words.
Always reference music theory, vocal technique, or production tips relevant to the user's context.
Speak in a warm, mentor-like tone. The user is recording in a virtual studio app called MAESTRO."""


# ─── Chat endpoint ────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:      str
    session_note: Optional[str] = ""

@router.post("/chat")
async def chat(req: ChatRequest):
    if not ANTHROPIC_API_KEY:
        return {
            "reply": "Namaste! I'm GURU. I'm currently in demo mode. "
                     "Consistency in practice is the key to mastery! What are you working on today?",
            "mode": "simulation"
        }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        user_content = req.message
        if req.session_note:
            user_content = f"[Session context: {req.session_note}]\n\n{req.message}"
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}]
        )
        return {"reply": response.content[0].text, "mode": "live"}
    except Exception as e:
        raise HTTPException(500, f"Guru unavailable: {str(e)}")


# ─── Analyze recording ────────────────────────────────────────────────────────
@router.post("/analyze")
async def analyze_recording(
    file: UploadFile = File(...),
    note: str        = Form("")
):
    audio_bytes = await file.read()
    pitch_info = "audio received"
    try:
        import io, numpy as np, librosa
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=22050, mono=True)
        f0, vf, _ = librosa.pyin(y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr)
        valid = [f for f, v in zip(f0, vf) if v and f and not np.isnan(f)]
        if valid:
            avg_hz   = float(__import__('numpy').mean(valid))
            note_str = librosa.hz_to_note(avg_hz)
            voiced   = round(100 * len(valid) / max(len(f0), 1), 1)
            pitch_info = f"average pitch {note_str} ({avg_hz:.0f}Hz), {voiced}% voiced"
    except Exception:
        pass

    if not ANTHROPIC_API_KEY:
        return {
            "feedback": f"I analyzed your recording ({pitch_info}). Your pitch stability looks good! "
                        "Focus on breath support during high notes.",
            "score": 78,
            "tips": ["Breathe from your diaphragm", "Warm up before recording", "Stay hydrated"],
            "mode": "simulation"
        }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        prompt = f"I just recorded a vocal take. Audio analysis: {pitch_info}. " \
                 f"Additional context: {note or 'none'}. Please give specific vocal coaching feedback."
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"feedback": response.content[0].text, "score": 75,
                "tips": ["Practice regularly", "Warm up before sessions"], "mode": "live"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Lyrics generation ────────────────────────────────────────────────────────
@router.post("/lyrics")
async def generate_lyrics(
    prompt:   str = Form(...),
    language: str = Form("english"),
    mood:     str = Form("upbeat"),
    lines:    int = Form(4),
):
    if not ANTHROPIC_API_KEY:
        sample = {
            "english": ["Walking through the golden light", "Your voice echoes in the night",
                        "We rise above the storm", "Finding warmth within the rain"],
            "hindi":   ["तेरी याद में खो गया हूं", "दिल की धड़कन तू ही है",
                        "रात के तारे गवाह हैं", "मेरे सपनों में आ जा"],
            "telugu":  ["నీ గుర్తులు మనసులో", "ప్రేమ వెలుతురు చూపు",
                        "జీవితం నీతో సాగాలి", "ఆనందం పంచుకుందాం"],
        }
        return {"lines": sample.get(language, sample["english"])[:lines], "mode": "simulation"}
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        lang_map = {"hindi": "Write in Hindi (Devanagari script)",
                    "telugu": "Write in Telugu script", "english": "Write in English"}
        prompt_text = (
            f"Generate exactly {lines} song lyrics lines. Theme: {prompt}. "
            f"Mood: {mood}. {lang_map.get(language, 'Write in English')}. "
            f"Output ONLY the lyrics lines, one per line, no numbering, no explanation."
        )
        response = client.messages.create(
            model="claude-3-haiku-20240307", max_tokens=200, system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt_text}]
        )
        raw_lines = [l.strip() for l in response.content[0].text.strip().split("\n") if l.strip()]
        return {"lines": raw_lines[:lines], "mode": "live"}
    except Exception as e:
        raise HTTPException(500, str(e))
