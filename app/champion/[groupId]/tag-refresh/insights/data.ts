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
