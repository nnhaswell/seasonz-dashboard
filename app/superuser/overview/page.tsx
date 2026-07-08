import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SuperuserOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch top-line platform stats in parallel
  const [profilesRes, groupsRes, postsRes, connectionsRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('groups').select('id', { count: 'exact', head: true }),
    supabase.from('posts').select('id', { count: 'exact', head: true }),
    supabase.from('connections').select('id', { count: 'exact', head: true }),
  ])

  // Active this week — profiles with a post in last 7 days
  const { count: activeThisWeek } = await supabase
    .from('posts')
    .select('author_id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  // New signups this week
  const { count: newThisWeek } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  // Season breakdown
  const { data: seasonData } = await supabase
    .from('profiles')
    .select('active_season')

  const seasonCounts = (seasonData ?? []).reduce(
    (acc, p) => {
      const s = p.active_season as string
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const total = profilesRes.count ?? 0

  const SEASON_COLOR: Record<string, string> = {
    past:    '#f87559',
    present: '#22c55e',
    future:  '#60a5fa',
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-muted text-sm mt-1">Real-time snapshot of Seasonz</p>
      </div>

      {/* ── Top stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'Total users',       value: total },
          { label: 'Active this week',  value: activeThisWeek ?? 0 },
          { label: 'New this week',     value: newThisWeek ?? 0 },
          { label: 'Total groups',      value: groupsRes.count ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card">
            <p className="stat-label">{label}</p>
            <p className="stat-number mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-6">
        <div className="card">
          <p className="stat-label">Total posts</p>
          <p className="stat-number mt-2">{postsRes.count ?? 0}</p>
        </div>
        <div className="card">
          <p className="stat-label">Connections made</p>
          <p className="stat-number mt-2">{connectionsRes.count ?? 0}</p>
        </div>
      </div>

      {/* ── Season breakdown ── */}
      <div className="card">
        <h2 className="text-sm font-semibold text-white mb-4">Season breakdown — all users</h2>
        <div className="flex rounded-full overflow-hidden h-2.5 mb-4 bg-surface-high">
          {(['past', 'present', 'future'] as const).map(s => {
            const pct = total > 0 ? Math.round(((seasonCounts[s] ?? 0) / total) * 100) : 0
            return pct > 0 ? (
              <div key={s} style={{ width: `${pct}%`, backgroundColor: SEASON_COLOR[s] }} />
            ) : null
          })}
        </div>
        <div className="flex gap-6">
          {(['past', 'present', 'future'] as const).map(s => {
            const count = seasonCounts[s] ?? 0
            const pct   = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={s} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEASON_COLOR[s] }} />
                <span className="text-sm text-muted capitalize">{s}</span>
                <span className="text-sm font-semibold text-white">{count}</span>
                <span className="text-xs text-faint">({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        {[
          { label: 'Manage users',    href: '/superuser/users' },
          { label: 'Manage groups',   href: '/superuser/groups' },
          { label: 'All champions',   href: '/superuser/champions' },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="
              card flex items-center justify-between
              hover:border-white/20 transition-colors cursor-pointer
            "
          >
            <span className="text-sm font-medium text-white">{label}</span>
            <span className="text-muted text-sm">→</span>
          </a>
        ))}
      </div>
    </div>
  )
}
