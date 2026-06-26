-- Allow superusers and a group's champion to UPDATE the group row
-- (name, description, season, visibility). Pricing still flows through
-- set_group_pricing(); this enables the editable group fields on the dashboard.
-- Applied live against Tokyo.

drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups for update to authenticated
  using (
    public.is_group_champion(id, auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_superuser = true)
  )
  with check (
    public.is_group_champion(id, auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_superuser = true)
  );
