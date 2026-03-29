// src/services/supabase.ts
// Supabase client — replace the two constants below with your project values.
// Find them at: supabase.com → your project → Settings → API
//
// Install: npx expo install @supabase/supabase-js

import { createClient } from '@supabase/supabase-js';

// ─── REPLACE THESE ────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://cmbfzcqjfbrbioqmvzoh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYmZ6Y3FqZmJyYmlvcW12em9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzc0NTEsImV4cCI6MjA5MDI1MzQ1MX0.ndKWwDav0-9xQTnq1Zcu-hlyLnOqnJHd9Xml8D-hsjU';
// ──────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false, // required for React Native
  },
});

// ─── Database helpers ─────────────────────────────────────────────────────

export const db = {
  // Save a completed recording to the database
  saveRecording: async (params: {
    userId:      string;
    projectName: string;
    fileUrl:     string;
    durationMs:  number;
    bpm:         number;
    key:         string;
    autoTunePct: number;
    instruments: string[];
  }) => {
    const { data, error } = await supabase
      .from('recordings')
      .insert([{
        user_id:       params.userId,
        project_name:  params.projectName,
        file_url:      params.fileUrl,
        duration_ms:   params.durationMs,
        bpm:           params.bpm,
        key:           params.key,
        auto_tune_pct: params.autoTunePct,
        instruments:   params.instruments,
        created_at:    new Date().toISOString(),
      }])
      .select()
      .single();
    return { data, error };
  },

  // Get all recordings for a user
  getUserRecordings: async (userId: string) => {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Check if user has active subscription
  getSubscription: async (userId: string) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    return { data, error };
  },
};
