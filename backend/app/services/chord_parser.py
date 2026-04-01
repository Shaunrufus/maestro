# backend/app/services/chord_parser.py
# MAESTRO — Chord Progression Parser
# Accepts multiple input formats:
#   - "C G Am F" — standard chord names
#   - "Cm Bb Eb Ab" — with minor suffix
#   - "I V vi IV" — Roman numerals (in any key)
#   - "C7 G7 Am7 F" — with chord extensions
#
# Returns a standardised list of chord names

import re
from typing import List, Dict, Optional

NOTE_NAMES     = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
ENHARMONIC     = {'Db':'C#', 'Eb':'D#', 'Fb':'E', 'Gb':'F#', 'Ab':'G#', 'Bb':'A#', 'Cb':'B'}

# Roman numeral → semitone offset for major scale
ROMAN_MAJOR = {
    'I':   0, 'II': 2,  'III': 4, 'IV': 5,
    'V':   7, 'VI': 9,  'VII': 11,
    'i':   0, 'ii': 2,  'iii': 4, 'iv': 5,
    'v':   7, 'vi': 9,  'vii': 11,
}

# For minor key: relative positions
ROMAN_MINOR = {
    'i':   0, 'ii': 2,  'III': 3, 'iv': 5,
    'v':   7, 'VI': 8,  'VII': 10,
    'I':   0, 'II': 2,  'iv':  5,
}

# MIDI note numbers for chord roots (middle octave, C4=60)
MIDI_ROOTS: Dict[str, int] = {
    'C':60, 'C#':61, 'D':62, 'D#':63, 'E':64, 'F':65,
    'F#':66, 'G':67, 'G#':68, 'A':69, 'A#':70, 'B':71,
}

# Intervals for each chord quality (semitones from root)
CHORD_INTERVALS: Dict[str, List[int]] = {
    '':     [0, 4, 7],          # major
    'm':    [0, 3, 7],          # minor
    '7':    [0, 4, 7, 10],      # dominant 7th
    'maj7': [0, 4, 7, 11],      # major 7th
    'm7':   [0, 3, 7, 10],      # minor 7th
    'dim':  [0, 3, 6],          # diminished
    'aug':  [0, 4, 8],          # augmented
    'sus2': [0, 2, 7],          # suspended 2nd
    'sus4': [0, 5, 7],          # suspended 4th
    '9':    [0, 4, 7, 10, 14],  # dominant 9th
    'add9': [0, 4, 7, 14],      # add 9
}


def parse_chord_progression(
    input_str: str,
    key: str = 'C',
    beats_per_chord: int = 4,
    bpm: int = 90,
) -> List[Dict]:
    """
    Parse a chord progression string into a list of timed chord dicts.

    Returns:
        [
          {"chord": "C", "root": "C", "quality": "", "midi_notes": [60,64,67],
           "start": 0.0, "duration": 2.67, "beats": 4},
          ...
        ]
    """
    tokens = _tokenize(input_str.strip())
    if not tokens:
        return _default_progression(key, bpm)

    # Detect if Roman numeral input
    is_roman = _looks_like_roman(tokens)

    chords = []
    beat_duration = 60.0 / bpm
    time_cursor   = 0.0

    for token in tokens:
        if is_roman:
            chord_name = _roman_to_chord(token, key)
        else:
            chord_name = _normalize_chord_name(token)

        if not chord_name:
            continue

        root, quality = _split_chord(chord_name)
        midi_notes    = _chord_to_midi(root, quality)
        duration_sec  = beat_duration * beats_per_chord

        chords.append({
            "chord":      chord_name,
            "root":       root,
            "quality":    quality,
            "midi_notes": midi_notes,
            "start":      round(time_cursor, 3),
            "duration":   round(duration_sec, 3),
            "beats":      beats_per_chord,
        })
        time_cursor += duration_sec

    return chords if chords else _default_progression(key, bpm)


# ─── Internal helpers ──────────────────────────────────────────────────────

def _tokenize(s: str) -> List[str]:
    """Split by spaces, commas, dashes, arrows."""
    return [t.strip() for t in re.split(r'[\s,→\-|]+', s) if t.strip()]


def _looks_like_roman(tokens: List[str]) -> bool:
    roman_pattern = re.compile(r'^(I{1,3}|IV|VI{0,3}|VII|i{1,3}|iv|vi{0,3}|vii)(m|maj7|7|dim|aug)?$')
    return sum(1 for t in tokens if roman_pattern.match(t)) > len(tokens) / 2


def _roman_to_chord(token: str, key: str = 'C') -> Optional[str]:
    """Convert Roman numeral like 'IV', 'vi', 'V7' to chord name like 'F', 'Am', 'G7'."""
    match = re.match(r'^(I{1,3}|IV|VI{0,3}|VII|i{1,3}|iv|vi{0,3}|vii)(m|maj7|7|dim|aug|sus4|sus2)?$', token, re.I)
    if not match:
        return None

    numeral = match.group(1)
    suffix  = match.group(2) or ''

    # Determine if the Roman numeral implies minor quality
    is_lower = numeral.islower()
    offset   = ROMAN_MAJOR.get(numeral.upper(), ROMAN_MAJOR.get(numeral, 0))

    # Find key root
    key_clean  = re.sub(r'\s*(major|minor)', '', key.strip(), flags=re.I)
    key_clean  = ENHARMONIC.get(key_clean, key_clean)
    root_idx   = NOTE_NAMES.index(key_clean) if key_clean in NOTE_NAMES else 0

    chord_root = NOTE_NAMES[(root_idx + offset) % 12]

    # Determine quality
    if suffix:
        quality = suffix
    elif is_lower:
        quality = 'm'
    else:
        quality = ''

    return chord_root + quality


def _normalize_chord_name(token: str) -> Optional[str]:
    """Normalize enharmonic equivalents and strip octave numbers."""
    match = re.match(r'^([A-Ga-g][#b]?)(m|maj7|M7|7|dim|aug|sus4|sus2|m7|add9|9)?(\d)?$', token)
    if not match:
        return None

    root    = match.group(1).capitalize()
    quality = match.group(2) or ''
    root    = ENHARMONIC.get(root, root)

    # Normalise quality aliases
    if quality == 'M7':
        quality = 'maj7'

    return root + quality


def _split_chord(chord_name: str) -> tuple:
    """Split 'Am7' → ('A', 'm7'), 'Cmaj7' → ('C', 'maj7')."""
    match = re.match(r'^([A-G][#]?)(m|maj7|7|m7|dim|aug|sus4|sus2|add9|9)?$', chord_name)
    if match:
        return match.group(1), match.group(2) or ''
    return chord_name, ''


def _chord_to_midi(root: str, quality: str, base_octave: int = 4) -> List[int]:
    """Convert chord root + quality to MIDI note numbers."""
    root_midi  = MIDI_ROOTS.get(root, 60)
    intervals  = CHORD_INTERVALS.get(quality, CHORD_INTERVALS[''])
    return [root_midi + i for i in intervals]


def _default_progression(key: str, bpm: int) -> List[Dict]:
    """Fallback: I V vi IV in C major."""
    return parse_chord_progression('C G Am F', key='C', bpm=bpm)


# ─── Public utility ────────────────────────────────────────────────────────

def suggest_progression(key: str, genre: str) -> List[str]:
    """Suggest a chord progression for a given key and genre."""
    root = re.sub(r'\s*(major|minor)', '', key.strip(), flags=re.I)

    PROGRESSIONS = {
        'bollywood_pop':  ['I', 'V', 'vi', 'IV'],
        'slow_ballad':    ['I', 'IV', 'V', 'I'],
        'sad_ballad':     ['i', 'VI', 'III', 'VII'],
        'folk':           ['I', 'IV', 'I', 'V'],
        'devotional':     ['I', 'ii', 'IV', 'V'],
        'classical':      ['i', 'iv', 'VII', 'III'],
        'energetic_pop':  ['I', 'V', 'vi', 'iii', 'IV'],
        'dance':          ['i', 'VII', 'VI', 'VII'],
        'contemporary':   ['i', 'VI', 'III', 'VII'],
        'lofi':           ['I', 'vi', 'IV', 'V'],
    }

    numerals = PROGRESSIONS.get(genre, ['I', 'V', 'vi', 'IV'])
    chords   = []
    for n in numerals:
        chord = _roman_to_chord(n, root)
        if chord:
            chords.append(chord)
    return chords
