-- ============================================================
-- Fix Group Members RLS Policies (No Infinite Recursion)
-- ============================================================

-- ── 1. DROP ALL existing group_members policies ────────────────────────────────
DROP POLICY IF EXISTS "group_members: read public" ON public.group_members;
DROP POLICY IF EXISTS "group_members: members read private" ON public.group_members;
DROP POLICY IF EXISTS "group_members: self insert" ON public.group_members;
DROP POLICY IF EXISTS "group_members: self delete" ON public.group_members;
DROP POLICY IF EXISTS "gm_select" ON public.group_members;
DROP POLICY IF EXISTS "gm_insert" ON public.group_members;
DROP POLICY IF EXISTS "gm_delete" ON public.group_members;
DROP POLICY IF EXISTS "gm_update" ON public.group_members;
DROP POLICY IF EXISTS "superuser_read_all_group_members" ON public.group_members;
DROP POLICY IF EXISTS "champions_update_members" ON public.group_members;
DROP POLICY IF EXISTS "group_members_select_own" ON public.group_members;
DROP POLICY IF EXISTS "group_members_select_superuser" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_self" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_superuser" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_self" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_superuser" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_superuser" ON public.group_members;

-- ── 2. Create SAFE group_members policies (no recursion) ───────────────────────

-- Policy 1: Users can see their own memberships
CREATE POLICY "group_members_select_own"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Superusers can see all memberships (no recursion - just checks profiles)
CREATE POLICY "group_members_select_superuser"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_superuser = true
    )
  );

-- Policy 3: Users can join groups (insert themselves)
CREATE POLICY "group_members_insert_self"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy 4: Superusers can insert anyone
CREATE POLICY "group_members_insert_superuser"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_superuser = true
    )
  );

-- Policy 5: Users can leave groups (delete their own membership)
CREATE POLICY "group_members_delete_self"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 6: Superusers can remove anyone
CREATE POLICY "group_members_delete_superuser"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_superuser = true
    )
  );

-- Policy 7: Superusers can update any membership (e.g., promote to champion)
CREATE POLICY "group_members_update_superuser"
  ON public.group_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_superuser = true
    )
  );

-- Done!
