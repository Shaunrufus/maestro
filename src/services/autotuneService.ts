// src/services/autotuneService.ts
// Sends a WAV recording to the MAESTRO backend for pitch correction.
// Backend endpoint: POST /audio/autotune (FastAPI — see backend/ folder)

const BACKEND_URL = 'https://maestro-production-c525.up.railway.app';

export interface AutotuneResult {
  tunedUrl:     string; // URL of the corrected audio file in Supabase Storage
  pitchShifts:  number[]; // per-frame shift applied (Hz)
  avgCorrection: number;  // 0–100%, how much was corrected
}

/**
 * Upload a local WAV file URI and get back a pitch-corrected version.
 * @param localUri  - file:// URI from expo-av recording
 * @param strength  - 0 (natural) to 100 (robotic / full correction)
 * @param key       - musical key e.g. "C", "D#", "Bb"
 * @param scale     - "major" | "minor" | "chromatic"
 */
export async function applyAutotune(
  localUri: string,
  strength: number,
  key      = 'C',
  scale    = 'major'
): Promise<AutotuneResult> {
  const formData = new FormData();

  // React Native FormData accepts { uri, name, type }
  formData.append('file', {
    uri:  localUri,
    name: 'recording.wav',
    type: 'audio/wav',
  } as any);

  formData.append('strength', String(strength));
  formData.append('key',      key);
  formData.append('scale',    scale);

  const response = await fetch(`${BACKEND_URL}/audio/autotune`, {
    method:  'POST',
    headers: { 'Content-Type': 'multipart/form-data' },
    body:    formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Auto-tune failed: ${err}`);
  }

  return response.json() as Promise<AutotuneResult>;
}

/**
 * Request Guru AI analysis of the recording.
 * Returns vocal coach feedback as text.
 */
export async function analyzeWithGuru(
  localUri:    string,
  sessionNote: string = ''
): Promise<{ feedback: string; score: number; tips: string[] }> {
  const formData = new FormData();
  formData.append('file', { uri: localUri, name: 'recording.wav', type: 'audio/wav' } as any);
  formData.append('note', sessionNote);

  const response = await fetch(`${BACKEND_URL}/guru/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'multipart/form-data' },
    body:    formData,
  });

  if (!response.ok) throw new Error('Guru analysis failed');
  return response.json();
}
