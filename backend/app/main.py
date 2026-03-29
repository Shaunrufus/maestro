# backend/app/main.py — MAESTRO Backend v2 (Complete)
# All routes registered: health, audio, guru, multitrack (Phase 3)
#
# Deploy to Railway:
#   1. Push backend/ to GitHub
#   2. railway.app → New → from GitHub → select backend/
#   3. Set env vars: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
#   4. Railway auto-runs: uvicorn app.main:app --host 0.0.0.0 --port $PORT

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.audio_routes      import router as audio_router
# from app.routes.guru_routes        import router as guru_router
from app.routes.multitrack_routes  import router as multitrack_router

app = FastAPI(
    title       = "MAESTRO Backend",
    description = "Virtual Studio — AI audio services",
    version     = "2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# Register all routers
app.include_router(audio_router)
# app.include_router(guru_router)
app.include_router(multitrack_router)

@app.get("/health")
async def health():
    return { "status": "ok", "version": "2.0.0", "service": "MAESTRO Backend" }
