// src/services/instrumentService.ts
// MAESTRO — Instrument Sample Playback Service
// Plays a short preview sound when the user taps an instrument card.
//
// ─── HOW TO ADD REAL SOUNDS ───────────────────────────────────────────────
// Download one free MP3 per instrument and drop it in assets/sounds/:
//
//   keys.mp3      → https://freesound.org/s/132576/  (C4 piano note)
//   guitar.mp3    → https://freesound.org/s/338276/  (acoustic strum)
//   tabla.mp3     → https://freesound.org/s/411090/  (tabla hit)
//   flute.mp3     → https://freesound.org/s/528491/  (flute note)
//   sitar.mp3     → https://freesound.org/s/415775/  (sitar pluck)
//   orchestral.mp3→ https://freesound.org/s/463006/  (strings)
//
// All are CC0 / Attribution-licensed. Rename to match keys above.
// ──────────────────────────────────────────────────────────────────────────

import { Audio } from 'expo-av';

type InstrKey = 'keys' | 'guitar' | 'tabla' | 'flute' | 'sitar' | 'orchestral';

// Map instrument key → require() path
// When files don't exist yet we use null (silent mode).
const SOUND_MAP: Record<InstrKey, any | null> = {
  keys:        requireSafe('./../../assets/sounds/keys.mp3'),
  guitar:      requireSafe('./../../assets/sounds/guitar.mp3'),
  tabla:       requireSafe('./../../assets/sounds/tabla.mp3'),
  flute:       requireSafe('./../../assets/sounds/flute.mp3'),
  sitar:       requireSafe('./../../assets/sounds/sitar.mp3'),
  orchestral:  requireSafe('./../../assets/sounds/orchestral.mp3'),
};

// Safe require — returns null if the file doesn't exist yet
function requireSafe(path: string): any | null {
  try {
    return require(path);
  } catch {
    return null;
  }
}

let currentPreviewSound: Audio.Sound | null = null;

export const playInstrumentNote = async (key: InstrKey): Promise<void> => {
  // Stop any currently playing preview
  if (currentPreviewSound) {
    try {
      await currentPreviewSound.stopAsync();
      await currentPreviewSound.unloadAsync();
    } catch {}
    currentPreviewSound = null;
  }

  const source = SOUND_MAP[key];
  if (!source) {
    // No file yet — just vibrate/haptic feedback (handled by caller)
    console.log(`[Instrument] No sound file for: ${key}. Drop MP3 in assets/sounds/${key}.mp3`);
    return;
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:   false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 0.85 });
    currentPreviewSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        currentPreviewSound = null;
      }
    });
  } catch (e) {
    console.error('[Instrument] Playback error:', e);
  }
};

// Pre-load all sounds at app start (optional — dramatically reduces tap latency)
export const preloadInstrumentSounds = async (): Promise<void> => {
  for (const [key, source] of Object.entries(SOUND_MAP)) {
    if (!source) continue;
    try {
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false });
      await sound.unloadAsync(); // just verifying it loads
    } catch {
      console.warn(`[Instrument] Could not preload: ${key}`);
    }
  }
};
