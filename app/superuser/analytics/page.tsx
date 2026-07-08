import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SuperuserAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify superuser
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superuser')
    .eq('id', user.id)
    .single()

  if (!profile?.is_superuser) redirect('/403')

  // Fetch various analytics
  const [
    { data: profiles },
    { data: posts },
    { data: connections },
    { data: groups },
    { data: championMessages },
  ] = await Promise.all([
    supabase.from('profiles').select('id, created_at, active_season'),
    supabase.from('posts').select('id, created_at, season, author_id'),
    supabase.from('connections').select('id, created_at, status'),
    supabase.from('groups').select('id, created_at, member_count').is('deleted_at', null),
    supabase.from('champion_messages').select('id, sent_at, recipient_count'),
  ])

  // Calculate growth metrics
  const now = new Date()
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const newUsers30d = (profiles ?? []).filter(
    p => new Date(p.created_at) > last30Days
  ).length

  const newUsers7d = (profiles ?? []).filter(
    p => new Date(p.created_at) > last7Days
  ).length

  const newPosts30d = (posts ?? []).filter(
    p => new Date(p.created_at) > last30Days
  ).length

  const newPosts7d = (posts ?? []).filter(
    p => new Date(p.created_at) > last7Days
  ).length

  const newConnections30d = (connections ?? []).filter(
    c => new Date(c.created_at) > last30Days && c.status === 'connected'
  ).length

  // Season distribution
  const seasonCounts = (profiles ?? []).reduce((acc, p) => {
    acc[p.active_season] = (acc[p.active_season] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Post season distribution
  const postSeasonCounts = (posts ?? []).reduce((acc, p) => {
    acc[p.season] = (acc[p.season] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Engagement metrics
  const totalPosts = posts?.length ?? 0
  const totalUsers = profiles?.length ?? 0
  const avgPostsPerUser = totalUsers > 0 ? (totalPosts / totalUsers).toFixed(1) : '0'

  // Active users (posted in last 30 days)
  const activeUserIds = new Set(
    (posts ?? [])
      .filter(p => new Date(p.created_at) > last30Days)
      .map(p => p.author_id)
  )
  const activeUsers = activeUserIds.size
  const activityRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : '0'

  // Champion engagement
  const totalMessages = championMessages?.length ?? 0
  const totalReach = (championMessages ?? []).reduce(
    (sum, m) => sum + (m.recipient_count ?? 0),
    0
  )

  const SEASON_COLOR: Record<string, string> = {
    past: '#f87559',
    present: '#22c55e',
    future: '#60a5fa',
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
        <p className="text-muted text-sm mt-1">
          Real-time insights into platform health and engagement
        </p>
      </div>

      {/* Growth Metrics */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Growth Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="card">
            <p className="stat-label">New Users (30d)</p>
            <p className="stat-number mt-2">{newUsers30d}</p>
            <p className="text-xs text-muted mt-1">{newUsers7d} this week</p>
          </div>
          <div className="card">
            <p className="stat-label">New Posts (30d)</p>
            <p className="stat-number mt-2">{newPosts30d}</p>
            <p className="text-xs text-muted mt-1">{newPosts7d} this week</p>
          </div>
          <div className="card">
            <p className="stat-label">New Connections (30d)</p>
            <p className="stat-number mt-2">{newConnections30d}</p>
          </div>
          <div className="card">
            <p className="stat-label">Total Groups</p>
            <p className="stat-number mt-2">{groups?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Engagement Metrics */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Engagement Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="card">
            <p className="stat-label">Active Users (30d)</p>
            <p className="stat-number mt-2">{activeUsers}</p>
            <p className="text-xs text-muted mt-1">{activityRate}% of total</p>
          </div>
          <div className="card">
            <p className="stat-label">Avg Posts/User</p>
            <p className="stat-number mt-2">{avgPostsPerUser}</p>
          </div>
          <div className="card">
            <p className="stat-label">Connected Users</p>
            <p className="stat-number mt-2">
              {(connections ?? []).filter(c => c.status === 'connected').length}
            </p>
          </div>
          <div className="card">
            <p className="stat-label">Connection Rate</p>
            <p className="stat-number mt-2">
              {totalUsers > 0
                ? (((connections ?? []).filter(c => c.status === 'connected').length / totalUsers) * 100).toFixed(1)
                : '0'
              }%
            </p>
          </div>
        </div>
      </div>

      {/* Season Distribution */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">User Season Distribution</h2>
          <div className="flex rounded-full overflow-hidden h-3 mb-4 bg-surface-high">
            {(['past', 'present', 'future'] as const).map(season => {
              const count = seasonCounts[season] || 0
              const pct = totalUsers > 0 ? (count / totalUsers) * 100 : 0
              return pct > 0 ? (
                <div
                  key={season}
                  style={{ width: `${pct}%`, backgroundColor: SEASON_COLOR[season] }}
                />
              ) : null
            })}
          </div>
          <div className="flex gap-4">
            {(['past', 'present', 'future'] as const).map(season => {
              const count = seasonCounts[season] || 0
              const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0
              return (
                <div key={season} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: SEASON_COLOR[season] }}
                  />
                  <span className="text-sm text-muted capitalize">{season}</span>
                  <span className="text-sm font-semibold text-white">{count}</span>
                  <span className="text-xs text-faint">({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Post Season Distribution</h2>
          <div className="flex rounded-full overflow-hidden h-3 mb-4 bg-surface-high">
            {(['past', 'present', 'future'] as const).map(season => {
              const count = postSeasonCounts[season] || 0
              const pct = totalPosts > 0 ? (count / totalPosts) * 100 : 0
              return pct > 0 ? (
                <div
                  key={season}
                  style={{ width: `${pct}%`, backgroundColor: SEASON_COLOR[season] }}
                />
              ) : null
            })}
          </div>
          <div className="flex gap-4">
            {(['past', 'present', 'future'] as const).map(season => {
              const count = postSeasonCounts[season] || 0
              const pct = totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0
              return (
                <div key={season} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: SEASON_COLOR[season] }}
                  />
                  <span className="text-sm text-muted capitalize">{season}</span>
                  <span className="text-sm font-semibold text-white">{count}</span>
                  <span className="text-xs text-faint">({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Champion Impact */}
      <div className="card">
        <h2 className="text-sm font-semibold text-white mb-4">Champion Impact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <div>
            <p className="text-xs text-faint mb-1">Messages Sent</p>
            <p className="text-2xl font-bold text-white">{totalMessages}</p>
          </div>
          <div>
            <p className="text-xs text-faint mb-1">Total Reach</p>
            <p className="text-2xl font-bold text-white">{totalReach}</p>
            <p className="text-xs text-muted mt-1">message recipients</p>
          </div>
          <div>
            <p className="text-xs text-faint mb-1">Avg Reach/Message</p>
            <p className="text-2xl font-bold text-white">
              {totalMessages > 0 ? Math.round(totalReach / totalMessages) : 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
