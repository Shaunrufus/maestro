# backend/app/routes/guru_routes.py
# FastAPI routes for GURU AI Vocal Coach.
# Handles: /guru/chat, /guru/analyze, /guru/lyrics

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
import os

# Import the guru service we created earlier
from ..services.guru import GuruService

router = APIRouter()
guru   = GuruService()

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
async def guru_chat(req: ChatRequest):
    """Simple text chat with the Guru AI."""
    print(f"[GURU] Message: {req.message}")
    response = await guru.get_spiritual_feedback(req.message)
    return {"reply": response}

@router.post("/analyze")
async def guru_analyze(
    file: UploadFile = File(...),
    note: Optional[str] = Form("")
):
    """Analyzes a vocal recording and provides feedback."""
    print(f"[GURU] Analyzing recording for: {note}")
    
    # Save temp file
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())
    
    try:
        feedback = await guru.analyze_performance(temp_path, note)
        return {"feedback": feedback}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/lyrics")
async def guru_lyrics(
    prompt: str = Form(...),
    language: str = Form("english"),
    mood: str = Form("upbeat"),
    lines: int = Form(4)
):
    """Generates lyrics based on theme and mood."""
    print(f"[GURU] Generating lyrics for: {prompt} ({language}, {mood})")
    
    # Simple logic to convert prompt to guru service call
    # In a real app, we'd have a specialized generate_lyrics method in GuruService
    full_prompt = f"Write {lines} lines of {language} lyrics about '{prompt}' with a {mood} vibe."
    lyrics = await guru.get_spiritual_feedback(full_prompt)
    
    # Split by lines for the frontend
    split_lines = [l.strip() for l in lyrics.split("\n") if l.strip()]
    return {"lines": split_lines[:lines]}
