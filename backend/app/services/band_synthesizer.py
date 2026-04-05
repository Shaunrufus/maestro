# backend/app/services/band_synthesizer.py
# ─────────────────────────────────────────────────────────────────────────────
# MAESTRO Band Synthesizer V2
#
# Generates 7 distinct arrangement outputs using:
#   1. Intelligent MIDI generation (midi_generator.py)
#   2. SoundFont rendering via MeltySynth or improved fallback (soundfont_renderer.py)
#   3. Vocal + backing mix with proper headroom
#
# Each arrangement has distinct instrumentation, tempo variation, and feel.
# ─────────────────────────────────────────────────────────────────────────────

import io
import base64
from typing import Dict, List, Optional

import numpy as np

try:
    from pydub import AudioSegment
    PYDUB_OK = True
except ImportError:
    PYDUB_OK = False

from app.services.soundfont_renderer import render_notes, ndarray_to_wav_bytes, get_renderer_info
from app.services.midi_generator import generate_arrangement_notes

SR = 44100


# ─── Arrangement Metadata ────────────────────────────────────────────────────
ARRANGEMENTS = [
    {
        "id":    "bollywood_pop",
        "label": "Output A",
        "emoji": "🎬",
        "desc":  "Piano · Tabla · Strings",
        "color": "#FF6B35",
        "metadata": {"tempo_label": "Medium", "feel": "energetic",
                     "instruments": ["Piano", "Tabla", "Strings"]}
    },
    {
        "id":    "folk",
        "label": "Output B",
        "emoji": "🎸",
        "desc":  "Guitar · Flute · Bass",
        "color": "#4CAF50",
        "metadata": {"tempo_label": "Relaxed", "feel": "acoustic",
                     "instruments": ["Guitar", "Flute", "Bass"]}
    },
    {
        "id":    "lofi",
        "label": "Output C",
        "emoji": "🌙",
        "desc":  "Piano · Bass (Lo-Fi)",
        "color": "#7C4DFF",
        "metadata": {"tempo_label": "Slow", "feel": "chill",
                     "instruments": ["Piano", "Bass"]}
    },
    {
        "id":    "classical_teentaal",
        "label": "Output D",
        "emoji": "🪗",
        "desc":  "Sitar · Tabla · Strings (16-beat)",
        "color": "#FF9800",
        "metadata": {"tempo_label": "Brisk", "feel": "classical",
                     "instruments": ["Sitar", "Tabla", "Strings"]}
    },
    {
        "id":    "classical_ektal",
        "label": "Output E",
        "emoji": "🪕",
        "desc":  "Sitar · Tabla (6-beat)",
        "color": "#FF5722",
        "metadata": {"tempo_label": "Slow", "feel": "meditative",
                     "instruments": ["Sitar", "Tabla"]}
    },
    {
        "id":    "orchestral",
        "label": "Output F",
        "emoji": "🎻",
        "desc":  "Strings · Piano · Brass",
        "color": "#2196F3",
        "metadata": {"tempo_label": "Grand", "feel": "epic",
                     "instruments": ["Strings", "Piano", "Brass"]}
    },
    {
        "id":    "rnb",
        "label": "Output G",
        "emoji": "✨",
        "desc":  "Keys · Bass (R&B Groove)",
        "color": "#E91E63",
        "metadata": {"tempo_label": "Smooth", "feel": "groovy",
                     "instruments": ["Piano", "Bass"]}
    },
]


# ─── Load vocal audio ────────────────────────────────────────────────────────

def _load_vocal(audio_bytes: bytes) -> np.ndarray:
    """Load vocal audio bytes into float32 mono numpy array at SR."""
    try:
        if PYDUB_OK:
            seg = AudioSegment.from_file(io.BytesIO(audio_bytes))
            seg = seg.set_frame_rate(SR).set_channels(1).set_sample_width(2)
            return np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0
        else:
            import soundfile as sf
            arr, orig_sr = sf.read(io.BytesIO(audio_bytes), dtype='float32')
            if arr.ndim > 1:
                arr = arr.mean(axis=1)
            if orig_sr != SR:
                import librosa
                arr = librosa.resample(arr, orig_sr=orig_sr, target_sr=SR)
            return arr
    except Exception as e:
        print(f"[BandSynth] Vocal load failed: {e}")
        return np.zeros(SR * 5, dtype=np.float32)  # 5s silence


# ─── Mix vocal + backing ─────────────────────────────────────────────────────

def _mix_tracks(vocal: np.ndarray, backing: np.ndarray,
                vocal_vol: float = 0.75, backing_vol: float = 0.50) -> np.ndarray:
    """Mix vocal and backing track with proper headroom."""
    n = max(len(vocal), len(backing))
    v = np.zeros(n, dtype=np.float32)
    b = np.zeros(n, dtype=np.float32)
    v[:len(vocal)]  = vocal * vocal_vol
    b[:len(backing)] = backing * backing_vol

    mixed = v + b
    peak = np.max(np.abs(mixed))
    if peak > 0.95:
        mixed = mixed * (0.95 / peak)
    return mixed


# ─── Generate single arrangement ─────────────────────────────────────────────

def _generate_single_arrangement(
    vocal_arr:      np.ndarray,
    chord_sequence: List[Dict],
    arrangement_id: str,
    bpm:            int,
    duration_sec:   float,
    user_instruments: Optional[List[str]] = None,
) -> Dict:
    """Generate one arrangement: MIDI → render → mix with vocal → base64 WAV."""

    arr_meta = None
    for a in ARRANGEMENTS:
        if a['id'] == arrangement_id:
            arr_meta = dict(a)
            break
    if not arr_meta:
        arr_meta = dict(ARRANGEMENTS[0])

    try:
        # Step 1: Generate intelligent MIDI note events
        notes = generate_arrangement_notes(
            chord_sequence   = chord_sequence,
            arrangement_id   = arrangement_id,
            bpm              = bpm,
            duration_sec     = duration_sec,
            user_instruments = user_instruments,
        )

        print(f"[BandSynth] {arrangement_id}: {len(notes)} notes generated")

        if not notes:
            raise ValueError(f"No notes generated for {arrangement_id}")

        # Step 2: Render notes to audio using SoundFont or fallback
        backing_arr = render_notes(notes, duration_sec, SR)

        # Step 3: Mix with vocal
        mixed = _mix_tracks(vocal_arr, backing_arr)

        # Step 4: Convert to WAV bytes → base64
        wav_bytes = ndarray_to_wav_bytes(mixed, SR)
        audio_b64 = base64.b64encode(wav_bytes).decode('utf-8')

        # Update metadata
        meta = dict(arr_meta.get('metadata', {}))
        meta['tempo'] = bpm
        meta['renderer'] = get_renderer_info()['engine']
        if user_instruments:
            meta['instruments'] = [i.capitalize() for i in user_instruments]

        return {
            **arr_meta,
            'metadata':     meta,
            'audio_base64': audio_b64,
            'mime_type':    'audio/wav',
            'duration_sec': duration_sec,
            'has_audio':    True,
        }

    except Exception as e:
        print(f"[BandSynth] FAILED {arrangement_id}: {e}")
        import traceback; traceback.print_exc()
        return {
            **arr_meta,
            'audio_base64': None,
            'mime_type':    None,
            'duration_sec': 0,
            'has_audio':    False,
            'error':        str(e),
        }


# ─── Public API ───────────────────────────────────────────────────────────────

async def generate_all_arrangements(
    vocal_bytes:          bytes,
    chord_sequence:       List[Dict],
    bpm:                  int = 90,
    duration_sec:         float = 30.0,
    selected_styles:      Optional[List[str]] = None,
    selected_instruments: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Generate multiple arrangement versions. Each arrangement has:
    - Distinct instrumentation (different GM programs)
    - Different rhythm patterns (strumming vs arpeggiation vs comping)
    - Tempo variation per style
    - Humanized velocity/timing

    Returns list of arrangement dicts with audio_base64 WAV data.
    """
    # Load vocal once
    vocal_arr = _load_vocal(vocal_bytes)

    # Clamp duration
    duration_sec = min(duration_sec, 60.0)  # Max 60s per arrangement
    if duration_sec < 3.0:
        duration_sec = 15.0  # Minimum useful duration

    styles_to_generate = selected_styles or [a['id'] for a in ARRANGEMENTS]

    results = []
    for arr in ARRANGEMENTS:
        if arr['id'] not in styles_to_generate:
            continue

        result = _generate_single_arrangement(
            vocal_arr        = vocal_arr,
            chord_sequence   = chord_sequence,
            arrangement_id   = arr['id'],
            bpm              = bpm,
            duration_sec     = duration_sec,
            user_instruments = selected_instruments,
        )
        results.append(result)

    renderer_info = get_renderer_info()
    print(f"[BandSynth] Done: {len(results)} arrangements, engine={renderer_info['engine']}")

    return results
