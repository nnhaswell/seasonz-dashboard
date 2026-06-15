-- ============================================================
-- Seasonz — Explicit table grants for authenticated + anon roles
-- Created: 2026-05-25
--
-- RLS policies control which *rows* are visible, but the role
-- also needs table-level GRANT privileges to touch the table at all.
-- Supabase auto-grants these when tables are created via the dashboard,
-- but migrations need them added manually.
--
-- Run via: supabase db push
-- ============================================================

-- ── Schema usage ──────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- ── profiles ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- ── posts ─────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;

-- ── connections ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;

-- ── tags + user_tags ─────────────────────────────────────────────────────────
GRANT SELECT ON public.tags TO authenticated, anon;
GRANT SELECT, INSERT, DELETE ON public.user_tags TO authenticated;

-- ── groups + group_members ────────────────────────────────────────────────────
GRANT SELECT ON public.groups TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
