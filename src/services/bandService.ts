// src/services/bandService.ts
// MAESTRO — Band Engine API Service
// Calls to /band endpoints for vocal analysis, arrangement generation

import { useStudioStore } from '../store/useStudioStore';

const API_BASE = process.env.REACT_APP_API_URL || 'https://maestro-production-c525.up.railway.app';

export interface BandAnalysis {
  key: string;
  key_short: string;
  key_type: string;
  bpm: number;
  duration_sec: number;
  chord_sequence: any[];
  simple_progression: string[];
  progression_str: string;
  avg_pitch_note: string;
  genre_hint: string;
  voiced_pct: number;
  suggested_progression?: string[];
}

export interface Arrangement {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  color: string;
  audio_base64?: string | null;
  has_audio: boolean;
  duration_sec?: number;
  mime_type?: string;
}

export interface BandAnalysisAndGenerateResponse {
  analysis: BandAnalysis;
  chord_sequence: any[];
  progression: string;
  arrangements: Arrangement[];
}

export const bandService = {
  /**
   * Analyze a vocal recording and return key, BPM, chord progression
   */
  async analyzeVocal(audioUrl: string): Promise<BandAnalysis> {
    try {
      const resp = await fetch(`${API_BASE}/band/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      console.error('[BandService] analyzeVocal error:', err);
      throw err;
    }
  },

  /**
   * Generate multiple arrangement styles from a chord progression
   */
  async generateArrangements(
    chordProgression: string,
    key: string,
    bpm: number,
    vocalUrl?: string,
    selectedStyles?: string[],
  ): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE}/band/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chord_progression: chordProgression,
          key,
          bpm,
          vocal_file_url: vocalUrl || null,
          selected_styles: selectedStyles || null,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      console.error('[BandService] generateArrangements error:', err);
      throw err;
    }
  },

  /**
   * One-shot endpoint: analyze vocal + generate all arrangements
   * This is the primary endpoint called from StudioScreen after recording stops
   */
  async analyzeAndGenerate(
    audioFile: Blob,
    customChords?: string,
    selectedStyles?: string[],
  ): Promise<BandAnalysisAndGenerateResponse> {
    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      if (customChords) formData.append('custom_chords', customChords);
      if (selectedStyles?.length) formData.append('selected_styles', selectedStyles.join(','));

      const resp = await fetch(`${API_BASE}/band/analyze-and-generate`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      console.error('[BandService] analyzeAndGenerate error:', err);
      throw err;
    }
  },

  /**
   * Parse user chord input format (e.g., "C G Am F" or "I V vi IV")
   */
  async parseChords(chordStr: string, key?: string, bpm?: number): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE}/band/parse-chords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chord_str: chordStr, key, bpm }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      console.error('[BandService] parseChords error:', err);
      throw err;
    }
  },

  /**
   * Analyze a reference track from YouTube URL or audio file URL
   */
  async analyzeReference(url: string, limitSec?: number): Promise<BandAnalysis> {
    try {
      const resp = await fetch(`${API_BASE}/band/reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, limit_sec: limitSec || 60 }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      console.error('[BandService] analyzeReference error:', err);
      throw err;
    }
  },

  /**
   * Convert base64 audio to a playable data URI
   */
  audioBase64ToUri(base64: string, mimeType: string = 'audio/wav'): string {
    return `data:${mimeType};base64,${base64}`;
  },

  /**
   * Save a selected arrangement to the user's recordings
   * (This would later save to Supabase)
   */
  async saveArrangement(
    recordingId: string,
    arrangementId: string,
    arrangedAudioBase64: string,
  ): Promise<void> {
    // TODO: POST to /api/recordings/{recordingId}/arrangements
    // to link the selected arrangement with the vocal recording
    console.log('[BandService] saveArrangement (stub):', recordingId, arrangementId);
  },
};
