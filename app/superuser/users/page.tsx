import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PromoteChampionButton } from './promote-champion-button'

export default async function SuperuserUsersPage() {
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

  // Fetch all users and groups
  const [
    { data: users },
    { data: groups }
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('groups').select('id, name')
  ])

  // Fetch all stats in bulk to avoid rate limits (3 queries total instead of N*3)
  const userIds = (users ?? []).map((u: any) => u.id)

  const [
    { data: allPosts },
    { data: allConnections },
    { data: allGroupMemberships }
  ] = await Promise.all([
    supabase.from('posts').select('author_id').in('author_id', userIds),
    supabase.from('connections').select('requester_id, addressee_id').eq('status', 'connected'),
    supabase.from('group_members').select('user_id, role, groups(name)').in('user_id', userIds)
  ])

  // Build lookup maps
  const postCounts: Record<string, number> = {}
  allPosts?.forEach((post: any) => {
    postCounts[post.author_id] = (postCounts[post.author_id] || 0) + 1
  })

  const connectionCounts: Record<string, number> = {}
  allConnections?.forEach((conn: any) => {
    if (userIds.includes(conn.requester_id)) {
      connectionCounts[conn.requester_id] = (connectionCounts[conn.requester_id] || 0) + 1
    }
    if (userIds.includes(conn.addressee_id)) {
      connectionCounts[conn.addressee_id] = (connectionCounts[conn.addressee_id] || 0) + 1
    }
  })

  const groupsByUser: Record<string, any[]> = {}
  allGroupMemberships?.forEach((m: any) => {
    if (!groupsByUser[m.user_id]) groupsByUser[m.user_id] = []
    groupsByUser[m.user_id].push(m)
  })

  // Combine with user data
  const userStats = (users ?? []).map((user: any) => {
    const memberships = groupsByUser[user.id] || []
    return {
      ...user,
      postCount: postCounts[user.id] || 0,
      connectionCount: connectionCounts[user.id] || 0,
      groupCount: memberships.length,
      isChampion: memberships.some((m: any) => m.role === 'champion'),
      championGroups: memberships.filter((m: any) => m.role === 'champion'),
    }
  })

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
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-muted text-sm mt-1">
          {userStats.length} total users on the platform
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="stat-label">Total Users</p>
          <p className="stat-number mt-2">{userStats.length}</p>
        </div>
        <div className="card">
          <p className="stat-label">Champions</p>
          <p className="stat-number mt-2">
            {userStats.filter(u => u.isChampion).length}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Superusers</p>
          <p className="stat-number mt-2">
            {userStats.filter(u => u.is_superuser).length}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">New This Week</p>
          <p className="stat-number mt-2">
            {userStats.filter(u => {
              const created = new Date(u.created_at)
              const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              return created > weekAgo
            }).length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                User
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Season
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Role
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Posts
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Groups
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Connections
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Joined
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {userStats.map((user: any) => (
              <tr
                key={user.id}
                className="border-b border-border last:border-0 hover:bg-surface transition-colors"
              >
                {/* User Info */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar_url ?? 'https://i.pravatar.cc/150?img=0'}
                      alt={user.display_name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {user.display_name}
                      </p>
                      <p className="text-xs text-muted">@{user.handle}</p>
                    </div>
                  </div>
                </td>

                {/* Season */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: SEASON_COLOR[user.active_season] }}
                    />
                    <span className="text-sm text-white capitalize">
                      {user.active_season}
                    </span>
                  </div>
                </td>

                {/* Role */}
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-1">
                    {user.is_superuser && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded w-fit">
                        Superuser
                      </span>
                    )}
                    {user.isChampion && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-present/20 text-present rounded w-fit">
                        Champion
                      </span>
                    )}
                    {!user.is_superuser && !user.isChampion && (
                      <span className="text-xs text-muted">Member</span>
                    )}
                  </div>
                </td>

                {/* Posts */}
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-white">
                    {user.postCount}
                  </span>
                </td>

                {/* Groups */}
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-white">
                    {user.groupCount}
                  </span>
                </td>

                {/* Connections */}
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-white">
                    {user.connectionCount}
                  </span>
                </td>

                {/* Joined Date */}
                <td className="px-4 py-4">
                  <span className="text-sm text-muted">
                    {formatDate(user.created_at)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-4 text-right">
                  {!user.is_superuser && (
                    <PromoteChampionButton
                      userId={user.id}
                      userName={user.display_name}
                      groups={groups ?? []}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
