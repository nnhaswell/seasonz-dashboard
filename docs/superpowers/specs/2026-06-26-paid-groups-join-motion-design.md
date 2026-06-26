# Paid Groups — Join Motion (Design Spec)

**Date:** 2026-06-26
**Status:** Approved for planning
**Repos:** `seasonz-dashboard` (Next.js web — pricing config) · `Seasons_AIv02` (React Native/Expo mobile — join/checkout flow) · shared Supabase project (Tokyo `ysavccnnbgymuaeiucxs`)

## Goal

Let groups carry a price and route joining through a real checkout state machine, while every group is free (£0) for now. Build the *motions* — select plan → review → confirm → entitlement granted — so that switching on a real payment gateway later is an additive change, not a rebuild.

## Core Principle

Model **entitlement** (what a membership grants) separately from **payment** (how it was acquired). At £0 the checkout grants entitlement directly and writes a mock payment row. A real gateway later writes the same membership + payment rows from a webhook; nothing else in the app moves.

## Scope

**In scope**
- Pricing configuration on groups: `free` / `one_time` / `subscription`, set per group.
- A checkout/plan-confirm step in the mobile join flow for paid groups.
- An entitlement snapshot on each membership and a payments ledger.
- Locale-aware, user-editable display currency at checkout.
- Dashboard pricing editor for champions (own group) and superusers (any group).

**Explicitly out of scope (deferred to separate specs)**
- Discovery / people-count limits (the other monetization lever).
- Real payment gateway integration (Stripe etc.).
- Currency FX conversion (at £0 the currency is a display label only).
- Refunds, cancellation, dunning, proration, subscription lapse/renewal jobs.

## Decisions (locked during brainstorming)

| Question | Decision |
| --- | --- |
| First build | Paid-group join motion only; discovery limits later. |
| Pricing shape | Group decides: `free`, `one_time`, or `subscription`. |
| Who sets price | The group's champion (own group) **and** superusers (any group). |
| Checkout fidelity | Plan-confirm screen — no fake card fields. Honest "free for now" copy. |
| Currency | Default from device locale, user-editable; no FX while £0. |
| Payments ledger | Keep it (`group_payments`) — the gateway seam. |
| Closed + paid groups | Payment happens **after** the join request is approved. |

## Current System (verified)

- `groups` (`supabase/migrations/20260525000004_groups.sql`): `is_public`, `member_count`, champion via `group_members.role`. No pricing concept.
- Joining is RPC-based in the mobile app (`src/hooks/useGroups.ts`): `join_or_request_group(p_group)` returns `'joined' | 'requested' | 'member'`; `leave_group(p_group)`. Closed groups use `group_join_requests` + `approve_join_request` / `reject_join_request`.
- `group_members` RLS already allows self-insert / self-delete. Membership state is read via a `useGroupMembership`-style query (`isMember`, `role`).
- Dashboard manages groups at `app/superuser/groups` and per-group champion routes under `app/champion/[groupId]`.

## Data Model

### `groups` — pricing configuration (ALTER)

```sql
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS pricing_type     text    NOT NULL DEFAULT 'free'
    CHECK (pricing_type IN ('free', 'one_time', 'subscription')),
  ADD COLUMN IF NOT EXISTS price_amount     integer NOT NULL DEFAULT 0,   -- minor units (pence/cents)
  ADD COLUMN IF NOT EXISTS price_currency   text    NOT NULL DEFAULT 'GBP', -- ISO 4217, champion's base currency
  ADD COLUMN IF NOT EXISTS billing_interval text
    CHECK (billing_interval IN ('month', 'year'));   -- NULL unless subscription
```

Invariants (enforced in the `setGroupPricing` action and a CHECK where practical):
- `pricing_type = 'free'` ⇒ `price_amount = 0`, `billing_interval IS NULL`.
- `pricing_type = 'one_time'` ⇒ `price_amount >= 0`, `billing_interval IS NULL`.
- `pricing_type = 'subscription'` ⇒ `price_amount >= 0`, `billing_interval IN ('month','year')`.

### `group_members` — entitlement snapshot (ALTER)

```sql
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS plan               text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'one_time', 'subscription')),
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'none', 'expired')),
  ADD COLUMN IF NOT EXISTS price_paid         integer NOT NULL DEFAULT 0, -- minor units; 0 during motions
  ADD COLUMN IF NOT EXISTS currency           text NOT NULL DEFAULT 'GBP', -- display currency chosen at checkout
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;                 -- NULL unless subscription
```

- `plan`/`status`/`price_paid`/`currency` are a **snapshot at join time** — they do not change if the group is later re-priced.
- Existing memberships backfill to `plan='free'`, `status='active'` (the defaults), so current members are unaffected.

### `group_payments` — ledger (NEW)

```sql
CREATE TABLE IF NOT EXISTS public.group_payments (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  membership_id uuid        NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  group_id      uuid        NOT NULL REFERENCES public.groups(id)        ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  amount        integer     NOT NULL DEFAULT 0,   -- minor units that were "due" (price_amount at checkout)
  amount_paid   integer     NOT NULL DEFAULT 0,   -- actually collected; 0 during motions
  currency      text        NOT NULL DEFAULT 'GBP',
  status        text        NOT NULL DEFAULT 'mock_free'
                  CHECK (status IN ('mock_free', 'succeeded', 'pending', 'failed', 'refunded')),
  provider      text        NOT NULL DEFAULT 'mock', -- 'mock' now; 'stripe' later
  provider_ref  text,                                -- gateway charge/session id later; NULL now
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_payments_group ON public.group_payments (group_id);
CREATE INDEX IF NOT EXISTS idx_group_payments_user  ON public.group_payments (user_id);
```

When a gateway is added, its webhook inserts `group_payments` with `provider='stripe'`, `status='succeeded'`, `amount_paid>0`, `provider_ref=<charge id>` — the only new code path.

## RPCs (SECURITY DEFINER)

### `checkout_group_membership(p_group uuid, p_currency text) RETURNS jsonb`

The paid-group entitlement grant. Runs as the calling user (`auth.uid()`).

1. Load the group. If not found → error.
2. If the user already has an `active` membership → return `{ status: 'member' }` (idempotent).
3. **Gate ordering for closed groups:** if the group is closed (private) and the user is not yet approved, this RPC must reject with `needs_approval`. Payment only proceeds once a `group_join_requests` row for the user is `approved`. (Open groups skip this.)
4. Derive `plan = groups.pricing_type`, `amount = groups.price_amount`, base currency, and — for `subscription` — `current_period_end = now() + (billing_interval)`.
5. Insert/upsert `group_members` with `plan`, `status='active'`, `price_paid=0`, `currency = COALESCE(p_currency, groups.price_currency)`, `current_period_end`.
6. Insert a `group_payments` row: `amount = groups.price_amount`, `amount_paid = 0`, `currency`, `status='mock_free'`, `provider='mock'`.
7. Return `{ status: 'joined', membership_id, plan, current_period_end }`.

Free groups do **not** use this RPC — they keep `join_or_request_group`. The mobile client branches on `pricing_type`.

### Entitlement helper

`has_active_membership(group_row, membership_row)` (client-side TS helper, also usable in RLS later): `membership.status = 'active'` AND (`plan <> 'subscription'` OR `current_period_end > now()`). Used to gate access to group content. During the motions every paid join yields `active`, so this is always true post-checkout — but it is the check a real subscription lapse would later flip.

## Dashboard — Pricing Configuration (`seasonz-dashboard`)

A **Pricing card** added to:
- **Champion:** the group's settings/overview area under `app/champion/[groupId]` (authorized: champion of that group).
- **Superuser:** the per-group admin under `app/superuser/groups` (authorized: any superuser).

UI: pricing-type segmented control (`Free` / `One-time` / `Subscription`) → amount input (shown/required only when not free) → currency select (base currency) → interval select (`Monthly` / `Annually`, shown only for subscription).

Server action `setGroupPricing({ groupId, pricingType, priceAmount, priceCurrency, billingInterval })`:
- Authorize: caller is superuser **or** `group_members.role = 'champion'` for `groupId`.
- Validate invariants (free ⇒ amount 0 / no interval; subscription ⇒ interval set).
- `UPDATE groups SET ...`.

A small **"Revenue (motions)"** read-out on the same card: count of `group_payments` and sum of `amount_paid` for the group (will read £0 / N joins now), proving the ledger wiring.

## Mobile — Plan-Confirm Checkout (`Seasons_AIv02`)

- **Group profile screen (`GroupProfileScreen.tsx`):** the Join button branches:
  - `pricing_type = 'free'` → existing instant `join_or_request_group` path, unchanged.
  - paid + open group → navigate to **`GroupCheckoutScreen`**.
  - paid + closed group → request first (`join_or_request_group` → `'requested'`); the checkout screen is reachable only once the request is `approved` (button label reflects state: *Request to join* → *Pending approval* → *Confirm & join*).
- **`GroupCheckoutScreen` (new):** shows group name/avatar, the plan summary (`One-time` or `Renews monthly/annually`), the price formatted in the **display currency**, a **currency picker** (default from `expo-localization` device locale, editable; short ISO list), honest "Free for now — £0" copy, and a **Confirm & join** button that calls `checkout_group_membership(groupId, displayCurrency)`. On success → invalidate membership queries, navigate into the group.
- **Currency:** `getDisplayCurrency()` derives a currency code from the device locale, falling back to the group's `price_currency`. Switching currency reformats the label only (no FX while £0). Chosen currency is passed to the RPC and stored on the membership + payment.
  - **Locale source:** prefer `expo-localization` (`getLocales()[0].currencyCode`). It ships with the Expo SDK and runs in **Expo Go** (no custom dev build / native rebuild needed — consistent with the project's no-rebuild constraint). It must be added to `package.json` (`npx expo install expo-localization`). If we choose to avoid the dependency entirely, fall back to parsing `Intl.NumberFormat().resolvedOptions().locale` plus a small locale→currency map; `expo-localization` is preferred for giving the currency directly.

`useGroups.ts` gains a `useCheckoutMembership` mutation wrapping the RPC, mirroring the existing `useJoinGroup` pattern.

## Currency Formatting

A shared pure helper (one in each repo, or duplicated — both already have Vitest):
`formatPrice(amountMinor: number, currency: string, locale?: string): string` → uses `Intl.NumberFormat(locale, { style: 'currency', currency })`. Example: `(0, 'GBP') → "£0.00"`, `(1500, 'USD') → "$15.00"`.

## Error Handling

- Already an active member → RPC returns `{ status: 'member' }`; client treats as success (navigates in).
- Closed group, not yet approved → RPC rejects `needs_approval`; client keeps the request/pending UI, does not show checkout.
- Unknown/missing currency → fall back to the group's `price_currency`.
- Re-pricing a group does not alter existing memberships (snapshot semantics).
- Concurrent double-confirm → membership upsert on `UNIQUE(group_id, user_id)` makes it idempotent.

## Testing (Vitest — pure logic only)

- `formatPrice` — minor units + currency → display string across GBP/USD/EUR and zero.
- `getDisplayCurrency` — locale → currency code, fallback path.
- Plan/status derivation from a group's `pricing_type`.
- Subscription `current_period_end` computation for `month` / `year`.
- `has_active_membership` helper — active one-time vs. active/expired subscription.

RPCs, RLS, dashboard action, and the mobile screen are verified by running the flow (set a price on the dashboard → join from the app → confirm membership + ledger row), not by unit tests.

## Migration & Rollout Notes

- One migration file in each repo's `supabase/migrations` (identical SQL), applied live from **`Seasons_AIv02`** against the Tokyo project (the dashboard CLI links to the wrong Mumbai project — see memory `tag-refresh-game`).
- All new columns have safe defaults; existing groups become `free` and existing members `active` automatically. No backfill script needed.
- `group_payments` gets RLS: a user reads their own rows; champions/superusers read rows for groups they administer; inserts happen only inside the SECURITY DEFINER RPC.

## File Map (anticipated)

**`seasonz-dashboard`**
- `supabase/migrations/<ts>_paid_groups.sql` — groups/members ALTERs, `group_payments`, RPC, RLS, grants.
- `app/champion/[groupId]/.../` pricing card + `setGroupPricing` server action.
- `app/superuser/groups/...` pricing card (reuse the same component/action).
- `lib/price.ts` + `lib/price.test.ts` — `formatPrice`.

**`Seasons_AIv02`**
- `supabase/migrations/<ts>_paid_groups.sql` — identical SQL.
- `src/screens/GroupCheckoutScreen.tsx` — plan-confirm screen.
- `src/screens/GroupProfileScreen.tsx` — Join button branching.
- `src/hooks/useGroups.ts` — `useCheckoutMembership` mutation.
- `src/lib/price.ts` (+ test) and `getDisplayCurrency` (expo-localization).
- `package.json` — add `expo-localization` (Expo-SDK, Expo Go compatible).
- Navigation registration for `GroupCheckoutScreen`.
