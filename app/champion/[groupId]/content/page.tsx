import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UserAvatar } from '@/components/UserAvatar'

interface Props {
  params: Promise<{ groupId: string }>
}

export default async function ContentPage({ params }: Props) {
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

  // Fetch all group members
  const { data: membersList } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)

  const memberIds = (membersList ?? []).map(m => m.user_id)

  // Fetch recent posts from group members
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id,
      headline,
      body,
      season,
      created_at,
      likes_count,
      comments_count,
      profiles (
        display_name,
        handle,
        avatar_url,
        active_season
      )
    `)
    .in('author_id', memberIds)
    .order('created_at', { ascending: false })
    .limit(50)

  // Group posts by season
  const postsBySeason = {
    past: (posts ?? []).filter(p => p.season === 'past'),
    present: (posts ?? []).filter(p => p.season === 'present'),
    future: (posts ?? []).filter(p => p.season === 'future'),
  }

  const SEASON_COLOR: Record<string, string> = {
    past: '#f87559',
    present: '#22c55e',
    future: '#60a5fa',
  }

  const SEASON_LABEL: Record<string, string> = {
    past: 'Past',
    present: 'Present',
    future: 'Future',
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Content Feed</h1>
        <p className="text-muted text-sm mt-1">
          Recent posts from {group?.name ?? 'this group'} members
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="stat-label">Total Posts</p>
          <p className="stat-number mt-2">{posts?.length ?? 0}</p>
        </div>
        <div className="card">
          <p className="stat-label">Past</p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SEASON_COLOR.past }}
            />
            <p className="stat-number">{postsBySeason.past.length}</p>
          </div>
        </div>
        <div className="card">
          <p className="stat-label">Present</p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SEASON_COLOR.present }}
            />
            <p className="stat-number">{postsBySeason.present.length}</p>
          </div>
        </div>
        <div className="card">
          <p className="stat-label">Future</p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SEASON_COLOR.future }}
            />
            <p className="stat-number">{postsBySeason.future.length}</p>
          </div>
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {(posts ?? []).map((post: any) => {
          const profile = post.profiles

          return (
            <div key={post.id} className="card hover:border-white/20 transition-colors">
              {/* Post Header */}
              <div className="flex items-start gap-3 mb-3">
                <UserAvatar avatarUrl={profile.avatar_url} name={profile.display_name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">
                      {profile.display_name}
                    </p>
                    <span className="text-xs text-faint">@{profile.handle}</span>
                    <span className="text-xs text-faint">•</span>
                    <span className="text-xs text-faint">
                      {formatDate(post.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: SEASON_COLOR[post.season] }}
                    />
                    <span className="text-xs text-muted capitalize">
                      {SEASON_LABEL[post.season]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Post Content */}
              <h3 className="text-base font-semibold text-white mb-2">
                {post.headline}
              </h3>
              {post.body && (
                <p className="text-sm text-muted mb-3 line-clamp-3">
                  {post.body}
                </p>
              )}

              {/* Post Stats */}
              <div className="flex items-center gap-4 text-xs text-faint">
                <span className="flex items-center gap-1">
                  <span>❤️</span>
                  <span>{post.likes_count ?? 0}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span>💬</span>
                  <span>{post.comments_count ?? 0}</span>
                </span>
              </div>
            </div>
          )
        })}

        {(!posts || posts.length === 0) && (
          <div className="card text-center py-12">
            <p className="text-muted">No posts yet from group members</p>
            <p className="text-faint text-sm mt-2">
              Posts will appear here as members share their stories
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
