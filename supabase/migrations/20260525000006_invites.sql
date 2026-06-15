-- ─── invites ──────────────────────────────────────────────────────────────────
-- Stores invite codes that gate entry to the platform.
--
-- invite_type:
--   'standard'  — basic invite, no special extras
--   'custom'    — sender pre-populated gifted_items (GiftedItemsScreen)
--   'champion'  — sent by a Seasons Champion; includes curated champion_tags
--                 that pre-select the recipient's onboarding tags
--
-- champion_tags / gifted_items are JSONB so the shape can evolve without
-- migrations. See app code for the expected structure.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invites (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text        UNIQUE NOT NULL,            -- e.g. 'NATH-XK7'
  created_by     uuid        NOT NULL
                               REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id       uuid        REFERENCES public.groups(id) ON DELETE SET NULL,
  invite_type    text        NOT NULL DEFAULT 'standard'
                               CHECK (invite_type IN ('standard', 'custom', 'champion')),

  -- Champion-defined tag pre-selections (champion invites only)
  -- Shape: { "past": ["career pivot", "burnout"], "present": [...], "future": [...] }
  champion_tags  jsonb,

  -- Gifted items for custom invites (GiftedItemsScreen)
  -- Shape: { "past": [InviteItem], "present": [InviteItem], "future": [InviteItem] }
  gifted_items   jsonb,

  max_uses       integer     NOT NULL DEFAULT 1
                               CHECK (max_uses >= 1),
  uses           integer     NOT NULL DEFAULT 0
                               CHECK (uses >= 0),
  expires_at     timestamptz,

  redeemed_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  redeemed_at    timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Guard: cannot exceed the allowed usage cap
  CONSTRAINT invite_uses_within_max CHECK (uses <= max_uses)
);

-- ── Ensure all columns exist (guard for pre-migration manual table creation) ──

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS group_id      uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_type   text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS champion_tags jsonb,
  ADD COLUMN IF NOT EXISTS gifted_items  jsonb,
  ADD COLUMN IF NOT EXISTS max_uses      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uses          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redeemed_at   timestamptz;

-- ── Ensure all columns exist (guard for pre-migration manual table creation) ──
-- created_by is added nullable here; the NOT NULL constraint exists on fresh
-- tables via CREATE TABLE above. Existing rows in manually-created tables
-- can't have a NOT NULL column added without a DEFAULT.

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS created_by    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_id      uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_type   text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS champion_tags jsonb,
  ADD COLUMN IF NOT EXISTS gifted_items  jsonb,
  ADD COLUMN IF NOT EXISTS max_uses      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uses          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redeemed_at   timestamptz;

-- Hot-path index — code lookup on landing screen (pre-auth)
CREATE INDEX IF NOT EXISTS idx_invites_code        ON public.invites (code);
-- Champion can list their sent invites
CREATE INDEX IF NOT EXISTS idx_invites_created_by  ON public.invites (created_by);
-- Group context lookup
CREATE INDEX IF NOT EXISTS idx_invites_group_id    ON public.invites (group_id)
  WHERE group_id IS NOT NULL;

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated / anon key) can look up an invite by code.
DROP POLICY IF EXISTS "public read invite by code" ON public.invites;
CREATE POLICY "public read invite by code"
  ON public.invites
  FOR SELECT
  USING (true);

-- Only the creator can insert their own invites.
DROP POLICY IF EXISTS "creator can insert invite" ON public.invites;
CREATE POLICY "creator can insert invite"
  ON public.invites
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Redemption: authenticated users can claim an unused slot.
DROP POLICY IF EXISTS "authenticated user can redeem invite" ON public.invites;
CREATE POLICY "authenticated user can redeem invite"
  ON public.invites
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND uses < max_uses
    AND (expires_at IS NULL OR expires_at > now())
  )
  WITH CHECK (true);

-- Creator can delete their own invites (e.g. to revoke).
DROP POLICY IF EXISTS "creator can delete invite" ON public.invites;
CREATE POLICY "creator can delete invite"
  ON public.invites
  FOR DELETE
  USING (auth.uid() = created_by);

-- ─── Helper: generate a random invite code ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- omit I/O/1/0 for legibility
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-';
  FOR i IN 1..3 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ─── RPC: redeem_invite ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_invite(
  p_invite_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.invites
  SET
    uses        = uses + 1,
    redeemed_by = p_user_id,
    redeemed_at = now()
  WHERE id         = p_invite_id
    AND uses       < max_uses
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite % is no longer valid or has been fully used', p_invite_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_invite TO authenticated;
