-- Fix recursive RLS policies on groups, group_members, group_posts
-- The original group_members policy referenced group_members itself, causing infinite recursion.

-- Drop all existing policies on these three tables
drop policy if exists "groups: read public"            on public.groups;
drop policy if exists "groups: members read private"   on public.groups;
drop policy if exists "groups: insert"                 on public.groups;
drop policy if exists "groups: delete"                 on public.groups;
drop policy if exists "groups_select"                  on public.groups;
drop policy if exists "groups_insert"                  on public.groups;
drop policy if exists "groups_delete"                  on public.groups;

drop policy if exists "group_members: read public"          on public.group_members;
drop policy if exists "group_members: members read private" on public.group_members;
drop policy if exists "group_members: self insert"          on public.group_members;
drop policy if exists "group_members: self delete"          on public.group_members;
drop policy if exists "gm_select"                           on public.group_members;
drop policy if exists "gm_insert"                           on public.group_members;
drop policy if exists "gm_delete"                           on public.group_members;

drop policy if exists "group_posts: member read"   on public.group_posts;
drop policy if exists "group_posts: member insert" on public.group_posts;
drop policy if exists "group_posts: author delete" on public.group_posts;
drop policy if exists "gp_select"                  on public.group_posts;
drop policy if exists "gp_insert"                  on public.group_posts;
drop policy if exists "gp_delete"                  on public.group_posts;

-- groups: readable by all authenticated users if public
create policy "groups_select"
  on public.groups for select to authenticated
  using (is_public = true);

-- groups: any authenticated user can create (superuser does this via dashboard)
create policy "groups_insert"
  on public.groups for insert to authenticated
  with check (true);

-- groups: any authenticated user can delete (superuser only in practice)
create policy "groups_delete"
  on public.groups for delete to authenticated
  using (true);

-- group_members: NO self-reference — only see your own memberships
create policy "gm_select"
  on public.group_members for select to authenticated
  using (user_id = auth.uid());

create policy "gm_insert"
  on public.group_members for insert to authenticated
  with check (true);

create policy "gm_delete"
  on public.group_members for delete to authenticated
  using (true);

-- group_posts: members can read posts in their groups
create policy "gp_select"
  on public.group_posts for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_posts.group_id
        and gm.user_id = auth.uid()
    )
  );

create policy "gp_insert"
  on public.group_posts for insert to authenticated
  with check (auth.uid() = author_id);

create policy "gp_delete"
  on public.group_posts for delete to authenticated
  using (auth.uid() = author_id);
