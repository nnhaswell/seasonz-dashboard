-- ============================================================
-- Seasonz — user_tasks table
-- Created: 2026-05-25
--
-- Personal to-do items per user, shown on the present feed.
-- Run via: supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_tasks (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label        text        NOT NULL CHECK (char_length(label) > 0 AND char_length(label) <= 280),
  done         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Index: fast lookup of all tasks for a user, newest first
CREATE INDEX IF NOT EXISTS idx_user_tasks_user
  ON public.user_tasks (user_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "user_tasks: owner select"
  ON public.user_tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can only insert their own tasks
CREATE POLICY "user_tasks: owner insert"
  ON public.user_tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own tasks
CREATE POLICY "user_tasks: owner update"
  ON public.user_tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own tasks
CREATE POLICY "user_tasks: owner delete"
  ON public.user_tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tasks TO authenticated;
