"""
MAESTRO Music Generation Service — v1
=====================================
Uses Meta's MusicGen via HuggingFace Inference API.
NO local GPU needed. HF free tier: ~500 calls/day.

Docs: https://huggingface.co/facebook/musicgen-small
Set HUGGINGFACE_TOKEN in Railway environment variables.
"""

import asyncio
import io
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

HF_TOKEN    = os.getenv("HUGGINGFACE_TOKEN", "")
HF_SMALL    = "https://api-inference.huggingface.co/models/facebook/musicgen-small"
HF_MELODY   = "https://api-inference.huggingface.co/models/facebook/musicgen-melody"

# ─── Arrangement style prompts ────────────────────────────────────────────────

ARRANGEMENT_PROMPTS = {
    "A": "{genre} song, warm piano and bass, melodic, {key} key, {bpm} BPM",
    "B": "{genre} track, acoustic guitar strumming, folk feel, {key} key, {bpm} BPM",
    "C": "{genre} arrangement, full band drums bass guitar piano, energetic, {bpm} BPM",
    "D": "{genre} style, orchestral strings and piano, cinematic, slow {bpm} BPM",
    "E": "electronic {genre}, synth bass and drums, modern production, {bpm} BPM",
    "F": "Indian {genre}, tabla and sitar fusion, {key} raga, {bpm} BPM",
    "G": "{genre} lo-fi chill, mellow guitar, soft drums, relaxed {bpm} BPM",
}


async def generate_arrangement(
    style_description: str,
    duration_seconds: int = 28,
) -> Optional[bytes]:
    """
    Generate a music arrangement using MusicGen-Small via HF Inference API.
    Returns WAV bytes or None if failed.
    """
    if not HF_TOKEN:
        logger.warning("[MusicGen] No HF token — skipping generation")
        return None

    payload = {
        "inputs": style_description,
        "parameters": {
            "max_new_tokens": int(duration_seconds * 50),
            "do_sample":      True,
            "guidance_scale": 3.0,
        },
    }
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type":  "application/json",
    }

    logger.info(f"[MusicGen] Prompt: '{style_description[:60]}...' ({duration_seconds}s)")

    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in range(3):
            try:
                resp = await client.post(HF_SMALL, json=payload, headers=headers)

                if resp.status_code == 503:
                    wait = int(resp.headers.get("X-Wait-For-Model", "20"))
                    logger.info(f"[MusicGen] Model loading, waiting {wait}s...")
                    await asyncio.sleep(min(wait, 30))
                    continue

                if resp.status_code == 429:
                    logger.warning("[MusicGen] Rate limited — waiting 30s")
                    await asyncio.sleep(30)
                    continue

                if resp.status_code == 401:
                    logger.error("[MusicGen] Invalid HF token")
                    return None

                resp.raise_for_status()
                audio_bytes = resp.content
                logger.info(f"[MusicGen] Got {len(audio_bytes)} bytes")
                return audio_bytes

            except httpx.TimeoutException:
                logger.warning(f"[MusicGen] Timeout (attempt {attempt + 1}/3)")
                if attempt == 2:
                    return None
            except Exception as e:
                logger.error(f"[MusicGen] Error: {e}")
                return None

    return None


async def generate_all_arrangements(
    genre: str,
    key: str,
    bpm: int,
    duration_s: int = 25,
) -> dict:
    """
    Generate all 7 arrangement variants (Output A-G) concurrently.
    Returns {label: wav_bytes | None}
    """
    tasks = {}
    for label, template in ARRANGEMENT_PROMPTS.items():
        prompt = template.format(genre=genre, key=key, bpm=bpm)
        tasks[label] = generate_arrangement(prompt, duration_s)

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    output = {}
    for label, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            logger.error(f"[MusicGen] Arrangement {label} failed: {result}")
            output[label] = None
        else:
            output[label] = result

    return output


def generate_silence(duration_s: int, sr: int = 22050) -> bytes:
    """Return silent WAV as fallback when MusicGen is unavailable."""
    import numpy as np
    import soundfile as sf

    silence = np.zeros(sr * duration_s, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, silence, sr, format="WAV")
    return buf.getvalue()
