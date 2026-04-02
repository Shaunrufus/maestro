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

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info"]
