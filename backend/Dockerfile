# MAESTRO Backend — Railway Dockerfile
# python:3.11-slim = standard pip, no Nix quirks

FROM python:3.11-slim

# System dependencies for audio processing (librosa/soundfile/fluidsynth)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    fluidsynth \
    fluid-soundfont-gm \
    praat \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Use shell script to expand $PORT env var at runtime
EXPOSE 8080

# Health check for Railway (tests /health endpoint every 10s, timeout 5s)
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-keep-alive 60 --log-level info"]
