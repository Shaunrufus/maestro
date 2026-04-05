# backend/app/routes/editor_routes.py
# ─────────────────────────────────────────────────────────────────────────────
# MAESTRO — Audio Editor Routes
# POST /editor/process — Apply effects (EQ, compression, reverb, trim, autotune)
# ─────────────────────────────────────────────────────────────────────────────

import io
import base64
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import numpy as np

router = APIRouter(prefix="/editor", tags=["Editor"])

try:
    import librosa
    import soundfile as sf
    LIBS_OK = True
except ImportError:
    LIBS_OK = False

SR = 44100


def _apply_eq(y: np.ndarray, sr: int, bass: float, mid: float, treble: float) -> np.ndarray:
    """Simple 3-band EQ using scipy butterworth filters."""
    try:
        from scipy.signal import butter, sosfilt

        # Bass: 0-200 Hz
        sos_low = butter(4, 200, btype='low', fs=sr, output='sos')
        bass_signal = sosfilt(sos_low, y)

        # Mid: 200-3000 Hz
        sos_mid = butter(4, [200, 3000], btype='band', fs=sr, output='sos')
        mid_signal = sosfilt(sos_mid, y)

        # Treble: 3000+ Hz
        sos_high = butter(4, 3000, btype='high', fs=sr, output='sos')
        treble_signal = sosfilt(sos_high, y)

        # Mix with gain (0.0 = silent, 0.5 = normal, 1.0 = boosted)
        bass_gain   = bass * 2      # 0 → 0x, 0.5 → 1x, 1.0 → 2x
        mid_gain    = mid * 2
        treble_gain = treble * 2

        result = bass_signal * bass_gain + mid_signal * mid_gain + treble_signal * treble_gain
        return result
    except ImportError:
        return y  # No scipy → return unchanged


def _apply_compression(y: np.ndarray, ratio: float) -> np.ndarray:
    """Simple dynamic range compression."""
    if ratio <= 0:
        return y

    threshold = 0.5
    # Where signal exceeds threshold, reduce by ratio
    above = np.abs(y) > threshold
    compressed = y.copy()
    compressed[above] = np.sign(y[above]) * (threshold + (np.abs(y[above]) - threshold) * (1 - ratio * 0.8))

    return compressed


def _apply_reverb(y: np.ndarray, sr: int, amount: float) -> np.ndarray:
    """Simple reverb via convolution with exponential decay impulse."""
    if amount <= 0.01:
        return y

    # Create impulse response (exponential decay)
    reverb_length = int(sr * 0.3 * amount)  # up to 0.3s reverb tail
    if reverb_length < 10:
        return y

    impulse = np.exp(-np.linspace(0, 6, reverb_length))
    impulse = impulse / np.sum(impulse)

    # Add early reflections
    impulse[int(reverb_length * 0.1)] += 0.3
    impulse[int(reverb_length * 0.2)] += 0.15

    # Convolve
    wet = np.convolve(y, impulse, mode='full')[:len(y)]

    # Mix dry/wet
    return y * (1 - amount * 0.6) + wet * (amount * 0.6)


@router.post("/process")
async def process_audio(
    file:              UploadFile = File(...),
    autotune_strength: float      = Form(0.75),
    reverb:            float      = Form(0.0),
    eq_bass:           float      = Form(0.5),
    eq_mid:            float      = Form(0.5),
    eq_treble:         float      = Form(0.5),
    compression:       float      = Form(0.0),
    trim_start:        float      = Form(0.0),
    trim_end:          float      = Form(1.0),
):
    """
    Apply processing chain to uploaded audio:
    1. Trim
    2. Auto-tune
    3. EQ (3-band)
    4. Compression
    5. Reverb
    """
    audio_bytes = await file.read()
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large")

    if not LIBS_OK:
        return {"status": "error", "message": "Audio processing libraries not available"}

    try:
        # Load audio
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=SR, mono=True)

        # 1. Trim
        total_len = len(y)
        start_idx = int(trim_start * total_len)
        end_idx   = int(trim_end * total_len)
        y = y[start_idx:end_idx]

        if len(y) < SR * 0.3:
            raise HTTPException(400, "Trimmed audio too short")

        # 2. Auto-tune
        autotune_mode = 'none'
        if autotune_strength > 0.05:
            from app.services.autotune import apply_autotune_pipeline
            buf_in = io.BytesIO()
            sf.write(buf_in, y, sr, format='WAV', subtype='PCM_16')
            tuned_bytes = await apply_autotune_pipeline(
                audio_bytes=buf_in.getvalue(),
                strength=autotune_strength,
            )
            with io.BytesIO(tuned_bytes) as buf:
                y, _ = librosa.load(buf, sr=SR, mono=True)
            autotune_mode = 'applied'

        # 3. EQ
        y = _apply_eq(y, sr, eq_bass, eq_mid, eq_treble)

        # 4. Compression
        y = _apply_compression(y, compression)

        # 5. Reverb
        y = _apply_reverb(y, sr, reverb)

        # Normalize
        peak = np.max(np.abs(y))
        if peak > 0.95:
            y = y * (0.95 / peak)

        # Output
        buf_out = io.BytesIO()
        sf.write(buf_out, y, sr, format='WAV', subtype='PCM_16')
        audio_b64 = base64.b64encode(buf_out.getvalue()).decode('utf-8')

        return {
            "status": "ok",
            "audio_base64": audio_b64,
            "duration_sec": round(len(y) / sr, 2),
            "autotune_mode": autotune_mode,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Processing failed: {str(e)}")
