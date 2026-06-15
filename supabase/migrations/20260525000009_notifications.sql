-- ─── Notifications + post_likes ───────────────────────────────────────────────

-- ─── 1. post_likes ────────────────────────────────────────────────────────────

create table if not exists post_likes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table post_likes enable row level security;

drop policy if exists "anyone can view likes"  on post_likes;
drop policy if exists "users can like posts"   on post_likes;
drop policy if exists "users can unlike posts" on post_likes;

create policy "anyone can view likes"
  on post_likes for select using (true);

drop policy if exists "users can like posts" on post_likes;
create policy "users can like posts"
  on post_likes for insert
  with check (user_id = auth.uid());

drop policy if exists "users can unlike posts" on post_likes;
create policy "users can unlike posts"
  on post_likes for delete
  using (user_id = auth.uid());

-- ─── 2. notifications ─────────────────────────────────────────────────────────

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  type         text not null,
  post_id      uuid references posts(id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table notifications enable row level security;

drop policy if exists "users can view own notifications"       on notifications;
drop policy if exists "users can mark own notifications read"  on notifications;

create policy "users can view own notifications"
  on notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "users can mark own notifications read" on notifications;
create policy "users can mark own notifications read"
  on notifications for update
  using (recipient_id = auth.uid());

-- ─── 3. Trigger: post liked → update likes_count + notify author ──────────────

create or replace function on_post_like_insert()
returns trigger language plpgsql security definer as $$
declare
  v_author_id uuid;
begin
  update posts set likes_count = likes_count + 1 where id = new.post_id;

  select author_id into v_author_id from posts where id = new.post_id;
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, post_id)
    values (v_author_id, new.user_id, 'post_like', new.post_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_post_like_insert on post_likes;
create trigger trg_post_like_insert
  after insert on post_likes
  for each row execute procedure on_post_like_insert();

-- ─── 4. Trigger: post unliked → decrement likes_count ────────────────────────

create or replace function on_post_like_delete()
returns trigger language plpgsql security definer as $$
begin
  update posts
  set likes_count = greatest(likes_count - 1, 0)
  where id = old.post_id;
  return old;
end;
$$;

drop trigger if exists trg_post_like_delete on post_likes;
create trigger trg_post_like_delete
  after delete on post_likes
  for each row execute procedure on_post_like_delete();

-- ─── 5. Trigger: connection accepted → notify requester ───────────────────────

create or replace function on_connection_accepted()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'connected' and old.status = 'pending' then
    insert into notifications (recipient_id, actor_id, type)
    values (new.requester_id, new.addressee_id, 'connection_accepted');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connection_accepted on connections;
create trigger trg_connection_accepted
  after update on connections
  for each row execute procedure on_connection_accepted();

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_post_likes_post  on post_likes(post_id);
create index if not exists idx_post_likes_user  on post_likes(user_id);
create index if not exists idx_notifications_recipient
  on notifications(recipient_id, created_at desc);

-- ─── 7. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
