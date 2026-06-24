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
