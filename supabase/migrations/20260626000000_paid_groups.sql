-- Paid groups: membership pricing + £0 checkout motion + payments ledger.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

-- 1. groups: pricing configuration
alter table public.groups
  add column if not exists pricing_type     text    not null default 'free'
    check (pricing_type in ('free','one_time','subscription')),
  add column if not exists price_amount     integer not null default 0,   -- minor units (pence/cents)
  add column if not exists price_currency   text    not null default 'GBP',
  add column if not exists billing_interval text
    check (billing_interval in ('month','year'));                          -- null unless subscription

-- 2. group_members: entitlement snapshot (taken at join time)
alter table public.group_members
  add column if not exists plan               text not null default 'free'
    check (plan in ('free','one_time','subscription')),
  add column if not exists status             text not null default 'active'
    check (status in ('active','pending','none','expired')),
  add column if not exists price_paid         integer not null default 0,  -- minor units; 0 during motions
  add column if not exists currency           text not null default 'GBP',
  add column if not exists current_period_end timestamptz;                 -- null unless subscription

-- 3. payments ledger (the gateway seam)
create table if not exists public.group_membership_payments (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.group_members(id) on delete cascade,
  group_id      uuid not null references public.groups(id)        on delete cascade,
  user_id       uuid not null references public.profiles(id)      on delete cascade,
  amount        integer not null default 0,   -- minor units due (price at checkout)
  amount_paid   integer not null default 0,   -- actually collected; 0 during motions
  currency      text not null default 'GBP',
  status        text not null default 'mock_free'
    check (status in ('mock_free','succeeded','pending','failed','refunded')),
  provider      text not null default 'mock',  -- 'mock' now; 'stripe' later
  provider_ref  text,                          -- gateway charge id later
  created_at    timestamptz not null default now()
);
create index if not exists gmp_group_idx on public.group_membership_payments(group_id);
create index if not exists gmp_user_idx  on public.group_membership_payments(user_id);

alter table public.group_membership_payments enable row level security;

drop policy if exists "gmp_select" on public.group_membership_payments;
create policy "gmp_select" on public.group_membership_payments for select to authenticated
  using (user_id = auth.uid() or public.is_group_champion(group_id, auth.uid()));

grant select on public.group_membership_payments to authenticated;
-- No client insert: only the definer RPC writes rows.

-- 4. set_group_pricing — champion of the group OR superuser
create or replace function public.set_group_pricing(
  p_group uuid, p_type text, p_amount integer, p_currency text, p_interval text
) returns void language plpgsql security definer set search_path = public as $$
declare v_is_super boolean;
begin
  select coalesce(is_superuser, false) into v_is_super from profiles where id = auth.uid();
  if not (v_is_super or public.is_group_champion(p_group, auth.uid())) then
    raise exception 'not authorised';
  end if;
  if p_type not in ('free','one_time','subscription') then raise exception 'invalid pricing type'; end if;

  if p_type = 'free' then
    update groups set pricing_type = 'free', price_amount = 0,
      price_currency = coalesce(nullif(p_currency,''),'GBP'), billing_interval = null
      where id = p_group;
  elsif p_type = 'one_time' then
    if p_amount is null or p_amount < 0 then raise exception 'invalid amount'; end if;
    update groups set pricing_type = 'one_time', price_amount = p_amount,
      price_currency = coalesce(nullif(p_currency,''),'GBP'), billing_interval = null
      where id = p_group;
  else
    if p_amount is null or p_amount < 0 then raise exception 'invalid amount'; end if;
    if p_interval not in ('month','year') then raise exception 'subscription needs an interval'; end if;
    update groups set pricing_type = 'subscription', price_amount = p_amount,
      price_currency = coalesce(nullif(p_currency,''),'GBP'), billing_interval = p_interval
      where id = p_group;
  end if;
end; $$;
grant execute on function public.set_group_pricing(uuid, text, integer, text, text) to authenticated;

-- 5. checkout_group_membership — the £0 entitlement grant
create or replace function public.checkout_group_membership(p_group uuid, p_currency text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_public boolean; v_type text; v_amount integer; v_base_ccy text; v_interval text;
  v_currency text; v_period_end timestamptz; v_membership_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select id into v_membership_id from group_members where group_id = p_group and user_id = v_user;
  if v_membership_id is not null then
    return jsonb_build_object('status','member','membership_id', v_membership_id);
  end if;

  select is_public, pricing_type, price_amount, price_currency, billing_interval
    into v_public, v_type, v_amount, v_base_ccy, v_interval
    from groups where id = p_group;
  if v_public is null then raise exception 'group not found'; end if;

  -- Closed groups: pay only after the request is approved.
  if not v_public then
    if not exists (
      select 1 from group_join_requests
      where group_id = p_group and user_id = v_user and status = 'approved'
    ) then
      raise exception 'needs_approval';
    end if;
  end if;

  v_currency := coalesce(nullif(p_currency,''), v_base_ccy, 'GBP');
  v_period_end := case
    when v_type = 'subscription' and v_interval = 'month' then now() + interval '1 month'
    when v_type = 'subscription' and v_interval = 'year'  then now() + interval '1 year'
    else null end;

  insert into group_members (group_id, user_id, role, plan, status, price_paid, currency, current_period_end)
    values (p_group, v_user, 'member', v_type, 'active', 0, v_currency, v_period_end)
    on conflict (group_id, user_id) do update
      set plan = excluded.plan, status = 'active',
          currency = excluded.currency, current_period_end = excluded.current_period_end
    returning id into v_membership_id;

  insert into group_membership_payments
    (membership_id, group_id, user_id, amount, amount_paid, currency, status, provider)
    values (v_membership_id, p_group, v_user, coalesce(v_amount,0), 0, v_currency, 'mock_free', 'mock');

  return jsonb_build_object('status','joined','membership_id', v_membership_id,
    'plan', v_type, 'current_period_end', v_period_end);
end; $$;
grant execute on function public.checkout_group_membership(uuid, text) to authenticated;

-- 6. approve_join_request — paid groups approve WITHOUT auto-joining (pay after approval)
create or replace function public.approve_join_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_user uuid; v_type text;
begin
  select group_id, user_id into v_group, v_user from group_join_requests where id = p_request;
  if v_group is null then raise exception 'request not found'; end if;
  if not public.is_group_champion(v_group, auth.uid()) then raise exception 'not authorised'; end if;

  select pricing_type into v_type from groups where id = v_group;
  if coalesce(v_type,'free') = 'free' then
    insert into group_members (group_id, user_id, role) values (v_group, v_user, 'member')
      on conflict (group_id, user_id) do nothing;
  end if;
  -- Paid groups: membership is created later by checkout_group_membership.

  update group_join_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where id = p_request;
end; $$;
grant execute on function public.approve_join_request(uuid) to authenticated;
