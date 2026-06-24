# Tag Refresh — Plan 1: Data Model & Tag-Strength Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the database and pure-logic foundation for the Tag Refresh game — new tables, `user_tags` strength/history columns, RLS for champions and players, and the unit-tested tag-strength + outcome-mapping logic.

**Architecture:** Schema changes are plain timestamped SQL migrations in the **mobile repo** (`Seasons_AIv02/supabase/migrations/`), which holds the canonical migration history for the shared Supabase project (`project_id = "seasonz-dashboard"`). Tag-strength math is a pure, framework-free TypeScript module in `Seasons_AIv02/src/lib/`, unit-tested with Vitest. No RN/Supabase runtime is touched in Plan 1.

**Tech Stack:** Supabase Postgres (SQL migrations), TypeScript, Vitest.

**Source spec:** `seasonz-dashboard/docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§5, §5.4, §6A).

**Scope boundary (what Plan 1 does NOT do):** No mobile UI, no game loop, no dashboard, no AI generation, no commit wiring to Supabase. Admin (superuser) org-wide RLS is deferred to the dashboard/admin plan — only champion + player policies are written here.

> **Note on FK target:** New per-user columns reference `auth.users(id)` to match the most recent comparable feature (`knowledge_builder`). `group_members.user_id` references `public.profiles(id)`, and `auth.uid()` equals both, so policies using `gm.user_id = auth.uid()` are correct.

---

## File Structure

**Create (mobile repo `Seasons_AIv02/`):**
- `supabase/migrations/20260623100000_tag_refresh_tables.sql` — six new tables + indexes.
- `supabase/migrations/20260623100100_tag_refresh_user_tags_columns.sql` — strength/history columns on `user_tags`.
- `supabase/migrations/20260623100200_tag_refresh_rls.sql` — enable RLS + champion/player policies.
- `src/lib/tagStrength.ts` — pure strength math (weights, decay, decay-on-write).
- `src/lib/tagStrength.test.ts` — Vitest unit tests.
- `src/lib/tagOutcome.ts` — pure outcome → commit-action mapping.
- `src/lib/tagOutcome.test.ts` — Vitest unit tests.
- `vitest.config.ts` — Vitest config with `@` path alias.

**Modify (mobile repo):**
- `package.json` — add `vitest` devDependency + `test` / `test:watch` scripts.

---

## Task 1: Migration — new Tag Refresh tables

**Files:**
- Create: `Seasons_AIv02/supabase/migrations/20260623100000_tag_refresh_tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =====================================================
-- Tag Refresh — core tables
-- Word banks (reusable), pushed rounds, plays, per-word
-- results, and a general tag reinforcement signal log.
-- =====================================================

-- Reusable word banks (the Library). group_id NULL = org-wide/admin template.
CREATE TABLE IF NOT EXISTS public.tag_refresh_banks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  theme       TEXT,
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Words in a bank. Season-AGNOSTIC: the game assigns the season at play time.
CREATE TABLE IF NOT EXISTS public.tag_refresh_bank_words (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id       UUID NOT NULL REFERENCES public.tag_refresh_banks(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,                 -- canonical text tag (always present)
  emoji         TEXT,
  display_mode  TEXT NOT NULL DEFAULT 'combo' CHECK (display_mode IN ('text', 'combo', 'emoji')),
  position      INT NOT NULL DEFAULT 0
);

-- A pushed game instance. group_id NULL = org-wide.
CREATE TABLE IF NOT EXISTS public.tag_refresh_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id         UUID NOT NULL REFERENCES public.tag_refresh_banks(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  speed           TEXT NOT NULL DEFAULT 'medium' CHECK (speed IN ('slow', 'medium', 'fast')),
  words_per_round INT  NOT NULL DEFAULT 12,
  audience        JSONB NOT NULL DEFAULT '"all"'::jsonb,   -- 'all' | { "group_ids": [...] }
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'scheduled')),
  sent_at         TIMESTAMPTZ,
  scheduled_for   TIMESTAMPTZ,                              -- reserved; scheduling deferred
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One user's play session.
CREATE TABLE IF NOT EXISTS public.tag_refresh_plays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     UUID NOT NULL REFERENCES public.tag_refresh_rounds(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score        INT NOT NULL DEFAULT 0,
  best_streak  INT NOT NULL DEFAULT 0,
  fastest_ms   INT,
  completed    BOOLEAN NOT NULL DEFAULT false,
  partial      BOOLEAN NOT NULL DEFAULT false,
  played_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)   -- one play per round per user (v1)
);

-- Per-word results; doubles as the game analytics event log.
CREATE TABLE IF NOT EXISTS public.tag_refresh_play_words (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id      UUID NOT NULL REFERENCES public.tag_refresh_plays(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  emoji        TEXT,
  outcome      TEXT NOT NULL CHECK (outcome IN ('past', 'present', 'future', 'not_relevant')),
  reaction_ms  INT
);

-- General reinforcement log across ALL engagement points (source of truth for strength).
CREATE TABLE IF NOT EXISTS public.tag_signals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  season      TEXT NOT NULL CHECK (season IN ('past', 'present', 'future')),
  source      TEXT NOT NULL CHECK (source IN
                ('game_sort', 'profile_add', 'kept', 'post', 'activity', 'discovery', 'search', 'dismiss')),
  weight      NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the hot read paths.
CREATE INDEX IF NOT EXISTS idx_trbw_bank      ON public.tag_refresh_bank_words (bank_id);
CREATE INDEX IF NOT EXISTS idx_trr_group      ON public.tag_refresh_rounds (group_id);
CREATE INDEX IF NOT EXISTS idx_trp_round      ON public.tag_refresh_plays (round_id);
CREATE INDEX IF NOT EXISTS idx_trp_user       ON public.tag_refresh_plays (user_id);
CREATE INDEX IF NOT EXISTS idx_trpw_play      ON public.tag_refresh_play_words (play_id);
CREATE INDEX IF NOT EXISTS idx_tsig_user_seas ON public.tag_signals (user_id, season);
CREATE INDEX IF NOT EXISTS idx_tsig_created   ON public.tag_signals (created_at);
```

- [ ] **Step 2: Apply the migration and verify the tables exist**

Run (from `Seasons_AIv02/`): `supabase migration up`
Expected: applies cleanly with no error.
If you don't run a local Supabase instance, paste the file's SQL into the Supabase project's **SQL Editor** and run it; then confirm all six tables (`tag_refresh_banks`, `tag_refresh_bank_words`, `tag_refresh_rounds`, `tag_refresh_plays`, `tag_refresh_play_words`, `tag_signals`) appear in the Table Editor.

- [ ] **Step 3: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260623100000_tag_refresh_tables.sql
git commit -m "feat(tag-refresh): add core schema tables"
```

---

## Task 2: Migration — `user_tags` strength & history columns

**Files:**
- Create: `Seasons_AIv02/supabase/migrations/20260623100100_tag_refresh_user_tags_columns.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =====================================================
-- Tag Refresh — user_tags strength & history columns
-- DB is never capped; the ~8-per-season limit is display-only.
-- =====================================================

ALTER TABLE public.user_tags
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_reinforced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS strength            NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reinforcement_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dismissed_at        TIMESTAMPTZ;   -- non-NULL = hidden from display/discovery

-- Profile reads fetch the strongest, non-dismissed tags per user/season.
CREATE INDEX IF NOT EXISTS idx_user_tags_strength
  ON public.user_tags (user_id, season, strength DESC)
  WHERE dismissed_at IS NULL;
```

- [ ] **Step 2: Apply and verify the columns exist**

Run (from `Seasons_AIv02/`): `supabase migration up`
Expected: applies cleanly.
Verify: in the SQL Editor run `SELECT created_at, last_reinforced_at, strength, reinforcement_count, dismissed_at FROM public.user_tags LIMIT 1;` — it returns columns without error (zero rows is fine).

- [ ] **Step 3: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260623100100_tag_refresh_user_tags_columns.sql
git commit -m "feat(tag-refresh): add strength/history columns to user_tags"
```

---

## Task 3: Migration — RLS (champion + player)

**Files:**
- Create: `Seasons_AIv02/supabase/migrations/20260623100200_tag_refresh_rls.sql`

**Note:** Admin/superuser org-wide policies are deferred to the dashboard/admin plan. This task covers champions (group-scoped authoring) and players (own plays/signals).

- [ ] **Step 1: Write the migration file**

```sql
-- =====================================================
-- Tag Refresh — Row Level Security
-- Champions manage their group's banks/rounds; players read
-- rounds targeted to them and write their own plays/signals.
-- (Admin org-wide policies deferred to the dashboard/admin plan.)
-- =====================================================

ALTER TABLE public.tag_refresh_banks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_refresh_bank_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_refresh_rounds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_refresh_plays      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_refresh_play_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_signals            ENABLE ROW LEVEL SECURITY;

-- ── Banks: champions of the bank's group manage it ──────────────────
CREATE POLICY trb_champion_all ON public.tag_refresh_banks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tag_refresh_banks.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'champion'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tag_refresh_banks.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'champion'
    )
  );

-- ── Bank words: follow the parent bank's champion access ─────────────
CREATE POLICY trbw_champion_all ON public.tag_refresh_bank_words
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tag_refresh_banks b
      JOIN public.group_members gm ON gm.group_id = b.group_id
      WHERE b.id = tag_refresh_bank_words.bank_id
        AND gm.user_id = auth.uid()
        AND gm.role    = 'champion'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tag_refresh_banks b
      JOIN public.group_members gm ON gm.group_id = b.group_id
      WHERE b.id = tag_refresh_bank_words.bank_id
        AND gm.user_id = auth.uid()
        AND gm.role    = 'champion'
    )
  );

-- ── Rounds: champions of the round's group manage them ──────────────
CREATE POLICY trr_champion_all ON public.tag_refresh_rounds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tag_refresh_rounds.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'champion'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tag_refresh_rounds.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'champion'
    )
  );

-- ── Rounds: members of the targeted group can READ them (to play) ────
CREATE POLICY trr_member_read ON public.tag_refresh_rounds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tag_refresh_rounds.group_id
        AND gm.user_id  = auth.uid()
    )
  );

-- ── Plays: a user owns their own plays ──────────────────────────────
CREATE POLICY trp_owner_all ON public.tag_refresh_plays
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Play words: follow the parent play's owner ──────────────────────
CREATE POLICY trpw_owner_all ON public.tag_refresh_play_words
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tag_refresh_plays p
      WHERE p.id = tag_refresh_play_words.play_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tag_refresh_plays p
      WHERE p.id = tag_refresh_play_words.play_id
        AND p.user_id = auth.uid()
    )
  );

-- ── Tag signals: a user owns their own signals ──────────────────────
CREATE POLICY tsig_owner_all ON public.tag_signals
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply and verify RLS is enabled**

Run (from `Seasons_AIv02/`): `supabase migration up`
Expected: applies cleanly.
Verify: in the SQL Editor run
`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'tag_refresh_%' OR relname = 'tag_signals';`
Expected: every listed table shows `relrowsecurity = true`.

- [ ] **Step 3: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260623100200_tag_refresh_rls.sql
git commit -m "feat(tag-refresh): add champion + player RLS policies"
```

---

## Task 4: Vitest setup (mobile repo)

**Files:**
- Modify: `Seasons_AIv02/package.json`
- Create: `Seasons_AIv02/vitest.config.ts`

- [ ] **Step 1: Install Vitest as a dev dependency**

Run (from `Seasons_AIv02/`): `npm install --save-dev vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add test scripts to `package.json`**

In `Seasons_AIv02/package.json`, add these two entries to the `"scripts"` object (alongside the existing `type-check`):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config with the `@` path alias**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run (from `Seasons_AIv02/`): `npm test`
Expected: Vitest starts and reports "No test files found" (exit is fine) — confirms the runner is wired.

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(tag-refresh): add vitest for pure-logic unit tests"
```

---

## Task 5: `tagStrength.ts` — pure strength math (TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/tagStrength.test.ts`
- Create: `Seasons_AIv02/src/lib/tagStrength.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tagStrength.test.ts
import { describe, it, expect } from 'vitest';
import {
  HALF_LIFE_DAYS,
  SOURCE_WEIGHTS,
  decayedStrength,
  applySignal,
} from './tagStrength';

const DAY = 86_400_000;

describe('decayedStrength', () => {
  it('returns the same value when no time has elapsed', () => {
    const t0 = new Date('2026-06-23T00:00:00Z');
    expect(decayedStrength(1, t0, t0)).toBe(1);
  });

  it('halves the strength after exactly one half-life', () => {
    const t0 = new Date('2026-06-23T00:00:00Z');
    const later = new Date(t0.getTime() + HALF_LIFE_DAYS * DAY);
    expect(decayedStrength(1, t0, later)).toBeCloseTo(0.5, 5);
  });

  it('never increases strength over time', () => {
    const t0 = new Date('2026-06-23T00:00:00Z');
    const later = new Date(t0.getTime() + 10 * DAY);
    expect(decayedStrength(2, t0, later)).toBeLessThan(2);
  });
});

describe('applySignal', () => {
  it('adds the source weight to a fresh tag', () => {
    const now = new Date('2026-06-23T00:00:00Z');
    const next = applySignal(
      { strength: 0, lastReinforcedAt: now, reinforcementCount: 0 },
      'game_sort',
      now,
    );
    expect(next.strength).toBeCloseTo(SOURCE_WEIGHTS.game_sort, 5);
    expect(next.reinforcementCount).toBe(1);
    expect(next.lastReinforcedAt).toEqual(now);
  });

  it('decays the prior strength before adding the new weight', () => {
    const t0 = new Date('2026-06-23T00:00:00Z');
    const oneHalfLife = new Date(t0.getTime() + HALF_LIFE_DAYS * DAY);
    // strength 1.0 at t0, then a 'kept' (0.5) signal one half-life later → 0.5 + 0.5
    const next = applySignal(
      { strength: 1, lastReinforcedAt: t0, reinforcementCount: 1 },
      'kept',
      oneHalfLife,
    );
    expect(next.strength).toBeCloseTo(1.0, 5);
    expect(next.reinforcementCount).toBe(2);
  });

  it('treats a dismiss signal as zero weight (no boost)', () => {
    const now = new Date('2026-06-23T00:00:00Z');
    const next = applySignal(
      { strength: 0.8, lastReinforcedAt: now, reinforcementCount: 3 },
      'dismiss',
      now,
    );
    expect(next.strength).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `Seasons_AIv02/`): `npm test`
Expected: FAIL — `Cannot find module './tagStrength'` (or similar resolution error).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tagStrength.ts
// Pure tag-strength math. No RN/Supabase imports — unit-tested with Vitest.
// See spec §6A.

/** Display strength halves every 90 days. */
export const HALF_LIFE_DAYS = 90;

/** Decay time constant τ such that exp(-halfLife/τ) = 0.5. */
const TAU_DAYS = HALF_LIFE_DAYS / Math.LN2; // ≈ 129.8 days

const MS_PER_DAY = 86_400_000;

/** Intent weight per engagement point (tunable defaults, spec §6A). */
export const SOURCE_WEIGHTS = {
  game_sort: 1.0,
  profile_add: 1.0,
  kept: 0.5,
  post: 0.4,
  activity: 0.4,
  discovery: 0.2,
  search: 0.15,
  dismiss: 0,
} as const;

export type SignalSource = keyof typeof SOURCE_WEIGHTS;

export interface StrengthState {
  strength: number;
  lastReinforcedAt: Date;
  reinforcementCount: number;
}

/** Exponentially decay a stored strength forward to `now`. */
export function decayedStrength(prevStrength: number, lastReinforcedAt: Date, now: Date): number {
  const deltaDays = (now.getTime() - lastReinforcedAt.getTime()) / MS_PER_DAY;
  if (deltaDays <= 0) return prevStrength;
  return prevStrength * Math.exp(-deltaDays / TAU_DAYS);
}

/** Decay-on-write: decay the prior strength to `now`, then add the new signal's weight. */
export function applySignal(prev: StrengthState, source: SignalSource, now: Date): StrengthState {
  const decayed = decayedStrength(prev.strength, prev.lastReinforcedAt, now);
  return {
    strength: decayed + SOURCE_WEIGHTS[source],
    lastReinforcedAt: now,
    reinforcementCount: prev.reinforcementCount + 1,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `Seasons_AIv02/`): `npm test`
Expected: PASS — all `tagStrength` tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/tagStrength.ts src/lib/tagStrength.test.ts
git commit -m "feat(tag-refresh): add pure tag-strength decay logic"
```

---

## Task 6: `tagOutcome.ts` — outcome → commit-action mapping (TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/tagOutcome.test.ts`
- Create: `Seasons_AIv02/src/lib/tagOutcome.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tagOutcome.test.ts
import { describe, it, expect } from 'vitest';
import { mapOutcome } from './tagOutcome';

describe('mapOutcome', () => {
  it('maps a season outcome to an assign action with a game_sort signal', () => {
    expect(mapOutcome('present')).toEqual({ action: 'assign', season: 'present', source: 'game_sort' });
    expect(mapOutcome('past')).toEqual({ action: 'assign', season: 'past', source: 'game_sort' });
    expect(mapOutcome('future')).toEqual({ action: 'assign', season: 'future', source: 'game_sort' });
  });

  it('maps not_relevant to a dismiss action with a dismiss signal', () => {
    expect(mapOutcome('not_relevant')).toEqual({ action: 'dismiss', source: 'dismiss' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `Seasons_AIv02/`): `npm test`
Expected: FAIL — `Cannot find module './tagOutcome'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tagOutcome.ts
// Pure mapping from a game outcome to the commit action it implies.
// See spec §5.4. `Season` is the existing app type ('past' | 'present' | 'future').
import type { Season } from '@/types';
import type { SignalSource } from './tagStrength';

/** The four outcomes a falling word can be flicked into. */
export type Outcome = Season | 'not_relevant';

export type CommitAction =
  | { action: 'assign'; season: Season; source: SignalSource }
  | { action: 'dismiss'; source: SignalSource };

/** Resolve a game outcome into the database action it should produce. */
export function mapOutcome(outcome: Outcome): CommitAction {
  if (outcome === 'not_relevant') {
    return { action: 'dismiss', source: 'dismiss' };
  }
  return { action: 'assign', season: outcome, source: 'game_sort' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `Seasons_AIv02/`): `npm test`
Expected: PASS — all `tagOutcome` tests green.

- [ ] **Step 5: Type-check the whole app to confirm the `@/types` import resolves**

Run (from `Seasons_AIv02/`): `npm run type-check`
Expected: no new errors from `src/lib/tagOutcome.ts` (the `Season` import resolves). If `@/types` does not export `Season`, confirm the export path against `src/hooks/useUserTags.ts`, which already does `import type { Season } from '@/types'`.

- [ ] **Step 6: Commit**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add src/lib/tagOutcome.ts src/lib/tagOutcome.test.ts
git commit -m "feat(tag-refresh): add outcome-to-commit-action mapping"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Plan 1 scope only):**
- §5.2 new tables → Task 1. ✓
- §5.1 `user_tags` additions → Task 2. ✓
- §5.5 RLS (champion + player; admin deferred per scope note) → Task 3. ✓
- §6A strength math (weights, 90-day half-life, decay-on-write) → Task 5. ✓
- §5.4 outcome mapping (assign / soft-dismiss) → Task 6. ✓
- Out of Plan 1 scope (mobile UI, game loop, dashboard, AI, Insights, commit-to-Supabase wiring, admin RLS) → later plans. ✓

**Placeholder scan:** No TBD/TODO; every SQL and TS step contains complete content. ✓

**Type consistency:** `SignalSource` defined in `tagStrength.ts` (Task 5) and imported by `tagOutcome.ts` (Task 6). `StrengthState` shape consistent across `applySignal`/tests. `Outcome`/`Season` consistent with the existing app type. ✓

---

## Next plans (not in this document)
2. **Mobile game + commit** — playfield (Option B), scoring, summary, write-back using `tagStrength`/`tagOutcome` + `tag_signals`. Adds `react-native-gesture-handler` + `react-native-reanimated`.
3. **Dashboard Build + push** — word-bank builder, settings, push a round; **includes admin/superuser org-wide RLS**.
4. **AI generation** — Claude-backed word/emoji generation (follow the `claude-api` skill).
5. **Library + Insights** — reusable banks and analytics.
