# Onboarding via a First Tag Refresh Round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default onboarding tag-capture a single short, gentle Tag Refresh round (with the existing 3-page picker kept as a "pick manually" opt-out), persisting tags through the strength model without a DB round.

**Architecture:** A local synthetic round over a curated starter bank drives the existing `TagRefreshGameScreen`. The game's sort→tag persistence (step 3 of `commitTagRefresh`) is extracted into a reusable `applyTagSignals`; a new `useCommitOnboardingTags` calls only that (no `tag_refresh_plays` row). `OnboardingScreen` gains a `username → game → manual` phase machine.

**Tech Stack:** React Native/Expo, @tanstack/react-query, Supabase, Vitest. **Mobile only — no schema/migration, no dashboard changes.**

**Spec:** `docs/superpowers/specs/2026-06-29-onboarding-tag-game-design.md`

**Repo:** `Seasons_AIv02` = `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02` (work on a `feat/onboarding-game` branch).

---

## File Structure

- Create: `src/lib/onboardingBank.ts` (+ `src/lib/onboardingBank.test.ts`) — curated bank + `buildOnboardingRound()`.
- Modify: `src/hooks/useCommitTagRefresh.ts` — extract/export `applyTagSignals`; add `useCommitOnboardingTags`.
- Modify: `src/hooks/index.ts` — export `useCommitOnboardingTags`.
- Modify: `src/screens/TagRefreshGameScreen.tsx` — optional `hideScore` + `onPickManually` props.
- Create: `src/components/OnboardingGameStep.tsx` — synthetic round + onboarding commit + pick-manually.
- Modify: `src/components/index.ts` — export `OnboardingGameStep`.
- Modify: `src/screens/OnboardingScreen.tsx` — `username | game | manual` phase machine.

Reference types (already defined):
- `BankWord` (`src/lib/tagRefreshSampling.ts`): `{ label: string; emoji: string | null; displayMode: 'text'|'combo'|'emoji' }`.
- `TagRefreshRoundInput` & `SortRecord` (exported from `@/screens`): round = `{ id; speed: 'slow'|'medium'|'fast'; wordsPerRound; words: BankWord[] }`; `SortRecord` = `{ label; emoji; outcome; reactionMs }`.
- `SortResult` (`useCommitTagRefresh`) is structurally identical to `SortRecord`.

---

## Task 1: Onboarding bank + `buildOnboardingRound` (TDD)

**Files:** Create `src/lib/onboardingBank.ts`, Test `src/lib/onboardingBank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/onboardingBank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ONBOARDING_BANK, buildOnboardingRound } from './onboardingBank';

describe('ONBOARDING_BANK', () => {
  it('has enough well-formed words to fill a round', () => {
    expect(ONBOARDING_BANK.length).toBeGreaterThanOrEqual(12);
    for (const w of ONBOARDING_BANK) {
      expect(typeof w.label).toBe('string');
      expect(w.label.length).toBeGreaterThan(0);
      expect(['text', 'combo', 'emoji']).toContain(w.displayMode);
    }
  });
  it('has no duplicate labels', () => {
    const labels = ONBOARDING_BANK.map((w) => w.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('buildOnboardingRound', () => {
  it('is a gentle, fixed onboarding round', () => {
    const r = buildOnboardingRound();
    expect(r.id).toBe('onboarding');
    expect(r.speed).toBe('slow');
    expect(r.wordsPerRound).toBe(10);
    expect(r.words).toBe(ONBOARDING_BANK);
    expect(r.wordsPerRound).toBeLessThanOrEqual(ONBOARDING_BANK.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run src/lib/onboardingBank.test.ts`
Expected: FAIL — cannot find module `./onboardingBank`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/onboardingBank.ts`:

```ts
import type { BankWord } from '@/lib/tagRefreshSampling';
import type { TagRefreshRoundInput } from '@/screens';

const w = (label: string, emoji: string): BankWord => ({ label, emoji, displayMode: 'combo' });

/** Broad, hand-picked starter words for the first-run onboarding round — wide
 *  enough that anyone can place several into their past / present / future. */
export const ONBOARDING_BANK: BankWord[] = [
  w('Fitness', '💪'),
  w('Family', '👨‍👩‍👧'),
  w('Career', '💼'),
  w('Travel', '✈️'),
  w('Friendships', '🤝'),
  w('Learning', '📚'),
  w('Creativity', '🎨'),
  w('Adventure', '🧗'),
  w('Home', '🏡'),
  w('Health', '🩺'),
  w('Wealth', '💰'),
  w('Purpose', '🎯'),
  w('Confidence', '✨'),
  w('Community', '🏘️'),
  w('Freedom', '🕊️'),
  w('Achievement', '🥇'),
];

/** The synthetic, gentle onboarding round. Never touches tag_refresh_rounds. */
export function buildOnboardingRound(): TagRefreshRoundInput {
  return { id: 'onboarding', speed: 'slow', wordsPerRound: 10, words: ONBOARDING_BANK };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/onboardingBank.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboardingBank.ts src/lib/onboardingBank.test.ts
git commit -m "feat(mobile): onboarding starter bank + buildOnboardingRound"
```

---

## Task 2: Extract `applyTagSignals`; add `useCommitOnboardingTags`

**Files:** Modify `src/hooks/useCommitTagRefresh.ts`, `src/hooks/index.ts`

Context: `commitTagRefresh(input)` currently does (1) insert `tag_refresh_plays`, (2) insert `tag_refresh_play_words`, (3) a `for (const s of input.sorts) { … }` loop that applies tag signals to `user_tags` + `tag_signals` via `planTagCommit`/`findOrCreateTag`. We extract step 3 verbatim into a reusable function and call it from both paths.

- [ ] **Step 1: Extract the step-3 loop into `applyTagSignals`**

In `src/hooks/useCommitTagRefresh.ts`, add this exported function **above** `commitTagRefresh` (it uses the existing module-level `findOrCreateTag`, `planTagCommit`, `StrengthState`, and `supabase`):

```ts
/**
 * Apply a list of sort outcomes to user_tags + tag_signals (the strength model).
 * No play row — shared by the game commit and onboarding (which has no DB round).
 */
export async function applyTagSignals(
  userId: string,
  sorts: SortResult[],
  now: Date = new Date(),
): Promise<void> {
  for (const s of sorts) {
    // First pass: determine action kind (prev=null gives us season/source).
    const probe = planTagCommit(s.outcome, null, now);

    if (probe.kind === 'assign') {
      const tagId = await findOrCreateTag(s.label, probe.season);

      const { data: prevRow } = await supabase
        .from('user_tags')
        .select('id, strength, last_reinforced_at, reinforcement_count')
        .eq('user_id', userId)
        .eq('tag_id', tagId)
        .maybeSingle();

      const prev: StrengthState | null = prevRow
        ? {
            strength:            Number(prevRow.strength),
            lastReinforcedAt:    new Date(prevRow.last_reinforced_at),
            reinforcementCount:  prevRow.reinforcement_count,
          }
        : null;

      const finalPlan = planTagCommit(s.outcome, prev, now);
      if (finalPlan.kind !== 'assign') continue;

      if (prevRow?.id) {
        await supabase
          .from('user_tags')
          .update({
            season:               finalPlan.season,
            strength:             finalPlan.userTag.strength,
            last_reinforced_at:   finalPlan.userTag.lastReinforcedAt.toISOString(),
            reinforcement_count:  finalPlan.userTag.reinforcementCount,
            dismissed_at:         null,
          })
          .eq('id', prevRow.id);
      } else {
        await supabase.from('user_tags').insert({
          user_id:              userId,
          tag_id:               tagId,
          season:               finalPlan.season,
          strength:             finalPlan.userTag.strength,
          last_reinforced_at:   finalPlan.userTag.lastReinforcedAt.toISOString(),
          reinforcement_count:  finalPlan.userTag.reinforcementCount,
          dismissed_at:         null,
        });
      }

      await supabase.from('tag_signals').insert({
        user_id: userId,
        tag_id:  tagId,
        season:  finalPlan.signal.season,
        source:  finalPlan.signal.source,
        weight:  finalPlan.signal.weight,
      });
    } else {
      const { data: tagRows } = await supabase
        .from('tags')
        .select('id')
        .eq('label', s.label.trim());
      const tagIds = (tagRows ?? []).map((t: { id: string }) => t.id);
      if (!tagIds.length) continue;

      const { data: rows } = await supabase
        .from('user_tags')
        .select('tag_id, season')
        .eq('user_id', userId)
        .in('tag_id', tagIds);
      if (!rows?.length) continue;

      await supabase
        .from('user_tags')
        .update({ dismissed_at: probe.dismissedAt.toISOString() })
        .eq('user_id', userId)
        .in('tag_id', tagIds);

      for (const r of rows) {
        await supabase.from('tag_signals').insert({
          user_id: userId,
          tag_id:  r.tag_id,
          season:  r.season,
          source:  probe.signal.source,
          weight:  probe.signal.weight,
        });
      }
    }
  }
}
```

- [ ] **Step 2: Call it from `commitTagRefresh` (replace the inline loop)**

In `commitTagRefresh`, replace the entire `// 3. Process each word through planTagCommit.` block (the `for (const s of input.sorts) { … }` loop) with a single call:

```ts
  // 3. Apply tag signals (shared with onboarding).
  await applyTagSignals(input.userId, input.sorts, now);
```

(Steps 1 and 2 — the `tag_refresh_plays` and `tag_refresh_play_words` inserts — are unchanged.)

- [ ] **Step 3: Add the onboarding commit hook**

After the existing `useCommitTagRefresh` hook in the same file, add:

```ts
// ── Onboarding commit ─────────────────────────────────────────────────────────

/** Persist onboarding game tags. No DB round, so no tag_refresh_plays row —
 *  just the tag signals. */
export function useCommitOnboardingTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; sorts: SortResult[] }) =>
      applyTagSignals(args.userId, args.sorts),
    onSuccess: (_d, args) => {
      void qc.invalidateQueries({ queryKey: qk.userTags(args.userId) });
      void qc.invalidateQueries({ queryKey: ['tagScore', args.userId] });
    },
  });
}
```

(`useMutation`, `useQueryClient`, and `qk` are already imported in this file.)

- [ ] **Step 4: Export it**

In `src/hooks/index.ts`, add to the Tag Refresh exports:

```ts
export { useCommitOnboardingTags } from './useCommitTagRefresh';
```

- [ ] **Step 5: Typecheck + run existing tests**

Run: `npx tsc --noEmit` (zero `src/` errors; ignore `supabase/functions/`). Then `npx vitest run` (all pass — the refactor is covered by the existing `tagRefreshCommit`/`tagStrength` tests).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCommitTagRefresh.ts src/hooks/index.ts
git commit -m "refactor(mobile): extract applyTagSignals; add useCommitOnboardingTags"
```

---

## Task 3: Game screen — `hideScore` + `onPickManually` props

**Files:** Modify `src/screens/TagRefreshGameScreen.tsx`

Both props are optional and default to off/absent, so the home-feed game is unchanged.

- [ ] **Step 1: Add the props to the interface**

In the `interface Props { … }` (after `commitError?: boolean;`), add:

```ts
  hideScore?: boolean;
  onPickManually?: () => void;
```

- [ ] **Step 2: Destructure them**

In the component's destructured props (the line `round, onExit, onComplete, committing, committed, commitError,`), append:

```ts
  hideScore, onPickManually,
```

- [ ] **Step 3: Hide the score when asked**

Replace the score block:

```tsx
            <View style={styles.scoreWrap}>
              <Text style={styles.streak}>🔥 ×{Math.min(1 + Math.floor(multiplierStreak / 3) * 0.5, 3)}</Text>
              <Text style={styles.score}>{score}</Text>
            </View>
```
with:
```tsx
            {!hideScore && (
              <View style={styles.scoreWrap}>
                <Text style={styles.streak}>🔥 ×{Math.min(1 + Math.floor(multiplierStreak / 3) * 0.5, 3)}</Text>
                <Text style={styles.score}>{score}</Text>
              </View>
            )}
```

- [ ] **Step 4: Add the "pick manually" link to the intro overlay**

In the intro overlay, replace the Start button:

```tsx
              <Pressable style={styles.cta} onPress={reset}>
                <Text style={styles.ctaText}>Start</Text>
              </Pressable>
```
with:
```tsx
              <Pressable style={styles.cta} onPress={reset}>
                <Text style={styles.ctaText}>Start</Text>
              </Pressable>
              {onPickManually && (
                <Pressable onPress={onPickManually} hitSlop={8} style={styles.manualLink}>
                  <Text style={styles.manualLinkTxt}>Prefer to pick manually?</Text>
                </Pressable>
              )}
```

- [ ] **Step 5: Add the link styles**

In the screen's `StyleSheet.create({ … })`, add:

```ts
  manualLink: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  manualLinkTxt: { color: Colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/TagRefreshGameScreen.tsx
git commit -m "feat(mobile): optional hideScore + onPickManually on Tag Refresh game"
```

---

## Task 4: `OnboardingGameStep`

**Files:** Create `src/components/OnboardingGameStep.tsx`, Modify `src/components/index.ts`

- [ ] **Step 1: Write the component**

Create `src/components/OnboardingGameStep.tsx`:

```tsx
import React, { useMemo } from 'react';
import { TagRefreshGameScreen, type SortRecord } from '@/screens';
import { buildOnboardingRound } from '@/lib/onboardingBank';
import { useCurrentUser, useCommitOnboardingTags } from '@/hooks';

interface Props {
  /** Finish onboarding (App.tsx sets onboarding_complete + navigates). Tags are
   *  already persisted by the game commit, so empty arrays are correct here. */
  onComplete: (tags: { past: never[]; present: never[]; future: never[] }) => void;
  /** Switch to the manual season-picker flow. */
  onPickManually: () => void;
}

/** First-run onboarding: one gentle Tag Refresh round over a local starter bank.
 *  Persists tag signals (no DB round), then hands off to the normal finish path. */
export function OnboardingGameStep({ onComplete, onPickManually }: Props) {
  const { data: user } = useCurrentUser();
  const commit = useCommitOnboardingTags();
  const round = useMemo(() => buildOnboardingRound(), []);

  // Persist the sorted tags when the round finishes (stays on the done screen).
  const handleGameComplete = (sorts: SortRecord[]) => {
    if (user?.id && sorts.length) {
      commit.mutate({ userId: user.id, sorts });
    }
  };

  // Finish onboarding (done-screen CTA, or the top-bar close = skip).
  const finish = () => onComplete({ past: [], present: [], future: [] });

  return (
    <TagRefreshGameScreen
      round={round}
      onComplete={handleGameComplete}
      onExit={finish}
      onPickManually={onPickManually}
      committing={commit.isPending}
      committed={commit.isSuccess}
      commitError={commit.isError}
      hideScore
    />
  );
}
```

- [ ] **Step 2: Export it**

In `src/components/index.ts`, add:

```ts
export { OnboardingGameStep } from './OnboardingGameStep';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors. (`SortRecord` is structurally identical to the commit's `SortResult`, so `commit.mutate({ sorts })` typechecks.)

- [ ] **Step 4: Commit**

```bash
git add src/components/OnboardingGameStep.tsx src/components/index.ts
git commit -m "feat(mobile): OnboardingGameStep (first Tag Refresh round)"
```

---

## Task 5: `OnboardingScreen` phase machine

**Files:** Modify `src/screens/OnboardingScreen.tsx`

Context: the screen currently has `const [phase, setPhase] = useState<'username' | 'tags'>('username');` and an early return `if (phase === 'username') { return <ChooseUsernameStep onDone={() => setPhase('tags')} />; }` before the main (manual tag picker) return. We make `game` the default-after-username and keep the manual picker as a fallback.

- [ ] **Step 1: Import `OnboardingGameStep`**

Add `OnboardingGameStep` to the existing `@/components` import line (the one importing `ChooseUsernameStep`).

- [ ] **Step 2: Widen the phase type and route username → game**

Change the phase state declaration to:

```tsx
  const [phase, setPhase] = useState<'username' | 'game' | 'manual'>('username');
```

Change the username early return so it advances to the game:

```tsx
  if (phase === 'username') {
    return <ChooseUsernameStep onDone={() => setPhase('game')} />;
  }
  if (phase === 'game') {
    return (
      <OnboardingGameStep
        onComplete={onComplete!}
        onPickManually={() => setPhase('manual')}
      />
    );
  }
```

(Place the `game` block immediately after the `username` block, after all hooks. The existing main `return ( <SafeContainer> … )` now serves the `manual` phase unchanged — it still calls `onComplete({ past, present, future })`.)

NOTE: `onComplete` is an optional prop (`onComplete?`). The game step requires it; pass `onComplete!` (it is always provided by App.tsx). If TS complains about the optional/`never[]` shape mismatch, widen `OnboardingGameStep`'s `onComplete` prop type to match `OnboardingScreen`'s (`(tags: { past: Tag[]; present: Tag[]; future: Tag[] }) => void`) and pass `{ past: [], present: [], future: [] }` — empty arrays satisfy `Tag[]`.

- [ ] **Step 3: Typecheck + run tests**

Run: `npx tsc --noEmit` (zero `src/` errors). Then `npx vitest run` (all pass).

- [ ] **Step 4: Commit**

```bash
git add src/screens/OnboardingScreen.tsx
git commit -m "feat(mobile): onboarding defaults to a Tag Refresh round (manual fallback)"
```

---

## Task 6: End-to-end verification (run the app)

**No code changes — drive the flow.**

- [ ] **Step 1: Full test suite**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run
```
Expected: all pass (incl. `onboardingBank`).

- [ ] **Step 2: Game onboarding path**

Run the app. Sign up as a new user → username step → the **Tag Refresh intro** appears with a "Prefer to pick manually?" link → Start → sort the falling words (slow, **no score shown**) → done screen → continue → lands in the app.

- [ ] **Step 3: Tags persisted**

Open the profile season sheet / Discover: the sorted words appear as the user's tags in the seasons they were swiped into. (Swipe a couple to "just not me" → those don't appear.)

- [ ] **Step 4: Manual fallback**

Sign up again → username → on the intro, tap **Prefer to pick manually?** → the original 3-page season picker appears and still completes onboarding and persists selected tags.

- [ ] **Step 5: Home-feed game unchanged**

Trigger/play a normal Tag Refresh round from the home feed (champion/org round) → it still shows the score, has no "pick manually" link, and records a play as before.

- [ ] **Step 6: DB check**

```bash
supabase db query --linked "select count(*) from public.user_tags where user_id = '<new-user-id>';"
```
Expected: the onboarding sorts produced `user_tags` rows (and `tag_signals`), with **no** `tag_refresh_plays` row for the onboarding round.

---

## Self-Review

**1. Spec coverage**
- Game-first onboarding, manual opt-out → Tasks 4–5. ✓
- Gentle round (slow, ~10 words, curated bank) → Task 1; score hidden → Task 3. ✓
- Commit tags without a DB round (`applyTagSignals` extraction + `useCommitOnboardingTags`) → Task 2. ✓
- Reuse finish/navigate via `onComplete({empty})` → Task 4 + Task 5. ✓
- Manual picker unchanged; home-feed game unchanged (optional props off by default) → Tasks 3–5. ✓
- No schema change → nothing in the plan adds a migration. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every code step. `<new-user-id>` in Task 6 is an operator-substituted runtime value. ✓

**3. Type consistency:** `BankWord` ↔ `ONBOARDING_BANK` ↔ `buildOnboardingRound(): TagRefreshRoundInput` (matches the game screen's `round` prop). `SortRecord` (game `onComplete`) is structurally identical to `SortResult` (`applyTagSignals`/`useCommitOnboardingTags`), so `commit.mutate({ userId, sorts })` typechecks. `applyTagSignals(userId, sorts, now)` signature is used identically by `commitTagRefresh` (Task 2 Step 2) and the onboarding hook (Step 3). `OnboardingGameStep` props (`onComplete`, `onPickManually`) match the call site in `OnboardingScreen` (Task 5). ✓
