-- ============================================================
-- Seasonz — groups, group_members, group_posts
-- Created: 2026-05-25
--
-- groups:        community groups (each with an optional Champion)
-- group_members: junction — user ↔ group with role
-- group_posts:   posts/milestones/events within a group
-- Run via: supabase db push
-- ============================================================

-- ── groups ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  description  text,
  avatar_url   text,
  season       text        CHECK (season IN ('past', 'present', 'future', 'multi')),
  is_public    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  member_count int         NOT NULL DEFAULT 0
);

-- ── group_members ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_members (
  id        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id  uuid        NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member'
                        CHECK (role IN ('member', 'champion')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group  ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user   ON public.group_members (user_id);

-- ── group_posts ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_posts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   uuid        NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season     text        NOT NULL CHECK (season IN ('past', 'present', 'future')),
  type       text        NOT NULL DEFAULT 'post'
                         CHECK (type IN ('post', 'milestone', 'event')),
  text       text        NOT NULL,
  image_url  text,
  emoji      text,
  likes      int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_posts_group       ON public.group_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_group_posts_group_season ON public.group_posts (group_id, season);
CREATE INDEX IF NOT EXISTS idx_group_posts_author      ON public.group_posts (author_id);

-- ── member_count trigger ──────────────────────────────────────────────────────
-- Keeps groups.member_count in sync automatically.

CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_member_count ON public.group_members;
CREATE TRIGGER trg_group_member_count
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();

-- ── Ensure all columns exist (guard for pre-migration manual table creation) ──
-- The groups table was created manually before these migrations existed,
-- so it may be missing any number of columns. ADD COLUMN IF NOT EXISTS is safe
-- to run even when the column already exists (Postgres 9.6+).

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS avatar_url   text,
  ADD COLUMN IF NOT EXISTS season       text CHECK (season IN ('past', 'present', 'future', 'multi')),
  ADD COLUMN IF NOT EXISTS is_public    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_count int NOT NULL DEFAULT 0;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts  ENABLE ROW LEVEL SECURITY;

-- groups: anyone authenticated can read public groups
DROP POLICY IF EXISTS "groups: read public" ON public.groups;
CREATE POLICY "groups: read public"
  ON public.groups FOR SELECT TO authenticated
  USING (is_public = true);

-- groups: members can also read private groups they belong to
DROP POLICY IF EXISTS "groups: members read private" ON public.groups;
CREATE POLICY "groups: members read private"
  ON public.groups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id AND gm.user_id = auth.uid()
    )
  );

-- group_members: anyone authenticated can read memberships of public groups
DROP POLICY IF EXISTS "group_members: read public" ON public.group_members;
CREATE POLICY "group_members: read public"
  ON public.group_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND (g.is_public = true OR g.id IN (
        SELECT gm2.group_id FROM public.group_members gm2 WHERE gm2.user_id = auth.uid()
      ))
    )
  );

-- group_members: users can join/leave themselves only
DROP POLICY IF EXISTS "group_members: self insert" ON public.group_members;
CREATE POLICY "group_members: self insert"
  ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "group_members: self delete" ON public.group_members;
CREATE POLICY "group_members: self delete"
  ON public.group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- group_posts: members of the group can read posts
DROP POLICY IF EXISTS "group_posts: member read" ON public.group_posts;
CREATE POLICY "group_posts: member read"
  ON public.group_posts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.is_public = true
    )
  );

-- group_posts: members can post
DROP POLICY IF EXISTS "group_posts: member insert" ON public.group_posts;
CREATE POLICY "group_posts: member insert"
  ON public.group_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
    )
  );

-- group_posts: authors can delete their own posts
DROP POLICY IF EXISTS "group_posts: author delete" ON public.group_posts;
CREATE POLICY "group_posts: author delete"
  ON public.group_posts FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT                ON public.groups        TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_posts   TO authenticated;

-- ── Seed: 5 case-study groups ─────────────────────────────────────────────────
-- These are the launch communities. IDs are stable UUIDs so they can be
-- referenced from other seed data. ON CONFLICT DO NOTHING = safe to re-run.

INSERT INTO public.groups (id, name, description, season, is_public, member_count) VALUES

  -- 1. Women in Wellness
  (
    '00000000-0000-0000-0000-000000000001',
    'women in wellness',
    'a space for women navigating health, recovery, and the in-between — honest, no performance.',
    'present',
    true,
    0
  ),

  -- 2. Strength & Training
  (
    '00000000-0000-0000-0000-000000000002',
    'strength & training',
    'building physical and mental strength together. all levels, all seasons of the journey.',
    'present',
    true,
    0
  ),

  -- 3. Transplant Community
  (
    '00000000-0000-0000-0000-000000000003',
    'transplant community',
    'for transplant patients, families, and donors — before, during, and long after.',
    'multi',
    true,
    0
  ),

  -- 4. University Years
  (
    '00000000-0000-0000-0000-000000000004',
    'university years',
    'the chapter before the chapter. first jobs, first city, figuring it all out.',
    'past',
    true,
    0
  ),

  -- 5. Career Changers
  (
    '00000000-0000-0000-0000-000000000005',
    'career changers',
    'people who left what they were supposed to do and are building what they actually want.',
    'future',
    true,
    0
  )

ON CONFLICT (id) DO NOTHING;
