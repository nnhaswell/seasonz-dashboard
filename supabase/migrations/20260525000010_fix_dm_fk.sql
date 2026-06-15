-- Fix FK on conversation_participants.user_id to reference profiles instead
-- of auth.users. Profiles are the app-level user table; all valid users have
-- a profile, and profiles.id cascades from auth.users already.
-- Also recreates get_or_create_dm with explicit search_path so auth.uid()
-- resolves correctly inside the SECURITY DEFINER context.

-- 1. Drop and recreate the FK on user_id
alter table conversation_participants
  drop constraint conversation_participants_user_id_fkey;

alter table conversation_participants
  add constraint conversation_participants_user_id_fkey
  foreign key (user_id)
  references profiles(id)
  on delete cascade;

-- 2. Recreate get_or_create_dm with search_path set so auth.uid() works
drop function if exists get_or_create_dm(uuid);

create function get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id       uuid;
  v_conversation_id uuid;
begin
  -- Capture caller now so we get the right value inside security definer
  v_caller_id := auth.uid();

  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Find an existing 1:1 conversation between the two users
  select cp1.conversation_id into v_conversation_id
  from conversation_participants cp1
  join conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join conversations c on c.id = cp1.conversation_id
  where cp1.user_id = v_caller_id
    and cp2.user_id = other_user_id
    and c.is_group = false
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- Create a new 1:1 conversation
  insert into conversations (is_group)
  values (false)
  returning id into v_conversation_id;

  insert into conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_caller_id),
         (v_conversation_id, other_user_id);

  return v_conversation_id;
end;
$$;
