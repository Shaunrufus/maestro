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

        # ── 4 & 5. Intelligent Melody-to-Chord Engine ───────────────
        # Slice the entire time sequence into 4 equal blocks (representing a 4-bar phrase)
        # and assign a chord that fits the primary melody note of that block.
        
        f0, voiced_flag, _ = librosa.pyin(
            y_harm,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C6"),
            sr=sr,
        )
        
        voiced_frames_total = int(np.sum(voiced_flag))
        voiced_f0 = [f for f, v in zip(f0, voiced_flag) if v and f and not np.isnan(f)]
        avg_pitch = float(np.mean(voiced_f0)) if voiced_f0 else 0
        pitch_note = librosa.hz_to_note(avg_pitch).replace('♯', '#') if avg_pitch > 0 else "C4"
        
        unique_chords = []
        chord_sequence: List[Dict] = []
        num_blocks = 4
        frames_per_block = len(f0) // num_blocks
        
        for i in range(num_blocks):
            start_frame = i * frames_per_block
            end_frame = min(start_frame + frames_per_block, len(f0))
            
            block_f0 = f0[start_frame:end_frame]
            block_voiced = voiced_flag[start_frame:end_frame]
            
            valid_pitches = block_f0[block_voiced & ~np.isnan(block_f0)]
            
            if len(valid_pitches) > 5:
                # Find the most common pitch class in this block
                median_hz = np.median(valid_pitches)
                pitch_str = librosa.hz_to_note(median_hz).replace('♯', '#')
                # Strip the octave number (e.g. "C#4" -> "C#")
                root_note_str = ''.join([c for c in pitch_str if not c.isdigit()])
                
                # Match to the global key type to determine if Major or Minor
                chord_quality = "m" if key_type == "minor" else ""
                
                # A simple heuristic: if the melody note is the root of an out-of-scale chord,
                # shift it. But for now, we map the melody root + key quality directly.
                generated_chord = root_note_str + chord_quality
            else:
                # Fallback to key root if silent block
                generated_chord = NOTE_NAMES[root_idx] + ("m" if key_type == "minor" else "")
                
            unique_chords.append(generated_chord)
            
            chord_sequence.append({
                "chord": generated_chord,
                "start": round(float(librosa.frames_to_time(start_frame, sr=sr, hop_length=512)), 2),
                "end": round(float(librosa.frames_to_time(end_frame, sr=sr, hop_length=512)), 2),
                "confidence": 1.0,
            })
            
        progression_str = " → ".join(unique_chords)

        # Pitch extraction is already done above.

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
