-- Group tags: champion/superuser-set labels (Tag Refresh vocabulary) used to
-- describe a group and rank it in Discover. Safe to re-run.

create table if not exists public.group_tags (
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, label)
);
create index if not exists idx_group_tags_label on public.group_tags(label);
create index if not exists idx_group_tags_group on public.group_tags(group_id);

alter table public.group_tags enable row level security;

drop policy if exists "group_tags_select" on public.group_tags;
create policy "group_tags_select" on public.group_tags for select to authenticated using (true);

grant select on public.group_tags to authenticated;
-- No client insert/delete: writes go through set_group_tags() only.

-- Replace a group's tag set atomically. Authorised: superuser OR the group's champion.
create or replace function public.set_group_tags(p_group uuid, p_labels text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_is_super boolean;
begin
  select coalesce(is_superuser, false) into v_is_super from profiles where id = auth.uid();
  if not (v_is_super or public.is_group_champion(p_group, auth.uid())) then
    raise exception 'not authorised';
  end if;
  delete from group_tags where group_id = p_group;
  insert into group_tags (group_id, label)
    select p_group, lbl
    from (select distinct trim(both from l) as lbl from unnest(coalesce(p_labels, '{}')) as l) s
    where lbl <> '';
end; $$;
grant execute on function public.set_group_tags(uuid, text[]) to authenticated;
