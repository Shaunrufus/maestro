# backend/app/services/guru.py
# MAESTRO — Guru AI Service
# Powers all 4 agents behind the single "Guru" persona:
#   Vocal Coach, Lyrics Guru, Producer, Mix Engineer
#
# Uses Anthropic Claude API.
# Install: pip install anthropic
# Set env: ANTHROPIC_API_KEY=sk-ant-...

import os
import anthropic
import librosa
import numpy as np
import io

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

# ─── GURU SYSTEM PROMPT ───────────────────────────────────────────────────
GURU_SYSTEM = """You are GURU, the AI music teacher inside the MAESTRO virtual recording studio app.

You are NOT a generic AI assistant. You are an expert music producer, vocal coach, and songwriter 
rolled into one warm, encouraging personality. You speak like a seasoned music guru — knowledgeable,
inspiring, direct, and deeply passionate about music.

Your role:
- Analyze vocal recordings and give specific, actionable feedback
- Guide users to improve their singing technique
- Suggest chord progressions, melodies, and arrangements
- Help write and improve lyrics in any language (English, Hindi, Telugu, etc.)
- Recommend the right instruments, tuning, and effects for each song
- Always encourage — every singer can improve with the right guidance

Response style:
- Warm but direct. No fluff.
- Use music terminology correctly but explain it simply.
- Give specific tips, not generic advice.
- Keep responses concise — 3-5 sentences max unless asked for more.
- Never mention that you are built on Claude or any other AI model.
- You are GURU. That is your entire identity.

When analyzing audio data:
- Comment on pitch accuracy, breath control, rhythm, and tone
- Identify the strongest moments and areas to improve
- Give one clear "practice tip" for the session"""


async def analyze_with_guru_ai(audio_bytes: bytes, session_note: str = "") -> dict:
    """
    Vocal Coach agent: analyze recording + return Guru feedback.
    """
    # Extract basic audio features for context
    try:
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)

        duration  = round(len(y) / sr, 1)
        f0, voiced_flag, _ = librosa.pyin(y,
            fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr)

        voiced_pct = round(100 * np.sum(voiced_flag) / max(len(voiced_flag), 1), 1)
        valid_f0   = [f for f, v in zip(f0, voiced_flag) if v and f and not np.isnan(f)]
        avg_pitch  = round(float(np.mean(valid_f0)), 1) if valid_f0 else 0
        pitch_note = librosa.hz_to_note(avg_pitch) if avg_pitch > 0 else "unknown"
        pitch_var  = round(float(np.std(valid_f0)), 1) if len(valid_f0) > 1 else 0

        rms = round(float(np.sqrt(np.mean(y**2))), 4)
    except Exception:
        duration = voiced_pct = avg_pitch = pitch_var = rms = 0
        pitch_note = "unknown"

    user_message = f"""The singer just finished a recording session. Here is the audio analysis:
- Duration: {duration} seconds
- Average pitch: {pitch_note} ({avg_pitch} Hz)
- Pitch variation: {pitch_var} Hz std dev (lower = more consistent)
- Voiced frames: {voiced_pct}% (higher = more sustained singing vs silence/breath)
- RMS loudness: {rms} (0 = silent, 1 = maximum)
- Session note from singer: "{session_note or 'no note provided'}"

As GURU, give your vocal coaching feedback for this session."""

    response = client.messages.create(
        model      = "claude-sonnet-4-6",
        max_tokens = 400,
        system     = GURU_SYSTEM,
        messages   = [{"role": "user", "content": user_message}],
    )

    feedback_text = response.content[0].text

    # Parse into structured response
    lines = [l.strip() for l in feedback_text.split("\n") if l.strip()]
    score = min(100, max(40, int(voiced_pct * 0.6 + (1 - pitch_var / 50) * 40)))

    return {
        "feedback": feedback_text,
        "score":    score,
        "tips":     lines[:3],  # first 3 lines as quick tips
        "stats": {
            "duration_sec":  duration,
            "avg_pitch_note": pitch_note,
            "pitch_stability": round(100 - min(pitch_var, 50) * 2, 1),
            "voice_presence":  voiced_pct,
        },
    }


async def generate_lyrics(
    prompt:   str,
    language: str = "english",
    mood:     str = "upbeat",
    lines:    int = 4,
) -> dict:
    """
    Lyrics Guru agent: generate song lyrics.
    """
    user_message = f"""Write {lines} lines of song lyrics.
Language: {language}
Mood/vibe: {mood}
Theme/prompt: "{prompt}"

Format: just the lyrics lines, one per line. No explanations."""

    response = client.messages.create(
        model      = "claude-sonnet-4-6",
        max_tokens = 300,
        system     = GURU_SYSTEM,
        messages   = [{"role": "user", "content": user_message}],
    )

    lyrics_text = response.content[0].text.strip()
    lyrics_lines = [l for l in lyrics_text.split("\n") if l.strip()]

    return {
        "lyrics":   lyrics_text,
        "lines":    lyrics_lines,
        "language": language,
        "mood":     mood,
    }
