# backend/app/main.py — MAESTRO Backend v2
# FastAPI app with health endpoint responding immediately on startup.
# Heavy audio libs (librosa) are imported lazily inside routes, not at module load.

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("maestro")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MAESTRO Backend starting up...")
    yield
    logger.info("MAESTRO Backend shutting down.")


app = FastAPI(
    title       = "MAESTRO Backend",
    description = "Virtual Studio — AI audio services",
    version     = "2.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─── Health check — must respond immediately ─────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "service": "MAESTRO Backend"}


# ─── Register routers ─────────────────────────────────────────────────────────
# Imported AFTER health endpoint so startup is never blocked
from app.routes.audio_routes      import router as audio_router
from app.routes.guru_routes        import router as guru_router
from app.routes.multitrack_routes  import router as multitrack_router

app.include_router(audio_router)
app.include_router(guru_router)
app.include_router(multitrack_router)
