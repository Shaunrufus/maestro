/**
 * src/services/autotune_client.ts
 * MAESTRO — AutoTune Client v2
 *
 * Handles the full autotune flow from StudioScreen:
 *   1. Takes the local m4a URI from expo-av
 *   2. POSTs to Railway backend as multipart/form-data
 *   3. Receives JSON response with base64 WAV + metadata
 *   4. Saves WAV locally to device cache
 *   5. Returns local URI + metadata
 *
 * Usage in StudioScreen:
 *   import { applyAutotune, testAutotuneEndpoint } from '../services/autotune_client';
 */

import * as FileSystem from 'expo-file-system';

const BACKEND_URL = 'https://maestro-production-c525.up.railway.app';

export interface AutotuneResult {
  localUri:      string;   // Local .wav path on device
  key:           string;   // Detected key e.g. "A minor"
  scale:         string;   // Scale name
  autoTunePct:   number;   // % of frames corrected
  vocalPct:      number;   // % of audio that has vocals
  durationS:     number;   // Duration in seconds
  engine:        string;   // "psola"|"librosa_shift"|"passthrough"
  processTimeS:  number;   // Server processing time
}

export interface AutotuneOptions {
  correctionStrength?: number;   // 0.0–1.0 (default 0.8)
  scale?:              string;   // 'major'|'minor'|'yaman'|'bhairavi' etc.
  rootNote?:           number;   // 0-11 semitone (auto-detect if omitted)
  addEffect?:          boolean;  // T-Pain robotic effect (default false)
}

/**
 * Send a local audio file to the backend for pitch correction.
 * Returns a local URI to the corrected WAV file.
 */
export async function applyAutotune(
  localAudioUri: string,
  options: AutotuneOptions = {},
): Promise<AutotuneResult> {
  const {
    correctionStrength = 0.8,
    scale,
    rootNote,
    addEffect = false,
  } = options;

  // ── 1. Build form data ─────────────────────────────────────────────────────
  const filename = localAudioUri.split('/').pop() ?? `rec_${Date.now()}.m4a`;
  const ext      = filename.split('.').pop()?.toLowerCase() ?? 'm4a';
  const mimeType = ext === 'wav' ? 'audio/wav'
                 : ext === 'mp3' ? 'audio/mpeg'
                                 : 'audio/mp4';

  const formData = new FormData();
  formData.append('file', { uri: localAudioUri, name: filename, type: mimeType } as any);
  formData.append('correction_strength', String(correctionStrength));
  if (scale)      formData.append('scale',     scale);
  if (rootNote !== undefined) formData.append('root_note', String(rootNote));
  formData.append('add_effect', String(addEffect));

  // ── 2. POST to backend ─────────────────────────────────────────────────────
  console.log('[AutoTune] →', BACKEND_URL + '/audio/autotune');

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/audio/autotune`, {
      method: 'POST',
      body:   formData,
      // Do NOT set Content-Type — fetch adds the multipart boundary automatically
    });
  } catch (err: any) {
    throw new Error(`[AutoTune] Network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`[AutoTune] Backend error ${response.status}: ${body}`);
  }

  const data = await response.json();

  if (!data.audio_base64) {
    throw new Error('[AutoTune] Backend returned no audio_base64');
  }

  // ── 3. Save WAV locally ───────────────────────────────────────────────────
  const timestamp  = Date.now();
  const cacheDir   = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const localPath  = `${cacheDir}autotuned_${timestamp}.wav`;
  await FileSystem.writeAsStringAsync(localPath, data.audio_base64, { encoding: FileSystem.EncodingType.Base64 });

  console.log(`[AutoTune] ✓ ${data.autotune_engine} | key=${data.key} | ${data.avg_correction}% corrected`);
  console.log('[AutoTune] Saved to:', localPath);

  return {
    localUri:     localPath,
    key:          data.key          ?? '?',
    scale:        data.scale        ?? 'major',
    autoTunePct:  data.avg_correction ?? 0,
    vocalPct:     data.vocal_pct    ?? 0,
    durationS:    data.duration_s   ?? 0,
    engine:       data.autotune_engine ?? 'psola_v3',
    processTimeS: data.process_time_s  ?? 0,
  };
}

/**
 * Ping the autotune health-check endpoint.
 * Call this on app launch or before the first recording session.
 */
export async function testAutotuneEndpoint(): Promise<{
  ok:         boolean;
  engine?:    string;
  librosa?:   string;
  key?:       string;
  error?:     string;
}> {
  try {
    const res  = await fetch(`${BACKEND_URL}/audio/autotune/test`, { method: 'GET' });
    const data = await res.json();

    if (data.status === 'ok') {
      console.log('[AutoTune] Health check OK:', data.message);
      return {
        ok:       true,
        engine:   data.engine,
        librosa:  data.librosa_version,
        key:      data.key_detected,
      };
    }
    return { ok: false, error: data.error };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
