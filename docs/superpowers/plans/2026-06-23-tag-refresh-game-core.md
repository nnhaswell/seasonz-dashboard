# Tag Refresh — Plan 2a: Game Core & Data Layer (mobile, no UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, unit-tested game core (scoring, word-sampling, commit-planning) and the Supabase data layer (fetch pending rounds, commit a play) for the Tag Refresh game — everything the Plan 2b UI will consume, with no React Native UI yet.

**Architecture:** Pure logic lives in framework-free TypeScript modules under `Seasons_AIv02/src/lib/` and is unit-tested with Vitest (the runner added in Plan 1). The data layer follows the existing hook pattern (`useUserTags` / `useUserTagMutations`): React Query hooks in `Seasons_AIv02/src/hooks/` calling `supabase`. Commit logic reuses Plan 1's `tagStrength` (decay-on-write) and `tagOutcome` (outcome → action) modules.

**Tech Stack:** TypeScript, Vitest, @tanstack/react-query, supabase-js.

**Source spec:** `seasonz-dashboard/docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§3.4 scoring, §3.6 summary, §5.4 commit, §6A strength).
**Builds on:** Plan 1 (`src/lib/tagStrength.ts`, `src/lib/tagOutcome.ts`, the new tables, `user_tags` strength columns).

**Scope boundary (NOT in 2a):** No playfield, no animation/gestures, no summary screen, no navigation/feed wiring (all Plan 2b). No dashboard. No AI.

> All work is in `Seasons_AIv02/`. Branch off `main` AFTER PR #1 (`feature/tag-refresh-foundation`) is merged, OR branch off `feature/tag-refresh-foundation` if 2b/2a should stack on unmerged work — confirm at execution time. Pure modules from Plan 1 must be present.

---

## Domain types (used across tasks)

Defined once in Task 1 and imported elsewhere — do not redefine:
- `Outcome` (from Plan 1 `tagOutcome.ts`): `'past' | 'present' | 'future' | 'not_relevant'`.
- `SortResult`: one flicked word — `{ label: string; emoji: string | null; outcome: Outcome; reactionMs: number }`.

---

## File Structure

**Create (mobile repo `Seasons_AIv02/`):**
- `src/lib/tagRefreshScoring.ts` + `.test.ts` — pure scoring (reaction speed, streak, completion bonus, session reducer).
- `src/lib/tagRefreshSampling.ts` + `.test.ts` — pure deck word-sampling from a bank.
- `src/lib/tagRefreshCommit.ts` + `.test.ts` — pure "plan a commit" (per-word DB action + strength update + signal), reusing `tagStrength`/`tagOutcome`.
- `src/hooks/useTagRefresh.ts` — React Query hook: pending rounds + their words for the current user.
- `src/hooks/useCommitTagRefresh.ts` — mutation hook: persist a play (plays, play_words, tag_signals, user_tags) using `tagRefreshCommit`.

**Modify (mobile repo):**
- `src/lib/queryClient.ts` — add `qk.tagRefreshRounds` query key.
- `src/hooks/index.ts` — export the two new hooks.
- `src/types/index.ts` (or wherever app types live) — add shared `TagRefreshRound` / `TagRefreshWord` types (confirm exact file at execution; `useUserTags` imports `Season` from `@/types`).

---

## Task 1: Scoring module (pure, TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/tagRefreshScoring.test.ts`
- Create: `Seasons_AIv02/src/lib/tagRefreshScoring.ts`

Scoring rewards speed and rhythm only (spec §3.4): a fast flick scores full points; the longer a word falls, the fewer; a streak of decisive sorts multiplies; finishing the deck pays a bonus. All four outcomes score identically (no bucket is favored). Constants are tunable.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tagRefreshScoring.test.ts
import { describe, it, expect } from 'vitest';
import {
  FAST_MS, SLOW_MS, FULL_POINTS, FLOOR_POINTS, COMPLETION_BONUS,
  wordPoints, streakMultiplier, scoreSort, scoreSession,
} from './tagRefreshScoring';

describe('wordPoints', () => {
  it('gives full points for a flick at or under FAST_MS', () => {
    expect(wordPoints(0)).toBe(FULL_POINTS);
    expect(wordPoints(FAST_MS)).toBe(FULL_POINTS);
  });
  it('gives floor points at or over SLOW_MS', () => {
    expect(wordPoints(SLOW_MS)).toBe(FLOOR_POINTS);
    expect(wordPoints(SLOW_MS + 5000)).toBe(FLOOR_POINTS);
  });
  it('interpolates linearly in between (midpoint ~ average)', () => {
    const mid = (FAST_MS + SLOW_MS) / 2;
    expect(wordPoints(mid)).toBe(Math.round((FULL_POINTS + FLOOR_POINTS) / 2));
  });
});

describe('streakMultiplier', () => {
  it('is 1x for the first few sorts', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(2)).toBe(1);
  });
  it('steps up every 3 and caps at 3x', () => {
    expect(streakMultiplier(3)).toBe(1.5);
    expect(streakMultiplier(6)).toBe(2);
    expect(streakMultiplier(99)).toBe(3);
  });
});

describe('scoreSort', () => {
  it('multiplies word points by the streak multiplier and rounds', () => {
    // streak 3 -> 1.5x, fast flick -> FULL_POINTS
    expect(scoreSort(0, 3)).toBe(Math.round(FULL_POINTS * 1.5));
  });
});

describe('scoreSession', () => {
  const sorts = [
    { reactionMs: 0 },     // streak 0 -> 1x
    { reactionMs: 0 },     // streak 1 -> 1x
    { reactionMs: 0 },     // streak 2 -> 1x
    { reactionMs: 0 },     // streak 3 -> 1.5x
  ];
  it('sums per-sort points with a growing streak', () => {
    const r = scoreSession(sorts, { completed: false });
    expect(r.score).toBe(
      scoreSort(0, 0) + scoreSort(0, 1) + scoreSort(0, 2) + scoreSort(0, 3),
    );
    expect(r.bestStreak).toBe(4);
    expect(r.fastestMs).toBe(0);
  });
  it('adds the completion bonus only when completed', () => {
    const incomplete = scoreSession(sorts, { completed: false });
    const complete = scoreSession(sorts, { completed: true });
    expect(complete.score - incomplete.score).toBe(COMPLETION_BONUS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `Seasons_AIv02/`): `npm test`
Expected: FAIL — `Cannot find module './tagRefreshScoring'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tagRefreshScoring.ts
// Pure scoring for the Tag Refresh game. Rewards speed + rhythm only;
// every outcome scores identically (spec §3.4). All constants tunable.

export const FAST_MS = 500;        // flick this fast or faster => full points
export const SLOW_MS = 3000;       // this slow or slower => floor points
export const FULL_POINTS = 50;
export const FLOOR_POINTS = 10;
export const COMPLETION_BONUS = 100;

const STREAK_STEP = 3;             // every N decisive sorts bumps the multiplier
const STREAK_INCREMENT = 0.5;
const MAX_MULTIPLIER = 3;

/** Points for a single sort based on reaction time (linear FAST..SLOW ramp). */
export function wordPoints(reactionMs: number): number {
  if (reactionMs <= FAST_MS) return FULL_POINTS;
  if (reactionMs >= SLOW_MS) return FLOOR_POINTS;
  const t = (reactionMs - FAST_MS) / (SLOW_MS - FAST_MS); // 0..1
  return Math.round(FULL_POINTS + (FLOOR_POINTS - FULL_POINTS) * t);
}

/** Multiplier for the current streak length (caps at MAX_MULTIPLIER). */
export function streakMultiplier(streak: number): number {
  const m = 1 + Math.floor(streak / STREAK_STEP) * STREAK_INCREMENT;
  return Math.min(m, MAX_MULTIPLIER);
}

/** Points awarded for one sort given the streak BEFORE this sort. */
export function scoreSort(reactionMs: number, streakBefore: number): number {
  return Math.round(wordPoints(reactionMs) * streakMultiplier(streakBefore));
}

export interface SessionScore {
  score: number;
  bestStreak: number;
  fastestMs: number | null;
}

/**
 * Reduce a list of sorts into a session score. A "sort" is any flicked word
 * (skips are not included). Streak grows by one per sort.
 */
export function scoreSession(
  sorts: { reactionMs: number }[],
  opts: { completed: boolean },
): SessionScore {
  let score = 0;
  let fastestMs: number | null = null;
  sorts.forEach((s, i) => {
    score += scoreSort(s.reactionMs, i);
    if (fastestMs === null || s.reactionMs < fastestMs) fastestMs = s.reactionMs;
  });
  if (opts.completed) score += COMPLETION_BONUS;
  return { score, bestStreak: sorts.length, fastestMs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `Seasons_AIv02/`): `npm test`
Expected: PASS — all `tagRefreshScoring` tests green (plus the existing Plan 1 suites).

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/tagRefreshScoring.ts src/lib/tagRefreshScoring.test.ts
git commit -m "feat(tag-refresh): add pure game scoring"
```

---

## Task 2: Deck word-sampling (pure, TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/tagRefreshSampling.test.ts`
- Create: `Seasons_AIv02/src/lib/tagRefreshSampling.ts`

A round draws `wordsPerRound` words from its bank. Sampling is pure and takes an injectable RNG so it is deterministic in tests.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tagRefreshSampling.test.ts
import { describe, it, expect } from 'vitest';
import { sampleDeck, type BankWord } from './tagRefreshSampling';

const bank: BankWord[] = [
  { label: 'Music', emoji: '🎸', displayMode: 'emoji' },
  { label: 'Travel', emoji: '✈️', displayMode: 'combo' },
  { label: 'Reading', emoji: null, displayMode: 'text' },
  { label: 'Cycling', emoji: '🚴', displayMode: 'combo' },
];

// Deterministic RNG: returns a fixed sequence in [0,1)
const seqRng = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('sampleDeck', () => {
  it('returns exactly `count` words when the bank is larger', () => {
    const deck = sampleDeck(bank, 2, seqRng([0, 0, 0]));
    expect(deck).toHaveLength(2);
  });
  it('returns all words (shuffled) when count >= bank size', () => {
    const deck = sampleDeck(bank, 10, seqRng([0.1, 0.2, 0.3, 0.4]));
    expect(deck).toHaveLength(bank.length);
    expect([...deck].map((w) => w.label).sort()).toEqual(
      bank.map((w) => w.label).sort(),
    );
  });
  it('never returns duplicates', () => {
    const deck = sampleDeck(bank, 4, seqRng([0.9, 0.1, 0.5, 0.3]));
    const labels = deck.map((w) => w.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `Seasons_AIv02/`): `npm test`
Expected: FAIL — `Cannot find module './tagRefreshSampling'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tagRefreshSampling.ts
// Pure deck sampling: pick `count` distinct words from a bank using an
// injectable RNG (Fisher–Yates partial shuffle).

export interface BankWord {
  label: string;
  emoji: string | null;
  displayMode: 'text' | 'combo' | 'emoji';
}

/** Returns up to `count` distinct words, order randomized by `rng` (default Math.random). */
export function sampleDeck(
  bank: BankWord[],
  count: number,
  rng: () => number = Math.random,
): BankWord[] {
  const pool = [...bank];
  const take = Math.min(count, pool.length);
  // Fisher–Yates, but only as far as we need to take.
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `Seasons_AIv02/`): `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/tagRefreshSampling.ts src/lib/tagRefreshSampling.test.ts
git commit -m "feat(tag-refresh): add pure deck word-sampling"
```

---

## Task 3: Commit planning (pure, TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/tagRefreshCommit.test.ts`
- Create: `Seasons_AIv02/src/lib/tagRefreshCommit.ts`

Given one flicked word's outcome and the user's CURRENT stored strength state for that tag (or `null` if new), compute the resulting `user_tags` field values and the `tag_signals` row to write. Reuses Plan 1's `mapOutcome` (outcome → action) and `applySignal` / `SOURCE_WEIGHTS` (decay-on-write). This module decides *what* to persist; Task 5 performs the I/O.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tagRefreshCommit.test.ts
import { describe, it, expect } from 'vitest';
import { planTagCommit } from './tagRefreshCommit';
import { SOURCE_WEIGHTS } from './tagStrength';

const now = new Date('2026-06-23T00:00:00Z');

describe('planTagCommit', () => {
  it('assigns a season tag for a new word, with game_sort strength + signal', () => {
    const plan = planTagCommit('present', null, now);
    expect(plan.kind).toBe('assign');
    if (plan.kind !== 'assign') throw new Error('expected assign');
    expect(plan.season).toBe('present');
    expect(plan.userTag.strength).toBeCloseTo(SOURCE_WEIGHTS.game_sort, 5);
    expect(plan.userTag.reinforcementCount).toBe(1);
    expect(plan.userTag.lastReinforcedAt).toEqual(now);
    expect(plan.userTag.dismissedAt).toBeNull();
    expect(plan.signal).toEqual({ season: 'present', source: 'game_sort', weight: SOURCE_WEIGHTS.game_sort });
  });

  it('decays prior strength before adding on an existing tag', () => {
    const prior = { strength: 1, lastReinforcedAt: now, reinforcementCount: 2 };
    const ninetyDaysLater = new Date(now.getTime() + 90 * 86_400_000);
    const plan = planTagCommit('future', prior, ninetyDaysLater);
    if (plan.kind !== 'assign') throw new Error('expected assign');
    // 1.0 decayed by one half-life (~0.5) + game_sort (1.0) ≈ 1.5
    expect(plan.userTag.strength).toBeCloseTo(1.5, 2);
    expect(plan.userTag.reinforcementCount).toBe(3);
  });

  it('soft-dismisses on not_relevant with a zero-weight dismiss signal', () => {
    const prior = { strength: 0.8, lastReinforcedAt: now, reinforcementCount: 3 };
    const plan = planTagCommit('not_relevant', prior, now);
    expect(plan.kind).toBe('dismiss');
    if (plan.kind !== 'dismiss') throw new Error('expected dismiss');
    expect(plan.dismissedAt).toEqual(now);
    expect(plan.signal).toEqual({ season: null, source: 'dismiss', weight: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `Seasons_AIv02/`): `npm test`
Expected: FAIL — `Cannot find module './tagRefreshCommit'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tagRefreshCommit.ts
// Pure: decide what to persist for one flicked word. I/O happens in the hook.
import type { Season } from '@/types';
import type { Outcome } from './tagOutcome';
import { mapOutcome } from './tagOutcome';
import { applySignal, SOURCE_WEIGHTS, type SignalSource, type StrengthState } from './tagStrength';

export interface CommitSignal {
  season: Season | null;     // null for a dismiss
  source: SignalSource;
  weight: number;
}

export type CommitPlan =
  | {
      kind: 'assign';
      season: Season;
      userTag: {
        strength: number;
        lastReinforcedAt: Date;
        reinforcementCount: number;
        dismissedAt: null;
      };
      signal: CommitSignal;
    }
  | {
      kind: 'dismiss';
      dismissedAt: Date;
      signal: CommitSignal;
    };

/**
 * Compute the persistence plan for one outcome.
 * @param prev the user's current strength state for this tag, or null if new.
 */
export function planTagCommit(
  outcome: Outcome,
  prev: StrengthState | null,
  now: Date,
): CommitPlan {
  const action = mapOutcome(outcome);

  if (action.action === 'dismiss') {
    return {
      kind: 'dismiss',
      dismissedAt: now,
      signal: { season: null, source: action.source, weight: SOURCE_WEIGHTS[action.source] },
    };
  }

  const base: StrengthState = prev ?? { strength: 0, lastReinforcedAt: now, reinforcementCount: 0 };
  const next = applySignal(base, action.source, now);
  return {
    kind: 'assign',
    season: action.season,
    userTag: {
      strength: next.strength,
      lastReinforcedAt: next.lastReinforcedAt,
      reinforcementCount: next.reinforcementCount,
      dismissedAt: null,
    },
    signal: { season: action.season, source: action.source, weight: SOURCE_WEIGHTS[action.source] },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `Seasons_AIv02/`): `npm test`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run (from `Seasons_AIv02/`): `npm run type-check`
Expected: only the 7 pre-existing errors; none referencing the new `tagRefresh*` files.

- [ ] **Step 6: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/tagRefreshCommit.ts src/lib/tagRefreshCommit.test.ts
git commit -m "feat(tag-refresh): add pure commit planning"
```

---

## Task 4: `useTagRefresh` hook + query key (integration)

**Files:**
- Modify: `Seasons_AIv02/src/lib/queryClient.ts` (add a query key alongside the existing `qk` entries)
- Create: `Seasons_AIv02/src/hooks/useTagRefresh.ts`
- Modify: `Seasons_AIv02/src/hooks/index.ts` (export the hook)

This hook is impure (Supabase). There is no integration-test harness in this repo, so it is verified by `npm run type-check` and by following the existing `useUserTags` pattern exactly. Do NOT add Vitest tests that hit the network.

- [ ] **Step 1: Add the query key**

In `src/lib/queryClient.ts`, inside the `qk` object (alongside `userTags`), add:

```ts
  tagRefreshRounds: (userId: string)                 => ['tagRefreshRounds', userId]                 as const,
```

- [ ] **Step 2: Create the hook**

Read `src/hooks/useUserTags.ts` first to match its exact import style and structure. Then create `src/hooks/useTagRefresh.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { BankWord } from '@/lib/tagRefreshSampling';

export interface TagRefreshRound {
  id: string;
  speed: 'slow' | 'medium' | 'fast';
  wordsPerRound: number;
  words: BankWord[];
}

// Fetch rounds targeted at the user that they have not played yet, with the
// bank's words. RLS already restricts rounds to groups the user belongs to.
async function fetchPendingRounds(userId: string): Promise<TagRefreshRound[]> {
  const { data, error } = await supabase
    .from('tag_refresh_rounds')
    .select(`
      id, speed, words_per_round,
      tag_refresh_banks ( tag_refresh_bank_words ( label, emoji, display_mode ) ),
      tag_refresh_plays ( id, user_id )
    `)
    .eq('status', 'sent');

  if (error) throw new Error(error.message);

  return (data ?? [])
    // Exclude rounds this user has already played.
    .filter((r: any) => !(r.tag_refresh_plays ?? []).some((p: any) => p.user_id === userId))
    .map((r: any): TagRefreshRound => ({
      id: r.id,
      speed: r.speed,
      wordsPerRound: r.words_per_round,
      words: (r.tag_refresh_banks?.tag_refresh_bank_words ?? []).map((w: any): BankWord => ({
        label: w.label,
        emoji: w.emoji,
        displayMode: w.display_mode,
      })),
    }));
}

/** Rounds the user can play right now. staleTime 2 min. */
export function useTagRefresh(userId: string | null | undefined) {
  return useQuery({
    queryKey: qk.tagRefreshRounds(userId ?? ''),
    queryFn:  () => fetchPendingRounds(userId!),
    enabled:  !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Export the hook**

In `src/hooks/index.ts`, add `export * from './useTagRefresh';` (match the file's existing export style — read it first).

- [ ] **Step 4: Type-check**

Run (from `Seasons_AIv02/`): `npm run type-check`
Expected: only the 7 pre-existing errors; none in `useTagRefresh.ts` or `queryClient.ts`. If the nested-select typing from supabase-js produces an error, the `any` casts above keep it loose by design — confirm no NEW errors are introduced.

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/queryClient.ts src/hooks/useTagRefresh.ts src/hooks/index.ts
git commit -m "feat(tag-refresh): add useTagRefresh pending-rounds hook"
```

---

## Task 5: `useCommitTagRefresh` mutation hook (integration)

**Files:**
- Create: `Seasons_AIv02/src/hooks/useCommitTagRefresh.ts`
- Modify: `Seasons_AIv02/src/hooks/index.ts` (export the hook)

Persists a completed/partial play: inserts `tag_refresh_plays` + `tag_refresh_play_words`, and for each sort applies the `planTagCommit` result to `user_tags` and `tag_signals`. Reuses the `findOrCreateTag` approach from `useUserTagMutations` (read that file first to copy the exact pattern). Impure; verified by `npm run type-check` and the pure Task 3 tests that back its logic. Invalidates the user's `userTags` cache on success so the profile refreshes.

- [ ] **Step 1: Read the reference**

Read `src/hooks/useUserTagMutations.ts` to reuse its `findOrCreateTag(label, season)` logic and mutation/invalidation style. Read `src/lib/queryClient.ts` for `qk.userTags`.

- [ ] **Step 2: Create the hook**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Season } from '@/types';
import type { Outcome } from '@/lib/tagOutcome';
import { planTagCommit } from '@/lib/tagRefreshCommit';
import type { StrengthState } from '@/lib/tagStrength';

export interface SortResult {
  label: string;
  emoji: string | null;
  outcome: Outcome;
  reactionMs: number;
}

export interface CommitTagRefreshInput {
  userId: string;
  roundId: string;
  sorts: SortResult[];        // only flicked words (skips excluded)
  score: number;
  bestStreak: number;
  fastestMs: number | null;
  completed: boolean;
}

// Find an existing tag for (label, season) or create it. Mirrors useUserTagMutations.
async function findOrCreateTag(label: string, season: Season): Promise<string> {
  const clean = label.trim();
  const { data: existing } = await supabase
    .from('tags').select('id').eq('label', clean).eq('season', season).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase
    .from('tags').insert({ label: clean, season, category: 'custom' }).select('id').single();
  if (error || !created) throw new Error(error?.message ?? 'Could not create tag.');
  return created.id as string;
}

export function useCommitTagRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommitTagRefreshInput) => {
      const now = new Date();

      // 1. Record the play.
      const { data: play, error: playErr } = await supabase
        .from('tag_refresh_plays')
        .insert({
          round_id: input.roundId,
          user_id: input.userId,
          score: input.score,
          best_streak: input.bestStreak,
          fastest_ms: input.fastestMs,
          completed: input.completed,
          partial: !input.completed,
          played_at: now.toISOString(),
        })
        .select('id').single();
      if (playErr || !play) throw new Error(playErr?.message ?? 'Could not record play.');

      // 2. Record per-word results.
      if (input.sorts.length) {
        const { error: pwErr } = await supabase.from('tag_refresh_play_words').insert(
          input.sorts.map((s) => ({
            play_id: play.id, label: s.label, emoji: s.emoji,
            outcome: s.outcome, reaction_ms: s.reactionMs,
          })),
        );
        if (pwErr) throw new Error(pwErr.message);
      }

      // 3. Apply each sort to user_tags + tag_signals.
      for (const s of input.sorts) {
        const plan = planTagCommit(s.outcome, null /* prev strength */, now);

        if (plan.kind === 'assign') {
          const tagId = await findOrCreateTag(s.label, plan.season);

          // Read the user's current strength state for this tag, if any.
          const { data: prevRow } = await supabase
            .from('user_tags')
            .select('strength, last_reinforced_at, reinforcement_count')
            .eq('user_id', input.userId).eq('tag_id', tagId).eq('season', plan.season)
            .maybeSingle();

          const prev: StrengthState | null = prevRow
            ? {
                strength: Number(prevRow.strength),
                lastReinforcedAt: new Date(prevRow.last_reinforced_at),
                reinforcementCount: prevRow.reinforcement_count,
              }
            : null;
          const finalPlan = planTagCommit(s.outcome, prev, now);
          if (finalPlan.kind !== 'assign') continue;

          await supabase.from('user_tags').upsert(
            {
              user_id: input.userId, tag_id: tagId, season: plan.season,
              strength: finalPlan.userTag.strength,
              last_reinforced_at: finalPlan.userTag.lastReinforcedAt.toISOString(),
              reinforcement_count: finalPlan.userTag.reinforcementCount,
              dismissed_at: null,
            },
            { onConflict: 'user_id,tag_id,season' },
          );
          await supabase.from('tag_signals').insert({
            user_id: input.userId, tag_id: tagId, season: plan.season,
            source: plan.signal.source, weight: plan.signal.weight,
          });
        } else {
          // dismiss: mark existing tag rows for this label as dismissed (if present).
          const { data: tag } = await supabase
            .from('tags').select('id').eq('label', s.label.trim()).maybeSingle();
          if (tag?.id) {
            await supabase.from('user_tags')
              .update({ dismissed_at: plan.dismissedAt.toISOString() })
              .eq('user_id', input.userId).eq('tag_id', tag.id);
            await supabase.from('tag_signals').insert({
              user_id: input.userId, tag_id: tag.id, season: 'present',
              source: plan.signal.source, weight: plan.signal.weight,
            });
          }
        }
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: qk.userTags(input.userId) });
      qc.invalidateQueries({ queryKey: qk.tagRefreshRounds(input.userId) });
    },
  });
}
```

> **Note on the `user_tags` upsert `onConflict`:** this assumes a unique constraint on `(user_id, tag_id, season)`. Confirm at execution time by checking the `user_tags` definition in the migrations; if the unique key differs, adjust `onConflict` to match (and if absent, fall back to select-then-insert/update like `useUserTagMutations` does).
> **Note on `tag_signals.season` for dismiss:** the column is `NOT NULL CHECK (season IN ('past','present','future'))`, so a dismiss signal must carry a season. Using the tag's stored season is more accurate than hardcoding `'present'` — at execution, prefer selecting the dismissed `user_tags` row's `season` and using that. Hardcoding `'present'` is a stopgap only if the season isn't readily available.

- [ ] **Step 3: Export the hook**

In `src/hooks/index.ts`, add `export * from './useCommitTagRefresh';`.

- [ ] **Step 4: Type-check**

Run (from `Seasons_AIv02/`): `npm run type-check`
Expected: only the 7 pre-existing errors; none in `useCommitTagRefresh.ts`.

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/hooks/useCommitTagRefresh.ts src/hooks/index.ts
git commit -m "feat(tag-refresh): add useCommitTagRefresh mutation hook"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Plan 2a scope):**
- §3.4 scoring (speed ramp, streak multiplier, completion bonus, equal-weight outcomes) → Task 1. ✓
- Deck draw of `words_per_round` from a bank → Task 2. ✓
- §5.4 commit + §6A decay-on-write strength, soft-dismiss → Task 3 (pure) + Task 5 (I/O). ✓
- Fetch pending rounds for a user (feeds the Plan 2b entry card) → Task 4. ✓
- Persist play + play_words + signals + user_tags → Task 5. ✓
- Out of 2a scope (playfield, gestures, summary UI, feed/nav wiring) → Plan 2b. ✓

**Placeholder scan:** No TBD/TODO. Two execution-time confirmations are called out as explicit `Note:` blocks (unique-constraint `onConflict`; dismiss-signal season) with concrete fallbacks, not vague hand-waving.

**Type consistency:** `Outcome` (from `tagOutcome`), `StrengthState`/`SOURCE_WEIGHTS`/`applySignal` (from `tagStrength`), `BankWord` (from `tagRefreshSampling`) are imported, not redefined. `SortResult` defined in Task 5 matches the `{label, emoji, outcome, reactionMs}` shape used by `scoreSession` inputs (Task 1 uses only `reactionMs`, a structural subset — compatible). `CommitPlan` discriminated union (`kind: 'assign'|'dismiss'`) is consistent between Task 3 and Task 5 usage.

---

## Next plan (not in this document)
**Plan 2b — Game UI:** playfield (Option B layout, Reanimated + gesture-handler — add both deps), falling-word chips (text/combo/emoji), slim HUD, light summary screen ("Update my seasons" → `useCommitTagRefresh`), Discover/Home feed entry card (from `useTagRefresh`), and `AppScreen` navigation wiring in `App.tsx`. Verified manually in the running app (no Vitest for animation/gesture code).
