# backend/app/services/comping.py
# MAESTRO Phase 3 — Vocal Comping Service
# Scores takes, suggests best comp plan, renders final composite with crossfades
# Based on DAW-grade vocal comping principles (Logic Pro / Cubase style)

import io, os, numpy as np
from typing import List, Dict, Any

try:
    import librosa
    import soundfile as sf
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False


# ─── Take scoring ────────────────────────────────────────────────────────────
async def score_take(audio_bytes: bytes) -> Dict[str, float]:
    """
    Score a take on: pitch_accuracy, timing_stability, energy, presence.
    Returns dict with scores 0-100 and overall composite score.
    """
    if not AUDIO_AVAILABLE:
        return { "pitch": 75.0, "timing": 80.0, "energy": 70.0, "overall": 75.0 }

    with io.BytesIO(audio_bytes) as buf:
        y, sr = librosa.load(buf, sr=44100, mono=True)

    # Pitch accuracy — std deviation of f0 (lower = more in-tune)
    f0, vf, _ = librosa.pyin(y,
        fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr)
    valid_f0 = [f for f, v in zip(f0, vf) if v and f and not np.isnan(f)]
    pitch_stability = max(0, 100 - float(np.std(valid_f0)) * 2) if valid_f0 else 50.0

    # Energy — RMS loudness consistency
    rms_frames = librosa.feature.rms(y=y)[0]
    energy_score = float(100 - np.std(rms_frames) * 1000)
    energy_score = max(0, min(100, energy_score))

    # Voiced percentage (presence)
    voiced_pct = 100 * len(valid_f0) / max(len(f0), 1)

    # Timing — onset regularity (simplified)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
    if len(onsets) > 2:
        onset_intervals = np.diff(onsets)
        timing_score = max(0, 100 - float(np.std(onset_intervals)) * 100)
    else:
        timing_score = 70.0

    overall = (pitch_stability * 0.35 + timing_score * 0.25 +
               energy_score * 0.20 + voiced_pct * 0.20)

    return {
        "pitch":   round(pitch_stability, 1),
        "timing":  round(timing_score, 1),
        "energy":  round(energy_score, 1),
        "presence": round(voiced_pct, 1),
        "overall": round(overall, 1),
    }


# ─── Best comp plan ──────────────────────────────────────────────────────────
def build_comp_plan(
    take_scores: List[Dict[str, float]],
    n_regions:   int = 5,
) -> List[Dict[str, Any]]:
    """
    Given scores for N takes, build a comp plan choosing the best take
    for each region. Simple strategy: pick highest overall score per region.
    Phase 3 upgrade: use per-section scores for smarter phrase-level comping.
    """
    if not take_scores:
        return []

    # For each region, pick the take with highest overall score
    # with slight variety — don't always use the same take
    best_idx = max(range(len(take_scores)), key=lambda i: take_scores[i]['overall'])
    second   = sorted(range(len(take_scores)),
                      key=lambda i: take_scores[i]['overall'], reverse=True)

    region_size = 1.0 / n_regions
    plan = []
    for i in range(n_regions):
        # Alternate between top-2 takes for natural variety
        take_idx = second[0] if i % 2 == 0 else second[min(1, len(second)-1)]
        plan.append({
            "id":        f"r{i+1}",
            "startPct":  round(i * region_size, 3),
            "endPct":    round((i + 1) * region_size, 3),
            "takeIndex": take_idx,
            "label":     f"Region {i+1}",
        })
    return plan


# ─── Crossfade creation ──────────────────────────────────────────────────────
def apply_crossfade(
    seg_a: np.ndarray, seg_b: np.ndarray,
    sr: int, fade_ms: int = 10
) -> np.ndarray:
    """
    Apply linear crossfade between two audio segments.
    fade_ms: 5-20ms recommended (5ms on consonants, 15-20ms on vowels).
    """
    fade_samples = int(sr * fade_ms / 1000)
    fade_samples = min(fade_samples, len(seg_a), len(seg_b))

    # Fade out end of seg_a, fade in start of seg_b
    fade_out = np.linspace(1.0, 0.0, fade_samples)
    fade_in  = np.linspace(0.0, 1.0, fade_samples)

    overlap  = seg_a[-fade_samples:] * fade_out + seg_b[:fade_samples] * fade_in

    return np.concatenate([
        seg_a[:-fade_samples],
        overlap,
        seg_b[fade_samples:],
    ])


# ─── Render final comp ────────────────────────────────────────────────────────
async def render_comp(
    takes_audio:  List[bytes],          # raw WAV bytes for each take
    comp_plan:    List[Dict[str, Any]], # from build_comp_plan
    crossfade_ms: int = 10,
) -> bytes:
    """
    Assemble the final composite vocal from take segments per comp_plan.
    Returns rendered WAV bytes.
    """
    if not AUDIO_AVAILABLE or not takes_audio:
        return b""

    # Load all takes
    takes_y = []
    sr = 44100
    for raw in takes_audio:
        with io.BytesIO(raw) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)
        takes_y.append(y)

    # Find total length from longest take
    total_len = max(len(y) for y in takes_y)

    # Build comp
    result = np.zeros(total_len)
    prev_seg_end = 0

    for i, region in enumerate(comp_plan):
        take_y    = takes_y[region['takeIndex']]
        start_smp = int(region['startPct'] * total_len)
        end_smp   = int(region['endPct']   * total_len)
        end_smp   = min(end_smp, len(take_y))

        segment = take_y[start_smp:end_smp]
        if len(segment) == 0:
            continue

        if i == 0:
            result[start_smp:start_smp + len(segment)] = segment
        else:
            # Apply crossfade at boundary
            fade_samples = int(sr * crossfade_ms / 1000)
            # Blend into existing result
            overlap_start = max(0, start_smp - fade_samples)
            overlap_end   = min(total_len, start_smp + fade_samples)
            fade_in  = np.linspace(0.0, 1.0, overlap_end - overlap_start)
            fade_out = 1.0 - fade_in
            result[overlap_start:overlap_end] = (
                result[overlap_start:overlap_end] * fade_out +
                segment[:overlap_end - overlap_start] * fade_in
            )
            # Rest of segment after crossfade
            remainder_start = start_smp + fade_samples
            remainder_len   = len(segment) - fade_samples
            if remainder_len > 0:
                result[remainder_start:remainder_start + remainder_len] = \
                    segment[fade_samples:]

    # Encode output as WAV
    output_buf = io.BytesIO()
    sf.write(output_buf, result, sr, format='WAV', subtype='PCM_16')
    return output_buf.getvalue()
