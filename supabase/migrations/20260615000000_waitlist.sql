-- Public waitlist for the seasonz.ai landing page.
-- Anyone (anonymous visitors) can join; only superusers can read the list.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  source     text,                 -- optional "how did you hear" / utm
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Anyone may add themselves (the landing form uses the anon key).
drop policy if exists "waitlist_public_insert" on public.waitlist;
create policy "waitlist_public_insert" on public.waitlist
  for insert to anon, authenticated
  with check (true);

-- Only superusers can read the waitlist.
drop policy if exists "waitlist_admin_read" on public.waitlist;
create policy "waitlist_admin_read" on public.waitlist
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_superuser));

grant insert on public.waitlist to anon, authenticated;
grant select on public.waitlist to authenticated;
