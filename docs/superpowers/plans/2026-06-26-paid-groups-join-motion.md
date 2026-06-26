# Paid Groups — Join Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give groups a price (`free`/`one_time`/`subscription`) and route joining a paid group through a £0 plan-confirm checkout that records an entitlement snapshot + a mock payment, so a real gateway later is purely additive.

**Architecture:** One SQL migration adds pricing columns to `groups`, an entitlement snapshot to `group_members`, a `group_membership_payments` ledger, and two SECURITY DEFINER RPCs (`set_group_pricing`, `checkout_group_membership`) plus a tweak to `approve_join_request` (paid closed-groups pay *after* approval). The Next.js dashboard gets a pricing editor (champion + superuser). The Expo app branches the Join button: free → existing instant join; paid → a `GroupCheckoutSheet` modal that calls the checkout RPC.

**Tech Stack:** Supabase/Postgres (RLS, plpgsql), Next.js App Router (server actions, RSC), React Native/Expo, `@tanstack/react-query`, `expo-localization`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-26-paid-groups-join-motion-design.md`

**Repos:**
- `seasonz-dashboard` = `/Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard`
- `Seasons_AIv02` = `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`

**Critical infra note:** Apply the migration **live from `Seasons_AIv02`** against the Tokyo project (`supabase db query --linked`). The `seasonz-dashboard` CLI links to the wrong Mumbai project and times out (see memory `tag-refresh-game`). The migration file is committed to **both** repos for schema-record parity, but only run once against the shared DB.

**Naming note:** The spec calls the ledger `group_payments`; this plan uses **`group_membership_payments`** to avoid collision with the pre-existing `group_shop_payments` table (a separate feature).

---

## File Structure

**`Seasons_AIv02` (mobile + canonical migration)**
- Create: `supabase/migrations/20260626000000_paid_groups.sql` — all schema + RPCs (canonical, applied live).
- Create: `src/lib/price.ts` — `formatPrice`, `getDisplayCurrency`, `computePeriodEnd`, `hasActiveMembership`, shared types.
- Create: `src/lib/price.test.ts` — Vitest unit tests for the above.
- Create: `src/components/GroupCheckoutSheet.tsx` — plan-confirm modal.
- Modify: `src/hooks/useGroups.ts` — pricing fields on `GroupRow`, `useCheckoutMembership` mutation, membership query returns `plan`/`status`.
- Modify: `src/screens/GroupProfileScreen.tsx` — Join button branches on `pricing_type`; mounts the sheet.
- Modify: `package.json` — add `expo-localization`.

**`seasonz-dashboard` (web)**
- Create: `supabase/migrations/20260626000000_paid_groups.sql` — identical copy of the canonical migration (record only, not run from here).
- Create: `lib/price.ts` — `formatPrice` + pricing types (web copy).
- Create: `lib/price.test.ts` — Vitest unit test.
- Create: `app/champion/[groupId]/group-pricing-actions.ts` — `setGroupPricing` server action.
- Create: `components/GroupPricingCard.tsx` — client pricing editor.
- Modify: `app/champion/[groupId]/overview/page.tsx` — fetch pricing cols + render the card.
- Modify: `app/superuser/groups/page.tsx` — per-group pricing editor (reuses the card).

---

## Task 1: Database migration (schema + RPCs)

**Files:**
- Create: `Seasons_AIv02/supabase/migrations/20260626000000_paid_groups.sql`

- [ ] **Step 1: Write the migration file**

Create `Seasons_AIv02/supabase/migrations/20260626000000_paid_groups.sql` with exactly:

```sql
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
```

- [ ] **Step 2: Apply the migration live (from `Seasons_AIv02`)**

Run from `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`:

```bash
supabase db query --linked < supabase/migrations/20260626000000_paid_groups.sql
```

Expected: no error (statements return `ALTER TABLE` / `CREATE TABLE` / `CREATE FUNCTION` / `GRANT`).

- [ ] **Step 3: Smoke-verify schema + a £0 checkout**

Run from `Seasons_AIv02` (replace `<GID>` with a public seed group, e.g. `00000000-0000-0000-0000-000000000005`):

```bash
supabase db query --linked <<'SQL'
-- columns exist
select column_name from information_schema.columns
  where table_name='groups' and column_name in ('pricing_type','price_amount','price_currency','billing_interval');
select column_name from information_schema.columns
  where table_name='group_members' and column_name in ('plan','status','price_paid','currency','current_period_end');
-- functions exist
select proname from pg_proc where proname in ('set_group_pricing','checkout_group_membership');
SQL
```

Expected: 4 group columns, 5 member columns, 2 function names listed.

- [ ] **Step 4: Copy the migration into the dashboard repo (record parity)**

```bash
cp /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02/supabase/migrations/20260626000000_paid_groups.sql \
   /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard/supabase/migrations/20260626000000_paid_groups.sql
```

- [ ] **Step 5: Commit (both repos)**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260626000000_paid_groups.sql
git commit -m "feat(db): paid-groups pricing, checkout RPC, payments ledger"

cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard
git add supabase/migrations/20260626000000_paid_groups.sql
git commit -m "feat(db): paid-groups migration (record copy)"
```

---

## Task 2: Dashboard price helper (`formatPrice`)

**Files:**
- Create: `seasonz-dashboard/lib/price.ts`
- Test: `seasonz-dashboard/lib/price.test.ts`

- [ ] **Step 1: Write the failing test**

Create `seasonz-dashboard/lib/price.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPrice } from './price';

describe('formatPrice', () => {
  it('formats zero as a currency string', () => {
    expect(formatPrice(0, 'GBP', 'en-GB')).toBe('£0.00');
  });
  it('converts minor units to major', () => {
    expect(formatPrice(1500, 'USD', 'en-US')).toBe('$15.00');
  });
  it('handles non-round amounts', () => {
    expect(formatPrice(999, 'EUR', 'en-IE')).toBe('€9.99');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard && npx vitest run lib/price.test.ts`
Expected: FAIL — cannot find module `./price`.

- [ ] **Step 3: Write the implementation**

Create `seasonz-dashboard/lib/price.ts`:

```ts
// Shared pricing types + display formatting (web).
export type PricingType = 'free' | 'one_time' | 'subscription';
export type BillingInterval = 'month' | 'year';

/** Format minor currency units (pence/cents) as a localized currency string. */
export function formatPrice(amountMinor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/price.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/price.ts lib/price.test.ts
git commit -m "feat(dashboard): formatPrice helper + pricing types"
```

---

## Task 3: Dashboard `setGroupPricing` server action

**Files:**
- Create: `seasonz-dashboard/app/champion/[groupId]/group-pricing-actions.ts`

- [ ] **Step 1: Write the action**

Create `seasonz-dashboard/app/champion/[groupId]/group-pricing-actions.ts`:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { PricingType, BillingInterval } from '@/lib/price';

export interface SetGroupPricingInput {
  groupId: string;
  pricingType: PricingType;
  priceAmount: number;          // minor units
  priceCurrency: string;        // ISO 4217
  billingInterval: BillingInterval | null;
}

/** Set a group's pricing. Authorization is enforced inside the SQL RPC
 *  (champion of the group OR superuser). */
export async function setGroupPricing(input: SetGroupPricingInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_group_pricing', {
    p_group: input.groupId,
    p_type: input.pricingType,
    p_amount: input.pricingType === 'free' ? 0 : Math.max(0, Math.round(input.priceAmount)),
    p_currency: input.priceCurrency,
    p_interval: input.pricingType === 'subscription' ? input.billingInterval : null,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard && npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/group-pricing-actions.ts"
git commit -m "feat(dashboard): setGroupPricing server action"
```

---

## Task 4: Dashboard `GroupPricingCard` component

**Files:**
- Create: `seasonz-dashboard/components/GroupPricingCard.tsx`

- [ ] **Step 1: Write the component**

Create `seasonz-dashboard/components/GroupPricingCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { setGroupPricing } from '@/app/champion/[groupId]/group-pricing-actions';
import { formatPrice, type PricingType, type BillingInterval } from '@/lib/price';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'];

export interface GroupPricingCardProps {
  groupId: string;
  initialType: PricingType;
  initialAmount: number;        // minor units
  initialCurrency: string;
  initialInterval: BillingInterval | null;
  /** Optional revenue read-out (motions): payment count + collected minor units. */
  payments?: { count: number; collected: number };
}

export function GroupPricingCard(props: GroupPricingCardProps) {
  const [type, setType] = useState<PricingType>(props.initialType);
  const [major, setMajor] = useState((props.initialAmount / 100).toString());
  const [currency, setCurrency] = useState(props.initialCurrency || 'GBP');
  const [interval, setInterval] = useState<BillingInterval>(props.initialInterval ?? 'month');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onSave() {
    setSaving(true); setStatus(null);
    try {
      await setGroupPricing({
        groupId: props.groupId,
        pricingType: type,
        priceAmount: type === 'free' ? 0 : Math.round(parseFloat(major || '0') * 100),
        priceCurrency: currency,
        billingInterval: type === 'subscription' ? interval : null,
      });
      setStatus('Pricing saved.');
    } catch (e) {
      setStatus(`Save failed: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Pricing</p>

      <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden w-fit mb-4">
        {(['free', 'one_time', 'subscription'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-xs font-bold px-3 py-1.5 capitalize ${type === t ? 'bg-accent text-accent-ink' : 'text-muted'}`}
          >
            {t === 'one_time' ? 'One-time' : t}
          </button>
        ))}
      </div>

      {type !== 'free' && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="number" min="0" step="0.01" value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="0.00"
            className="w-28 bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
          <select
            value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {type === 'subscription' && (
            <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden">
              {(['month', 'year'] as const).map((iv) => (
                <button
                  key={iv} onClick={() => setInterval(iv)}
                  className={`text-xs font-bold px-3 py-1.5 ${interval === iv ? 'bg-accent text-accent-ink' : 'text-muted'}`}
                >
                  {iv === 'month' ? 'Monthly' : 'Annually'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onSave} disabled={saving}
        className="bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save pricing'}
      </button>
      {status && <p className="text-xs text-muted mt-3">{status}</p>}

      {props.payments && (
        <p className="text-xs text-faint mt-4 pt-3 border-t border-white/[0.06]">
          Revenue (motions): {props.payments.count} join{props.payments.count !== 1 ? 's' : ''} ·{' '}
          {formatPrice(props.payments.collected, currency)} collected
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add components/GroupPricingCard.tsx
git commit -m "feat(dashboard): GroupPricingCard editor"
```

---

## Task 5: Wire the pricing card into champion + superuser pages

**Files:**
- Modify: `seasonz-dashboard/app/champion/[groupId]/overview/page.tsx`
- Modify: `seasonz-dashboard/app/superuser/groups/page.tsx`

- [ ] **Step 1: Champion overview — fetch pricing columns**

In `app/champion/[groupId]/overview/page.tsx`, change the group select (currently line ~32-36) to include pricing + payments:

```ts
    supabase
      .from('groups')
      .select('name, description, season, member_count, pricing_type, price_amount, price_currency, billing_interval')
      .eq('id', groupId)
      .single(),
```

And widen the `group` cast (line ~45) to:

```ts
  const group = groupRes.data as {
    name: string; description: string | null; season: string | null; member_count: number;
    pricing_type: 'free' | 'one_time' | 'subscription'; price_amount: number;
    price_currency: string; billing_interval: 'month' | 'year' | null;
  } | null
```

- [ ] **Step 2: Champion overview — import + render the card**

Add the import at the top of the same file:

```ts
import { GroupPricingCard } from '@/components/GroupPricingCard'
```

Render it immediately after the page-header block (after the `</div>` that closes `{/* Page header */}`, around line 94):

```tsx
      <div className="mb-6">
        <GroupPricingCard
          groupId={groupId}
          initialType={group.pricing_type}
          initialAmount={group.price_amount}
          initialCurrency={group.price_currency}
          initialInterval={group.billing_interval}
        />
      </div>
```

- [ ] **Step 3: Superuser groups — load pricing into the list**

In `app/superuser/groups/page.tsx`, extend the `Group` type (line ~13) with pricing fields:

```ts
type Group = {
  id:           string
  name:         string
  description:  string | null
  season:       string | null
  is_public:    boolean
  member_count: number
  created_at:   string
  champion:     string | null
  pricing_type:     'free' | 'one_time' | 'subscription'
  price_amount:     number
  price_currency:   string
  billing_interval: 'month' | 'year' | null
}
```

Add the columns to the select (line ~45-48):

```ts
      .select(`
        id, name, description, season, is_public, member_count, created_at,
        pricing_type, price_amount, price_currency, billing_interval,
        group_members!left(user_id, role, profiles(display_name))
      `)
```

And map them (inside the `mapped` object, after `champion:` line ~63):

```ts
        champion:         champion?.profiles?.display_name ?? null,
        pricing_type:     g.pricing_type,
        price_amount:     g.price_amount,
        price_currency:   g.price_currency,
        billing_interval: g.billing_interval,
```

- [ ] **Step 4: Superuser groups — render the card per row**

Add the import at the top:

```ts
import { GroupPricingCard } from '@/components/GroupPricingCard'
```

Replace the group row block (the `<div key={g.id} className="card flex items-start justify-between gap-4">…</div>`, lines ~199-235) so the card sits beneath the existing row inside a wrapper:

```tsx
            <div key={g.id} className="flex flex-col gap-3">
              <div className="card flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-white capitalize truncate">{g.name}</h3>
                    {g.season && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: (SEASON_COLOR[g.season] ?? '#9aa3b8') + '22',
                          color: SEASON_COLOR[g.season] ?? '#9aa3b8',
                        }}
                      >
                        {g.season}
                      </span>
                    )}
                    {!g.is_public && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-faint shrink-0">private</span>
                    )}
                  </div>
                  {g.description && (
                    <p className="text-xs text-muted line-clamp-1 mb-2">{g.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-faint">
                    <span>{g.member_count} member{g.member_count !== 1 ? 's' : ''}</span>
                    {g.champion
                      ? <span className="text-accent">Champion: {g.champion}</span>
                      : <span className="text-past">No champion assigned</span>
                    }
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(g.id, g.name)}
                  className="shrink-0 text-xs text-faint hover:text-past transition-colors px-2 py-1"
                >
                  Delete
                </button>
              </div>
              <GroupPricingCard
                groupId={g.id}
                initialType={g.pricing_type}
                initialAmount={g.price_amount}
                initialCurrency={g.price_currency}
                initialInterval={g.billing_interval}
              />
            </div>
```

- [ ] **Step 5: Typecheck + run**

Run: `npx tsc --noEmit` (expect EXIT 0). Then `npm run dev`, open `/superuser/groups` and a champion `/champion/<id>/overview`, set a one-time price (e.g. 5.00 GBP) → "Pricing saved." Re-load and confirm the value persists.

- [ ] **Step 6: Commit**

```bash
git add "app/champion/[groupId]/overview/page.tsx" app/superuser/groups/page.tsx
git commit -m "feat(dashboard): pricing editor on champion overview + superuser groups"
```

---

## Task 6: Mobile price helper (`formatPrice`, `getDisplayCurrency`, `computePeriodEnd`, `hasActiveMembership`)

**Files:**
- Create: `Seasons_AIv02/src/lib/price.ts`
- Test: `Seasons_AIv02/src/lib/price.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Seasons_AIv02/src/lib/price.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPrice, getDisplayCurrency, computePeriodEnd, hasActiveMembership } from './price';

describe('formatPrice', () => {
  it('formats zero', () => { expect(formatPrice(0, 'GBP', 'en-GB')).toBe('£0.00'); });
  it('converts minor to major', () => { expect(formatPrice(1500, 'USD', 'en-US')).toBe('$15.00'); });
});

describe('getDisplayCurrency', () => {
  it('uses a valid device currency', () => { expect(getDisplayCurrency('USD', 'GBP')).toBe('USD'); });
  it('falls back when device currency is missing', () => { expect(getDisplayCurrency(null, 'GBP')).toBe('GBP'); });
  it('falls back when device currency is malformed', () => { expect(getDisplayCurrency('us', 'GBP')).toBe('GBP'); });
});

describe('computePeriodEnd', () => {
  it('adds a month', () => {
    expect(computePeriodEnd('month', '2026-01-15T00:00:00.000Z')).toBe('2026-02-15T00:00:00.000Z');
  });
  it('adds a year', () => {
    expect(computePeriodEnd('year', '2026-01-15T00:00:00.000Z')).toBe('2027-01-15T00:00:00.000Z');
  });
  it('returns null for non-subscription', () => {
    expect(computePeriodEnd(null, '2026-01-15T00:00:00.000Z')).toBeNull();
  });
});

describe('hasActiveMembership', () => {
  it('true for active one-time', () => {
    expect(hasActiveMembership({ status: 'active', plan: 'one_time', current_period_end: null })).toBe(true);
  });
  it('true for active subscription in period', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(hasActiveMembership({ status: 'active', plan: 'subscription', current_period_end: future })).toBe(true);
  });
  it('false for expired subscription period', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(hasActiveMembership({ status: 'active', plan: 'subscription', current_period_end: past })).toBe(false);
  });
  it('false when status not active', () => {
    expect(hasActiveMembership({ status: 'none', plan: 'one_time', current_period_end: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run src/lib/price.test.ts`
Expected: FAIL — cannot find module `./price`.

- [ ] **Step 3: Write the implementation**

Create `Seasons_AIv02/src/lib/price.ts`:

```ts
// Shared pricing types + pure helpers (mobile). No React/Expo imports here so
// it stays unit-testable; the device-locale lookup lives in the component.
export type PricingType = 'free' | 'one_time' | 'subscription';
export type BillingInterval = 'month' | 'year';

export interface MembershipEntitlement {
  status: 'active' | 'pending' | 'none' | 'expired';
  plan: PricingType;
  current_period_end: string | null;
}

/** Format minor currency units (pence/cents) as a localized currency string. */
export function formatPrice(amountMinor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}

/** Return deviceCurrency if it's a valid ISO-4217 code, else the fallback. */
export function getDisplayCurrency(deviceCurrency: string | null | undefined, fallback: string): string {
  if (deviceCurrency && /^[A-Z]{3}$/.test(deviceCurrency)) return deviceCurrency;
  return fallback;
}

/** Period end for a subscription, or null for one-time/free. */
export function computePeriodEnd(interval: BillingInterval | null, fromISO: string): string | null {
  if (interval !== 'month' && interval !== 'year') return null;
  const d = new Date(fromISO);
  if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

/** Whether a membership currently grants access. */
export function hasActiveMembership(m: MembershipEntitlement): boolean {
  if (m.status !== 'active') return false;
  if (m.plan !== 'subscription') return true;
  return m.current_period_end != null && new Date(m.current_period_end).getTime() > Date.now();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/price.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/price.ts src/lib/price.test.ts
git commit -m "feat(mobile): price helpers (format, currency, period, entitlement)"
```

---

## Task 7: Mobile — install expo-localization, group pricing fields, checkout mutation

**Files:**
- Modify: `Seasons_AIv02/package.json`
- Modify: `Seasons_AIv02/src/hooks/useGroups.ts`

- [ ] **Step 1: Install expo-localization**

Run from `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`:

```bash
npx expo install expo-localization
```

Expected: `expo-localization` added to `package.json` dependencies. (Expo-SDK module; works in Expo Go — no custom dev build needed.)

- [ ] **Step 2: Add pricing fields to `GroupRow`**

In `src/hooks/useGroups.ts`, extend the `GroupRow` interface (currently ends ~line 19 with `member_count`) with:

```ts
  pricing_type:     'free' | 'one_time' | 'subscription';
  price_amount:     number;
  price_currency:   string;
  billing_interval: 'month' | 'year' | null;
```

Then add these columns to every `.from('groups').select(...)` used to render group detail/list (e.g. the `useGroup`/`useAllGroups` query selects), appending `, pricing_type, price_amount, price_currency, billing_interval` to the selected column lists. (Search the file for `.from('groups')` and update each `select`.)

- [ ] **Step 3: Return entitlement fields from the membership query**

In `useGroupMembership` (the query at ~line 183), change the select and return shape:

```ts
    queryFn:   async (): Promise<{ isMember: boolean; role: 'member' | 'champion' | null; status: string | null }> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('role, status')
        .eq('group_id', groupId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return { isMember: !!data, role: data?.role ?? null, status: data?.status ?? null };
    },
```

- [ ] **Step 4: Add the `useCheckoutMembership` mutation**

In `src/hooks/useGroups.ts`, directly after the `useJoinGroup` function (ends ~line 224), add:

```ts
// ─── useCheckoutMembership — paid-group £0 checkout ───────────────────────────

export function useCheckoutMembership() {
  const qc = useQueryClient();
  const { data: authUser } = useCurrentUser();

  return useMutation({
    mutationFn: async (args: { groupId: string; currency: string }): Promise<'joined' | 'member'> => {
      const { data, error } = await supabase.rpc('checkout_group_membership', {
        p_group: args.groupId,
        p_currency: args.currency,
      });
      if (error) throw error;
      return ((data as { status?: string } | null)?.status ?? 'joined') as 'joined' | 'member';
    },
    onSuccess: (_data, args) => {
      const userId = authUser?.id ?? '';
      void qc.invalidateQueries({ queryKey: qk.groupMembership(args.groupId, userId) });
      void qc.invalidateQueries({ queryKey: qk.group(args.groupId) });
      void qc.invalidateQueries({ queryKey: qk.myGroups(userId) });
      void qc.invalidateQueries({ queryKey: qk.allGroups() });
    },
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0. (If existing call sites destructure `useGroupMembership` data, the added `status` field is additive and non-breaking.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/hooks/useGroups.ts
git commit -m "feat(mobile): group pricing fields + useCheckoutMembership; install expo-localization"
```

---

## Task 8: Mobile — `GroupCheckoutSheet` modal

**Files:**
- Create: `Seasons_AIv02/src/components/GroupCheckoutSheet.tsx`

- [ ] **Step 1: Write the component**

Create `Seasons_AIv02/src/components/GroupCheckoutSheet.tsx`. (Mirrors the existing sheet pattern — `visible`/`onClose` Modal like `GroupManageSheet`.)

```tsx
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as Localization from 'expo-localization';
import { formatPrice, getDisplayCurrency } from '../lib/price';
import { useCheckoutMembership } from '../hooks/useGroups';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onJoined: () => void;
  group: {
    id: string;
    name: string;
    pricing_type: 'free' | 'one_time' | 'subscription';
    price_amount: number;
    price_currency: string;
    billing_interval: 'month' | 'year' | null;
  };
}

export function GroupCheckoutSheet({ visible, onClose, onJoined, group }: Props) {
  const deviceCurrency = Localization.getLocales()[0]?.currencyCode ?? null;
  const [currency, setCurrency] = useState(getDisplayCurrency(deviceCurrency, group.price_currency || 'GBP'));
  const [error, setError] = useState<string | null>(null);
  const checkout = useCheckoutMembership();

  const planLabel = useMemo(() => {
    if (group.pricing_type === 'subscription') {
      return group.billing_interval === 'year' ? 'Renews annually' : 'Renews monthly';
    }
    return 'One-time access';
  }, [group.pricing_type, group.billing_interval]);

  const priceLabel = formatPrice(group.price_amount, currency);

  async function onConfirm() {
    setError(null);
    try {
      await checkout.mutateAsync({ groupId: group.id, currency });
      onJoined();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'needs_approval' ? 'Your request must be approved before you can join.' : msg);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Join {group.name}</Text>
          <Text style={styles.plan}>{planLabel}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{priceLabel}</Text>
            <Text style={styles.freeNote}>Free for now</Text>
          </View>

          <Text style={styles.label}>Currency</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCurrency(c)}
                style={[styles.ccyChip, currency === c && styles.ccyChipOn]}
              >
                <Text style={[styles.ccyTxt, currency === c && styles.ccyTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.confirm, checkout.isPending && styles.confirmDisabled]}
            onPress={onConfirm}
            disabled={checkout.isPending}
          >
            {checkout.isPending
              ? <ActivityIndicator color="#11140f" />
              : <Text style={styles.confirmTxt}>Confirm & join</Text>}
          </Pressable>

          <Pressable style={styles.cancel} onPress={onClose} disabled={checkout.isPending}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1b1e17', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: 36 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  plan: { color: '#9aa392', fontSize: 13, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 18 },
  price: { color: '#fff', fontSize: 30, fontWeight: '800' },
  freeNote: { color: '#a3e635', fontSize: 12, fontWeight: '700' },
  label: { color: '#9aa392', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ccyChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  ccyChipOn: { backgroundColor: '#a3e635', borderColor: '#a3e635' },
  ccyTxt: { color: '#cdd3c5', fontSize: 13, fontWeight: '700' },
  ccyTxtOn: { color: '#11140f' },
  error: { color: '#f87559', fontSize: 13, marginTop: 16 },
  confirm: { backgroundColor: '#a3e635', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  confirmDisabled: { opacity: 0.6 },
  confirmTxt: { color: '#11140f', fontSize: 15, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelTxt: { color: '#9aa392', fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/GroupCheckoutSheet.tsx
git commit -m "feat(mobile): GroupCheckoutSheet plan-confirm modal"
```

---

## Task 9: Mobile — branch the Join button in `GroupProfileScreen`

**Files:**
- Modify: `Seasons_AIv02/src/screens/GroupProfileScreen.tsx`

- [ ] **Step 1: Import the sheet + add open state**

Add the import near the other component imports:

```tsx
import { GroupCheckoutSheet } from '../components/GroupCheckoutSheet';
```

In the component body (near the other `useState` at ~line 175), add:

```tsx
  const [checkoutOpen, setCheckoutOpen] = useState(false);
```

- [ ] **Step 2: Branch `handleJoin` on pricing**

The screen already has the group object (the query that drives the header). Confirm a `group` variable with pricing fields is in scope (from `useGroup(groupId)`); if the local variable is named differently, use that name. Replace `handleJoin` (currently ~line 227) with:

```tsx
  const isPaid = !!group && group.pricing_type && group.pricing_type !== 'free';

  const handleJoin = () => {
    if (!groupId) return;
    if (isPaid) {
      // Closed paid groups: must request first; checkout opens once approved.
      if (isClosed && !isMember && membership?.status !== 'approved') {
        joinGroup.mutate(groupId); // files the request
        return;
      }
      setCheckoutOpen(true);
      return;
    }
    joinGroup.mutate(groupId);
  };
```

- [ ] **Step 3: Reflect price on the join button label**

Where the button label renders (currently `{isClosed ? 'request to join' : 'join group'}`, ~line 335), replace with:

```tsx
                  <Text style={styles.joinBtnTxt}>
                    {isClosed && !isMember
                      ? 'request to join'
                      : isPaid
                        ? `join · ${formatPrice(group!.price_amount, group!.price_currency)}`
                        : 'join group'}
                  </Text>
```

Add the import for `formatPrice` at the top:

```tsx
import { formatPrice } from '../lib/price';
```

- [ ] **Step 4: Mount the sheet**

Near the other sheets at the bottom of the returned JSX (alongside `<GroupManageSheet ... />`, ~line 383), add:

```tsx
        {group && (
          <GroupCheckoutSheet
            visible={checkoutOpen}
            onClose={() => setCheckoutOpen(false)}
            onJoined={() => setCheckoutOpen(false)}
            group={{
              id: groupId,
              name: group.name,
              pricing_type: group.pricing_type,
              price_amount: group.price_amount,
              price_currency: group.price_currency,
              billing_interval: group.billing_interval,
            }}
          />
        )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add src/screens/GroupProfileScreen.tsx
git commit -m "feat(mobile): paid-group join branches into checkout sheet"
```

---

## Task 10: End-to-end verification (run the apps)

**No code changes — drive the real flow.**

- [ ] **Step 1: Run the full test suites**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard && npx vitest run
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run
```

Expected: all pass.

- [ ] **Step 2: Price an open group on the dashboard**

`npm run dev` in `seasonz-dashboard`. As a superuser open `/superuser/groups`, pick an open seed group (e.g. *career changers*), set **One-time · 5.00 · GBP**, Save → "Pricing saved."

- [ ] **Step 3: Join it from the app**

Start the app (`cd Seasons_AIv02 && npx expo start -c`). As a non-member, open that group → the Join button reads **join · £5.00** → tap → `GroupCheckoutSheet` shows "One-time access", **£5.00**, "Free for now", a currency picker (defaults to device locale, switchable) → **Confirm & join** → you become a member.

- [ ] **Step 4: Confirm the ledger + entitlement**

From `Seasons_AIv02`:

```bash
supabase db query --linked <<'SQL'
select gm.plan, gm.status, gm.price_paid, gm.currency
  from group_members gm
  order by gm.joined_at desc limit 3;
select status, provider, amount, amount_paid, currency
  from group_membership_payments order by created_at desc limit 3;
SQL
```

Expected: the new membership row is `plan='one_time'`, `status='active'`, `price_paid=0`; a `group_membership_payments` row exists with `status='mock_free'`, `provider='mock'`, `amount=500`, `amount_paid=0`.

- [ ] **Step 5: Verify the closed-group order (pay after approval)**

Set a **private** group to a price. As a non-member, tap **request to join** (files a request; no checkout). As the champion, approve it (existing members screen). Back as the requester, the button now opens checkout → Confirm → member. Confirm calling checkout *before* approval raises "Your request must be approved before you can join."

- [ ] **Step 6: Verify free groups are unchanged**

A `free` group still joins instantly with one tap (no sheet), and existing members keep access (`status='active'` by default).

---

## Self-Review

**1. Spec coverage**
- Pricing config on groups (free/one_time/subscription) → Task 1 (cols) + Tasks 3–5 (editor). ✓
- Checkout/plan-confirm in mobile join flow → Tasks 8–9. ✓
- Entitlement snapshot on membership + payments ledger → Task 1. ✓
- Locale-aware, editable display currency → Task 6 (`getDisplayCurrency`) + Task 8 (picker, `expo-localization`). ✓
- Dashboard editor for champion (own) + superuser (any) → Task 1 RPC auth + Task 5 wiring. ✓
- Closed + paid = pay after approval → Task 1 (`approve_join_request` branch, checkout `needs_approval`) + Task 9 (request-first) + Task 10 Step 5. ✓
- "Revenue (motions)" read-out → `GroupPricingCard` `payments` prop (optional; rendered when supplied). Note: wiring the count/sum query is left optional in Task 5 (the prop exists; champion overview can pass it later) — not required for the core motion.
- Testing seams (formatPrice, getDisplayCurrency, period end, has_active_membership) → Tasks 2 & 6. ✓
- Deferred items (gateway, FX, discovery, refunds) → not in any task. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code. The only `<...>` are shell value placeholders (`<GID>`, `<id>`) the operator substitutes at runtime. ✓

**3. Type consistency:** `PricingType`/`BillingInterval` defined in `lib/price.ts` (web) and `src/lib/price.ts` (mobile), reused by the action, card, and sheet. `checkout_group_membership(p_group, p_currency)` signature matches `useCheckoutMembership`'s `{ groupId, currency }` rpc args. `set_group_pricing(p_group,p_type,p_amount,p_currency,p_interval)` matches `setGroupPricing`'s rpc call. `GroupRow` pricing fields (`pricing_type/price_amount/price_currency/billing_interval`) match the SQL columns and the `GroupCheckoutSheet` `group` prop. Membership entitlement shape (`status/plan/current_period_end`) matches `hasActiveMembership`. ✓
```
