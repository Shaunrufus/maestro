"""
MAESTRO AutoTune Service — v3 (Pure Python, No Praat, No psola package)
=====================================================
Zero external C dependencies. Works on Railway out of the box.

Stack:
  - librosa   → load audio (handles m4a via ffmpeg), pyin pitch detection
  - numpy     → signal math
  - scipy     → signal processing (PSOLA resampling, butterworth filter)
  - soundfile → write WAV output

Algorithm: PYIN pitch detection → scale quantization → PSOLA pitch shifting
Same algorithm as professional tools (WolfSound, autotone.js, AutoTalent)
"""

import io
import logging
import tempfile
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import scipy.signal
import soundfile as sf

logger = logging.getLogger(__name__)

# ─── Music Theory ─────────────────────────────────────────────────────────────

SCALES = {
    # Western
    "major":          [0, 2, 4, 5, 7, 9, 11],
    "minor":          [0, 2, 3, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "pentatonic":     [0, 2, 4, 7, 9],
    "blues":          [0, 3, 5, 6, 7, 10],
    "dorian":         [0, 2, 3, 5, 7, 9, 10],
    # Indian (basic ragas mapped to 12-TET)
    "bhairavi":       [0, 1, 3, 5, 7, 8, 10],   # Carnatic: Hanumattodi
    "yaman":          [0, 2, 4, 6, 7, 9, 11],   # Kalyan thaat
    "bhairav":        [0, 1, 4, 5, 7, 8, 11],
    "kafi":           [0, 2, 3, 5, 7, 9, 10],
    "bilawal":        [0, 2, 4, 5, 7, 9, 11],
    "khamaj":         [0, 2, 4, 5, 7, 9, 10],
}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
A4_HZ   = 440.0
A4_MIDI = 69


def hz_to_midi(freq: float) -> float:
    if freq <= 0 or np.isnan(freq):
        return np.nan
    return 69 + 12 * np.log2(freq / A4_HZ)


def midi_to_hz(midi: float) -> float:
    if np.isnan(midi):
        return np.nan
    return A4_HZ * 2 ** ((midi - A4_MIDI) / 12)


def detect_key(f0_hz: np.ndarray) -> Tuple[int, str]:
    """Detect musical key from pitch array using chroma profile + KS algorithm."""
    voiced = f0_hz[~np.isnan(f0_hz) & (f0_hz > 0)]
    if len(voiced) < 10:
        return 0, "major"

    midis = 69 + 12 * np.log2(np.clip(voiced, 20, 5000) / 440.0)
    chroma = np.zeros(12)
    for m in midis:
        if not np.isnan(m):
            chroma[int(m) % 12] += 1
    chroma /= chroma.sum() + 1e-8

    # Krumhansl-Schmuckler profiles
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                               2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                               2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    best_score, best_root, best_scale = -999, 0, "major"
    for root in range(12):
        rot = np.roll(chroma, -root)
        for profile, scale_name in [(major_profile, "major"), (minor_profile, "minor")]:
            score = np.corrcoef(rot, profile)[0, 1]
            if score > best_score:
                best_score, best_root, best_scale = score, root, scale_name

    return best_root, best_scale


def snap_pitch_to_scale(f0_hz: float, root: int, scale_name: str) -> float:
    """Snap a pitch (Hz) to the nearest note in the given scale."""
    if np.isnan(f0_hz) or f0_hz <= 0:
        return f0_hz

    scale_intervals = SCALES.get(scale_name, SCALES["major"])
    midi = hz_to_midi(f0_hz)
    if np.isnan(midi):
        return f0_hz

    octave = int(midi // 12)
    candidates = []
    for oct_offset in [-1, 0, 1]:
        for interval in scale_intervals:
            candidates.append((octave + oct_offset) * 12 + root + interval)

    candidates = np.array(candidates, dtype=float)
    closest = candidates[np.argmin(np.abs(candidates - midi))]
    return midi_to_hz(closest)


# ─── STFT Phase Vocoder Block Processing ───────────────────────────────────────

def stft_block_autotune(
    audio: np.ndarray,
    sr: int,
    source_f0: np.ndarray,
    target_f0: np.ndarray,
    hop_length: int = 512,
) -> np.ndarray:
    """
    STFT Phase Vocoder based Pitch Shifting (Librosa wrap).
    Instead of per-cycle time-domain resampling which is slow and error-prone,
    we group frames into contiguous blocks with similar pitch shifts and 
    use librosa's optimized internal phase vocoder + resampling.
    """
    import librosa
    n = len(audio)
    output = np.zeros(n, dtype=np.float32)
    weight = np.zeros(n, dtype=np.float32)
    
    n_frames = min(len(source_f0), len(target_f0))
    semitone_shifts = np.zeros(n_frames)
    
    # Calculate step shifts
    for i in range(n_frames):
        sf0, tf0 = source_f0[i], target_f0[i]
        if not np.isnan(sf0) and sf0 > 0 and not np.isnan(tf0) and tf0 > 0:
            semitone_shifts[i] = 12 * np.log2(tf0 / sf0)
        else:
            semitone_shifts[i] = 0.0

    # Group into blocks of constant shift (+/- 0.25 semitones)
    blocks = []
    current_shift = semitone_shifts[0]
    start_frame = 0
    
    for i in range(1, n_frames):
        if abs(semitone_shifts[i] - current_shift) > 0.25:
            blocks.append((start_frame, i, current_shift))
            current_shift = semitone_shifts[i]
            start_frame = i
    blocks.append((start_frame, n_frames, current_shift))

    # Process each block
    for start_f, end_f, shift in blocks:
        start_samp = start_f * hop_length
        end_samp   = min(end_f * hop_length + hop_length, n)
        
        block_len = end_samp - start_samp
        if block_len < hop_length:
            continue
            
        block_audio = audio[start_samp:end_samp]
        
        # Apply STFT phase vocoder shift via librosa
        if abs(shift) > 0.1:
            try:
                shifted = librosa.effects.pitch_shift(
                    block_audio, 
                    sr=sr, 
                    n_steps=shift,
                    bins_per_octave=12,
                    res_type='soxr_hq' # High quality resample
                )
            except Exception:
                shifted = block_audio # Fallback if block is too small
        else:
            shifted = block_audio
            
        # Ensure length match
        if len(shifted) > block_len:
            shifted = shifted[:block_len]
        elif len(shifted) < block_len:
            shifted = np.pad(shifted, (0, block_len - len(shifted)))
            
        # Apply crossfade window (tukey-like overlapping)
        window = np.hanning(block_len).astype(np.float32)
        if start_f == 0: window[:block_len//2] = 1.0
        if end_f == n_frames: window[block_len//2:] = 1.0
        
        output[start_samp:end_samp] += shifted * window
        weight[start_samp:end_samp] += window
        
    # Normalize weights
    mask = weight > 1e-8
    output[mask] /= weight[mask]
    
    return output


# ─── Main AutoTune Entry Point ────────────────────────────────────────────────

def autotune_audio(
    audio_bytes: bytes,
    input_format: str = "m4a",
    correction_strength: float = 0.8,
    scale_name: Optional[str] = None,
    root_note: Optional[int] = None,
    add_effect: bool = False,
) -> Tuple[bytes, dict]:
    """
    Apply autotune to vocal audio.

    Args:
        audio_bytes:         Raw audio file bytes (m4a, wav, mp3, etc.)
        input_format:        File extension hint for decoder
        correction_strength: 0.0 = no correction, 1.0 = hard snap to scale
        scale_name:          Force a specific scale (None = auto-detect)
        root_note:           Root semitone 0-11 (None = auto-detect)
        add_effect:          True = robotic T-Pain style, False = transparent

    Returns:
        (wav_bytes, metadata_dict)
    """
    try:
        import librosa
    except ImportError:
        raise RuntimeError("librosa not installed. Run: pip install librosa")

    # ── 1. Load audio ──────────────────────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=f".{input_format}", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        logger.info(f"[AutoTune v3] Loaded: {len(y)} samples, {sr}Hz, {len(y)/sr:.1f}s")
    except Exception as e:
        logger.error(f"[AutoTune v3] Load failed: {e}")
        raise RuntimeError(f"Could not decode audio: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if len(y) < sr * 0.5:
        raise ValueError("Audio too short (< 0.5 seconds)")

    # ── 2. PYIN pitch detection ────────────────────────────────────────────────
    hop_length   = 512
    frame_length = 2048

    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
        frame_length=frame_length,
        hop_length=hop_length,
    )

    voiced_count = int(np.sum(voiced_flag))
    total_frames = len(f0)
    vocal_pct    = round(voiced_count / max(total_frames, 1) * 100, 1)
    logger.info(f"[AutoTune v3] Voiced: {voiced_count}/{total_frames} ({vocal_pct}%)")

    if voiced_count < 5:
        logger.warning("[AutoTune v3] Very few voiced frames — returning original")
        buf = io.BytesIO()
        sf.write(buf, y, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue(), {
            "key": "?", "scale": "unknown", "auto_tune_pct": 0,
            "vocal_pct": vocal_pct, "engine": "passthrough",
            "warning": "no_vocal_detected",
        }

    # ── 3. Auto-detect key ────────────────────────────────────────────────────
    if scale_name is None or root_note is None:
        det_root, det_scale = detect_key(f0)
        if root_note is None:
            root_note = det_root
        if scale_name is None:
            scale_name = det_scale

    key_name = NOTE_NAMES[root_note] + " " + scale_name
    logger.info(f"[AutoTune v3] Key: {key_name}")

    # ── 4. Build target pitch contour ─────────────────────────────────────────
    target_f0      = np.copy(f0)
    corrected      = 0

    for i in range(len(f0)):
        if voiced_flag[i] and not np.isnan(f0[i]) and f0[i] > 0:
            snapped = snap_pitch_to_scale(f0[i], root_note, scale_name)

            if add_effect:
                target_f0[i] = snapped
            else:
                ratio_src    = np.log2(f0[i] / 440.0)
                ratio_tgt    = np.log2(snapped / 440.0) if snapped > 0 else ratio_src
                blended      = ratio_src + correction_strength * (ratio_tgt - ratio_src)
                target_f0[i] = 440.0 * 2 ** blended

            if abs(target_f0[i] - f0[i]) > 1.0:
                corrected += 1
        else:
            target_f0[i] = np.nan

    correction_pct = round(corrected / max(voiced_count, 1) * 100, 1)
    logger.info(f"[AutoTune v3] Corrected {corrected} frames ({correction_pct}%)")

    # ── 5. STFT Block Phase Vocoder ────────────────────────────────────────────
    try:
        y_tuned = stft_block_autotune(y, sr, f0, target_f0, hop_length=hop_length)
        engine  = "stft_vocoder"
    except Exception as e:
        logger.error(f"[AutoTune v3] STFT block failed: {e} — using librosa fallback")
        try:
            # Fallback: global semitone shift via librosa
            semitones = correction_strength * 2  # rough approximation
            y_tuned   = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
            engine    = "librosa_shift"
        except Exception as e2:
            logger.error(f"[AutoTune v3] Librosa fallback also failed: {e2}")
            y_tuned = y
            engine  = "passthrough"

    # ── 6. Post-process ────────────────────────────────────────────────────────
    b, a    = scipy.signal.butter(4, 80 / (sr / 2), btype="high")
    y_tuned = scipy.signal.filtfilt(b, a, y_tuned.astype(np.float64)).astype(np.float32)

    peak = np.max(np.abs(y_tuned))
    if peak > 0.98:
        y_tuned = y_tuned * (0.95 / peak)

    # ── 7. Encode WAV ─────────────────────────────────────────────────────────
    buf = io.BytesIO()
    sf.write(buf, y_tuned, sr, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    metadata = {
        "key":               key_name,
        "root_semitone":     int(root_note),
        "scale":             scale_name,
        "auto_tune_pct":     int(correction_pct),
        "vocal_pct":         vocal_pct,
        "duration_s":        round(len(y) / sr, 2),
        "sample_rate":       sr,
        "correction_strength": correction_strength,
        "engine":            engine,
    }

    logger.info(f"[AutoTune v3] Done ({engine}). Output: {len(wav_bytes)}b. {metadata}")
    return wav_bytes, metadata


# ─── Legacy shim: keep the old apply_autotune_pipeline API alive ──────────────
# (band_routes.py and audio_routes.py call these)

AUTOTUNE_ENGINE = "stft_vocoder"


def get_autotune_status() -> str:
    return AUTOTUNE_ENGINE


async def apply_autotune_pipeline(
    audio_bytes: bytes,
    strength: float    = 0.8,
    key: str           = "C",
    scale_type: str    = "major",
) -> bytes:
    """Legacy async wrapper — returns corrected WAV bytes."""
    # Map key name → root semitone
    key_map = {"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,
               "F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11}
    root = key_map.get(key.strip().capitalize(), 0)

    wav_bytes, _ = autotune_audio(
        audio_bytes        = audio_bytes,
        input_format       = "m4a",
        correction_strength= strength,
        scale_name         = scale_type,
        root_note          = root,
        add_effect         = False,
    )
    return wav_bytes


# ─── CLI test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        path = sys.argv[1]
        fmt  = path.split(".")[-1]
        with open(path, "rb") as f:
            data = f.read()
        wav_bytes, meta = autotune_audio(data, input_format=fmt)
        out_path = path.rsplit(".", 1)[0] + "_tuned.wav"
        with open(out_path, "wb") as f:
            f.write(wav_bytes)
        print(f"Saved: {out_path}")
        print(f"Metadata: {meta}")
    else:
        print("Usage: python autotune.py <input_audio.m4a>")
