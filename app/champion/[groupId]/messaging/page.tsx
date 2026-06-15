'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ groupId: string }>
}

export default function MessagingPage({ params }: Props) {
  const [groupId, setGroupId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [segment, setSegment] = useState<'all' | 'past' | 'present' | 'future' | 'inactive'>('all')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Unwrap params
  useEffect(() => {
    params.then(p => setGroupId(p.groupId))
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      // Count recipients based on segment
      let recipientCount = 0
      if (segment === 'all') {
        const { count } = await supabase
          .from('group_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('group_id', groupId)
        recipientCount = count ?? 0
      } else if (segment === 'inactive') {
        // Inactive = no posts in last 14 days
        const { data: members } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId)

        const memberIds = (members ?? []).map(m => m.user_id)

        const { data: activeMemberIds } = await supabase
          .from('posts')
          .select('author_id')
          .in('author_id', memberIds)
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

        const activeIds = new Set((activeMemberIds ?? []).map(p => p.author_id))
        recipientCount = memberIds.filter(id => !activeIds.has(id)).length
      } else {
        // Segment by season
        const { count } = await supabase
          .from('group_members')
          .select('user_id, profiles!inner(active_season)', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('profiles.active_season', segment)
        recipientCount = count ?? 0
      }

      // Post the check-in as a group message from the champion
      const { error: insertError } = await supabase
        .from('group_messages')
        .insert({
          sender_id: user.id,
          group_id: groupId,
          // No header for an all-members check-in — it's redundant. Only tag
          // season-targeted check-ins so recipients know who it's aimed at.
          body: segment === 'all' ? message : `[Check-in • ${segment} season]\n\n${message}`,
        })

      if (insertError) throw insertError

      setSuccess(true)
      setMessage('')

      // Redirect back to overview after 2 seconds
      setTimeout(() => {
        router.push(`/champion/${groupId}/overview`)
      }, 2000)

    } catch (err: any) {
      setError(err.message || 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const SEGMENT_OPTIONS = [
    { value: 'all', label: 'All members', description: 'Everyone in the group' },
    { value: 'past', label: 'Past season', description: 'Members focused on their past' },
    { value: 'present', label: 'Present season', description: 'Members focused on their present' },
    { value: 'future', label: 'Future season', description: 'Members focused on their future' },
    { value: 'inactive', label: 'Inactive members', description: 'No posts in the last 14 days' },
  ] as const

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Send a Check-in</h1>
        <p className="text-muted text-sm mt-1">
          Reach out to your group members with updates, questions, or encouragement
        </p>
      </div>

      {success ? (
        <div className="card">
          <div className="text-center py-8">
            <span className="text-5xl">✓</span>
            <h2 className="text-xl font-bold text-white mt-4">Check-in sent!</h2>
            <p className="text-muted text-sm mt-2">Your message has been delivered to the group.</p>
            <p className="text-faint text-xs mt-4">Redirecting to overview...</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex flex-col gap-6">
          {/* Target Segment */}
          <div className="card">
            <label className="block text-sm font-semibold text-white mb-3">
              Who should receive this?
            </label>
            <div className="flex flex-col gap-2">
              {SEGMENT_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                    transition-colors
                    ${segment === option.value
                      ? 'bg-accent/10 border-accent'
                      : 'bg-surface-high border-white/[0.08] hover:border-white/20'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="segment"
                    value={option.value}
                    checked={segment === option.value}
                    onChange={e => setSegment(e.target.value as typeof segment)}
                    className="mt-0.5 accent-accent"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{option.label}</p>
                    <p className="text-xs text-muted mt-0.5">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="card">
            <label className="block text-sm font-semibold text-white mb-3">
              Your message
            </label>
            <textarea
              required
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Hey everyone! Just checking in to see how you're doing this week..."
              rows={8}
              maxLength={1000}
              className="
                w-full bg-surface-high border border-white/[0.08] rounded-lg
                px-4 py-3 text-white placeholder-faint text-sm
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                transition-colors resize-none
              "
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-faint">
                Keep it personal and genuine. Members appreciate authenticity.
              </p>
              <p className="text-xs text-muted">
                {message.length}/1000
              </p>
            </div>
          </div>

          {error && (
            <div className="card bg-past/10 border-past">
              <p className="text-sm text-past">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(`/champion/${groupId}/overview`)}
              className="
                flex-1 bg-surface-high text-white text-sm font-medium
                rounded-lg px-4 py-3 border border-white/[0.08]
                hover:border-white/20 transition-colors
              "
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="
                flex-1 bg-accent text-accent-ink font-semibold text-sm
                rounded-lg px-4 py-3
                hover:opacity-90 active:opacity-80
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-opacity
              "
            >
              {loading ? 'Sending…' : 'Send check-in'}
            </button>
          </div>
        </form>
      )}

      {/* Tips */}
      {!success && (
        <div className="card mt-6 bg-surface">
          <h3 className="text-sm font-semibold text-white mb-3">Tips for great check-ins</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <span className="text-accent shrink-0">•</span>
              <span>Ask open-ended questions to spark conversation</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent shrink-0">•</span>
              <span>Share your own experiences to build trust</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent shrink-0">•</span>
              <span>Acknowledge wins and challenges in the group</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent shrink-0">•</span>
              <span>Keep it conversational and avoid corporate speak</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
