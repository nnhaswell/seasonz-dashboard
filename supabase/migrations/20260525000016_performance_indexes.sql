-- ============================================================
-- Seasonz — Schema additions + Performance Indexes
-- Created: 2026-05-22
--
-- Run via: supabase db push
-- ============================================================

-- ── Add missing columns to posts ──────────────────────────────────────────────
-- These are needed before the partial indexes below can reference them.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_gifted_suggestion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding
  ON profiles (id, onboarding_complete)
  WHERE onboarding_complete = false;

-- ── posts ─────────────────────────────────────────────────────────────────────

-- Profile screen: posts by a specific user in a specific season, newest first.
CREATE INDEX IF NOT EXISTS idx_posts_author_season_created
  ON posts (author_id, season, created_at DESC);

-- Feed screen: all posts for a season, newest first (excludes gifted suggestions).
CREATE INDEX IF NOT EXISTS idx_posts_season_created
  ON posts (season, created_at DESC)
  WHERE is_gifted_suggestion = false;

-- Gifted suggestion lookup per recipient.
CREATE INDEX IF NOT EXISTS idx_posts_gifted_recipient
  ON posts (recipient_id, season)
  WHERE is_gifted_suggestion = true;

-- ── connections ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_connections_requester
  ON connections (requester_id, status);

CREATE INDEX IF NOT EXISTS idx_connections_addressee
  ON connections (addressee_id, status);

-- ── group_members ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_group_members_user
  ON group_members (user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_members_group
  ON group_members (group_id, role);

-- ── user_tags ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_tags_user_season
  ON user_tags (user_id, season);

CREATE INDEX IF NOT EXISTS idx_user_tags_tag
  ON user_tags (tag_id);
