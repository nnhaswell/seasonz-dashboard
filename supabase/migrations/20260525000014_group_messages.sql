-- ============================================================
-- Seasonz — group_messages
-- Created: 2026-05-25
--
-- group_messages: chat messages within a group
--
-- Run via: supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS public.group_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   uuid        NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  sender_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group      ON public.group_messages (group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_time ON public.group_messages (group_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Members of public groups (or members of any group) can read messages
DROP POLICY IF EXISTS "group_messages: member read" ON public.group_messages;
CREATE POLICY "group_messages: member read"
  ON public.group_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id  = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_messages.group_id AND g.is_public = true
    )
  );

-- Group members can send messages
DROP POLICY IF EXISTS "group_messages: member insert" ON public.group_messages;
CREATE POLICY "group_messages: member insert"
  ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id  = auth.uid()
    )
  );

-- Authors can delete their own messages
DROP POLICY IF EXISTS "group_messages: author delete" ON public.group_messages;
CREATE POLICY "group_messages: author delete"
  ON public.group_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Enable Realtime for live group chat (run once in Supabase dashboard if
-- supabase_realtime publication isn't managed via SQL in your project):
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
--
-- Uncomment the line below if your project manages realtime via migrations:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
