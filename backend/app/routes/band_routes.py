# backend/app/routes/band_routes.py
# MAESTRO — Virtual Band API Endpoints
#
# POST /band/analyze       — analyze vocal recording → key, BPM, chords
# POST /band/generate      — generate all arrangements from analysis
# POST /band/reference     — extract chords from YouTube URL or audio file
# POST /band/parse-chords  — parse user-pasted chord string

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import List, Optional
import asyncio

from app.services.vocal_analysis  import analyze_vocal
from app.services.chord_parser    import parse_chord_progression, suggest_progression
from app.services.midi_generator   import generate_midi
from app.services.band_synthesizer import generate_all_arrangements, ARRANGEMENTS

router = APIRouter(prefix="/band", tags=["Virtual Band"])


# ─── Analyze vocal recording ───────────────────────────────────────────────
@router.post("/analyze")
async def analyze_vocal_recording(file: UploadFile = File(...)):
    """
    Analyze a vocal recording and return musical properties.

    Returns:
        key, bpm, chord_sequence, simple_progression, genre_hint, duration_sec
    """
    audio_bytes = await file.read()
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50MB)")

    analysis = await analyze_vocal(audio_bytes)

    # Also suggest a genre-appropriate progression
    suggested = suggest_progression(analysis.get("key", "C major"), analysis.get("genre_hint", "bollywood_pop"))
    analysis["suggested_progression"] = suggested

    return analysis


# ─── Generate all arrangements ────────────────────────────────────────────
class GenerateRequest(BaseModel):
    chord_progression:  str          # "C G Am F" or "I V vi IV"
    key:                str = "C"
    bpm:                int = 90
    duration_sec:       float = 30.0
    selected_styles:    Optional[List[str]] = None   # None = all styles
    vocal_file_url:     Optional[str] = None         # Supabase signed URL

@router.post("/generate")
async def generate_virtual_band(req: GenerateRequest):
    """
    Generate multiple arrangement versions for a chord progression.

    If vocal_file_url is provided, mixes vocal with each arrangement.
    Otherwise returns backing tracks only.

    This endpoint may take 20-60 seconds on first call (FluidSynth synthesis).
    """
    # Parse chords
    chord_sequence = parse_chord_progression(
        input_str     = req.chord_progression,
        key           = req.key,
        bpm           = req.bpm,
    )

    # Fetch vocal audio if provided
    vocal_bytes = None
    if req.vocal_file_url:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(req.vocal_file_url)
                if resp.status_code == 200:
                    vocal_bytes = resp.content
        except Exception as e:
            print(f"[Band] Could not fetch vocal: {e}")

    # Generate arrangements
    if vocal_bytes:
        arrangements = await generate_all_arrangements(
            vocal_bytes       = vocal_bytes,
            chord_sequence    = chord_sequence,
            bpm               = req.bpm,
            duration_sec      = req.duration_sec,
            selected_styles   = req.selected_styles,
        )
    else:
        # Return metadata only (no audio yet — app will call again with vocal)
        arrangements = [
            {**arr, "audio_base64": None, "has_audio": False}
            for arr in ARRANGEMENTS
            if not req.selected_styles or arr["id"] in req.selected_styles
        ]

    return {
        "chord_sequence":    chord_sequence,
        "progression_str":   req.chord_progression,
        "bpm":               req.bpm,
        "key":               req.key,
        "arrangements":      arrangements,
        "total":             len(arrangements),
    }


# ─── Full pipeline: analyze + generate in one call ─────────────────────────
@router.post("/analyze-and-generate")
async def analyze_and_generate(
    file:            UploadFile = File(...),
    custom_chords:   str        = Form(""),    # empty = auto-detect
    selected_styles: str        = Form(""),    # comma-separated, empty = all
):
    """
    One-shot endpoint:
    1. Analyzes the vocal recording
    2. Uses custom_chords if provided, otherwise uses AI detection
    3. Generates all arrangement versions
    4. Returns analysis + arrangements in one response

    This is the primary endpoint called from the app after recording stops.
    """
    audio_bytes = await file.read()
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large")

    # Step 1: Analyze vocal
    analysis = await analyze_vocal(audio_bytes)

    # Step 2: Determine chord progression to use
    if custom_chords.strip():
        chord_str = custom_chords.strip()
    else:
        chord_str = " ".join(analysis.get("simple_progression", ["C", "G", "Am", "F"]))

    # Step 3: Parse chords
    bpm = analysis.get("bpm", 90)
    key = analysis.get("key_short", "C")
    chord_sequence = parse_chord_progression(chord_str, key=key, bpm=bpm)

    # Step 4: Determine styles to generate
    styles = [s.strip() for s in selected_styles.split(",") if s.strip()] or None

    # Step 5: Generate arrangements with vocal mixed in
    arrangements = await generate_all_arrangements(
        vocal_bytes     = audio_bytes,
        chord_sequence  = chord_sequence,
        bpm             = bpm,
        duration_sec    = analysis.get("duration_sec", 30.0),
        selected_styles = styles,
    )

    return {
        "analysis":       analysis,
        "chord_sequence": chord_sequence,
        "progression":    chord_str,
        "arrangements":   arrangements,
    }


# ─── Parse user chord input ───────────────────────────────────────────────
class ParseChordsRequest(BaseModel):
    chord_str:  str
    key:        str = "C"
    bpm:        int = 90

@router.post("/parse-chords")
async def parse_chords(req: ParseChordsRequest):
    """
    Parse a chord string like "C G Am F" or "I V vi IV" → timed chord sequence.
    Used to validate user input before the recording session.
    """
    chords = parse_chord_progression(req.chord_str, key=req.key, bpm=req.bpm)
    return {
        "input":         req.chord_str,
        "chord_sequence": chords,
        "is_valid":       len(chords) > 0,
        "chord_names":   [c["chord"] for c in chords],
    }


# ─── Reference track analysis (YouTube / audio URL) ───────────────────────
class ReferenceRequest(BaseModel):
    url:   str   # YouTube URL or direct audio file URL
    limit_sec: int = 60

@router.post("/reference")
async def analyze_reference(req: ReferenceRequest):
    """
    Analyze a reference audio source (YouTube URL or audio file URL).
    Returns key, BPM, and chord progression of the reference.
    User can then record in that key/feel.

    IMPORTANT: Only musical analysis is returned — no audio is sampled.
    """
    try:
        audio_bytes = await _fetch_audio(req.url, req.limit_sec)
        if not audio_bytes:
            raise HTTPException(400, "Could not fetch audio from URL")

        analysis = await analyze_vocal(audio_bytes)
        analysis["source"] = "reference_track"
        analysis["url"]    = req.url

        suggested = suggest_progression(analysis.get("key", "C major"), analysis.get("genre_hint", "bollywood_pop"))
        analysis["suggested_progression"] = suggested

        return analysis

    except Exception as e:
        raise HTTPException(500, f"Reference analysis failed: {str(e)}")


async def _fetch_audio(url: str, limit_sec: int = 60) -> Optional[bytes]:
    """Download audio from YouTube URL or direct audio URL."""
    import re

    is_youtube = bool(re.search(r'youtube\.com|youtu\.be', url))

    if is_youtube:
        return await _download_youtube(url, limit_sec)
    else:
        # Direct audio URL
        import httpx
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.content
        except Exception as e:
            print(f"[Band] Direct URL fetch failed: {e}")
        return None


async def _download_youtube(url: str, limit_sec: int = 60) -> Optional[bytes]:
    """Download audio from YouTube using yt-dlp."""
    import subprocess, tempfile, os

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, 'audio.wav')
        cmd = [
            'yt-dlp',
            '-x',                          # extract audio
            '--audio-format', 'wav',
            '--audio-quality', '5',        # medium quality (faster)
            '--postprocessor-args', f'-ss 0 -t {limit_sec}',  # first N seconds
            '-o', out_path,
            url,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=120)

            if os.path.exists(out_path):
                with open(out_path, 'rb') as f:
                    return f.read()
        except Exception as e:
            print(f"[Band] yt-dlp failed: {e}")
        return None
