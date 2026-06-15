-- Push tokens: store Expo push tokens per user/device
-- One user can have multiple tokens (different devices / reinstalls)
-- Upsert on (user_id, token) keeps the table clean

create table if not exists push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  token      text not null,
  platform   text check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists idx_push_tokens_user on push_tokens(user_id);

-- RLS
alter table push_tokens enable row level security;

-- Users can only read/write their own tokens
drop policy if exists "users can manage own push tokens" on push_tokens;
create policy "users can manage own push tokens"
  on push_tokens for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role (used by the edge function) bypasses RLS automatically.

-- Permissions
grant select, insert, update, delete on push_tokens to authenticated;
