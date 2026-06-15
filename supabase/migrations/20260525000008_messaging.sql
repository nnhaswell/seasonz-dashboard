-- ─── Messaging: conversations + messages ──────────────────────────────────────
-- Drop any partial state from previous failed runs (safe — cascades)

drop table if exists messages                 cascade;
drop table if exists conversation_participants cascade;
drop table if exists conversations             cascade;
drop function if exists bump_conversation_updated_at() cascade;
drop function if exists get_or_create_dm(uuid)         cascade;

-- ─── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  name       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id)    on delete cascade,
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now()
);

-- ─── 2. RLS ───────────────────────────────────────────────────────────────────

alter table conversations             enable row level security;
alter table conversation_participants enable row level security;
alter table messages                  enable row level security;

-- conversations: only visible if you're a participant
drop policy if exists "participants can view conversations" on conversations;
create policy "participants can view conversations"
  on conversations for select
  using (
    exists (
      select 1 from conversation_participants
      where conversation_id = conversations.id
        and user_id = auth.uid()
    )
  );

-- conversation_participants: users can only see their own rows
drop policy if exists "users can view own participation" on conversation_participants;
create policy "users can view own participation"
  on conversation_participants for select
  using (user_id = auth.uid());

drop policy if exists "users can join conversations" on conversation_participants;
create policy "users can join conversations"
  on conversation_participants for insert
  with check (user_id = auth.uid());

drop policy if exists "users can update own participation" on conversation_participants;
create policy "users can update own participation"
  on conversation_participants for update
  using (user_id = auth.uid());

-- messages: readable if you're a participant
drop policy if exists "participants can read messages" on messages;
create policy "participants can read messages"
  on messages for select
  using (
    exists (
      select 1 from conversation_participants
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

drop policy if exists "participants can send messages" on messages;
create policy "participants can send messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_participants
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

-- ─── 3. Trigger: bump updated_at on new message ───────────────────────────────

create function bump_conversation_updated_at()
returns trigger language plpgsql security definer as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_insert
  after insert on messages
  for each row execute procedure bump_conversation_updated_at();

-- ─── 4. Helper: find or create a 1:1 DM ──────────────────────────────────────

create function get_or_create_dm(other_user_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_conversation_id uuid;
begin
  select cp1.conversation_id into v_conversation_id
  from conversation_participants cp1
  join conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join conversations c on c.id = cp1.conversation_id
  where cp1.user_id = auth.uid()
    and cp2.user_id = other_user_id
    and c.is_group = false
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into conversations (is_group) values (false)
  returning id into v_conversation_id;

  insert into conversation_participants (conversation_id, user_id)
  values (v_conversation_id, auth.uid()),
         (v_conversation_id, other_user_id);

  return v_conversation_id;
end;
$$;

-- ─── 5. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_conv_participants_user    on conversation_participants(user_id);
create index if not exists idx_messages_conversation     on messages(conversation_id, created_at desc);
create index if not exists idx_messages_sender           on messages(sender_id);

-- ─── 6. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table conversations;
  end if;
end $$;
