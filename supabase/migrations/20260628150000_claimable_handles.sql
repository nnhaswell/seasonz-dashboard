-- Claimable handles: reserved list, change cooldown, validation + claim RPCs.
-- Safe to re-run. The auto-generating signup trigger is untouched (stays default).

create table if not exists public.reserved_handles (label text primary key);
alter table public.reserved_handles enable row level security;
-- No policies / no grant: only the SECURITY DEFINER RPCs below read it.
insert into public.reserved_handles (label) values
  ('admin'),('administrator'),('support'),('help'),('seasonz'),('seasons'),
  ('official'),('team'),('mod'),('moderator'),('root'),('api'),('www'),
  ('about'),('privacy'),('terms'),('contact'),('login'),('signup'),('settings'),
  ('me'),('user'),('null'),('undefined')
on conflict do nothing;

alter table public.profiles
  add column if not exists handle_changed_at timestamptz;

-- Live availability check (no side effects). Returns { available, reason }.
create or replace function public.check_handle(p_handle text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); h text := lower(trim(coalesce(p_handle,'')));
begin
  if h !~ '^[a-z][a-z0-9._]{2,19}$' or h ~ '[._]{2,}' or h ~ '[._]$' then
    return jsonb_build_object('available', false, 'reason', 'invalid_format');
  end if;
  if exists (select 1 from reserved_handles where label = h) then
    return jsonb_build_object('available', false, 'reason', 'reserved');
  end if;
  if exists (
    select 1 from profiles
    where lower(handle) = h
      and id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    return jsonb_build_object('available', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('available', true, 'reason', 'ok');
end; $$;
grant execute on function public.check_handle(text) to authenticated;

-- Commit: validate + set the caller's handle. 30-day cooldown unless unchanged.
create or replace function public.claim_handle(p_handle text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  h text := lower(trim(coalesce(p_handle,'')));
  v_current text; v_last timestamptz; v_cooldown interval := interval '30 days';
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if h !~ '^[a-z][a-z0-9._]{2,19}$' or h ~ '[._]{2,}' or h ~ '[._]$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_format');
  end if;
  if exists (select 1 from reserved_handles where label = h) then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  select lower(handle), handle_changed_at into v_current, v_last from profiles where id = v_user;
  if h = v_current then
    return jsonb_build_object('ok', true, 'handle', h);  -- no-op; don't burn cooldown
  end if;
  if exists (select 1 from profiles where lower(handle) = h and id <> v_user) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  if v_last is not null and v_last > now() - v_cooldown then
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'next_at', v_last + v_cooldown);
  end if;
  update profiles set handle = h, handle_changed_at = now() where id = v_user;
  return jsonb_build_object('ok', true, 'handle', h);
end; $$;
grant execute on function public.claim_handle(text) to authenticated;
