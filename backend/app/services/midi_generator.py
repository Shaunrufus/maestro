# backend/app/services/midi_generator.py
# ─────────────────────────────────────────────────────────────────────────────
# INTELLIGENT MIDI GENERATION ENGINE
#
# Generates musically-aware MIDI note sequences for any instrument, using:
#   • Music theory: voice leading, chord inversions, walking bass lines
#   • Rhythm patterns: strumming, arpeggiation, comping, taal patterns
#   • Humanization: velocity variation, micro-timing offsets
#   • Style awareness: each arrangement style has distinct feel
#
# Output: List[Dict] of note events for soundfont_renderer.render_notes()
# ─────────────────────────────────────────────────────────────────────────────

import random
import math
from typing import List, Dict, Optional, Tuple

from app.services.soundfont_renderer import _get_gm_program

# ─── Music Theory Constants ──────────────────────────────────────────────────

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_MAP = {name: i for i, name in enumerate(NOTE_NAMES)}
NOTE_MAP.update({'Db': 1, 'Eb': 3, 'Fb': 4, 'Gb': 6, 'Ab': 8, 'Bb': 10, 'Cb': 11})

SCALE_INTERVALS = {
    'major':     [0, 2, 4, 5, 7, 9, 11],
    'minor':     [0, 2, 3, 5, 7, 8, 10],
    'dorian':    [0, 2, 3, 5, 7, 9, 10],
    'mixolydian':[0, 2, 4, 5, 7, 9, 10],
    'pentatonic':[0, 2, 4, 7, 9],
    'blues':     [0, 3, 5, 6, 7, 10],
}


def _parse_chord(chord_str: str) -> Tuple[int, List[int]]:
    """
    Parse chord string → (root_midi_in_octave_0, list_of_semitone_intervals).
    E.g. "Am7" → (9, [0, 3, 7, 10])
    """
    s = chord_str.strip()
    if not s:
        return (0, [0, 4, 7])  # C major default

    # Extract root note
    if len(s) >= 2 and s[1] in ('#', 'b'):
        root_name = s[:2]
        quality = s[2:]
    else:
        root_name = s[0]
        quality = s[1:]

    root = NOTE_MAP.get(root_name, 0)

    # Determine chord intervals
    q = quality.lower()
    if 'maj7' in q or 'M7' in quality:
        intervals = [0, 4, 7, 11]
    elif 'maj9' in q:
        intervals = [0, 4, 7, 11, 14]
    elif 'm7' in q or 'min7' in q:
        intervals = [0, 3, 7, 10]
    elif 'm9' in q:
        intervals = [0, 3, 7, 10, 14]
    elif 'dim7' in q:
        intervals = [0, 3, 6, 9]
    elif 'dim' in q:
        intervals = [0, 3, 6]
    elif 'aug' in q:
        intervals = [0, 4, 8]
    elif 'sus4' in q:
        intervals = [0, 5, 7]
    elif 'sus2' in q:
        intervals = [0, 2, 7]
    elif '7' in q:  # dominant 7th
        intervals = [0, 4, 7, 10]
    elif '9' in q:
        intervals = [0, 4, 7, 10, 14]
    elif 'm' in q or 'min' in q:
        intervals = [0, 3, 7]
    else:
        intervals = [0, 4, 7]  # major triad

    return (root, intervals)


def _chord_notes(chord_str: str, octave: int = 4) -> List[int]:
    """Get MIDI notes for a chord at given octave."""
    root, intervals = _parse_chord(chord_str)
    base = octave * 12 + root
    return [base + i for i in intervals]


def _humanize_velocity(base: int, variation: int = 15) -> int:
    """Add human-like velocity variation."""
    return max(30, min(127, base + random.randint(-variation, variation)))


def _humanize_time(t: float, amount: float = 0.012) -> float:
    """Add micro-timing variation (swing feel)."""
    return max(0, t + random.uniform(-amount, amount))


# ─── Instrument Pattern Generators ──────────────────────────────────────────

def generate_piano_comping(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    density: str = 'normal',  # sparse, normal, dense
    octave: int = 4,
) -> List[Dict]:
    """Generate piano comping pattern with voice-led chord voicings."""
    notes = []
    beat_sec = 60.0 / bpm

    # Comping patterns (beat positions within a bar)
    patterns = {
        'sparse':  [(0.0, 0.85), (2.0, 0.7)],  # whole notes/half notes
        'normal':  [(0.0, 0.85), (1.0, 0.6), (2.5, 0.7), (3.0, 0.5)],
        'dense':   [(0.0, 0.9), (0.5, 0.5), (1.0, 0.7), (1.5, 0.5),
                    (2.0, 0.8), (2.5, 0.5), (3.0, 0.7), (3.5, 0.5)],
    }
    pattern = patterns.get(density, patterns['normal'])

    for ci, chord_info in enumerate(chord_sequence):
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)
        c_dur = c_end - c_start

        chord_notes = _chord_notes(chord, octave)

        # Voice leading: try to keep notes close to previous chord
        bar_start = c_start
        while bar_start < c_end:
            for beat_offset, vel_mult in pattern:
                t = bar_start + beat_offset * beat_sec
                if t >= c_end or t >= duration_sec:
                    break

                # Note duration based on density
                dur = beat_sec * (1.5 if density == 'sparse' else 0.8 if density == 'dense' else 1.0)
                dur = min(dur, c_end - t)

                for midi_note in chord_notes:
                    notes.append({
                        'channel':   0,
                        'program':   _get_gm_program('piano'),
                        'note':      midi_note,
                        'velocity':  _humanize_velocity(int(85 * vel_mult)),
                        'start_sec': _humanize_time(t),
                        'end_sec':   t + dur,
                        'instrument':'piano',
                    })
            bar_start += 4 * beat_sec

    return notes


def generate_guitar_strumming(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    strum_style: str = 'folk',  # folk, pop, fingerpick
    octave: int = 3,
) -> List[Dict]:
    """Generate guitar strumming with down/up patterns and per-string delay."""
    notes = []
    beat_sec = 60.0 / bpm

    # Strum patterns: (beat, direction, velocity_mult)
    strum_patterns = {
        'folk':       [(0.0, 'D', 1.0), (1.0, 'D', 0.7), (1.5, 'U', 0.5),
                       (2.0, 'D', 0.9), (2.5, 'U', 0.5), (3.0, 'D', 0.7), (3.5, 'U', 0.5)],
        'pop':        [(0.0, 'D', 1.0), (0.5, 'U', 0.4), (1.5, 'D', 0.8),
                       (2.0, 'D', 0.9), (2.5, 'U', 0.4), (3.5, 'D', 0.7)],
        'fingerpick': [(0.0, 'P', 0.8), (0.5, 'P', 0.5), (1.0, 'P', 0.6),
                       (1.5, 'P', 0.5), (2.0, 'P', 0.7), (2.5, 'P', 0.5),
                       (3.0, 'P', 0.6), (3.5, 'P', 0.5)],
    }
    pattern = strum_patterns.get(strum_style, strum_patterns['folk'])

    for chord_info in chord_sequence:
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)

        # Guitar voicing: bass note + chord in higher register
        root, intervals = _parse_chord(chord)
        bass_note = octave * 12 + root
        chord_notes = [bass_note] + [(octave + 1) * 12 + root + i for i in intervals]

        bar_start = c_start
        while bar_start < c_end:
            for beat_offset, direction, vel_mult in pattern:
                t = bar_start + beat_offset * beat_sec
                if t >= c_end or t >= duration_sec:
                    break

                dur = beat_sec * 0.8

                if direction == 'P':
                    # Fingerpick: play one note from chord at a time
                    idx = random.randint(0, len(chord_notes) - 1)
                    notes.append({
                        'channel':   0,
                        'program':   _get_gm_program('guitar'),
                        'note':      chord_notes[idx],
                        'velocity':  _humanize_velocity(int(80 * vel_mult)),
                        'start_sec': _humanize_time(t),
                        'end_sec':   t + dur,
                        'instrument':'guitar',
                    })
                else:
                    # Strum: cascade notes with slight timing offset
                    strum_notes = chord_notes if direction == 'D' else list(reversed(chord_notes))
                    for i, midi_note in enumerate(strum_notes):
                        strum_delay = i * 0.015  # 15ms between strings
                        notes.append({
                            'channel':   0,
                            'program':   _get_gm_program('guitar'),
                            'note':      midi_note,
                            'velocity':  _humanize_velocity(int(80 * vel_mult)),
                            'start_sec': _humanize_time(t + strum_delay),
                            'end_sec':   t + dur,
                            'instrument':'guitar',
                        })
            bar_start += 4 * beat_sec

    return notes


def generate_walking_bass(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    style: str = 'walking',  # walking, root, groove
    octave: int = 2,
) -> List[Dict]:
    """Generate bass line: walking, root-fifth, or groove patterns."""
    notes = []
    beat_sec = 60.0 / bpm

    for ci, chord_info in enumerate(chord_sequence):
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)
        root, intervals = _parse_chord(chord)
        base = octave * 12 + root

        # Next chord root for approach notes
        if ci + 1 < len(chord_sequence):
            next_root, _ = _parse_chord(chord_sequence[ci + 1].get('chord', 'C'))
            next_base = octave * 12 + next_root
        else:
            next_base = base

        bar_start = c_start
        while bar_start < c_end:
            beats_remaining = int((c_end - bar_start) / beat_sec)

            if style == 'walking':
                # Walking bass: root, passing tone, 5th, chromatic approach
                walk_notes = [
                    base,
                    base + intervals[1] if len(intervals) > 1 else base + 4,
                    base + 7,  # fifth
                    next_base - 1 if next_base != base else base + 5,  # approach
                ]
                for i, mn in enumerate(walk_notes[:min(4, beats_remaining)]):
                    t = bar_start + i * beat_sec
                    if t >= c_end or t >= duration_sec:
                        break
                    notes.append({
                        'channel':   0,
                        'program':   _get_gm_program('bass'),
                        'note':      mn,
                        'velocity':  _humanize_velocity(90 if i == 0 else 75),
                        'start_sec': _humanize_time(t),
                        'end_sec':   t + beat_sec * 0.85,
                        'instrument':'bass',
                    })
            elif style == 'root':
                # Root notes only (sparse)
                for i in range(min(2, beats_remaining)):
                    t = bar_start + i * 2 * beat_sec
                    notes.append({
                        'channel':   0,
                        'program':   _get_gm_program('bass'),
                        'note':      base,
                        'velocity':  _humanize_velocity(95),
                        'start_sec': _humanize_time(t),
                        'end_sec':   t + beat_sec * 1.8,
                        'instrument':'bass',
                    })
            else:  # groove
                # Syncopated groove pattern
                groove = [(0.0, 0), (0.75, 7), (1.5, 0), (2.0, 5), (3.0, 0), (3.5, 7)]
                for beat_off, interval in groove:
                    t = bar_start + beat_off * beat_sec
                    if t >= c_end or t >= duration_sec:
                        break
                    notes.append({
                        'channel':   0,
                        'program':   _get_gm_program('bass'),
                        'note':      base + interval,
                        'velocity':  _humanize_velocity(85),
                        'start_sec': _humanize_time(t),
                        'end_sec':   t + beat_sec * 0.5,
                        'instrument':'bass',
                    })

            bar_start += 4 * beat_sec

    return notes


def generate_tabla_pattern(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    taal: str = 'keherwa',  # keherwa (8-beat), teentaal (16-beat), dadra (6-beat)
) -> List[Dict]:
    """Generate tabla rhythm patterns based on Indian taals."""
    notes = []
    beat_sec = 60.0 / bpm

    # Tabla bols mapped to percussion MIDI notes
    # GM percussion channel 9: bass drum=36, snare=38, hi-hat=42, tom=45
    TABLA_BOLS = {
        'dha':  (36, 100),  # bass + treble together
        'dhin': (38, 90),   # resonant treble
        'ta':   (37, 80),   # sharp treble
        'tin':  (44, 70),   # light treble
        'na':   (42, 75),   # open treble
        'ke':   (39, 65),   # soft bass
        'ge':   (41, 85),   # sharp bass
    }

    # Taal patterns (list of bol names per beat subdivision)
    TAAL_PATTERNS = {
        'keherwa':  ['dha', 'ge', 'na', 'tin', 'na', 'ke', 'dhin', 'na'],
        'teentaal': ['dha', 'dhin', 'dhin', 'dha', 'dha', 'dhin', 'dhin', 'dha',
                     'dha', 'tin', 'tin', 'ta', 'ta', 'dhin', 'dhin', 'dha'],
        'dadra':    ['dha', 'dhin', 'na', 'dha', 'tin', 'na'],
    }

    pattern = TAAL_PATTERNS.get(taal, TAAL_PATTERNS['keherwa'])
    cycle_beats = len(pattern)
    cycle_sec = cycle_beats * beat_sec * 0.5  # each bol = half beat

    t = 0.0
    while t < duration_sec:
        for i, bol in enumerate(pattern):
            bol_time = t + i * beat_sec * 0.5
            if bol_time >= duration_sec:
                break

            midi_note, vel = TABLA_BOLS.get(bol, (36, 70))
            notes.append({
                'channel':   9,  # Percussion channel
                'program':   0,
                'note':      midi_note,
                'velocity':  _humanize_velocity(vel, 10),
                'start_sec': _humanize_time(bol_time, 0.008),
                'end_sec':   bol_time + 0.15,
                'instrument':'tabla',
            })
        t += cycle_sec

    return notes


def generate_strings_pad(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    octave: int = 4,
) -> List[Dict]:
    """Generate sustained string pad with smooth voice leading."""
    notes = []

    for chord_info in chord_sequence:
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 2.0)

        chord_midi = _chord_notes(chord, octave)
        for midi_note in chord_midi:
            notes.append({
                'channel':   0,
                'program':   _get_gm_program('strings'),
                'note':      midi_note,
                'velocity':  _humanize_velocity(65),
                'start_sec': c_start,
                'end_sec':   c_end,
                'instrument':'strings',
            })

    return notes


def generate_sitar_melody(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    octave: int = 4,
) -> List[Dict]:
    """Generate sitar melodic line with ornamental grace notes."""
    notes = []
    beat_sec = 60.0 / bpm

    for chord_info in chord_sequence:
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)
        root, intervals = _parse_chord(chord)

        # Play melodic phrases based on chord tones + passing tones
        phrase_notes = [root + i for i in intervals]
        # Add scale passing tones
        phrase_notes += [root + 2, root + 5, root + 9]
        phrase_notes = sorted(set(phrase_notes))

        t = c_start
        for idx, interval in enumerate(phrase_notes[:6]):
            if t >= c_end or t >= duration_sec:
                break

            midi_note = octave * 12 + interval
            dur = beat_sec * random.choice([0.5, 0.75, 1.0])

            # Grace note (meend/gamak ornament)
            if random.random() > 0.6 and t > c_start:
                grace = midi_note + random.choice([-2, -1, 1, 2])
                notes.append({
                    'channel':   0,
                    'program':   _get_gm_program('sitar'),
                    'note':      grace,
                    'velocity':  _humanize_velocity(55),
                    'start_sec': t - 0.08,
                    'end_sec':   t + 0.05,
                    'instrument':'sitar',
                })

            notes.append({
                'channel':   0,
                'program':   _get_gm_program('sitar'),
                'note':      midi_note,
                'velocity':  _humanize_velocity(75),
                'start_sec': _humanize_time(t),
                'end_sec':   t + dur,
                'instrument':'sitar',
            })
            t += dur * 0.9

    return notes


def generate_flute_melody(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    octave: int = 5,
) -> List[Dict]:
    """Generate breathy flute melody with sustained notes and vibrato points."""
    notes = []
    beat_sec = 60.0 / bpm

    for chord_info in chord_sequence:
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)
        root, intervals = _parse_chord(chord)

        # Flute plays chord tones with longer durations
        melody_intervals = [intervals[0], intervals[-1], intervals[0] + 12]
        t = c_start
        for interval in melody_intervals:
            if t >= c_end or t >= duration_sec:
                break
            midi_note = octave * 12 + root + interval
            dur = beat_sec * random.choice([1.5, 2.0, 2.5])
            dur = min(dur, c_end - t)

            notes.append({
                'channel':   0,
                'program':   _get_gm_program('flute'),
                'note':      midi_note,
                'velocity':  _humanize_velocity(70),
                'start_sec': _humanize_time(t),
                'end_sec':   t + dur,
                'instrument':'flute',
            })
            t += dur * 0.85

    return notes


def generate_brass_section(
    chord_sequence: List[Dict],
    bpm: int,
    duration_sec: float,
    octave: int = 4,
) -> List[Dict]:
    """Generate brass section hits on strong beats."""
    notes = []
    beat_sec = 60.0 / bpm

    for chord_info in chord_sequence:
        chord = chord_info.get('chord', 'C')
        c_start = chord_info.get('start', 0)
        c_end = chord_info.get('end', c_start + 4 * beat_sec)
        chord_midi = _chord_notes(chord, octave)

        # Brass on beats 1 and 3
        for beat_off in [0.0, 2.0]:
            t = c_start + beat_off * beat_sec
            if t >= c_end or t >= duration_sec:
                break
            for mn in chord_midi:
                notes.append({
                    'channel':   0,
                    'program':   _get_gm_program('brass'),
                    'note':      mn,
                    'velocity':  _humanize_velocity(85),
                    'start_sec': _humanize_time(t),
                    'end_sec':   t + beat_sec * 1.5,
                    'instrument':'brass',
                })

    return notes


# ─── Arrangement Style Definitions ──────────────────────────────────────────

ARRANGEMENT_CONFIGS = {
    'bollywood_pop': {
        'generators': [
            ('piano', generate_piano_comping, {'density': 'normal'}),
            ('tabla', generate_tabla_pattern, {'taal': 'keherwa'}),
            ('strings', generate_strings_pad, {}),
        ],
        'tempo_mult': 1.0,
    },
    'folk': {
        'generators': [
            ('guitar', generate_guitar_strumming, {'strum_style': 'folk'}),
            ('flute', generate_flute_melody, {}),
            ('bass', generate_walking_bass, {'style': 'root'}),
        ],
        'tempo_mult': 0.95,
    },
    'lofi': {
        'generators': [
            ('piano', generate_piano_comping, {'density': 'sparse', 'octave': 4}),
            ('bass', generate_walking_bass, {'style': 'groove'}),
        ],
        'tempo_mult': 0.8,
    },
    'classical_teentaal': {
        'generators': [
            ('sitar', generate_sitar_melody, {}),
            ('tabla', generate_tabla_pattern, {'taal': 'teentaal'}),
            ('strings', generate_strings_pad, {'octave': 3}),
        ],
        'tempo_mult': 1.1,
    },
    'classical_ektal': {
        'generators': [
            ('sitar', generate_sitar_melody, {'octave': 5}),
            ('tabla', generate_tabla_pattern, {'taal': 'dadra'}),
        ],
        'tempo_mult': 0.85,
    },
    'orchestral': {
        'generators': [
            ('strings', generate_strings_pad, {}),
            ('piano', generate_piano_comping, {'density': 'sparse'}),
            ('brass', generate_brass_section, {}),
        ],
        'tempo_mult': 0.92,
    },
    'rnb': {
        'generators': [
            ('piano', generate_piano_comping, {'density': 'dense'}),
            ('bass', generate_walking_bass, {'style': 'groove'}),
        ],
        'tempo_mult': 0.88,
    },
}


def generate_arrangement_notes(
    chord_sequence: List[Dict],
    arrangement_id: str,
    bpm: int,
    duration_sec: float,
    user_instruments: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Generate all MIDI notes for an arrangement.
    If user_instruments is specified, only those instruments are used.
    """
    config = ARRANGEMENT_CONFIGS.get(arrangement_id, ARRANGEMENT_CONFIGS['bollywood_pop'])
    tempo_mult = config.get('tempo_mult', 1.0)
    effective_bpm = int(bpm * tempo_mult)

    all_notes = []

    if user_instruments:
        # User-specified instruments: map each to its best generator
        INSTRUMENT_GENERATOR_MAP = {
            'keys':    (generate_piano_comping, {'density': 'normal'}),
            'piano':   (generate_piano_comping, {'density': 'normal'}),
            'guitar':  (generate_guitar_strumming, {'strum_style': 'folk'}),
            'bass':    (generate_walking_bass, {'style': 'walking'}),
            'tabla':   (generate_tabla_pattern, {'taal': 'keherwa'}),
            'sitar':   (generate_sitar_melody, {}),
            'strings': (generate_strings_pad, {}),
            'flute':   (generate_flute_melody, {}),
            'brass':   (generate_brass_section, {}),
        }

        for instr in user_instruments:
            key = instr.lower().strip()
            if key in INSTRUMENT_GENERATOR_MAP:
                gen_fn, kwargs = INSTRUMENT_GENERATOR_MAP[key]
                notes = gen_fn(chord_sequence, effective_bpm, duration_sec, **kwargs)
                all_notes.extend(notes)
            else:
                # Fuzzy match
                for k, (fn, kw) in INSTRUMENT_GENERATOR_MAP.items():
                    if k in key or key in k:
                        notes = fn(chord_sequence, effective_bpm, duration_sec, **kw)
                        all_notes.extend(notes)
                        break
    else:
        # Use arrangement config
        for instr_name, gen_fn, kwargs in config['generators']:
            notes = gen_fn(chord_sequence, effective_bpm, duration_sec, **kwargs)
            all_notes.extend(notes)

    return all_notes
