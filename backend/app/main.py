"""
MAESTRO FastAPI Backend — Main Entry Point v3
==========================================
CRITICAL: ALL heavy imports (librosa, numpy, scipy) must be LAZY (inside functions).
Loading them at module level causes Railway to OOM during startup (512MB limit).

Boot sequence: FastAPI starts → routes registered → first request triggers lazy load.
Peak RAM during audio processing: ~150MB. At idle: ~80MB.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle. Keep startup lightweight."""
    logger.info("MAESTRO backend starting...")
    logger.info(f"Environment: PORT={os.getenv('PORT', '8000')}")
    yield
    logger.info("MAESTRO backend shutting down")


app = FastAPI(
    title="MAESTRO API",
    version="3.0.0",
    description="Virtual Recording Studio — AutoTune + Vocal Intelligence + Virtual Band",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register routers ─────────────────────────────────────────────────────────
# Import here (not at top) so module-level code in routes doesn't trigger heavy imports

from app.routes.audio_routes import router as audio_router
from app.routes.guru_routes import router as guru_router

app.include_router(audio_router)
app.include_router(guru_router)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "MAESTRO API v3",
        "endpoints": [
            "POST /audio/upload-and-process",
            "POST /audio/autotune",
            "GET  /audio/autotune/test",
            "POST /audio/analyze",
            "POST /audio/arrangements/generate",
            "GET  /audio/arrangements/{session_id}/{label}",
            "POST /guru/chat",
        ]
    }


@app.get("/")
async def root():
    return {"message": "MAESTRO API is live", "docs": "/docs"}

app.include_router(audio_router)
app.include_router(guru_router)
app.include_router(multitrack_router)
app.include_router(band_router)
app.include_router(editor_router)

