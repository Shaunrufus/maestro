import { create } from 'zustand';
import { supabase } from '../services/supabase';

// ─── Types ────────────────────────────────────────────────────────────────
export type InstrKey = 'keys' | 'guitar' | 'tabla' | 'flute' | 'sitar' | 'orchestral';
export type StudioMode = 'record' | 'edit' | 'mix';  // Phase 3 modes

export interface Take {
  id:          string;
  uri:          string;  // local file:// URI
  uploadedUrl?: string;  // Supabase Storage URL
  durationMs:  number;
  createdAt:   Date;
  pitchScore?: number;   // 0-100 from Guru analysis
  timingScore?: number;
  energyScore?: number;
  tuned:       boolean;
}

export interface Track {
  id:          string;
  name:        string;
  type:        'vocal' | 'instrument' | 'backing';
  takes:       Take[];
  selectedTakeId?: string;
  volume:      number;  // 0-1
  pan:         number;  // -1 to 1
  muted:       boolean;
  solo:        boolean;
}

export interface Project {
  id:          string;
  name:        string;
  bpm:         number;
  key:         string;
  scale:       string;
  tracks:      Track[];
  lyrics:      string;
  createdAt:   Date;
  updatedAt:   Date;
}

// Band Engine types
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
}

export interface BandArrangement {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  color: string;
  audio_base64?: string | null;
  has_audio: boolean;
  duration_sec?: number;
}

export interface StudioState {
  // Session
  isRecording:   boolean;
  isPlaying:     boolean;
  elapsedSec:    number;
  autoTunePct:   number;
  activeInstr:   InstrKey;
  studioMode:    StudioMode;

  // Project
  currentProject: Project | null;

  // User / Auth
  userId:        string | null;
  userEmail:     string | null;
  isPro:         boolean;

  // Backend
  backendUrl:    string;

  // Band Engine (Phase 5)
  bandAnalysis:      BandAnalysis | null;
  arrangements:      BandArrangement[];
  selectedArrangement: string | null;

  // Actions
  setRecording:   (v: boolean) => void;
  setPlaying:     (v: boolean) => void;
  setElapsed:     (v: number)  => void;
  setAutoTune:    (v: number)  => void;
  setActiveInstr: (v: InstrKey) => void;
  setStudioMode:  (v: StudioMode) => void;
  setProject:     (p: Project) => void;
  setUser:        (id: string, email: string, isPro: boolean) => void;
  clearUser:      () => void;
  addTake:        (trackId: string, take: Take) => void;
  setTakes:       (trackId: string, takes: Take[]) => void;
  selectTake:     (trackId: string, takeId: string) => void;
  addTrack:       (track: Track) => void;
  updateTrackVolume: (trackId: string, vol: number) => void;
  updateTrackPan:    (trackId: string, pan: number) => void;
  toggleMute:     (trackId: string) => void;
  toggleSolo:     (trackId: string) => void;

  // Band Engine actions
  setBandAnalysis:       (analysis: BandAnalysis | null) => void;
  setArrangements:       (arrangements: BandArrangement[]) => void;
  selectArrangement:     (id: string | null) => void;
}

// ─── Default project factory ───────────────────────────────────────────────
const defaultProject = (): Project => ({
  id:        `proj_${Date.now()}`,
  name:      'Untitled Session',
  bpm:       120,
  key:       'C',
  scale:     'major',
  tracks:    [
    { id: 'lead', name: 'Lead Vocal', type: 'vocal', takes: [], volume: 0.9, pan: 0, muted: false, solo: false },
    { id: 'double', name: 'Double',   type: 'vocal', takes: [], volume: 0.6, pan: -0.3, muted: false, solo: false },
    { id: 'harmony', name: 'Harmony', type: 'vocal', takes: [], volume: 0.5, pan: 0.3, muted: false, solo: false },
  ],
  lyrics:    '',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ─── Store ─────────────────────────────────────────────────────────────────
export const useStudioStore = create<StudioState>((set) => ({
  isRecording:    false,
  isPlaying:      false,
  elapsedSec:     0,
  autoTunePct:    78,
  activeInstr:    'keys',
  studioMode:     'record',
  currentProject: defaultProject(),
  userId:         null,
  userEmail:      null,
  isPro:          false,
  backendUrl:     'https://maestro-production-c525.up.railway.app',

  // Band Engine initial state
  bandAnalysis:       null,
  arrangements:       [],
  selectedArrangement: null,

  setRecording:   (v) => set({ isRecording: v }),
  setPlaying:     (v) => set({ isPlaying: v }),
  setElapsed:     (v) => set({ elapsedSec: v }),
  setAutoTune:    (v) => set({ autoTunePct: v }),
  setActiveInstr: (v) => set({ activeInstr: v }),
  setStudioMode:  (v) => set({ studioMode: v }),
  setProject:     (p) => set({ currentProject: p }),

  setUser: (id, email, isPro) => set({ userId: id, userEmail: email, isPro }),
  clearUser: () => set({ userId: null, userEmail: null, isPro: false }),

  addTake: (trackId, take) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, takes: [...t.takes, take] } : t
        ),
      } : null,
    })),

  setTakes: (trackId, takes) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, takes } : t
        ),
      } : null,
    })),

  selectTake: (trackId, takeId) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, selectedTakeId: takeId } : t
        ),
      } : null,
    })),

  addTrack: (track) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: [...s.currentProject.tracks, track],
      } : null,
    })),

  updateTrackVolume: (trackId, vol) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, volume: vol } : t
        ),
      } : null,
    })),

  updateTrackPan: (trackId, pan) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, pan } : t
        ),
      } : null,
    })),

  toggleMute: (trackId) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, muted: !t.muted } : t
        ),
      } : null,
    })),

  toggleSolo: (trackId) =>
    set((s) => ({
      currentProject: s.currentProject ? {
        ...s.currentProject,
        tracks: s.currentProject.tracks.map(t =>
          t.id === trackId ? { ...t, solo: !t.solo } : t
        ),
      } : null,
    })),

  // Band Engine actions
  setBandAnalysis: (analysis) => set({ bandAnalysis: analysis }),
  setArrangements: (arrangements) => set({ arrangements }),
  selectArrangement: (id) => set({ selectedArrangement: id }),
}));
