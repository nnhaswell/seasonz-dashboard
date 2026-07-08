import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { UserAvatar } from '@/components/UserAvatar'

export default async function SuperuserChampionsPage() {
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

  // Fetch all champions with their groups
  const { data: championMemberships } = await supabase
    .from('group_members')
    .select(`
      user_id,
      group_id,
      joined_at,
      profiles (
        id,
        display_name,
        handle,
        avatar_url,
        active_season,
        created_at
      ),
      groups (
        id,
        name,
        member_count,
        avatar_url
      )
    `)
    .eq('role', 'champion')
    .order('joined_at', { ascending: false })

  // Group by champion
  const championsMap = new Map()

  championMemberships?.forEach((membership: any) => {
    const userId = membership.user_id
    if (!championsMap.has(userId)) {
      championsMap.set(userId, {
        ...membership.profiles,
        groups: [],
      })
    }
    championsMap.get(userId).groups.push({
      ...membership.groups,
      joined_at: membership.joined_at,
    })
  })

  const champions = Array.from(championsMap.values())

  // Fetch stats in bulk to avoid rate limits
  const championIds = champions.map((c: any) => c.id)

  const [
    { data: allPosts },
    { data: allMessages }
  ] = await Promise.all([
    supabase.from('posts').select('author_id').in('author_id', championIds),
    supabase.from('champion_messages').select('champion_id').in('champion_id', championIds)
  ])

  // Build lookup maps
  const postCounts: Record<string, number> = {}
  allPosts?.forEach((post: any) => {
    postCounts[post.author_id] = (postCounts[post.author_id] || 0) + 1
  })

  const messageCounts: Record<string, number> = {}
  allMessages?.forEach((msg: any) => {
    messageCounts[msg.champion_id] = (messageCounts[msg.champion_id] || 0) + 1
  })

  // Combine with champion data
  const championStats = champions.map((champion: any) => ({
    ...champion,
    postCount: postCounts[champion.id] || 0,
    messageCount: messageCounts[champion.id] || 0,
    totalMembers: champion.groups.reduce((sum: number, g: any) => sum + (g.member_count ?? 0), 0),
  }))

  // Sort by number of groups (most groups first)
  championStats.sort((a, b) => b.groups.length - a.groups.length)

  const SEASON_COLOR: Record<string, string> = {
    past: '#f87559',
    present: '#22c55e',
    future: '#60a5fa',
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Champions</h1>
        <p className="text-muted text-sm mt-1">
          {championStats.length} champions leading{' '}
          {championMemberships?.length ?? 0} groups
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="stat-label">Total Champions</p>
          <p className="stat-number mt-2">{championStats.length}</p>
        </div>
        <div className="card">
          <p className="stat-label">Total Members Led</p>
          <p className="stat-number mt-2">
            {championStats.reduce((sum, c) => sum + c.totalMembers, 0)}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Messages Sent</p>
          <p className="stat-number mt-2">
            {championStats.reduce((sum, c) => sum + c.messageCount, 0)}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Avg Groups/Champion</p>
          <p className="stat-number mt-2">
            {championStats.length > 0
              ? (championStats.reduce((sum, c) => sum + c.groups.length, 0) / championStats.length).toFixed(1)
              : 0
            }
          </p>
        </div>
      </div>

      {/* Champions List */}
      <div className="space-y-4">
        {championStats.map((champion: any) => (
          <div
            key={champion.id}
            className="card hover:border-white/20 transition-colors"
          >
            {/* Champion Header */}
            <div className="flex items-start gap-4 mb-4">
              <UserAvatar avatarUrl={champion.avatar_url} name={champion.display_name} size={56} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {champion.display_name}
                    </h3>
                    <p className="text-sm text-muted">@{champion.handle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: SEASON_COLOR[champion.active_season] }}
                    />
                    <span className="text-sm text-muted capitalize">
                      {champion.active_season}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-surface-high rounded-lg">
              <div>
                <p className="text-xs text-faint mb-1">Groups</p>
                <p className="text-lg font-bold text-white">
                  {champion.groups.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-faint mb-1">Total Members</p>
                <p className="text-lg font-bold text-white">
                  {champion.totalMembers}
                </p>
              </div>
              <div>
                <p className="text-xs text-faint mb-1">Messages Sent</p>
                <p className="text-lg font-bold text-white">
                  {champion.messageCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-faint mb-1">Posts</p>
                <p className="text-lg font-bold text-white">
                  {champion.postCount}
                </p>
              </div>
            </div>

            {/* Groups List */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Leading Groups
              </p>
              <div className="grid grid-cols-1 gap-2">
                {champion.groups.map((group: any) => (
                  <Link
                    key={group.id}
                    href={`/champion/${group.id}/overview`}
                    className="
                      flex items-center justify-between p-3 rounded-lg
                      bg-surface border border-white/[0.08]
                      hover:border-accent/50 hover:bg-accent/5
                      transition-all
                    "
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={group.avatar_url ?? 'https://api.dicebear.com/7.x/shapes/svg?seed=group'}
                        alt={group.name}
                        className="w-10 h-10 rounded-lg"
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {group.name}
                        </p>
                        <p className="text-xs text-muted">
                          {group.member_count} members • Since {formatDate(group.joined_at)}
                        </p>
                      </div>
                    </div>
                    <span className="text-muted text-sm">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}

        {championStats.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-muted">No champions yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
