// src/services/audioService.ts
// MAESTRO — Audio Recording + Cloud Upload Service
// Records via expo-av → uploads to Supabase Storage → saves metadata to DB

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const SUPABASE_URL  = 'https://cmbfzcqjfbrbioqmvzoh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYmZ6Y3FqZmJyYmlvcW12em9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzc0NTEsImV4cCI6MjA5MDI1MzQ1MX0.ndKWwDav0-9xQTnq1Zcu-hlyLnOqnJHd9Xml8D-hsjU';

// ─── State ────────────────────────────────────────────────────────────────
let activeRecording: Audio.Recording | null = null;
let currentSound:    Audio.Sound    | null = null;

// ─── Start recording ──────────────────────────────────────────────────────
export const startRecording = async (
  onMeteringLevel?: (level: number) => void
): Promise<boolean> => {
  try {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      console.error('[Audio] Microphone permission denied');
      return false;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS:      true,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
    });

    const { recording } = await Audio.Recording.createAsync(
      {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension:        '.m4a',
          outputFormat:     Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder:     Audio.AndroidAudioEncoder.AAC,
          sampleRate:       44100,
          numberOfChannels: 1,
          bitRate:          128000,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension:    '.m4a',
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate:   44100,
          bitDepthHint: 16,
          bitRateStrategy: 1,
        },
        isMeteringEnabled: true,
      },
      (status) => {
        if (status.metering !== undefined && onMeteringLevel) {
          // Convert dB (-160 to 0) → 0–1 linear scale
          const level = Math.max(0, Math.min(1, (status.metering + 160) / 160));
          onMeteringLevel(level);
        }
      },
      100 // metering update interval ms
    );

    activeRecording = recording;
    console.log('[Audio] Recording started');
    return true;
  } catch (e) {
    console.error('[Audio] Start failed:', e);
    return false;
  }
};

// ─── Upload file to Supabase Storage via REST API ─────────────────────────
// Uses expo-file-system to read base64, then uploads via Supabase REST.
// This is the ONLY reliable upload path in React Native / Expo Go.
async function uploadToSupabase(
  localUri: string,
  storagePath: string
): Promise<string | null> {
  try {
    // Step 1: Read file as base64 string
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Step 2: Decode base64 → binary string → Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Step 3: Upload directly to Supabase Storage REST API
    // Using fetch with Uint8Array body — most reliable in RN
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/recordings/${storagePath}`;
    const response = await fetch(uploadUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'audio/mp4',
        'x-upsert':      'false',
      },
      body: bytes,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Audio] Storage REST upload failed:', response.status, errorText);
      return null;
    }

    console.log('[Audio] Upload to Supabase Storage ✓');

    // Step 4: Create a signed URL for playback (30 days)
    const { data: signedData } = await supabase.storage
      .from('recordings')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    return signedData?.signedUrl ?? null;
  } catch (e) {
    console.error('[Audio] uploadToSupabase error:', e);
    return null;
  }
}

// ─── Stop recording + upload to Supabase ─────────────────────────────────
export const stopAndSaveRecording = async (options: {
  userId:       string;
  projectName?: string;
  bpm?:         number;
  key?:         string;
  autoTunePct?: number;
  instruments?: string[];
}): Promise<{ localUri: string | null; cloudUrl: string | null; durationMs: number }> => {
  if (!activeRecording) {
    return { localUri: null, cloudUrl: null, durationMs: 0 };
  }

  let localUri: string | null = null;

  try {
    // Get duration before stopping
    const status = await activeRecording.getStatusAsync();
    const durationMs = (status as any).durationMillis ?? 0;

    await activeRecording.stopAndUnloadAsync();
    localUri = activeRecording.getURI() ?? null;
    activeRecording = null;

    console.log('[Audio] Recording stopped. URI:', localUri, 'Duration:', durationMs);

    if (!localUri) return { localUri: null, cloudUrl: null, durationMs };

    // ── Upload to Supabase Storage ──────────────────────────────────────
    let cloudUrl: string | null = null;
    try {
      const userId   = options.userId || 'anonymous';
      const fileName = `${userId}/${Date.now()}.m4a`;

      cloudUrl = await uploadToSupabase(localUri, fileName);

      if (cloudUrl) {
        // Save metadata to database
        const { error: dbError } = await supabase.from('recordings').insert({
          user_id:       userId,
          project_name:  options.projectName ?? 'Untitled Session',
          file_url:      cloudUrl,
          duration_ms:   Math.round(durationMs),
          bpm:           options.bpm       ?? 120,
          key:           options.key       ?? 'C',
          auto_tune_pct: options.autoTunePct ?? 0,
          instruments:   options.instruments  ?? [],
        });

        if (dbError) {
          console.error('[Audio] DB insert error:', dbError.message);
        } else {
          console.log('[Audio] Saved to Supabase ✓', cloudUrl);
        }
      }
    } catch (uploadErr) {
      console.error('[Audio] Upload failed:', uploadErr);
    } finally {
      // Clean up local temp file
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return { localUri, cloudUrl, durationMs };
  } catch (e) {
    console.error('[Audio] Stop failed:', e);
    activeRecording = null;
    return { localUri: null, cloudUrl: null, durationMs: 0 };
  }
};

// ─── Legacy stopRecording (for backwards compat) ──────────────────────────
export const stopRecording = async (): Promise<string | null> => {
  if (!activeRecording) return null;
  try {
    await activeRecording.stopAndUnloadAsync();
    const uri = activeRecording.getURI() ?? null;
    activeRecording = null;
    return uri;
  } catch {
    activeRecording = null;
    return null;
  }
};

// ─── Playback ─────────────────────────────────────────────────────────────
export const playRecording = async (url: string): Promise<void> => {
  try {
    if (currentSound) {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
      currentSound = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true, volume: 1.0 }
    );
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        currentSound = null;
      }
    });
  } catch (e) {
    console.error('[Audio] Playback failed:', e);
  }
};

export const stopPlayback = async (): Promise<void> => {
  if (currentSound) {
    await currentSound.stopAsync();
    await currentSound.unloadAsync();
    currentSound = null;
  }
};

export const isRecordingActive = (): boolean => activeRecording !== null;

// ─── Legacy class shim (keeps old import working) ─────────────────────────
class AudioServiceShim {
  startRecording()  { return startRecording(); }
  stopRecording()   { return stopRecording(); }
  playRecording()   { return playRecording(''); }
  getRecordingStatus() { return activeRecording; }
}
export const audioService = new AudioServiceShim();
