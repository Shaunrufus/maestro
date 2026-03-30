# backend/app/routes/guru_routes.py
# MAESTRO — AI Guru Routes
# POST /guru/chat     — general music coaching chat
# POST /guru/analyze  — analyze uploaded recording
# POST /guru/lyrics   — generate AI lyrics
#
# Supports both Anthropic direct AND OpenRouter (for Claude via openrouter.ai)
# Set EITHER env var:
#   ANTHROPIC_API_KEY  = sk-ant-...
#   OPENROUTER_API_KEY = sk-or-v1-...

import os
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/guru", tags=["Guru AI"])

ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

SYSTEM_PROMPT = """You are GURU — the world's most advanced AI music teacher and vocal coach, 
specializing in Indian classical, Bollywood, and contemporary music. 
You give specific, practical, encouraging feedback. Keep responses under 200 words.
Always reference music theory, vocal technique, or production tips relevant to the user's context.
Speak in a warm, mentor-like tone. The user is recording in a virtual studio app called MAESTRO."""


def _call_openrouter(user_content: str, max_tokens: int = 300) -> str:
    """Call OpenRouter API (Claude Haiku via openrouter.ai)."""
    import httpx
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://maestroapp.in",
        "X-Title":       "MAESTRO",
    }
    payload = {
        "model":      "anthropic/claude-3-haiku",
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system",  "content": SYSTEM_PROMPT},
            {"role": "user",    "content": user_content},
        ],
    }
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=payload, headers=headers, timeout=30
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _call_anthropic(user_content: str, max_tokens: int = 300) -> str:
    """Call Anthropic Claude directly."""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}]
    )
    return response.content[0].text


def _call_ai(user_content: str, max_tokens: int = 300) -> str:
    """
    Route to whichever AI key is configured.
    Priority: Anthropic → OpenRouter → simulation fallback
    """
    if ANTHROPIC_API_KEY:
        return _call_anthropic(user_content, max_tokens)
    if OPENROUTER_API_KEY:
        return _call_openrouter(user_content, max_tokens)
    raise ValueError("No API key configured")


# ─── Chat endpoint ────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:      str
    session_note: Optional[str] = ""


@router.post("/chat")
async def chat(req: ChatRequest):
    user_content = req.message
    if req.session_note:
        user_content = f"[Session context: {req.session_note}]\n\n{req.message}"

    try:
        reply = _call_ai(user_content)
        mode  = "live_anthropic" if ANTHROPIC_API_KEY else "live_openrouter"
        return {"reply": reply, "mode": mode}
    except ValueError:
        # No API key — simulation mode
        return {
            "reply": ("Namaste! I'm GURU. I'm currently in demo mode — "
                      "set ANTHROPIC_API_KEY or OPENROUTER_API_KEY in Railway to go live! "
                      "Consistency in practice is the key to mastery. What are you working on today?"),
            "mode": "simulation"
        }
    except Exception as e:
        raise HTTPException(500, f"Guru unavailable: {str(e)}")


# ─── Analyze recording ────────────────────────────────────────────────────────
@router.post("/analyze")
async def analyze_recording(
    file: UploadFile = File(...),
    note: str        = Form("")
):
    audio_bytes = await file.read()
    pitch_info  = "audio received"

    try:
        import io, numpy as np, librosa
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=22050, mono=True)
        f0, vf, _ = librosa.pyin(
            y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
        )
        valid = [f for f, v in zip(f0, vf) if v and f and not __import__('numpy').isnan(f)]
        if valid:
            avg_hz   = float(__import__('numpy').mean(valid))
            note_str = librosa.hz_to_note(avg_hz)
            voiced   = round(100 * len(valid) / max(len(f0), 1), 1)
            pitch_info = f"average pitch {note_str} ({avg_hz:.0f}Hz), {voiced}% voiced"
    except Exception:
        pass

    prompt = (
        f"I just recorded a vocal take. Audio analysis: {pitch_info}. "
        f"Additional context: {note or 'none'}. "
        f"Please give specific vocal coaching feedback."
    )

    try:
        feedback = _call_ai(prompt, max_tokens=400)
        return {
            "feedback": feedback,
            "score":    75,
            "tips":     ["Practice regularly", "Warm up before sessions"],
            "mode":     "live_anthropic" if ANTHROPIC_API_KEY else "live_openrouter"
        }
    except ValueError:
        return {
            "feedback": (
                f"I analyzed your recording ({pitch_info}). "
                "Your pitch stability looks good! Focus on breath support during high notes. "
                "Try sustaining notes for 3-4 seconds to build consistency."
            ),
            "score": 78,
            "tips":  ["Breathe from your diaphragm", "Warm up before recording", "Stay hydrated"],
            "mode":  "simulation"
        }
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
    lang_map = {
        "hindi":   "Write in Hindi (Devanagari script)",
        "telugu":  "Write in Telugu script",
        "english": "Write in English"
    }
    prompt_text = (
        f"Generate exactly {lines} song lyrics lines. "
        f"Theme: {prompt}. Mood: {mood}. "
        f"{lang_map.get(language, 'Write in English')}. "
        f"Output ONLY the lyrics lines, one per line, no numbering, no explanation."
    )

    try:
        raw      = _call_ai(prompt_text, max_tokens=200)
        raw_lines= [l.strip() for l in raw.strip().split("\n") if l.strip()]
        return {
            "lines": raw_lines[:lines],
            "mode":  "live_anthropic" if ANTHROPIC_API_KEY else "live_openrouter"
        }
    except ValueError:
        sample = {
            "english": [
                "Walking through the golden light",
                "Your voice echoes in the night",
                "We rise above the storm",
                "Finding warmth within the rain",
            ],
            "hindi": [
                "तेरी याद में खो गया हूं",
                "दिल की धड़कन तू ही है",
                "रात के तारे गवाह हैं",
                "मेरे सपनों में आ जा",
            ],
            "telugu": [
                "నీ గుర్తులు మనసులో",
                "ప్రేమ వెలుతురు చూపు",
                "జీవితం నీతో సాగాలి",
                "ఆనందం పంచుకుందాం",
            ],
        }
        return {"lines": sample.get(language, sample["english"])[:lines], "mode": "simulation"}
    except Exception as e:
        raise HTTPException(500, str(e))
