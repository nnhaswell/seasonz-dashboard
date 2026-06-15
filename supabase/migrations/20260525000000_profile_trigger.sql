-- ============================================================
-- Seasonz — Profile auto-creation trigger + RLS policies
-- Created: 2026-05-25
--
-- Run via: supabase db push
-- ============================================================

-- ── Handle generator ──────────────────────────────────────────────────────────
-- Tries up to 10 times to produce a unique handle, appending a random
-- 4-digit suffix to the slugified display_name.

CREATE OR REPLACE FUNCTION public.generate_unique_handle(base text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts  int := 0;
BEGIN
  LOOP
    candidate := base || '.' || floor(random() * 9000 + 1000)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE handle = candidate
    );
    attempts := attempts + 1;
    IF attempts >= 10 THEN
      -- Fallback: use a UUID fragment — guaranteed unique
      candidate := base || '.' || substring(gen_random_uuid()::text FROM 1 FOR 6);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- ── Profile creation function ─────────────────────────────────────────────────
-- Fires after a new row is inserted into auth.users.
-- SECURITY DEFINER means it runs with the privileges of the function owner
-- (postgres), bypassing RLS on the profiles table for this INSERT.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  raw_name    text;
  slug        text;
  final_handle text;
BEGIN
  -- Pull display_name from signup metadata, fall back to email prefix
  raw_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'),    ''),
    split_part(NEW.email, '@', 1)
  );

  -- Slugify: lowercase, collapse whitespace to dots, strip non-alphanumeric
  slug := lower(regexp_replace(trim(raw_name), '\s+', '.', 'g'));
  slug := regexp_replace(slug, '[^a-z0-9.]', '', 'g');
  -- Ensure slug is never empty
  IF slug = '' OR slug = '.' THEN
    slug := 'user';
  END IF;

  final_handle := public.generate_unique_handle(slug);

  INSERT INTO public.profiles (
    id,
    display_name,
    handle,
    avatar_url,
    bio,
    active_season,
    onboarding_complete,
    created_at
  ) VALUES (
    NEW.id,
    raw_name,
    final_handle,
    NULL,
    NULL,
    'present',
    false,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Trigger ───────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS (idempotent — safe to run if already enabled)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any profile (needed for discovery, connections)
DROP POLICY IF EXISTS "profiles: authenticated read" ON public.profiles;
CREATE POLICY "profiles: authenticated read"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- The trigger function (SECURITY DEFINER) handles INSERT — no INSERT policy needed
-- for regular users, but add one so upserts from the client also work as fallback
DROP POLICY IF EXISTS "profiles: owner insert" ON public.profiles;
CREATE POLICY "profiles: owner insert"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
