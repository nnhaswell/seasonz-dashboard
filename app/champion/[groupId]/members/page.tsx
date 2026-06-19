import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JoinRequestsPanel, RoleButton } from './member-actions'

interface Props {
  params: Promise<{ groupId: string }>
}

export default async function MembersPage({ params }: Props) {
  const { groupId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch group info
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()

  // Fetch all members with their basic info
  const { data: members } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      joined_at,
      profiles (
        display_name,
        handle,
        avatar_url,
        active_season
      )
    `)
    .eq('group_id', groupId)
    .order('role', { ascending: false }) // champions first

  // Pending join requests (Closed groups)
  const { data: pendingRequests } = await supabase
    .from('group_join_requests')
    .select('id, user_id, created_at, profile:profiles(display_name, handle, avatar_url)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Fetch activity stats in bulk to avoid N+1 queries
  const memberIds = (members ?? []).map((m: any) => m.user_id)

  const [
    { data: allPosts },
    { data: allLikes },
  ] = await Promise.all([
    supabase.from('posts').select('author_id, created_at').in('author_id', memberIds),
    supabase.from('post_likes').select('user_id').in('user_id', memberIds),
  ])

  // Build lookup maps
  const postsByUser: Record<string, string[]> = {}
  allPosts?.forEach((p: any) => {
    if (!postsByUser[p.author_id]) postsByUser[p.author_id] = []
    postsByUser[p.author_id].push(p.created_at)
  })

  const likeCountByUser: Record<string, number> = {}
  allLikes?.forEach((l: any) => {
    likeCountByUser[l.user_id] = (likeCountByUser[l.user_id] || 0) + 1
  })

  const memberStats = (members ?? []).map((member: any) => {
    const userId = member.user_id
    const postDates = postsByUser[userId] ?? []
    const postCount = postDates.length
    const likeCount = likeCountByUser[userId] ?? 0

    const lastActive = postDates.length > 0
      ? new Date(Math.max(...postDates.map(d => new Date(d).getTime())))
      : null

    // Engagement score: posts × 5 + likes given × 1
    const engagementScore = postCount * 5 + likeCount

    return {
      ...member,
      postCount,
      likeCount,
      lastActive,
      engagementScore,
    }
  })

  // Sort by engagement score descending
  memberStats.sort((a, b) => b.engagementScore - a.engagementScore)

  const SEASON_COLOR: Record<string, string> = {
    past:    '#f87559',
    present: '#22c55e',
    future:  '#60a5fa',
  }

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never'
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Members</h1>
        <p className="text-muted text-sm mt-1">
          {memberStats.length} {memberStats.length === 1 ? 'member' : 'members'} in {group?.name ?? 'this group'}
        </p>
      </div>

      {/* Pending join requests (Closed groups) */}
      <JoinRequestsPanel groupId={groupId} requests={(pendingRequests ?? []) as any} />

      {/* Members Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Member
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Season
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Last Active
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Posts
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Likes Given
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Engagement
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Manage
              </th>
            </tr>
          </thead>
          <tbody>
            {memberStats.map((member: any) => {
              const profile = member.profiles
              const isChampion = member.role === 'champion'

              return (
                <tr
                  key={member.user_id}
                  className="border-b border-border last:border-0 hover:bg-surface transition-colors"
                >
                  {/* Member Info */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={profile.avatar_url ?? 'https://i.pravatar.cc/150?img=0'}
                        alt={profile.display_name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">
                            {profile.display_name}
                          </p>
                          {isChampion && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded">
                              Champion
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted">@{profile.handle}</p>
                      </div>
                    </div>
                  </td>

                  {/* Season */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: SEASON_COLOR[profile.active_season] }}
                      />
                      <span className="text-sm text-white capitalize">
                        {profile.active_season}
                      </span>
                    </div>
                  </td>

                  {/* Last Active */}
                  <td className="px-4 py-4">
                    <span className={`text-sm ${member.lastActive ? 'text-white' : 'text-faint'}`}>
                      {formatDate(member.lastActive)}
                    </span>
                  </td>

                  {/* Post Count */}
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-medium text-white">
                      {member.postCount}
                    </span>
                  </td>

                  {/* Likes Given */}
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-medium text-white">
                      {member.likeCount}
                    </span>
                  </td>

                  {/* Engagement Score */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-bold text-white">
                        {member.engagementScore}
                      </span>
                      {member.engagementScore > 20 && (
                        <span className="text-xs text-accent">🔥</span>
                      )}
                      {member.engagementScore === 0 && (
                        <span className="text-xs text-faint">💤</span>
                      )}
                    </div>
                  </td>

                  {/* Manage (promote/demote) */}
                  <td className="px-4 py-4 text-right">
                    <RoleButton groupId={groupId} userId={member.user_id} role={member.role} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {memberStats.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-muted">No members yet</p>
          </div>
        )}
      </div>

      {/* Engagement Legend */}
      <div className="mt-4 card">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Engagement Score
        </p>
        <p className="text-sm text-faint">
          Posts × 5 + Likes given × 1
        </p>
        <div className="flex gap-4 mt-2 text-xs text-faint">
          <span>🔥 High engagement (&gt; 20)</span>
          <span>💤 Inactive (0)</span>
        </div>
      </div>
    </div>
  )
}
