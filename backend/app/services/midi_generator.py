# backend/app/services/midi_generator.py
# MAESTRO — MIDI Generator
# Converts a chord progression + arrangement style into a MIDI file
# that FluidSynth can render into audio.
#
# Install: pip install mido pretty_midi

import io
import math
from typing import List, Dict, Optional

try:
    import mido
    from mido import MidiFile, MidiTrack, Message, MetaMessage
    MIDO_OK = True
except ImportError:
    MIDO_OK = False


# ─── MIDI Channel → General MIDI Instrument ──────────────────────────────
# General MIDI Program Numbers (0-indexed):
GM_INSTRUMENTS = {
    'grand_piano':    0,    # Acoustic Grand Piano
    'electric_piano': 4,    # Electric Piano 1 (Rhodes)
    'harpsichord':    6,
    'acoustic_guitar':25,   # Acoustic Guitar (steel)
    'electric_guitar':26,   # Electric Guitar (jazz)
    'nylon_guitar':   24,   # Acoustic Guitar (nylon) — folk sound
    'bass':           33,   # Electric Bass (finger)
    'upright_bass':   32,   # Acoustic Bass
    'violin':         40,
    'strings':        48,   # String Ensemble 1
    'choir':          52,   # Choir Aahs
    'pad':            89,   # Pad 2 (warm)
    'sitar':          104,  # Sitar
    'banjo':          105,  # Banjo — nearest to tabla timbre in GM
    'flute':          73,   # Flute
    'oboe':           68,   # Oboe — warm wind
    'brass':          61,   # Brass Section
    'french_horn':    60,
}

# Rhythm patterns: list of (beat_offset, velocity) per beat in a measure
# Each beat_offset is in ticks (480 = 1 beat at 480 ppq resolution)
RHYTHM_PATTERNS: Dict[str, Dict[str, List[tuple]]] = {
    # ----- Bollywood Pop (4/4, Keherwa-inspired) -----
    'bollywood_pop': {
        'bass': [
            (0, 90), (240, 70), (480, 90), (720, 65),   # down-upbeats
        ],
        'chord': [
            (0, 75), (480, 65), (960, 72), (1440, 62),  # 4 chords per bar
        ],
        'tabla': [
            # Keherwa: Na Ge Na Ge, Na Tin Na Ge
            (0, 85), (120, 60), (240, 75), (360, 55),
            (480, 90), (600, 60), (720, 80), (840, 60),
            (960, 85), (1200, 70), (1440, 90), (1680, 65),
        ],
        'melody': [
            (0, 75), (480, 70), (960, 72), (1440, 68),
        ],
    },

    # ----- Acoustic Folk -----
    'folk': {
        'bass': [(0, 80), (960, 75)],
        'chord': [
            (0, 65), (240, 55), (480, 60), (720, 52),
            (960, 65), (1200, 55), (1440, 60), (1680, 52),
        ],
        'melody': [(0, 70), (480, 65), (960, 72), (1440, 68)],
    },

    # ----- Lo-Fi Chill -----
    'lofi': {
        'bass': [(0, 75), (480, 65), (720, 60)],
        'chord': [
            (0, 55), (360, 48), (720, 52), (1080, 45),
        ],
        'melody': [(0, 60), (720, 58), (1440, 62)],
    },

    # ----- Classical Indian -----
    'classical': {
        'bass': [(0, 80), (960, 80)],        # tanpura-like drone
        'chord': [(0, 65), (1920, 65)],      # slow harmonic rhythm
        'tabla': [
            # Teentaal (16 beat): simplified
            (0, 90), (240, 55), (480, 75), (720, 60),
            (960, 85), (1200, 60), (1440, 75), (1680, 55),
        ],
        'melody': [(0, 70), (960, 65)],
    },

    # ----- Full Orchestral -----
    'orchestral': {
        'bass': [(0, 85), (480, 75), (960, 80)],
        'chord': [(0, 70), (480, 65), (960, 72), (1440, 68)],
        'melody': [(0, 80), (480, 75), (960, 80), (1440, 70)],
        'strings_high': [(0, 62), (240, 55), (480, 60), (960, 62)],
    },

    # ----- Contemporary R&B -----
    'rnb': {
        'bass': [(0, 85), (360, 70), (720, 80), (1080, 68)],
        'chord': [(0, 65), (480, 58), (960, 62), (1440, 55)],
        'melody': [(0, 72), (480, 68), (960, 70), (1440, 65)],
    },
}


def generate_midi(
    chord_sequence: List[Dict],
    arrangement_style: str,
    bpm: int = 90,
    bars: int = 4,
    extra_instruments: Optional[List[str]] = None,
) -> Optional[bytes]:
    """
    Generate a MIDI file from a chord sequence.

    Args:
        chord_sequence: List of {"chord","root","quality","midi_notes","start","duration"}
        arrangement_style: "bollywood_pop", "folk", "lofi", "classical", "orchestral", "rnb"
        bpm: Beats per minute
        bars: Total number of bars to generate
        extra_instruments: Additional instrument names to include

    Returns:
        MIDI file as bytes, or None if mido not available
    """
    if not MIDO_OK:
        return None

    ppq    = 480          # pulses per quarter note
    tempo  = mido.bpm2tempo(bpm)  # microseconds per beat
    ticks_per_bar = ppq * 4       # 4/4 time

    mid = MidiFile(ticks_per_minute=ppq, type=1)
    style = arrangement_style.lower()

    # ── Metadata track ──────────────────────────────────────────────
    meta_track = MidiTrack()
    meta_track.append(MetaMessage('set_tempo', tempo=tempo, time=0))
    meta_track.append(MetaMessage('time_signature',
                                   numerator=4, denominator=4,
                                   clocks_per_click=24, notated_32nd_notes_per_beat=8,
                                   time=0))
    meta_track.append(MetaMessage('track_name', name='MAESTRO', time=0))
    mid.tracks.append(meta_track)

    # ── Determine which tracks to build ──────────────────────────────
    style_config = _get_style_config(style)

    for track_role, track_config in style_config.items():
        track = _build_track(
            track_role    = track_role,
            track_config  = track_config,
            chord_sequence= chord_sequence,
            bpm           = bpm,
            bars          = bars,
            ppq           = ppq,
        )
        mid.tracks.append(track)

    # ── Write to bytes ───────────────────────────────────────────────
    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()


def _get_style_config(style: str) -> Dict[str, Dict]:
    """Return track configuration for each arrangement style."""
    configs = {
        'bollywood_pop': {
            'piano_chords': {'program': GM_INSTRUMENTS['grand_piano'],  'channel': 0, 'octave_offset': 0, 'role': 'chord'},
            'bass':         {'program': GM_INSTRUMENTS['bass'],          'channel': 1, 'octave_offset':-12, 'role': 'bass'},
            'strings':      {'program': GM_INSTRUMENTS['strings'],       'channel': 2, 'octave_offset': 12, 'role': 'strings_high'},
        },
        'folk': {
            'guitar':       {'program': GM_INSTRUMENTS['nylon_guitar'],  'channel': 0, 'octave_offset': 0, 'role': 'chord'},
            'bass':         {'program': GM_INSTRUMENTS['upright_bass'],  'channel': 1, 'octave_offset':-12, 'role': 'bass'},
            'flute':        {'program': GM_INSTRUMENTS['flute'],         'channel': 2, 'octave_offset': 12, 'role': 'melody'},
        },
        'lofi': {
            'electric_piano':{'program': GM_INSTRUMENTS['electric_piano'],'channel': 0, 'octave_offset': 0, 'role': 'chord'},
            'bass':           {'program': GM_INSTRUMENTS['bass'],         'channel': 1, 'octave_offset':-12, 'role': 'bass'},
            'pad':            {'program': GM_INSTRUMENTS['pad'],          'channel': 2, 'octave_offset': 0, 'role': 'chord'},
        },
        'classical': {
            'sitar':        {'program': GM_INSTRUMENTS['sitar'],         'channel': 0, 'octave_offset': 0, 'role': 'melody'},
            'tanpura':      {'program': GM_INSTRUMENTS['pad'],           'channel': 1, 'octave_offset':-12, 'role': 'bass'},
        },
        'orchestral': {
            'strings':      {'program': GM_INSTRUMENTS['strings'],       'channel': 0, 'octave_offset': 0, 'role': 'chord'},
            'piano':        {'program': GM_INSTRUMENTS['grand_piano'],   'channel': 1, 'octave_offset': 0, 'role': 'melody'},
            'bass':         {'program': GM_INSTRUMENTS['upright_bass'],  'channel': 2, 'octave_offset':-12, 'role': 'bass'},
            'brass':        {'program': GM_INSTRUMENTS['brass'],         'channel': 3, 'octave_offset': 0, 'role': 'strings_high'},
        },
        'rnb': {
            'electric_piano':{'program': GM_INSTRUMENTS['electric_piano'],'channel': 0, 'octave_offset': 0, 'role': 'chord'},
            'bass':          {'program': GM_INSTRUMENTS['bass'],          'channel': 1, 'octave_offset':-12, 'role': 'bass'},
            'pad':           {'program': GM_INSTRUMENTS['pad'],           'channel': 2, 'octave_offset': 12, 'role': 'melody'},
        },
    }
    return configs.get(style, configs['bollywood_pop'])


def _build_track(
    track_role: str,
    track_config: Dict,
    chord_sequence: List[Dict],
    bpm: int,
    bars: int,
    ppq: int,
) -> MidiTrack:
    """Build a single MIDI track for one instrument part."""
    track   = MidiTrack()
    channel = track_config['channel']
    program = track_config['program']
    octave_offset = track_config.get('octave_offset', 0)
    role    = track_config.get('role', 'chord')

    # Set instrument
    track.append(Message('program_change', channel=channel, program=program, time=0))

    ticks_per_bar = ppq * 4
    rhythm_pattern = RHYTHM_PATTERNS.get(
        list(RHYTHM_PATTERNS.keys())[0], {}  # fallback
    ).get(role, [(0, 70)])

    # Find the closest style rhythm patterns
    for style_key, style_patterns in RHYTHM_PATTERNS.items():
        if role in style_patterns:
            rhythm_pattern = style_patterns[role]
            break

    chord_idx  = 0
    prev_tick  = 0
    note_events = []  # (tick, type, channel, note, velocity)

    for bar in range(bars):
        bar_start_tick = bar * ticks_per_bar

        # Get current chord (cycle through progression)
        if chord_sequence:
            current_chord = chord_sequence[chord_idx % len(chord_sequence)]
            chord_idx += 1
        else:
            current_chord = {'midi_notes': [60, 64, 67], 'root': 'C'}

        notes_to_play = current_chord['midi_notes']

        if role == 'bass':
            # Bass plays root note one octave below
            notes_to_play = [notes_to_play[0] + octave_offset]
        elif role in ('chord', 'strings_high'):
            notes_to_play = [n + octave_offset for n in notes_to_play]
        elif role == 'melody':
            # Melody uses root + 5th, slightly ornamented
            notes_to_play = [notes_to_play[0] + octave_offset, notes_to_play[-1] + octave_offset]
        elif role == 'tabla':
            # Tabla uses percussion channel (9) or pitched notes as rhythm
            notes_to_play = [38, 36]  # snare + kick approximation

        for beat_offset, velocity in rhythm_pattern:
            note_start_tick = bar_start_tick + beat_offset
            note_dur_tick   = int(ppq * 0.9)  # slightly shorter than full beat (legato)

            for note in notes_to_play:
                note = max(0, min(127, note))
                note_events.append((note_start_tick, 'on',  channel, note, velocity))
                note_events.append((note_start_tick + note_dur_tick, 'off', channel, note, 0))

    # Sort by tick, then 'off' before 'on' at same tick
    note_events.sort(key=lambda e: (e[0], 0 if e[1] == 'off' else 1))

    # Convert absolute ticks to delta ticks
    prev_tick = 0
    for tick, msg_type, ch, note, vel in note_events:
        delta = tick - prev_tick
        if msg_type == 'on':
            track.append(Message('note_on',  channel=ch, note=note, velocity=vel, time=delta))
        else:
            track.append(Message('note_off', channel=ch, note=note, velocity=0,   time=delta))
        prev_tick = tick

    track.append(MetaMessage('end_of_track', time=0))
    return track
