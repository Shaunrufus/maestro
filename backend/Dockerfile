# MAESTRO Backend — Railway Dockerfile
# Uses python:3.11-slim (guaranteed pip, no Nix quirks)
# Installs libsndfile + ffmpeg for librosa/soundfile audio processing

FROM python:3.11-slim

# System dependencies for audio processing
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies (cached layer — only rebuilds if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose default port (Railway overrides with $PORT env var)
EXPOSE 8080

# Start server — shell form so $PORT env var expands correctly
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
