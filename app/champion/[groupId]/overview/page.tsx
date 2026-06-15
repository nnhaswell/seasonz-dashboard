import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  params: Promise<{ groupId: string }>
}

const SEASON_COLOR: Record<string, string> = {
  past:    '#f87559',
  present: '#22c55e',
  future:  '#60a5fa',
}

const SEASON_LABEL: Record<string, string> = {
  past:    'Past',
  present: 'Present',
  future:  'Future',
}

export default async function OverviewPage({ params }: Props) {
  const { groupId } = await params
  const supabase    = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Fetch group and members first ─────────────────────────────────────────
  const [groupRes, membersRes] = await Promise.all([
    // Group details — only columns that exist in the schema
    supabase
      .from('groups')
      .select('name, description, season, member_count')
      .eq('id', groupId)
      .single(),

    // All members of this group with their profiles (for season breakdown + activity)
    supabase
      .from('group_members')
      .select('user_id, role, joined_at, profiles(active_season)')
      .eq('group_id', groupId),
  ])

  const group   = groupRes.data as { name: string; description: string | null; season: string | null; member_count: number } | null
  const members = membersRes.data ?? []

  // ── Fetch posts using member IDs ──────────────────────────────────────────
  const memberIds = members.map(m => m.user_id)
  const postsRes = memberIds.length > 0
    ? await supabase
        .from('posts')
        .select('user_id, created_at')
        .in('user_id', memberIds)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    : { data: [] }

  if (!group) redirect('/403')

  // ── Compute stats inline (no RPC needed) ────────────────────────────────────
  const total       = group.member_count || members.length
  const oneWeekAgo  = new Date(Date.now() - 7 * 86400000)
  const newThisWeek = members.filter(m => m.joined_at && new Date(m.joined_at) >= oneWeekAgo).length

  // Season breakdown from member profiles
  const breakdown = { past: 0, present: 0, future: 0 }
  for (const m of members) {
    const season = (m.profiles as any)?.active_season as string | undefined
    if (season === 'past' || season === 'present' || season === 'future') {
      breakdown[season]++
    }
  }

  // Active this week = members who posted in the last 7 days
  // We do a simpler approximation: use joined recently as a proxy if posts fail
  const activeThisWeek = postsRes.data?.length
    ? new Set(postsRes.data.map(p => p.user_id)).size
    : 0

  const pastPct    = total > 0 ? Math.round((breakdown.past    / total) * 100) : 0
  const presentPct = total > 0 ? Math.round((breakdown.present / total) * 100) : 0
  const futurePct  = total > 0 ? Math.round((breakdown.future  / total) * 100) : 0
  const activeRate = total > 0 ? Math.round((activeThisWeek    / total) * 100) : 0

  return (
    <div className="max-w-4xl">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white capitalize">{group.name}</h1>
        {group.description && (
          <p className="text-muted text-sm mt-1.5 max-w-lg">{group.description}</p>
        )}
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">

        <div className="card">
          <p className="stat-label">Total members</p>
          <p className="stat-number mt-2">{total}</p>
        </div>

        <div className="card">
          <p className="stat-label">Active this week</p>
          <p className="stat-number mt-2">{activeThisWeek}</p>
          {total > 0 && (
            <p className="text-xs text-muted mt-1">{activeRate}% of group</p>
          )}
        </div>

        <div className="card">
          <p className="stat-label">New this week</p>
          <p className="stat-number mt-2">{newThisWeek}</p>
          <p className="text-xs text-muted mt-1">joined recently</p>
        </div>
      </div>

      {/* ── Season breakdown ──────────────────────────────────────────────── */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Season breakdown</h2>

        <div className="flex rounded-full overflow-hidden h-2.5 mb-4 bg-surface-high">
          {pastPct > 0 && (
            <div style={{ width: `${pastPct}%`, backgroundColor: SEASON_COLOR.past }} />
          )}
          {presentPct > 0 && (
            <div style={{ width: `${presentPct}%`, backgroundColor: SEASON_COLOR.present }} />
          )}
          {futurePct > 0 && (
            <div style={{ width: `${futurePct}%`, backgroundColor: SEASON_COLOR.future }} />
          )}
          {total === 0 && (
            <div className="w-full bg-surface-high rounded-full" />
          )}
        </div>

        <div className="flex gap-6">
          {(['past', 'present', 'future'] as const).map(key => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEASON_COLOR[key] }} />
              <span className="text-sm text-muted">{SEASON_LABEL[key]}</span>
              <span className="text-sm font-semibold text-white">{breakdown[key]}</span>
              <span className="text-xs text-faint">
                ({key === 'past' ? pastPct : key === 'present' ? presentPct : futurePct}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Members preview + quick actions ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-3">Recent members</h2>
          {members.length === 0 ? (
            <p className="text-sm text-faint italic">No members yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {members.slice(0, 5).map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between">
                  <span className="text-sm text-muted truncate">{m.user_id.slice(0, 8)}…</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: SEASON_COLOR[(m.profiles as any)?.active_season] + '22',
                      color: SEASON_COLOR[(m.profiles as any)?.active_season] ?? '#9aa3b8',
                    }}
                  >
                    {(m.profiles as any)?.active_season ?? '—'}
                  </span>
                </div>
              ))}
              {members.length > 5 && (
                <Link href={`/champion/${groupId}/members`} className="text-xs text-accent mt-1 hover:underline">
                  View all {members.length} members →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white">Quick actions</h2>

          <Link
            href={`/champion/${groupId}/messaging`}
            className="flex items-center justify-between bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
          >
            <span>✦ Send a check-in</span>
            <span>→</span>
          </Link>

          <Link
            href={`/champion/${groupId}/members`}
            className="flex items-center justify-between bg-surface-high text-white text-sm font-medium rounded-lg px-4 py-2.5 border border-white/[0.08] hover:border-white/20 transition-colors"
          >
            <span>View all members</span>
            <span className="text-muted">→</span>
          </Link>

          <Link
            href={`/champion/${groupId}/ai-assist`}
            className="flex items-center justify-between bg-surface-high text-white text-sm font-medium rounded-lg px-4 py-2.5 border border-white/[0.08] hover:border-white/20 transition-colors"
          >
            <span>AI writing assist</span>
            <span className="text-muted">→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
