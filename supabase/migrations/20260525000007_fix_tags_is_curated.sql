-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: add is_curated column to tags if it was created before this column
-- existed (the 20260525000003_tags migration skips CREATE TABLE when the table
-- already exists, so the column was never added on older databases).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS is_curated boolean NOT NULL DEFAULT false;

-- ── Seed curated tags ─────────────────────────────────────────────────────────
-- ON CONFLICT DO NOTHING makes this idempotent — safe to run even if some rows
-- already exist from an earlier partial run.

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
  ('new in city',        'present', true),
  ('building strength',  'present', true),
  ('recovering',         'present', true),
  ('first kid',          'present', true),
  ('thesis crunch',      'present', true),
  ('finding community',  'present', true),
  ('caregiving',         'present', true),
  ('solo era',           'present', true),
  ('big change at work', 'present', true),

  -- future
  ('launch a podcast', 'future', true),
  ('run a marathon',   'future', true),
  ('learn to code',    'future', true),
  ('start a business', 'future', true),
  ('find my people',   'future', true),
  ('leave the city',   'future', true),
  ('write a book',     'future', true),
  ('be a parent',      'future', true)

ON CONFLICT (label, season) DO UPDATE SET is_curated = true;
