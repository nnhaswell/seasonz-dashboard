# Claimable Handles (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users claim a custom handle (`@nathaniel`) during signup and later in settings, replacing the auto-generated suffixed default, with server-validated format/reserved/uniqueness/cooldown rules.

**Architecture:** A reserved-names table + two SECURITY DEFINER RPCs (`check_handle` for live availability, `claim_handle` to commit) are the only handle write path. Mobile gets a pure `validateHandle` helper for instant feedback, a reusable `UsernameField` (debounced availability), a username step prepended to onboarding, and a settings editor sheet. The auto-generating signup trigger is unchanged (stays the default).

**Tech Stack:** Supabase/Postgres (plpgsql, RLS), React Native/Expo, @tanstack/react-query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-28-usernames-and-web-profiles-design.md` (Phase 1 only; Phase 2 web profiles is a separate plan).

**Repos:** `Seasons_AIv02` = `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02` · `seasonz-dashboard` = `/Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard`

**Infra note:** Apply the migration **live from `Seasons_AIv02`** (Tokyo); the dashboard CLI points at the wrong Mumbai project. Copy the migration to both repos for record.

---

## File Structure

**Shared / DB**
- Create: `Seasons_AIv02/supabase/migrations/20260628150000_claimable_handles.sql` (canonical) + copy in dashboard repo.

**`Seasons_AIv02`**
- Create: `src/lib/handle.ts` (+ `src/lib/handle.test.ts`) — `validateHandle`, `slugifyHandle`.
- Create: `src/hooks/useHandle.ts` — `useCheckHandle`, `useClaimHandle`.
- Modify: `src/hooks/index.ts` — export the handle hooks.
- Create: `src/components/UsernameField.tsx` — reusable input (instant validation + debounced availability).
- Create: `src/components/ChooseUsernameStep.tsx` — onboarding username step.
- Modify: `src/screens/OnboardingScreen.tsx` — prepend the username phase.
- Create: `src/components/UsernameEditSheet.tsx` — settings editor sheet.
- Modify: `src/components/index.ts` — export new components.
- Modify: `src/App.tsx` — `ProfilePanel` "username" row + `onEditUsername` prop + mount `UsernameEditSheet`.

---

## Task 1: Migration — reserved names, cooldown column, RPCs

**Files:** Create `Seasons_AIv02/supabase/migrations/20260628150000_claimable_handles.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply live (from Seasons_AIv02)**

```bash
supabase db query --linked < supabase/migrations/20260628150000_claimable_handles.sql
```
Expected: no error. INFRA NOTE: run only from the Seasons_AIv02 repo (Tokyo-linked). If `supabase db query --linked` errors on the flag/credentials, STOP and report DONE_WITH_CONCERNS with the exact error.

- [ ] **Step 3: Smoke-verify**

```bash
supabase db query --linked <<'SQL'
select count(*) as reserved_count from public.reserved_handles;
select column_name from information_schema.columns where table_name='profiles' and column_name='handle_changed_at';
select proname from pg_proc where proname in ('check_handle','claim_handle') order by proname;
SQL
```
Expected: reserved_count = 24; `handle_changed_at` present; both functions listed.

- [ ] **Step 4: Copy to dashboard repo**

```bash
cp /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02/supabase/migrations/20260628150000_claimable_handles.sql \
   /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard/supabase/migrations/20260628150000_claimable_handles.sql
```

- [ ] **Step 5: Commit (both repos, on their feat/usernames branches — do not switch branches)**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260628150000_claimable_handles.sql
git commit -m "feat(db): claimable handles — reserved list, cooldown, check/claim RPCs"

cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard
git add supabase/migrations/20260628150000_claimable_handles.sql
git commit -m "feat(db): claimable handles migration (record copy)"
```

---

## Task 2: `validateHandle` + `slugifyHandle` (TDD)

**Files:** Create `Seasons_AIv02/src/lib/handle.ts`, Test `Seasons_AIv02/src/lib/handle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/handle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateHandle, slugifyHandle } from './handle';

describe('validateHandle', () => {
  it('accepts a clean handle', () => {
    expect(validateHandle('nathaniel')).toEqual({ ok: true });
    expect(validateHandle('jo.smith_3')).toEqual({ ok: true });
  });
  it('rejects too short / too long', () => {
    expect(validateHandle('ab')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateHandle('a'.repeat(21))).toEqual({ ok: false, reason: 'too_long' });
  });
  it('rejects a non-letter start', () => {
    expect(validateHandle('1nathaniel')).toEqual({ ok: false, reason: 'bad_start' });
    expect(validateHandle('.nope')).toEqual({ ok: false, reason: 'bad_start' });
  });
  it('rejects bad separators', () => {
    expect(validateHandle('jo..smith')).toEqual({ ok: false, reason: 'bad_separators' });
    expect(validateHandle('jo.')).toEqual({ ok: false, reason: 'bad_separators' });
  });
  it('rejects illegal characters', () => {
    expect(validateHandle('na thaniel')).toEqual({ ok: false, reason: 'bad_chars' });
    expect(validateHandle('na@me')).toEqual({ ok: false, reason: 'bad_chars' });
  });
  it('is case-insensitive (normalises)', () => {
    expect(validateHandle('Nathaniel')).toEqual({ ok: true });
  });
});

describe('slugifyHandle', () => {
  it('slugifies a display name', () => {
    expect(slugifyHandle('Nathaniel')).toBe('nathaniel');
    expect(slugifyHandle('Bob Smith')).toBe('bob.smith');
  });
  it('strips illegal chars and collapses separators', () => {
    expect(slugifyHandle('Anne-Marie  O’Neil')).toBe('anne.marie.oneil');
  });
  it('ensures a letter start and min length, capped at 20', () => {
    expect(slugifyHandle('123')).toMatch(/^[a-z]/);
    expect(slugifyHandle('Jo').length).toBeGreaterThanOrEqual(3);
    expect(slugifyHandle('x'.repeat(40)).length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run src/lib/handle.test.ts`
Expected: FAIL — cannot find module `./handle`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/handle.ts`:

```ts
// Pure handle rules (mirror the DB RPC). The RPC remains the source of truth for
// reserved/taken/cooldown; this is for instant client-side feedback.

export type HandleProblem =
  | 'too_short' | 'too_long' | 'bad_start' | 'bad_separators' | 'bad_chars';

const FULL = /^[a-z][a-z0-9._]{2,19}$/;

/** Validate a handle's format. Normalises case/whitespace first. */
export function validateHandle(raw: string): { ok: true } | { ok: false; reason: HandleProblem } {
  const h = raw.trim().toLowerCase();
  if (h.length < 3) return { ok: false, reason: 'too_short' };
  if (h.length > 20) return { ok: false, reason: 'too_long' };
  if (!/^[a-z]/.test(h)) return { ok: false, reason: 'bad_start' };
  if (/[._]{2,}/.test(h) || /[._]$/.test(h)) return { ok: false, reason: 'bad_separators' };
  if (!FULL.test(h)) return { ok: false, reason: 'bad_chars' };
  return { ok: true };
}

/** Turn a display name into a sensible default handle. */
export function slugifyHandle(name: string): string {
  let s = name.trim().toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '.')
    .replace(/^[._]+|[._]+$/g, '');
  if (!/^[a-z]/.test(s)) s = 'u' + s;
  if (s.length < 3) s = (s + 'user').slice(0, 6);
  return s.slice(0, 20);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/handle.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/handle.ts src/lib/handle.test.ts
git commit -m "feat(mobile): validateHandle + slugifyHandle helpers"
```

---

## Task 3: `useCheckHandle` + `useClaimHandle` hooks

**Files:** Create `Seasons_AIv02/src/hooks/useHandle.ts`, Modify `Seasons_AIv02/src/hooks/index.ts`

- [ ] **Step 1: Write the hooks**

Create `src/hooks/useHandle.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface HandleCheck { available: boolean; reason: string }
export interface ClaimResult { ok: boolean; handle?: string; reason?: string; next_at?: string }

/** Live availability for a candidate handle. Only fires for length >= 3. */
export function useCheckHandle(handle: string) {
  const h = handle.trim().toLowerCase();
  return useQuery({
    queryKey:  ['checkHandle', h],
    enabled:   h.length >= 3,
    staleTime: 30 * 1000,
    queryFn:   async (): Promise<HandleCheck> => {
      const { data, error } = await supabase.rpc('check_handle', { p_handle: h });
      if (error) throw error;
      return data as HandleCheck;
    },
  });
}

/** Commit a handle claim. */
export function useClaimHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string): Promise<ClaimResult> => {
      const { data, error } = await supabase.rpc('claim_handle', { p_handle: handle });
      if (error) throw error;
      return data as ClaimResult;
    },
    onSuccess: (res) => {
      // Refresh any profile query so the new handle shows immediately.
      if (res.ok) void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
```

- [ ] **Step 2: Export the hooks**

In `src/hooks/index.ts`, add near the other hook exports:

```ts
export { useCheckHandle, useClaimHandle } from './useHandle';
export type { HandleCheck, ClaimResult } from './useHandle';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors under `src/` (ignore pre-existing `supabase/functions/` Deno errors).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useHandle.ts src/hooks/index.ts
git commit -m "feat(mobile): useCheckHandle + useClaimHandle hooks"
```

---

## Task 4: `UsernameField` reusable input

**Files:** Create `Seasons_AIv02/src/components/UsernameField.tsx`, Modify `Seasons_AIv02/src/components/index.ts`

- [ ] **Step 1: Write the component**

Create `src/components/UsernameField.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { validateHandle } from '@/lib/handle';
import { useCheckHandle } from '@/hooks';

const REASON_TEXT: Record<string, string> = {
  too_short: 'at least 3 characters',
  too_long: 'at most 20 characters',
  bad_start: 'must start with a letter',
  bad_separators: 'no spaces or double . _',
  bad_chars: 'letters, numbers, . and _ only',
  reserved: 'this username is reserved',
  taken: 'that username is taken',
  invalid_format: 'invalid username',
};

interface Props {
  initial: string;
  /** The user's current handle — counts as available even though it's "taken". */
  currentHandle?: string;
  /** Fires whenever the value or its claimability changes. */
  onChange: (value: string, claimable: boolean) => void;
}

/** Username input with `@` prefix, instant format validation, and debounced
 *  server availability. Tells the parent the current value + whether it can be
 *  claimed; the parent owns the claim/save button. */
export function UsernameField({ initial, currentHandle, onChange }: Props) {
  const [value, setValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  // Debounce the value that drives the availability query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [value]);

  const format = validateHandle(value);
  const isCurrent = currentHandle != null && value.trim().toLowerCase() === currentHandle.toLowerCase();
  const check = useCheckHandle(format.ok && !isCurrent ? debounced : '');

  let claimable = false;
  let status: { tone: 'muted' | 'good' | 'bad'; text: string } = { tone: 'muted', text: '' };

  if (value.trim().length === 0) {
    status = { tone: 'muted', text: '' };
  } else if (!format.ok) {
    status = { tone: 'bad', text: REASON_TEXT[format.reason] ?? 'invalid username' };
  } else if (isCurrent) {
    claimable = true;
    status = { tone: 'muted', text: 'your current username' };
  } else if (check.isFetching) {
    status = { tone: 'muted', text: 'checking…' };
  } else if (check.data?.available) {
    claimable = true;
    status = { tone: 'good', text: 'available' };
  } else if (check.data) {
    status = { tone: 'bad', text: REASON_TEXT[check.data.reason] ?? 'unavailable' };
  } else {
    status = { tone: 'muted', text: 'checking…' };
  }

  useEffect(() => { onChange(value.trim().toLowerCase(), claimable); }, [value, claimable]); // eslint-disable-line react-hooks/exhaustive-deps

  const toneColor = status.tone === 'good' ? Colors.season.present
    : status.tone === 'bad' ? Colors.season.past : Colors.textMuted;

  return (
    <View>
      <View style={styles.inputRow}>
        <Text style={styles.at}>@</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          placeholder="username"
          placeholderTextColor={Colors.textFaint}
          style={styles.input}
          maxLength={20}
        />
      </View>
      <Text style={[styles.status, { color: toneColor }]}>{status.text || ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  at: { color: Colors.textMuted, fontFamily: 'Inter_700Bold', fontSize: 18 },
  input: { flex: 1, color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 18, paddingVertical: 14, marginLeft: 4 },
  status: { ...Typography.bodySm, marginTop: 6, marginLeft: 4, minHeight: 18 },
});
```

- [ ] **Step 2: Export it**

In `src/components/index.ts`, add:

```ts
export { UsernameField } from './UsernameField';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors. (If `Colors.season.present`/`Colors.season.past` or `Typography.bodySm` differ, check `src/theme/index.ts` — these tokens are used elsewhere in the app and exist.)

- [ ] **Step 4: Commit**

```bash
git add src/components/UsernameField.tsx src/components/index.ts
git commit -m "feat(mobile): reusable UsernameField (validation + live availability)"
```

---

## Task 5: `ChooseUsernameStep` + onboarding wiring

**Files:** Create `Seasons_AIv02/src/components/ChooseUsernameStep.tsx`, Modify `Seasons_AIv02/src/components/index.ts`, Modify `Seasons_AIv02/src/screens/OnboardingScreen.tsx`

Context: `OnboardingScreen` renders `<SafeContainer>` with a top bar + a horizontal season pager, and calls `onComplete(...)` at the end. We prepend a `username` phase shown before the existing flow. `useCurrentUser`/`useProfile` give the current user's `display_name` and `handle`.

- [ ] **Step 1: Write the step component**

Create `src/components/ChooseUsernameStep.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeContainer, Button, UsernameField } from '@/components';
import { Colors, Spacing, Typography } from '@/theme';
import { useCurrentUser, useProfile, useClaimHandle } from '@/hooks';
import { slugifyHandle } from '@/lib/handle';

interface Props { onDone: () => void }

/** First onboarding step: claim a username (or skip to keep the default). */
export function ChooseUsernameStep({ onDone }: Props) {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile(user?.id);
  const claim = useClaimHandle();

  const initial = useMemo(
    () => slugifyHandle(profile?.display_name ?? profile?.handle ?? 'user'),
    [profile?.display_name, profile?.handle],
  );

  const [value, setValue] = useState(initial);
  const [claimable, setClaimable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    try {
      const res = await claim.mutateAsync(value);
      if (res.ok) { onDone(); return; }
      setError(
        res.reason === 'taken' ? 'That username is taken.'
        : res.reason === 'reserved' ? 'That username is reserved.'
        : res.reason === 'cooldown' ? 'You changed your username recently — try again later.'
        : 'That username isn’t valid.',
      );
    } catch {
      setError('Couldn’t save — try again.');
    }
  }

  return (
    <SafeContainer>
      <View style={styles.body}>
        <Text style={styles.title}>Choose your username</Text>
        <Text style={styles.sub}>This is how people find and share your profile. You can change it later.</Text>

        {/* Re-mount the field once the default is computed from the profile. */}
        <UsernameField
          key={initial}
          initial={initial}
          currentHandle={profile?.handle}
          onChange={(v, ok) => { setValue(v); setClaimable(ok); }}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label={claim.isPending ? '' : 'Continue'}
          onPress={onConfirm}
          disabled={!claimable || claim.isPending}
          style={styles.cta}
        >
          {claim.isPending ? <ActivityIndicator color={Colors.accentInk} /> : undefined}
        </Button>

        <Pressable style={styles.skip} onPress={onDone} disabled={claim.isPending}>
          <Text style={styles.skipTxt}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing['2xl'] },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
  sub: { ...Typography.body, color: Colors.textMuted, marginTop: 8, marginBottom: Spacing.xl },
  error: { ...Typography.bodySm, color: Colors.season.past, marginTop: 12 },
  cta: { marginTop: Spacing.xl },
  skip: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  skipTxt: { ...Typography.body, color: Colors.textMuted },
});
```

NOTE: The `Button` component is at `src/components/Button.tsx`. Open it and confirm its props — it is used widely with a `label`/`onPress`/`disabled` API. If `Button` does not accept `children` or a `style` prop, replace the `<Button>` usage with a `<Pressable>` styled like the app's primary CTA (background `Colors.accent`, text `Colors.accentInk`, radius `Radius.full`, centered, `paddingVertical: 15`) and render the `ActivityIndicator` or the "Continue" label inside. Match the real `Button` API; do not invent props.

- [ ] **Step 2: Export it**

In `src/components/index.ts`, add:

```ts
export { ChooseUsernameStep } from './ChooseUsernameStep';
```

- [ ] **Step 3: Prepend the username phase in `OnboardingScreen`**

In `src/screens/OnboardingScreen.tsx`:

Add the import:
```tsx
import { ChooseUsernameStep } from '@/components';
```
Add a phase state with the other `useState` hooks near the top of the component body:
```tsx
  const [phase, setPhase] = useState<'username' | 'tags'>('username');
```
Immediately before the component's main `return (` (the one returning `<SafeContainer>` with the top bar), add an early return:
```tsx
  if (phase === 'username') {
    return <ChooseUsernameStep onDone={() => setPhase('tags')} />;
  }
```

- [ ] **Step 4: Typecheck + run**

Run: `npx tsc --noEmit` (zero `src/` errors). Then `npx vitest run` (existing tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/components/ChooseUsernameStep.tsx src/components/index.ts src/screens/OnboardingScreen.tsx
git commit -m "feat(mobile): username step at the start of onboarding"
```

---

## Task 6: Settings — `UsernameEditSheet` + ProfilePanel row

**Files:** Create `Seasons_AIv02/src/components/UsernameEditSheet.tsx`, Modify `Seasons_AIv02/src/components/index.ts`, Modify `Seasons_AIv02/src/App.tsx`

Context: `ProfilePanel` (in `App.tsx`) is presentational and opens sheets via callbacks (`onInviteFriends`/`onHelp`/`onPrivacy`); the matching sheets (`InviteFriendsSheet`, `HelpSupportSheet`, `PrivacySheet`) are mounted in `App.tsx` with `useState` open flags. We follow that exact pattern.

- [ ] **Step 1: Write the sheet**

Create `src/components/UsernameEditSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { UsernameField } from '@/components';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { useCurrentUser, useProfile, useClaimHandle } from '@/hooks';

interface Props { visible: boolean; onClose: () => void }

export function UsernameEditSheet({ visible, onClose }: Props) {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile(user?.id);
  const claim = useClaimHandle();

  const current = profile?.handle ?? '';
  const [value, setValue] = useState(current);
  const [claimable, setClaimable] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave() {
    setMsg(null);
    try {
      const res = await claim.mutateAsync(value);
      if (res.ok) { onClose(); return; }
      setMsg(
        res.reason === 'taken' ? 'That username is taken.'
        : res.reason === 'reserved' ? 'That username is reserved.'
        : res.reason === 'cooldown' ? 'You can only change your username once every 30 days.'
        : 'That username isn’t valid.',
      );
    } catch {
      setMsg('Couldn’t save — try again.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Username</Text>
          {/* key on current so it resets to the latest handle each open */}
          <UsernameField
            key={current}
            initial={current}
            currentHandle={current}
            onChange={(v, ok) => { setValue(v); setClaimable(ok); }}
          />
          {msg && <Text style={styles.msg}>{msg}</Text>}
          <Pressable
            style={[styles.save, (!claimable || claim.isPending) && styles.saveDisabled]}
            onPress={onSave}
            disabled={!claimable || claim.isPending}
          >
            {claim.isPending ? <ActivityIndicator color={Colors.accentInk} /> : <Text style={styles.saveTxt}>Save</Text>}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose} disabled={claim.isPending}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing['2xl'] },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, marginBottom: Spacing.lg },
  msg: { ...Typography.bodySm, color: Colors.season.past, marginTop: 8 },
  save: { backgroundColor: Colors.accent, borderRadius: Radius.full, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.lg },
  saveDisabled: { opacity: 0.5 },
  saveTxt: { color: Colors.accentInk, fontFamily: 'Inter_700Bold', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelTxt: { color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
```

- [ ] **Step 2: Export it**

In `src/components/index.ts`, add:
```ts
export { UsernameEditSheet } from './UsernameEditSheet';
```

- [ ] **Step 3: Add the `onEditUsername` prop + row to `ProfilePanel`**

In `src/App.tsx`, add `onEditUsername: () => void;` to the `ProfilePanelProps` interface (next to `onPrivacy`), add `onEditUsername,` to the destructured props, and add a link row alongside the other secondary links (next to the "privacy" row):
```tsx
        <Pressable style={profilePanelStyles.linkRow} onPress={() => { onClose(); onEditUsername(); }}>
          <Text style={profilePanelStyles.linkLabel}>username</Text>
        </Pressable>
```

- [ ] **Step 4: Mount the sheet in `App.tsx`**

Add `UsernameEditSheet` to the `@/components` import. Add an open-state flag near the other sheet flags (e.g. where `inviteSheetOpen`/`privacy` open flags live):
```tsx
  const [usernameSheetOpen, setUsernameSheetOpen] = useState(false);
```
Pass the prop where `<ProfilePanel ... />` is rendered (next to `onPrivacy={...}`):
```tsx
              onEditUsername={() => setUsernameSheetOpen(true)}
```
And mount the sheet near the other sheets (next to `<PrivacySheet ... />`):
```tsx
            <UsernameEditSheet visible={usernameSheetOpen} onClose={() => setUsernameSheetOpen(false)} />
```

- [ ] **Step 5: Typecheck + run**

Run: `npx tsc --noEmit` (zero `src/` errors). Then `npx vitest run` (pass).

- [ ] **Step 6: Commit**

```bash
git add src/components/UsernameEditSheet.tsx src/components/index.ts src/App.tsx
git commit -m "feat(mobile): edit-username sheet from profile settings"
```

---

## Task 7: End-to-end verification (run the app)

**No code changes — drive the flow.**

- [ ] **Step 1: Test suites**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run
```
Expected: all pass (incl. `handle` tests).

- [ ] **Step 2: Signup claim**

Run the app. Sign up as a new user → after OTP verify, the **Choose your username** step appears first, pre-filled from the name. Type a taken/reserved/invalid handle → live red message; a free one → green "available". **Continue** → proceeds into the tag onboarding. **Skip** → proceeds keeping the auto handle.

- [ ] **Step 3: Confirm persistence**

After finishing onboarding, open the profile panel → the handle shows the claimed `@username` (not the suffixed default).

- [ ] **Step 4: Edit later**

Profile panel → **username** → the sheet opens with the current handle → change to a free one → **Save** → panel shows the new handle. Immediately reopen and try changing again → "once every 30 days" cooldown message.

- [ ] **Step 5: DB check**

```bash
supabase db query --linked "select handle, handle_changed_at from public.profiles where handle_changed_at is not null order by handle_changed_at desc limit 5;"
```
Expected: the claimed handle(s) with a recent `handle_changed_at`.

---

## Self-Review

**1. Spec coverage**
- Handle rules (3–20, letter start, separators, lowercase) → Task 1 (RPC regex) + Task 2 (`validateHandle`). ✓
- `reserved_handles` table seeded → Task 1. ✓
- `check_handle` (live) + `claim_handle` (commit, 30-day cooldown, no-op-on-unchanged) → Task 1. ✓
- `handle_changed_at` column → Task 1. ✓
- Pure `validateHandle` (+ tests) and slugify → Task 2. ✓
- `useCheckHandle`/`useClaimHandle` → Task 3. ✓
- "Choose your username" as the first onboarding step, pre-filled, live availability, skippable, keeps default → Tasks 4–5. ✓
- Auto-gen trigger unchanged → not modified anywhere. ✓
- Edit-username settings reusing the RPCs + cooldown message → Task 6. ✓
- Reserved RLS: table has RLS on, no grant/policy → only definer RPCs read it → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO. Concrete code throughout. Task 5 explicitly instructs verifying the real `Button` API and gives a precise fallback rather than guessing — not a placeholder. Timestamps concrete (`20260628150000`). ✓

**3. Type consistency:** `check_handle`→`{available,reason}`=`HandleCheck`; `claim_handle`→`{ok,handle?,reason?,next_at?}`=`ClaimResult`. `useCheckHandle(handle)` / `useClaimHandle().mutateAsync(handle)` match the RPC arg `p_handle`. `validateHandle` returns `{ok}` | `{ok:false,reason:HandleProblem}` consistent between Task 2 def and Task 4 use. `UsernameField` `onChange(value, claimable)` matches both consumers (Tasks 5 & 6). `qk.profile` = `['profile', userId]`, so invalidating `['profile']` (Task 3) matches. ✓
