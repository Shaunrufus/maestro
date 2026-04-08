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

import { File, Paths } from 'expo-file-system';

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
  formData.append('retune_speed', String(correctionStrength * 100)); // Convert 0-1 to 0-100
  formData.append('flex_tune', '25.0');
  formData.append('humanize', '30.0');
  if (scale)      formData.append('scale',     scale);
  if (rootNote !== undefined) formData.append('root_note', String(rootNote));
  formData.append('add_effect', String(addEffect));
  formData.append('return_base64', 'true');

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

  // Extract metadata (nested in response)
  const meta = data.metadata || {};

  // ── 3. Save WAV locally ───────────────────────────────────────────────────
  const timestamp  = Date.now();
  const wavFile = new File(Paths.cache, `autotuned_${timestamp}.wav`);
  await wavFile.write(data.audio_base64, { encoding: 'base64' });
  const localPath = wavFile.uri;

  console.log(`[AutoTune] ✓ ${meta.engine} | key=${meta.key} | ${meta.auto_tune_pct}% corrected`);
  console.log('[AutoTune] Saved to:', localPath);

  return {
    localUri:     localPath,
    key:          meta.key          ?? '?',
    scale:        meta.scale        ?? 'major',
    autoTunePct:  meta.auto_tune_pct ?? 0,
    vocalPct:     meta.vocal_pct    ?? 0,
    durationS:    meta.duration_s   ?? 0,
    engine:       meta.engine       ?? 'pyin+phase_vocoder',
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
