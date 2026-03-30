-- Copy and paste this entirely into your Supabase Dashboard -> SQL Editor -> New Query
-- Run this, and the recording uploads will work instantly!

-- 1. Create the recordings table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.recordings (
  id uuid default gen_random_uuid() primary key,
  user_id text, 
  project_name text,
  file_url text,
  duration_ms integer,
  bpm integer,
  key text,
  auto_tune_pct integer,
  instruments text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Allow ANYONE (including unauthenticated/anonymous users) to INSERT into the recordings table
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.recordings;
CREATE POLICY "Allow anonymous inserts" ON public.recordings
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous selects" ON public.recordings;
CREATE POLICY "Allow anonymous selects" ON public.recordings
  FOR SELECT USING (true);

-- 3. Storage Bucket Configuration
-- Ensure the 'recordings' bucket exists and is publicly accessible
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Allow ANYONE (including unauthenticated users) to UPLOAD files to the storage bucket
DROP POLICY IF EXISTS "Allow anonymous uploads" ON storage.objects;
CREATE POLICY "Allow anonymous uploads" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'recordings' );

-- 5. Allow ANYONE to download/read files from the storage bucket
DROP POLICY IF EXISTS "Allow anonymous downloads" ON storage.objects;
CREATE POLICY "Allow anonymous downloads" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'recordings' );

-- 6. Allow ANYONE to update/delete their own files (optional, good for temporary cleanup)
DROP POLICY IF EXISTS "Allow anonymous modifications" ON storage.objects;
CREATE POLICY "Allow anonymous modifications" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'recordings' );

DROP POLICY IF EXISTS "Allow anonymous deletions" ON storage.objects;
CREATE POLICY "Allow anonymous deletions" 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'recordings' );

-- 7. Create PROJECTS table (for Multitrack / DAW functionality)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id text,
  name text,
  bpm integer default 120,
  key text default 'C',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.projects;
CREATE POLICY "Allow anonymous inserts" ON public.projects FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anonymous selects" ON public.projects;
CREATE POLICY "Allow anonymous selects" ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anonymous updates" ON public.projects;
CREATE POLICY "Allow anonymous updates" ON public.projects FOR UPDATE USING (true);

-- 8. Create TAKES table (for Comping & Multiple Recording Passes)
CREATE TABLE IF NOT EXISTS public.takes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade,
  track_id text, 
  user_id text,
  file_url text,
  duration_ms integer,
  pitch_score float,
  timing_score float,
  energy_score float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.takes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.takes;
CREATE POLICY "Allow anonymous inserts" ON public.takes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anonymous selects" ON public.takes;
CREATE POLICY "Allow anonymous selects" ON public.takes FOR SELECT USING (true);

-- 9. Create GURU_CHATS table (for AI semantic memory)
CREATE TABLE IF NOT EXISTS public.guru_chats (
  id uuid default gen_random_uuid() primary key,
  user_id text,
  session_id text,
  message JSONB,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.guru_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.guru_chats;
CREATE POLICY "Allow anonymous inserts" ON public.guru_chats FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anonymous selects" ON public.guru_chats;
CREATE POLICY "Allow anonymous selects" ON public.guru_chats FOR SELECT USING (true);

-- 10. Create COMP_SNAPSHOTS table (for Timeline Undos)
CREATE TABLE IF NOT EXISTS public.comp_snapshots (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade,
  user_id text,
  snapshot_name text,
  configuration JSONB,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.comp_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.comp_snapshots;
CREATE POLICY "Allow anonymous inserts" ON public.comp_snapshots FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anonymous selects" ON public.comp_snapshots;
CREATE POLICY "Allow anonymous selects" ON public.comp_snapshots FOR SELECT USING (true);
