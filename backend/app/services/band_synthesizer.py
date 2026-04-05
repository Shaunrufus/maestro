# backend/app/services/band_synthesizer.py
# MAESTRO — Band Synthesizer
# Renders MIDI files to audio using FluidSynth + SF2 SoundFonts,
# then mixes with the vocal recording using pydub.
#
# Install:
#   pip install pyfluidsynth pydub mido
#   apt-get install fluidsynth fluid-soundfont-gm libsndfile1  (Railway nixpacks)
#
# SoundFont setup on Railway:
#   - Download FluidR3_GM.sf2 (~150MB) and commit to backend/soundfonts/
#   - OR download at startup from a GitHub release asset

import os
import io
import base64
import tempfile
import math
from typing import Dict, List, Optional

try:
    import fluidsynth
    FLUID_OK = True
except ImportError:
    FLUID_OK = False

try:
    from pydub import AudioSegment
    PYDUB_OK = True
except ImportError:
    PYDUB_OK = False


# ─── SoundFont paths ──────────────────────────────────────────────────────
# Priority order: environment variable → bundled in repo → system default
SOUNDFONT_PATHS = [
    os.environ.get('SOUNDFONT_PATH', ''),
    '/app/soundfonts/FluidR3_GM.sf2',
    '/usr/share/sounds/sf2/FluidR3_GM.sf2',
    '/usr/share/soundfonts/FluidR3_GM.sf2',
    os.path.expanduser('~/.fluidsynth/default_sound_font.sf2'),
]

def _find_soundfont() -> Optional[str]:
    for path in SOUNDFONT_PATHS:
        if path and os.path.exists(path):
            return path
    return None


# ─── Arrangement style definitions ────────────────────────────────────────
ARRANGEMENTS = [
    {
        "id":    "bollywood_pop",
        "label": "Output A",
        "emoji": "🎬",
        "desc":  "Piano · Tabla · Strings",
        "color": "#FF6B35",
        "metadata": {"tempo": 102, "feel": "energetic", "instruments": ["Piano", "Tabla", "Strings"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "folk",
        "label": "Output B",
        "emoji": "🎸",
        "desc":  "Guitar · Bansuri · Bass",
        "color": "#4CAF50",
        "metadata": {"tempo": 90, "feel": "acoustic", "instruments": ["Guitar", "Bansuri", "Bass"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "lofi",
        "label": "Output C",
        "emoji": "🌙",
        "desc":  "Electric Piano · Pad · Bass",
        "color": "#7C4DFF",
        "metadata": {"tempo": 76, "feel": "chill", "instruments": ["Electric Piano", "Synth Pad", "Bass"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "classical_teentaal",
        "label": "Output D",
        "emoji": "🪗",
        "desc":  "Sitar · Tabla · Tanpura",
        "color": "#FF9800",
        "metadata": {"tempo": 110, "feel": "classical", "instruments": ["Sitar", "Tabla", "Tanpura"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "classical_ektal",
        "label": "Output E",
        "emoji": "🪕",
        "desc":  "Sitar · Tabla (12beat)",
        "color": "#FF5722",
        "metadata": {"tempo": 85, "feel": "classical", "instruments": ["Sitar", "Tabla"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "orchestral",
        "label": "Output F",
        "emoji": "🎻",
        "desc":  "Strings · Piano · Brass",
        "color": "#2196F3",
        "metadata": {"tempo": 95, "feel": "epic", "instruments": ["Strings", "Piano", "Brass"], "chords": ["C", "Am", "F", "G"]}
    },
    {
        "id":    "rnb",
        "label": "Output G",
        "emoji": "✨",
        "desc":  "Electric Piano · Pad · Bass",
        "color": "#E91E63",
        "metadata": {"tempo": 88, "feel": "smooth", "instruments": ["Electric Piano", "Bass", "Drums"], "chords": ["C", "Am", "F", "G"]}
    },
]


# ─── Main synthesis function ───────────────────────────────────────────────
def synthesize_band(
    midi_bytes: bytes,
    arrangement_style: str,
    duration_sec: float = 30.0,
    sample_rate: int = 44100,
) -> Optional[bytes]:
    """
    Render MIDI to WAV audio using FluidSynth.

    Returns WAV bytes, or None if FluidSynth unavailable.
    """
    if not FLUID_OK:
        print("[BandSynth] FluidSynth not available — returning None")
        return None

    sf_path = _find_soundfont()
    if not sf_path:
        print("[BandSynth] No SoundFont found — check SOUNDFONT_PATH env var")
        return None

    # Write MIDI to temp file (FluidSynth needs a file path)
    with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as midi_file:
        midi_file.write(midi_bytes)
        midi_path = midi_file.name

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as wav_file:
        wav_path = wav_file.name

    try:
        # Use FluidSynth command-line (most reliable on Railway)
        result = os.system(
            f'fluidsynth -ni "{sf_path}" "{midi_path}" -F "{wav_path}" -r {sample_rate}'
        )

        if result != 0 or not os.path.exists(wav_path):
            # Try Python API as fallback
            return _synth_via_api(sf_path, midi_bytes, duration_sec, sample_rate)

        with open(wav_path, 'rb') as f:
            return f.read()

    finally:
        for path in [midi_path, wav_path]:
            try:
                os.unlink(path)
            except Exception:
                pass


def _synth_via_api(
    sf_path: str,
    midi_bytes: bytes,
    duration_sec: float,
    sample_rate: int,
) -> Optional[bytes]:
    """Fallback: use pyfluidsynth Python API to generate samples."""
    try:
        import mido
        mid = mido.MidiFile(file=io.BytesIO(midi_bytes))

        fs = fluidsynth.Synth(samplerate=float(sample_rate))
        sfid = fs.sfload(sf_path)

        # Load all programs used in the MIDI
        for track in mid.tracks:
            for msg in track:
                if msg.type == 'program_change':
                    fs.program_select(msg.channel, sfid, 0, msg.program)

        total_ticks    = sum(t for t in [msg.time for track in mid.tracks for msg in track])
        samples_needed = int(duration_sec * sample_rate)

        # Process MIDI events
        current_time = 0.0
        tempo        = 500000  # default 120 BPM in microseconds
        samples      = []

        for msg in mido.merge_tracks(mid.tracks):
            if msg.time > 0:
                # Generate samples for the elapsed time
                elapsed_sec = mido.tick2second(msg.time, mid.ticks_per_beat, tempo)
                n_samples   = int(elapsed_sec * sample_rate)
                s = fs.get_samples(n_samples)
                samples.extend(s)

            if msg.type == 'set_tempo':
                tempo = msg.tempo
            elif msg.type == 'note_on' and msg.velocity > 0:
                fs.noteon(msg.channel, msg.note, msg.velocity)
            elif msg.type in ('note_off', 'note_on'):
                fs.noteoff(msg.channel, msg.note)

        # Pad or trim to desired duration
        target = samples_needed * 2  # stereo
        if len(samples) < target:
            samples.extend([0] * (target - len(samples)))
        samples = samples[:target]

        fs.delete()

        # Convert to WAV bytes
        import struct, wave
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, 'wb') as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            raw = fluidsynth.raw_audio_string(samples)
            wf.writeframes(raw)
        return wav_buf.getvalue()

    except Exception as e:
        print(f"[BandSynth] API fallback failed: {e}")
        return None


# ─── Mix vocals + backing ─────────────────────────────────────────────────
def mix_vocal_with_band(
    vocal_bytes: bytes,
    backing_wav_bytes: bytes,
    vocal_volume_db: float = 0.0,
    backing_volume_db: float = -6.0,
    output_format: str = 'wav',
) -> Optional[bytes]:
    """
    Overlay vocal audio on top of backing track.

    Args:
        vocal_bytes:       Raw bytes of vocal recording (.m4a or .wav)
        backing_wav_bytes: WAV bytes of synthesized band
        vocal_volume_db:   dB adjustment for vocals (0 = no change)
        backing_volume_db: dB adjustment for backing (-6 = quieter)
        output_format:     'wav' or 'mp3'

    Returns:
        Mixed audio as bytes
    """
    if not PYDUB_OK:
        print("[BandSynth] pydub not available — returning vocal only")
        return vocal_bytes

    try:
        # Load vocal
        vocal = AudioSegment.from_file(io.BytesIO(vocal_bytes))
        vocal = vocal.normalize()
        if vocal_volume_db != 0:
            vocal += vocal_volume_db

        # Load backing
        backing = AudioSegment.from_wav(io.BytesIO(backing_wav_bytes))
        backing = backing.normalize()
        backing += backing_volume_db

        # Match lengths — loop backing if shorter than vocal
        if len(backing) < len(vocal):
            repeats = math.ceil(len(vocal) / len(backing))
            backing = backing * repeats
        backing = backing[:len(vocal)]

        # Add slight reverb to backing (simulate room sound)
        # Note: pydub doesn't have reverb natively — use fade tricks
        # For proper reverb, use librosa or pyrubberband

        # Overlay vocal on backing
        mixed = backing.overlay(vocal, position=0)

        # Normalize final mix
        mixed = mixed.normalize()

        # Export
        out_buf = io.BytesIO()
        if output_format == 'mp3':
            mixed.export(out_buf, format='mp3', bitrate='192k')
        else:
            mixed.export(out_buf, format='wav')

        return out_buf.getvalue()

    except Exception as e:
        print(f"[BandSynth] Mix failed: {e}")
        return vocal_bytes  # return vocal-only on failure


# ─── Generate all arrangements for a recording ───────────────────────────
async def generate_all_arrangements(
    vocal_bytes: bytes,
    chord_sequence: List[Dict],
    bpm: int = 90,
    duration_sec: float = 30.0,
    selected_styles: Optional[List[str]] = None,
    selected_instruments: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Generate multiple arrangement versions for a vocal recording.
    """
    from .midi_generator import generate_midi

    styles_to_generate = selected_styles or [a["id"] for a in ARRANGEMENTS]
    results = []

    # Map raw instrument keys from frontend to capitalized names for UI
    instr_map = {
        'keys': 'Piano', 'guitar': 'Guitar', 'tabla': 'Tabla',
        'flute': 'Flute', 'sitar': 'Sitar', 'strings': 'Strings'
    }
    
    user_instr_labels = None
    if selected_instruments:
        user_instr_labels = [instr_map.get(i.lower(), i.capitalize()) for i in selected_instruments]

    for arr in ARRANGEMENTS:
        if arr["id"] not in styles_to_generate:
            continue

        try:
            # 1. Generate MIDI
            midi_bytes = generate_midi(
                chord_sequence    = chord_sequence,
                arrangement_style = arr["id"],
                bpm               = bpm,
                bars              = max(4, int(duration_sec / (60.0/bpm) / 4) + 1),
                extra_instruments = selected_instruments,
            )

            if not midi_bytes:
                results.append(_arrangement_placeholder(arr))
                continue

            # 2. Synthesize MIDI → WAV
            backing_wav = synthesize_band(
                midi_bytes        = midi_bytes,
                arrangement_style = arr["id"],
                duration_sec      = duration_sec,
            )

            if not backing_wav:
                results.append(_arrangement_placeholder(arr))
                continue

            # 3. Mix vocals + band
            mixed = mix_vocal_with_band(
                vocal_bytes       = vocal_bytes,
                backing_wav_bytes = backing_wav,
            )

            if not mixed:
                results.append(_arrangement_placeholder(arr))
                continue

            # 4. Encode as base64 for API response
            audio_b64 = base64.b64encode(mixed).decode('utf-8')

            # Build metadata, overriding instruments if user selected specific ones
            meta = dict(arr.get("metadata", {}))
            if user_instr_labels:
                meta["instruments"] = user_instr_labels

            results.append({
                **arr,
                "metadata":     meta,
                "audio_base64": audio_b64,
                "mime_type":    "audio/wav",
                "duration_sec": duration_sec,
                "has_audio":    True,
            })

        except Exception as e:
            print(f"[BandSynth] Failed {arr['id']}: {e}")
            results.append(_arrangement_placeholder(arr))

    return results


def _arrangement_placeholder(arr: Dict) -> Dict:
    """Return arrangement metadata without audio (for when synth fails)."""
    return {
        **arr,
        "audio_base64": None,
        "mime_type":    None,
        "duration_sec": 0,
        "has_audio":    False,
        "error":        "Synthesis unavailable — add FluidSynth to Railway build",
    }
