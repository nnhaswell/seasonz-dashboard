-- ============================================================
-- Seasonz — Base schema
-- Must run before all other migrations
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text,
  handle              text unique,
  avatar_url          text,
  bio                 text,
  active_season       text check (active_season in ('past', 'present', 'future')) default 'present',
  onboarding_complete boolean not null default false,
  is_superuser        boolean not null default false,
  champion_reveal_seen boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── posts ─────────────────────────────────────────────────────────────────────

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,
  season        text not null check (season in ('past', 'present', 'future')),
  content       text not null,
  image_url     text,
  likes_count   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── connections ───────────────────────────────────────────────────────────────

create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  connected_user_id uuid not null references public.profiles(id) on delete cascade,
  requester_id     uuid references public.profiles(id) on delete cascade,
  addressee_id     uuid references public.profiles(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'connected')),
  created_at       timestamptz not null default now(),
  unique (user_id, connected_user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.posts       enable row level security;
alter table public.connections enable row level security;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- posts
drop policy if exists "posts_select" on public.posts;
create policy "posts_select"
  on public.posts for select to authenticated using (true);

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert"
  on public.posts for insert to authenticated with check (auth.uid() = author_id or auth.uid() = user_id);

drop policy if exists "posts_update" on public.posts;
create policy "posts_update"
  on public.posts for update to authenticated using (auth.uid() = author_id or auth.uid() = user_id);

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete"
  on public.posts for delete to authenticated using (auth.uid() = author_id or auth.uid() = user_id);

-- connections
drop policy if exists "connections_select" on public.connections;
create policy "connections_select"
  on public.connections for select to authenticated using (true);

drop policy if exists "connections_insert" on public.connections;
create policy "connections_insert"
  on public.connections for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "connections_update" on public.connections;
create policy "connections_update"
  on public.connections for update to authenticated using (auth.uid() = user_id or auth.uid() = connected_user_id);

-- ── Grants ────────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.posts       to authenticated;
grant select, insert, update, delete on public.connections to authenticated;
