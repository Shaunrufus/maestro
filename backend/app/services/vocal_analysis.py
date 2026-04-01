# backend/app/services/vocal_analysis.py
# MAESTRO — Vocal Analysis Service
# Extracts musical properties from a raw vocal recording:
#   - Musical key (C, D, Eb, etc.)
#   - Tempo / BPM
#   - Chord progression (timed chord sequence)
#   - Melody notes (pitch sequence)
#   - Genre hints (based on scale and tempo)
#
# Install: pip install librosa numpy scipy

import io
import numpy as np
from typing import List, Tuple, Dict, Any

try:
    import librosa
    LIBROSA_OK = True
except ImportError:
    LIBROSA_OK = False


# ─── Constants ────────────────────────────────────────────────────────────

NOTE_NAMES  = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Major and minor chord templates (12-dimensional chroma vectors)
# 1 = note in chord, 0 = not in chord
CHORD_TEMPLATES: Dict[str, np.ndarray] = {}

def _build_templates():
    """Build major and minor chord templates for all 12 root notes."""
    major_intervals = [0, 4, 7]   # root, major 3rd, perfect 5th
    minor_intervals = [0, 3, 7]   # root, minor 3rd, perfect 5th
    dom7_intervals  = [0, 4, 7, 10]
    maj7_intervals  = [0, 4, 7, 11]

    for root_idx, root_name in enumerate(NOTE_NAMES):
        for name, intervals in [
            (f'{root_name}',    major_intervals),
            (f'{root_name}m',   minor_intervals),
            (f'{root_name}7',   dom7_intervals),
            (f'{root_name}maj7', maj7_intervals),
        ]:
            template = np.zeros(12)
            for interval in intervals:
                template[(root_idx + interval) % 12] = 1
            CHORD_TEMPLATES[name] = template / np.linalg.norm(template)

_build_templates()


# ─── Main Analysis Function ───────────────────────────────────────────────

async def analyze_vocal(audio_bytes: bytes) -> Dict[str, Any]:
    """
    Full analysis of a vocal recording.
    Returns: key, bpm, chord_sequence, melody_notes, duration, genre_hint
    """
    if not LIBROSA_OK:
        return _fallback_analysis()

    try:
        with io.BytesIO(audio_bytes) as buf:
            y, sr = librosa.load(buf, sr=44100, mono=True)

        duration = len(y) / sr

        # ── 1. Separate harmonic component (removes percussion/noise) ──
        y_harm, _ = librosa.effects.hpss(y)

        # ── 2. Detect BPM ──────────────────────────────────────────────
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(tempo))
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # ── 3. Detect musical key from chroma ──────────────────────────
        chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)
        mean_chroma = np.mean(chroma, axis=1)
        key_idx = int(np.argmax(mean_chroma))
        key_name = NOTE_NAMES[key_idx]

        # Determine major vs minor via Krumhansl-Schmuckler profiles
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                                   2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                                   2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        major_scores = np.array([np.corrcoef(np.roll(major_profile, i), mean_chroma)[0,1]
                                  for i in range(12)])
        minor_scores = np.array([np.corrcoef(np.roll(minor_profile, i), mean_chroma)[0,1]
                                  for i in range(12)])

        best_major = np.argmax(major_scores)
        best_minor = np.argmax(minor_scores)

        if major_scores[best_major] >= minor_scores[best_minor]:
            key_full = f"{NOTE_NAMES[best_major]} major"
            key_type = "major"
            root_idx  = int(best_major)
        else:
            key_full = f"{NOTE_NAMES[best_minor]} minor"
            key_type = "minor"
            root_idx  = int(best_minor)

        # ── 4. Detect chord progression (2-bar segments) ───────────────
        hop_length = 512
        segment_frames = int(sr * 2.0 / hop_length)  # 2-second segments

        chord_sequence: List[Dict] = []
        n_frames = chroma.shape[1]

        for seg_start in range(0, n_frames, segment_frames):
            seg_end   = min(seg_start + segment_frames, n_frames)
            seg_chroma = np.mean(chroma[:, seg_start:seg_end], axis=1)

            if np.linalg.norm(seg_chroma) < 0.01:
                continue  # skip silence

            seg_chroma_norm = seg_chroma / (np.linalg.norm(seg_chroma) + 1e-10)

            # Find best matching chord
            best_chord = "C"
            best_score = -1
            for chord_name, template in CHORD_TEMPLATES.items():
                score = float(np.dot(seg_chroma_norm, template))
                if score > best_score:
                    best_score  = score
                    best_chord  = chord_name

            start_time = librosa.frames_to_time(seg_start, sr=sr, hop_length=hop_length)
            end_time   = librosa.frames_to_time(seg_end,   sr=sr, hop_length=hop_length)

            chord_sequence.append({
                "chord":      best_chord,
                "start":      round(float(start_time), 2),
                "end":        round(float(end_time), 2),
                "confidence": round(float(best_score), 3),
            })

        # ── 5. Simplify to a clean repeating progression ───────────────
        unique_chords = list(dict.fromkeys([c["chord"] for c in chord_sequence]))[:8]
        progression_str = " → ".join(unique_chords[:4])

        # ── 6. Detect melody notes (top pitch per frame) ───────────────
        f0, voiced_flag, _ = librosa.pyin(
            y_harm,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C6"),
            sr=sr,
        )
        voiced_f0 = [f for f, v in zip(f0, voiced_flag) if v and f and not np.isnan(f)]
        avg_pitch   = float(np.mean(voiced_f0)) if voiced_f0 else 0
        pitch_note  = librosa.hz_to_note(avg_pitch) if avg_pitch > 0 else "C4"

        # ── 7. Genre hint from BPM + key type ─────────────────────────
        genre_hint = _guess_genre(bpm, key_type)

        return {
            "key":          key_full,
            "key_short":    NOTE_NAMES[root_idx],
            "key_type":     key_type,
            "bpm":          bpm,
            "duration_sec": round(duration, 1),
            "chord_sequence": chord_sequence,
            "simple_progression": unique_chords[:4],
            "progression_str":   progression_str,
            "avg_pitch_note":    pitch_note,
            "genre_hint":        genre_hint,
            "voiced_pct":        round(100 * len(voiced_f0) / max(len(f0), 1), 1),
        }

    except Exception as e:
        print(f"[VocalAnalysis] Error: {e}")
        return _fallback_analysis()


def _guess_genre(bpm: int, key_type: str) -> str:
    """Simple genre heuristic from BPM and key type."""
    if bpm < 70:
        return "slow_ballad"
    elif bpm < 90:
        return "devotional" if key_type == "major" else "sad_ballad"
    elif bpm < 110:
        return "folk" if key_type == "major" else "classical"
    elif bpm < 130:
        return "bollywood_pop" if key_type == "major" else "contemporary"
    else:
        return "energetic_pop" if key_type == "major" else "dance"


def _fallback_analysis() -> Dict[str, Any]:
    """Return a sensible default when librosa is unavailable."""
    return {
        "key":              "C major",
        "key_short":        "C",
        "key_type":         "major",
        "bpm":              90,
        "duration_sec":     30.0,
        "chord_sequence":   [],
        "simple_progression": ["C", "G", "Am", "F"],
        "progression_str":  "C → G → Am → F",
        "avg_pitch_note":   "C4",
        "genre_hint":       "bollywood_pop",
        "voiced_pct":       70.0,
        "fallback":         True,
    }
