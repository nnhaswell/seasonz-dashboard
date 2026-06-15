'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  // The recovery link routes through /auth/callback which exchanges the code
  // for a session, then redirects here. Confirm we actually have one.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => router.push('/'), 1500)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <span className="text-accent text-4xl font-bold leading-none mb-3">✦</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Seasonz</h1>
          <p className="text-muted text-sm mt-1">Set a new password</p>
        </div>

        {hasSession === false ? (
          <div className="card flex flex-col gap-4">
            <p className="text-sm text-muted">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <a
              href="/login"
              className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 text-center hover:opacity-90 transition-opacity"
            >
              Back to sign in
            </a>
          </div>
        ) : done ? (
          <div className="card flex flex-col gap-2 items-center text-center">
            <p className="text-sm text-white font-medium">Password updated</p>
            <p className="text-xs text-faint">Signing you in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-4 py-2.5 text-white placeholder-faint text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-4 py-2.5 text-white placeholder-faint text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>

            {error && <p className="text-sm text-past">{error}</p>}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
