-- Allow authenticated users to view members of public groups
CREATE POLICY IF NOT EXISTS group_members_select_public_groups
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE groups.id = group_members.group_id
      AND groups.is_public = true
    )
  );
