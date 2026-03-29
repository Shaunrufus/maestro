# backend/app/routes/multitrack_routes.py
# MAESTRO Phase 3 — Multitrack & Comping Routes

import base64, json
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.comping  import score_take, build_comp_plan, render_comp
# from app.services.autotune import apply_autotune_pipeline

router = APIRouter(prefix="/multitrack", tags=["Multitrack Phase 3"])


# ─── Score a single take ────────────────────────────────────────────────────
@router.post("/score-take")
async def score_take_endpoint(file: UploadFile = File(...)):
    """Score a take: pitch, timing, energy, overall."""
    audio = await file.read()
    scores = await score_take(audio)
    return scores


# ─── Score multiple takes and suggest best comp ─────────────────────────────
class CompSuggestRequest(BaseModel):
    project_id: str
    track_id:   str
    take_ids:   List[str]
    n_regions:  int = 5

@router.post("/comp-suggest")
async def suggest_comp(req: CompSuggestRequest):
    """
    Suggest optimal comp plan given scored takes.
    In production: fetch take audio from Supabase Storage, score each, build plan.
    Here: returns demo plan (no Supabase integration yet).
    """
    # Demo scores (replace with real scoring after Supabase Storage is wired)
    demo_scores = [
        {"pitch": 82.0, "timing": 78.0, "energy": 75.0, "overall": 79.0},
        {"pitch": 91.0, "timing": 85.0, "energy": 88.0, "overall": 88.5},
        {"pitch": 76.0, "timing": 72.0, "energy": 80.0, "overall": 76.0},
    ][:len(req.take_ids)]

    plan = build_comp_plan(demo_scores, n_regions=req.n_regions)
    return { "regions": plan, "take_scores": demo_scores }


# ─── Render final comp from plan ────────────────────────────────────────────
class RegionPlan(BaseModel):
    id:        str
    startPct:  float
    endPct:    float
    takeIndex: int
    label:     str

class RenderCompRequest(BaseModel):
    project_id:   str
    regions:      List[RegionPlan]
    crossfade_ms: int = 10

@router.post("/render-comp")
async def render_comp_endpoint(req: RenderCompRequest):
    """
    Render final composite vocal from comp plan.
    Production: fetch takes from Supabase, render, upload result.
    """
    # Placeholder — returns success with mock URL
    # TODO: fetch take audio bytes from Supabase Storage by project_id
    return {
        "status":       "ok",
        "output_url":   f"https://YOUR_SUPABASE_URL/storage/v1/object/recordings/{req.project_id}/comp.wav",
        "crossfade_ms": req.crossfade_ms,
        "regions":      len(req.regions),
    }


# ─── Mixdown ─────────────────────────────────────────────────────────────────
class MixdownRequest(BaseModel):
    project_id:    str
    preset:        str  = "clean_pop"
    loudness_lufs: int  = -14
    format:        str  = "wav_hq"

PRESET_CONFIGS = {
    "clean_pop":  { "eq_hi_shelf": 2.0,  "compression": 0.6, "reverb": 0.2 },
    "lofi":       { "eq_low_pass": 8000, "saturation":  0.4, "reverb": 0.35 },
    "worship":    { "eq_hi_shelf": 1.5,  "compression": 0.3, "reverb": 0.5  },
    "bollywood":  { "eq_mid_boost": 3.0, "compression": 0.7, "reverb": 0.3  },
    "hip_hop":    { "eq_sub_boost": 4.0, "compression": 0.8, "reverb": 0.15 },
    "classical":  { "compression":  0.1, "reverb":      0.4               },
}

@router.post("/mixdown")
async def mixdown(req: MixdownRequest):
    """
    Apply genre preset + loudness normalisation and export.
    Production: fetch stems from Supabase, process, upload final mix.
    """
    config = PRESET_CONFIGS.get(req.preset, PRESET_CONFIGS["clean_pop"])
    return {
        "status":        "ok",
        "preset":        req.preset,
        "config":        config,
        "loudness_lufs": req.loudness_lufs,
        "format":        req.format,
        "download_url":  f"https://YOUR_SUPABASE_URL/storage/v1/object/recordings/{req.project_id}/final_mix.wav",
        "note":          "Connect Supabase service key in env to enable real file processing.",
    }
