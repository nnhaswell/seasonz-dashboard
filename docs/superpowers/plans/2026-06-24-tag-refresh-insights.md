# Tag Refresh — Plan: Insights (champion analytics)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Insights tab in the champion Tag Refresh section showing, for a chosen month and scoped to the champion's group: summary cards (rounds sent / players / completion / tags refreshed), most-popular tags by season, season balance, and month-over-month movers.

**Architecture:** Pure aggregation functions (`lib/tagRefreshInsights.ts`, Vitest-tested) operate on raw play rows. A server-only data layer fetches the group's plays + play-words via the **service-role admin client** (play data is owner-only under RLS; the route is already champion-gated, and every query is scoped to the group's own rounds). A server-component Insights page renders it; a small client tabs strip switches Build ⇄ Insights.

**Tech Stack:** Next.js (App Router, RSC), `@supabase/supabase-js` (admin client), Vitest, TypeScript.

**Source spec:** `docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§4.3 Insights).

**Grounding facts (verified):**
- `@/lib/supabase/server` exports `createAdminClient()` (service role, bypasses RLS — server-only).
- Build screen lives at `app/champion/[groupId]/tag-refresh/page.tsx`; the route is gated to champions/superusers by `app/champion/[groupId]/layout.tsx`.
- Dashboard has NO test runner yet — this plan **adds Vitest** for the pure aggregators; the data layer + page are verified by `npm run type-check` + `npm run build` + a manual check.
- `@/*` maps to repo root. Tables: `tag_refresh_rounds(id, group_id, sent_at)`, `tag_refresh_plays(id, round_id, user_id, completed, played_at)`, `tag_refresh_play_words(play_id, label, emoji, outcome)`.

**Scope boundary:** Group-scoped only (no org-wide/admin aggregation). No CSV export, no charts library (CSS bars). Movers compare the selected month to the previous month.

---

## File Structure

**Create:**
- `vitest.config.ts` — Vitest config.
- `lib/tagRefreshInsights.ts` + `lib/tagRefreshInsights.test.ts` — pure aggregators.
- `app/champion/[groupId]/tag-refresh/insights/data.ts` — server data fetch (admin client, group-scoped).
- `app/champion/[groupId]/tag-refresh/insights/page.tsx` — Insights page (server component).
- `app/champion/[groupId]/tag-refresh/tabs.tsx` — client tabs strip (active state via `usePathname`).
- `app/champion/[groupId]/tag-refresh/layout.tsx` — renders the tabs above `{children}`.

**Modify:**
- `package.json` — add `vitest` devDependency + `test` script.

---

## Task 1: Vitest setup

**Files:** Modify `package.json`; Create `vitest.config.ts`.

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest`
Expected: `vitest` under `devDependencies`.

- [ ] **Step 2: Add a test script**

In `package.json` `"scripts"`, add: `"test": "vitest run"`

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, '.') } },
  test: { environment: 'node', include: ['lib/**/*.test.ts'] },
});
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: Vitest starts, "No test files found" (exit non-zero is fine — runner is wired).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(tag-refresh): add vitest for insights aggregators"
```

---

## Task 2: Pure aggregators (TDD)

**Files:** Create `lib/tagRefreshInsights.test.ts`, then `lib/tagRefreshInsights.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tagRefreshInsights.test.ts
import { describe, it, expect } from 'vitest';
import { popularTags, seasonBalance, movers, summaryStats, type PlayWord, type Play } from './tagRefreshInsights';

const pw = (label: string, outcome: PlayWord['outcome'], emoji: string | null = null): PlayWord => ({ label, emoji, outcome });

describe('popularTags', () => {
  it('counts tags for a season, sorted desc, limited', () => {
    const words = [pw('Music', 'present', '🎸'), pw('Music', 'present'), pw('Travel', 'present'), pw('Old', 'past')];
    const r = popularTags(words, 'present', 1);
    expect(r).toEqual([{ label: 'Music', emoji: '🎸', count: 2 }]);
  });
  it('ignores other seasons', () => {
    expect(popularTags([pw('X', 'past')], 'present', 5)).toEqual([]);
  });
});

describe('seasonBalance', () => {
  it('counts each season, excluding not_relevant', () => {
    const words = [pw('a', 'past'), pw('b', 'present'), pw('c', 'present'), pw('d', 'not_relevant')];
    expect(seasonBalance(words)).toEqual({ past: 1, present: 2, future: 0 });
  });
});

describe('movers', () => {
  it('returns month-over-month deltas, biggest |delta| first, excluding zero', () => {
    const now = [pw('Yoga', 'present'), pw('Yoga', 'present'), pw('Gaming', 'present')];
    const prev = [pw('Gaming', 'present'), pw('Gaming', 'present'), pw('Yoga', 'present')];
    // Yoga: 2-1=+1, Gaming: 1-2=-1
    const r = movers(now, prev, 5);
    expect(r).toEqual([
      { label: 'Yoga', delta: 1 },
      { label: 'Gaming', delta: -1 },
    ]);
  });
  it('ignores not_relevant', () => {
    expect(movers([pw('X', 'not_relevant')], [], 5)).toEqual([]);
  });
});

describe('summaryStats', () => {
  it('computes players, completion %, and tags refreshed', () => {
    const plays: Play[] = [
      { id: '1', userId: 'a', completed: true },
      { id: '2', userId: 'a', completed: false },
      { id: '3', userId: 'b', completed: true },
    ];
    const words = [pw('x', 'present'), pw('y', 'not_relevant')];
    expect(summaryStats(4, plays, words)).toEqual({ roundsSent: 4, players: 2, completionPct: 67, tagsRefreshed: 1 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`Cannot find module './tagRefreshInsights'`).

- [ ] **Step 3: Implement**

```ts
// lib/tagRefreshInsights.ts
// Pure aggregation over raw Tag Refresh play rows. Framework-free; Vitest-tested.

export type Season = 'past' | 'present' | 'future';
export type Outcome = Season | 'not_relevant';

export interface PlayWord { label: string; emoji: string | null; outcome: Outcome; }
export interface Play { id: string; userId: string; completed: boolean; }

export interface PopularTag { label: string; emoji: string | null; count: number; }

/** Top `limit` tags assigned to `season`, by count, desc. */
export function popularTags(words: PlayWord[], season: Season, limit: number): PopularTag[] {
  const map = new Map<string, PopularTag>();
  for (const w of words) {
    if (w.outcome !== season) continue;
    const ex = map.get(w.label);
    if (ex) ex.count += 1;
    else map.set(w.label, { label: w.label, emoji: w.emoji, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface SeasonBalance { past: number; present: number; future: number; }

/** Count of season assignments (not_relevant excluded). */
export function seasonBalance(words: PlayWord[]): SeasonBalance {
  const b: SeasonBalance = { past: 0, present: 0, future: 0 };
  for (const w of words) if (w.outcome !== 'not_relevant') b[w.outcome] += 1;
  return b;
}

export interface Mover { label: string; delta: number; }

/** Month-over-month change in how often each tag was assigned to a season. */
export function movers(thisMonth: PlayWord[], lastMonth: PlayWord[], limit: number): Mover[] {
  const tally = (words: PlayWord[]) => {
    const m = new Map<string, number>();
    for (const w of words) if (w.outcome !== 'not_relevant') m.set(w.label, (m.get(w.label) ?? 0) + 1);
    return m;
  };
  const a = tally(thisMonth);
  const b = tally(lastMonth);
  const labels = new Set<string>([...a.keys(), ...b.keys()]);
  const out: Mover[] = [];
  for (const label of labels) {
    const delta = (a.get(label) ?? 0) - (b.get(label) ?? 0);
    if (delta !== 0) out.push({ label, delta });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, limit);
}

export interface Summary { roundsSent: number; players: number; completionPct: number; tagsRefreshed: number; }

export function summaryStats(roundsSent: number, plays: Play[], words: PlayWord[]): Summary {
  const players = new Set(plays.map((p) => p.userId)).size;
  const completed = plays.filter((p) => p.completed).length;
  const completionPct = plays.length ? Math.round((completed / plays.length) * 100) : 0;
  const tagsRefreshed = words.filter((w) => w.outcome !== 'not_relevant').length;
  return { roundsSent, players, completionPct, tagsRefreshed };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: PASS (all aggregator tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tagRefreshInsights.ts lib/tagRefreshInsights.test.ts
git commit -m "feat(tag-refresh): pure insights aggregators"
```

---

## Task 3: Server data layer (group-scoped, admin client)

**Files:** Create `app/champion/[groupId]/tag-refresh/insights/data.ts`.

Fetches the group's rounds, then this-month and last-month plays + their play-words. Uses the admin client (play data is owner-only under RLS) but **scopes every query to the group's own round ids**, so no cross-group leakage.

- [ ] **Step 1: Write the data module**

```ts
// app/champion/[groupId]/tag-refresh/insights/data.ts
import { createAdminClient } from '@/lib/supabase/server';
import type { Play, PlayWord } from '@/lib/tagRefreshInsights';

export interface InsightsData {
  roundsSent: number;            // rounds sent in the selected month
  plays: Play[];                 // plays in the selected month
  wordsThisMonth: PlayWord[];
  wordsLastMonth: PlayWord[];
}

/** `month` is 'YYYY-MM'. Returns aggregated raw rows for the group. */
export async function fetchInsights(groupId: string, month: string): Promise<InsightsData> {
  const admin = createAdminClient();

  const { data: roundRows } = await admin
    .from('tag_refresh_rounds')
    .select('id, sent_at')
    .eq('group_id', groupId);
  const roundIds = (roundRows ?? []).map((r: any) => r.id as string);
  if (!roundIds.length) {
    return { roundsSent: 0, plays: [], wordsThisMonth: [], wordsLastMonth: [] };
  }

  const [start, end] = monthRange(month);
  const [prevStart, prevEnd] = monthRange(prevMonth(month));

  const roundsSent = (roundRows ?? []).filter(
    (r: any) => r.sent_at && r.sent_at >= start && r.sent_at < end,
  ).length;

  const plays = await fetchPlays(admin, roundIds, start, end);
  const prevPlays = await fetchPlays(admin, roundIds, prevStart, prevEnd);

  const wordsThisMonth = await fetchWords(admin, plays.map((p) => p.id));
  const wordsLastMonth = await fetchWords(admin, prevPlays.map((p) => p.id));

  return { roundsSent, plays, wordsThisMonth, wordsLastMonth };
}

async function fetchPlays(admin: any, roundIds: string[], start: string, end: string): Promise<Play[]> {
  const { data } = await admin
    .from('tag_refresh_plays')
    .select('id, user_id, completed, played_at')
    .in('round_id', roundIds)
    .gte('played_at', start)
    .lt('played_at', end);
  return (data ?? []).map((p: any) => ({ id: p.id as string, userId: p.user_id as string, completed: !!p.completed }));
}

async function fetchWords(admin: any, playIds: string[]): Promise<PlayWord[]> {
  if (!playIds.length) return [];
  const { data } = await admin
    .from('tag_refresh_play_words')
    .select('label, emoji, outcome')
    .in('play_id', playIds);
  return (data ?? []).map((w: any) => ({ label: w.label as string, emoji: w.emoji ?? null, outcome: w.outcome }));
}

// 'YYYY-MM' -> [startISO, endISO) covering that UTC month.
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return [start.toISOString(), end.toISOString()];
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/insights/data.ts"
git commit -m "feat(tag-refresh): insights data layer (group-scoped)"
```

---

## Task 4: Insights page (server component)

**Files:** Create `app/champion/[groupId]/tag-refresh/insights/page.tsx`.

- [ ] **Step 1: Write the page**

```tsx
// app/champion/[groupId]/tag-refresh/insights/page.tsx
import Link from 'next/link';
import { fetchInsights, currentMonth, prevMonth } from './data';
import { popularTags, seasonBalance, movers, summaryStats } from '@/lib/tagRefreshInsights';

const SEASON_COLOR = { past: '#f87559', present: '#22c55e', future: '#60a5fa' } as const;

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { groupId } = await params;
  const sp = await searchParams;
  const month = sp.month ?? currentMonth();

  const data = await fetchInsights(groupId, month);
  const summary = summaryStats(data.roundsSent, data.plays, data.wordsThisMonth);
  const popular = popularTags(data.wordsThisMonth, 'present', 6);
  const balance = seasonBalance(data.wordsThisMonth);
  const moverList = movers(data.wordsThisMonth, data.wordsLastMonth, 5);
  const total = balance.past + balance.present + balance.future || 1;
  const maxCount = popular[0]?.count ?? 1;
  const base = `/champion/${groupId}/tag-refresh/insights`;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Insights</h2>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`${base}?month=${prevMonth(month)}`} className="text-muted hover:text-white">←</Link>
          <span className="text-white font-semibold">{month}</span>
          <Link href={`${base}?month=${nextMonth(month)}`} className="text-muted hover:text-white">→</Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat value={String(summary.roundsSent)} label="Rounds sent" />
        <Stat value={String(summary.players)} label="Players" />
        <Stat value={`${summary.completionPct}%`} label="Completion" />
        <Stat value={String(summary.tagsRefreshed)} label="Tags refreshed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Popular tags (present) */}
        <div className="card">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Most popular · present</p>
          {popular.length === 0 && <p className="text-sm text-muted">No data for this month yet.</p>}
          {popular.map((t) => (
            <div key={t.label} className="flex items-center gap-3 mb-2.5">
              <div className="w-28 text-sm font-semibold text-white truncate">{t.emoji ? `${t.emoji} ` : ''}{t.label}</div>
              <div className="flex-1 h-2 rounded bg-surface-low overflow-hidden">
                <div className="h-full rounded" style={{ width: `${(t.count / maxCount) * 100}%`, background: SEASON_COLOR.present }} />
              </div>
              <div className="w-7 text-right text-xs text-muted">{t.count}</div>
            </div>
          ))}
        </div>

        {/* Movers + balance */}
        <div className="card">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Movers this month</p>
          {moverList.length === 0 && <p className="text-sm text-muted">No change vs last month.</p>}
          {moverList.map((m) => (
            <div key={m.label} className="flex items-center justify-between py-1.5 text-sm border-b border-white/[0.06] last:border-0">
              <span className="text-white font-semibold">{m.label}</span>
              <span style={{ color: m.delta > 0 ? SEASON_COLOR.present : SEASON_COLOR.past }} className="font-bold">
                {m.delta > 0 ? `▲ +${m.delta}` : `▼ ${m.delta}`}
              </span>
            </div>
          ))}

          <p className="text-xs font-bold tracking-widest uppercase text-muted mt-5 mb-2">Group season balance</p>
          <div className="flex h-3 rounded overflow-hidden mb-2">
            <div style={{ width: `${(balance.past / total) * 100}%`, background: SEASON_COLOR.past }} />
            <div style={{ width: `${(balance.present / total) * 100}%`, background: SEASON_COLOR.present }} />
            <div style={{ width: `${(balance.future / total) * 100}%`, background: SEASON_COLOR.future }} />
          </div>
          <div className="flex gap-4 text-xs text-muted">
            <span style={{ color: SEASON_COLOR.past }}>Past {pct(balance.past, total)}%</span>
            <span style={{ color: SEASON_COLOR.present }}>Present {pct(balance.present, total)}%</span>
            <span style={{ color: SEASON_COLOR.future }}>Future {pct(balance.future, total)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card !p-3">
      <div className="text-2xl font-bold text-white leading-none">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function pct(n: number, total: number): number {
  return Math.round((n / total) * 100);
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/insights/page.tsx"
git commit -m "feat(tag-refresh): insights page"
```

---

## Task 5: Tabs (Build ⇄ Insights)

**Files:** Create `app/champion/[groupId]/tag-refresh/tabs.tsx` (client) and `app/champion/[groupId]/tag-refresh/layout.tsx`.

- [ ] **Step 1: Create the client tabs strip**

```tsx
// app/champion/[groupId]/tag-refresh/tabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TagRefreshTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const base = `/champion/${groupId}/tag-refresh`;
  const tabs = [
    { label: 'Build', href: base },
    { label: 'Insights', href: `${base}/insights` },
  ];
  return (
    <div className="flex gap-6 border-b border-white/[0.08] mb-6">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`pb-2.5 text-sm font-semibold ${active ? 'text-white border-b-2 border-accent' : 'text-muted'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create the layout that renders the tabs**

```tsx
// app/champion/[groupId]/tag-refresh/layout.tsx
import { TagRefreshTabs } from './tabs';

export default async function TagRefreshLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Tag Refresh</h1>
      <p className="text-sm text-muted mt-1 mb-4">
        Build a word bank and push a quick falling-words game to your members.
      </p>
      <TagRefreshTabs groupId={groupId} />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Remove the now-duplicated heading from the Build page**

The Build page (`app/champion/[groupId]/tag-refresh/page.tsx`) currently renders its own `<h1>Tag Refresh</h1>` + description and a `max-w-4xl` wrapper — the layout now provides these. Edit the Build page: change the outer `<div className="max-w-4xl">` to `<div>` and delete the `<h1>` and the following `<p>` description lines (keep everything from the `<div className="grid ...">` onward).

- [ ] **Step 4: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: clean; both `/champion/[groupId]/tag-refresh` and `/champion/[groupId]/tag-refresh/insights` routes compile.

- [ ] **Step 5: Manual smoke test**

`npm run dev` → a group you champion → **Tag Refresh** → tab strip shows Build / Insights. Open **Insights**: summary cards + popular tags + movers + season balance render (push a round and play it on mobile first if there's no data). Month arrows change `?month=`.

- [ ] **Step 6: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/tabs.tsx" "app/champion/[groupId]/tag-refresh/layout.tsx" "app/champion/[groupId]/tag-refresh/page.tsx"
git commit -m "feat(tag-refresh): Build/Insights tabs"
```

---

## Self-Review (completed by plan author)

**Spec coverage (§4.3 Insights):**
- Month selector → Task 4 (prev/next links + `?month`). ✓
- Summary cards (rounds/players/completion/tags refreshed) → `summaryStats` (Task 2) + page (Task 4). ✓
- Most popular tags by season → `popularTags` + page (present shown; helper is season-parameterized). ✓
- Movers (month-over-month) → `movers` (Task 2) + page. ✓
- Group season balance → `seasonBalance` + page. ✓
- Tabs (Build/Insights) → Task 5. ✓
- Group scoping enforced in the data layer (admin client + round-id filter). ✓

**Placeholder scan:** No TBD/TODO; complete code throughout. Pure logic is Vitest-tested; integration verified by type-check/build + manual.

**Type consistency:** `PlayWord`/`Play`/`Outcome`/`Season` defined in `tagRefreshInsights.ts` (Task 2) and imported by `data.ts` (Task 3) + page (Task 4). `InsightsData` shape consumed by the page matches `fetchInsights`'s return. `monthRange`/`prevMonth`/`currentMonth`/`nextMonth` consistent string `'YYYY-MM'` format.

---

## Next plans (not in this document)
- **Library** — reusable saved banks.
- **Admin org-wide push** — superuser RLS for org-wide bank/round writes + org-level insights.
- **Profile display** — top-8 tags per season by strength (mobile).
