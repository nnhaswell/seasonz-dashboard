'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type RequestRow = {
  id: string
  user_id: string
  created_at: string
  profile: { display_name: string; handle: string; avatar_url: string | null } | null
}

/** Pending join-request review (Closed groups). Renders nothing when empty. */
export function JoinRequestsPanel({ groupId, requests }: { groupId: string; requests: RequestRow[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(requestId: string, action: 'approve' | 'reject') {
    setBusy(requestId)
    const fn = action === 'approve' ? 'approve_join_request' : 'reject_join_request'
    const { error } = await supabase.rpc(fn, { p_request: requestId })
    setBusy(null)
    if (error) { alert(error.message); return }
    router.refresh()
  }

  if (requests.length === 0) return null

  return (
    <div className="card mb-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Pending requests · {requests.length}
      </p>
      <div className="flex flex-col gap-2">
        {requests.map(r => (
          <div key={r.id} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.profile?.avatar_url ?? `https://i.pravatar.cc/100?u=${r.user_id}`}
              alt=""
              className="w-9 h-9 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{r.profile?.display_name ?? 'Someone'}</p>
              <p className="text-xs text-muted">@{r.profile?.handle ?? ''}</p>
            </div>
            <button
              onClick={() => decide(r.id, 'approve')}
              disabled={busy === r.id}
              className="bg-accent text-accent-ink font-semibold text-xs rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Approve
            </button>
            <button
              onClick={() => decide(r.id, 'reject')}
              disabled={busy === r.id}
              className="text-xs text-faint hover:text-past transition-colors px-2 py-1.5"
            >
              Decline
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Per-member promote/demote control. */
export function RoleButton({ groupId, userId, role }: { groupId: string; userId: string; role: 'member' | 'champion' }) {
  const supabase = createClient()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function setRole(next: 'member' | 'champion') {
    setBusy(true)
    const { error } = await supabase.rpc('set_group_role', { p_group: groupId, p_user: userId, p_role: next })
    setBusy(false)
    if (error) { alert(error.message); return }
    router.refresh()
  }

  return role === 'champion' ? (
    <button
      onClick={() => setRole('member')}
      disabled={busy}
      className="text-xs text-faint hover:text-past transition-colors disabled:opacity-40"
    >
      Remove admin
    </button>
  ) : (
    <button
      onClick={() => setRole('champion')}
      disabled={busy}
      className="text-xs text-accent hover:underline disabled:opacity-40"
    >
      Make admin
    </button>
  )
}
