-- ─────────────────────────────────────────────────────────────────────────────
-- timeline_milestones
--
-- Stores a user's future-season milestones: goals they're building toward,
-- each with an emoji, timeframe, optional description, and optional
-- accountability-buddy (tagged_user_id → another user in their connections).
--
-- Soft-deleted via deleted_at so users can undo a removal within a session.
-- connected_count tracks how many other users are working on the same goal
-- (populated by a future background job / edge function — defaults 0 for now).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.timeline_milestones (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,

  -- Content
  emoji            text not null default '✦',
  title            text not null,
  description      text,

  -- Ordering / grouping
  timeframe        text not null,           -- display label, e.g. "1 year"
  timeframe_order  int  not null default 3, -- sort key (1 = 3 months … 5 = 5+ years)

  -- Social
  tagged_user_id   uuid references public.profiles(id) on delete set null,
  connected_count  int  not null default 0,

  -- Completion
  completed        boolean   not null default false,
  completed_at     timestamptz,

  -- Soft delete
  deleted_at       timestamptz,

  -- Timestamps
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary query: all active milestones for a user, ordered by timeframe then created_at
create index if not exists timeline_milestones_user_active_idx
  on public.timeline_milestones (user_id, timeframe_order, created_at)
  where deleted_at is null;

-- Buddy look-up (who tagged me as an accountability buddy?)
create index if not exists timeline_milestones_tagged_user_idx
  on public.timeline_milestones (tagged_user_id)
  where tagged_user_id is not null and deleted_at is null;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists timeline_milestones_updated_at on public.timeline_milestones;
create trigger timeline_milestones_updated_at
  before update on public.timeline_milestones
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.timeline_milestones enable row level security;

-- Users can read their own milestones (active only — soft-deleted rows excluded
-- by the query filter in the app, not at RLS level so the app can still undo)
drop policy if exists "Users can read own milestones" on public.timeline_milestones;
create policy "Users can read own milestones"
  on public.timeline_milestones
  for select
  using (auth.uid() = user_id);

-- Connected users can read milestones where they are tagged as accountability buddy
drop policy if exists "Buddies can read milestones they are tagged in" on public.timeline_milestones;
create policy "Buddies can read milestones they are tagged in"
  on public.timeline_milestones
  for select
  using (auth.uid() = tagged_user_id);

-- Users can insert their own milestones
drop policy if exists "Users can insert own milestones" on public.timeline_milestones;
create policy "Users can insert own milestones"
  on public.timeline_milestones
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own milestones (complete, edit, soft-delete)
drop policy if exists "Users can update own milestones" on public.timeline_milestones;
create policy "Users can update own milestones"
  on public.timeline_milestones
  for update
  using (auth.uid() = user_id);

-- Hard delete is intentionally not allowed — use deleted_at soft delete instead
-- (no DELETE policy)

-- ─── Grant public schema access to authenticated role ─────────────────────────

grant select, insert, update on public.timeline_milestones to authenticated;
