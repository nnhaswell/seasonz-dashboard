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
