-- ============================================================
-- Seasonz — tags + user_tags tables + suggestions RPC
-- Created: 2026-05-25
--
-- tags:      master list of season tags (curated + user-created)
-- user_tags: junction linking users to tags per season
-- get_suggestions: cross-season tag-overlap suggestion query
-- Run via: supabase db push
-- ============================================================

-- ── tags ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tags (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  label      text    NOT NULL,
  season     text    NOT NULL CHECK (season IN ('past', 'present', 'future')),
  category   text,
  is_curated boolean NOT NULL DEFAULT false,
  UNIQUE (label, season)
);

-- ── user_tags ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_tags (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_id     uuid        NOT NULL REFERENCES public.tags(id)     ON DELETE CASCADE,
  season     text        NOT NULL CHECK (season IN ('past', 'present', 'future')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user   ON public.user_tags (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag    ON public.user_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_season ON public.user_tags (user_id, season);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

-- tags: anyone authenticated can read; only service role inserts curated tags
DROP POLICY IF EXISTS "tags: authenticated read" ON public.tags;
CREATE POLICY "tags: authenticated read"
  ON public.tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tags: authenticated insert" ON public.tags;
CREATE POLICY "tags: authenticated insert"
  ON public.tags FOR INSERT TO authenticated WITH CHECK (true);

-- user_tags: own rows only
DROP POLICY IF EXISTS "user_tags: owner select" ON public.user_tags;
CREATE POLICY "user_tags: owner select"
  ON public.user_tags FOR SELECT TO authenticated USING (true); -- readable by all (needed for suggestions)

DROP POLICY IF EXISTS "user_tags: owner insert" ON public.user_tags;
CREATE POLICY "user_tags: owner insert"
  ON public.user_tags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tags: owner delete" ON public.user_tags;
CREATE POLICY "user_tags: owner delete"
  ON public.user_tags FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT         ON public.tags      TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_tags TO authenticated;

-- ── Ensure is_curated column exists ──────────────────────────────────────────
-- Guard for databases where the tags table was created before this column was
-- added to the migration (CREATE TABLE IF NOT EXISTS skips the column).

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS is_curated boolean NOT NULL DEFAULT false;

-- ── Seed curated tags ─────────────────────────────────────────────────────────
-- Mirrors CURATED_TAGS in OnboardingScreen.tsx exactly.
-- ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO public.tags (label, season, is_curated) VALUES
  -- past
  ('university',   'past', true),
  ('first job',    'past', true),
  ('moved cities', 'past', true),
  ('breakup',      'past', true),
  ('parenthood',   'past', true),
  ('career pivot', 'past', true),
  ('lost someone', 'past', true),
  ('sober',        'past', true),
  ('immigration',  'past', true),
  ('burnout',      'past', true),
  ('started over', 'past', true),

  -- present
  ('new in city',       'present', true),
  ('building strength', 'present', true),
  ('recovering',        'present', true),
  ('first kid',         'present', true),
  ('thesis crunch',     'present', true),
  ('finding community', 'present', true),
  ('caregiving',        'present', true),
  ('solo era',          'present', true),
  ('big change at work','present', true),

  -- future
  ('launch a podcast', 'future', true),
  ('run a marathon',   'future', true),
  ('learn to code',    'future', true),
  ('start a business', 'future', true),
  ('find my people',   'future', true),
  ('leave the city',   'future', true),
  ('write a book',     'future', true),
  ('be a parent',      'future', true)

ON CONFLICT (label, season) DO NOTHING;

-- ── get_suggestions RPC ───────────────────────────────────────────────────────
-- Returns users whose tags overlap with p_user_id's tags, ranked by overlap
-- count. Excludes already-connected / pending users. Cross-season matches are
-- intentional — that's the core Seasonz insight.

CREATE OR REPLACE FUNCTION public.get_suggestions(
  p_user_id uuid,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  user_id          uuid,
  display_name     text,
  handle           text,
  avatar_url       text,
  bio              text,
  active_season    text,
  common_tag_labels text[],
  my_seasons        text[],
  their_seasons     text[],
  overlap_count     int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id                                   AS user_id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.bio,
    p.active_season,
    array_agg(DISTINCT t.label ORDER BY t.label)          AS common_tag_labels,
    array_agg(DISTINCT my_ut.season  ORDER BY my_ut.season)  AS my_seasons,
    array_agg(DISTINCT thm.season    ORDER BY thm.season)    AS their_seasons,
    COUNT(DISTINCT t.id)::int                              AS overlap_count
  FROM user_tags my_ut
  JOIN tags t       ON t.id  = my_ut.tag_id
  JOIN user_tags thm ON thm.tag_id = t.id
  JOIN profiles p   ON p.id  = thm.user_id
  WHERE my_ut.user_id = p_user_id
    AND thm.user_id   != p_user_id
    -- exclude users we already have a connection row with (any status)
    AND NOT EXISTS (
      SELECT 1 FROM connections c
      WHERE (c.requester_id = p_user_id  AND c.addressee_id = thm.user_id)
         OR (c.requester_id = thm.user_id AND c.addressee_id = p_user_id)
    )
  GROUP BY p.id, p.display_name, p.handle, p.avatar_url, p.bio, p.active_season
  ORDER BY overlap_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_suggestions(uuid, int) TO authenticated;
