'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function WaitlistForm() {
  const supabase = createClient()
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [status, setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!clean) return
    setStatus('loading')
    setMessage('')

    const { error } = await supabase
      .from('waitlist')
      .insert({ email: clean, name: name.trim() || null })

    if (error) {
      // Unique violation → already signed up; treat as success.
      if (/duplicate|unique/i.test(error.message)) {
        setStatus('done')
        setMessage("You're already on the list — we'll be in touch.")
        return
      }
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
      return
    }

    setStatus('done')
    setMessage("You're on the list. We'll be in touch.")
  }

  if (status === 'done') {
    return (
      <div className="w-full max-w-md rounded-xl border border-accent/40 bg-accent/[0.06] px-5 py-4 text-center">
        <p className="text-accent font-semibold text-sm">✓ {message}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="First name (optional)"
          className="flex-1 bg-surface border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-faint text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 bg-surface border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-faint text-sm focus:outline-none focus:border-accent transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'loading' || !email.trim()}
        className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-5 py-3 hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {status === 'error' && <p className="text-sm text-past text-center">{message}</p>}
      <p className="text-xs text-faint text-center">No spam. Just an invite when we open the doors.</p>
    </form>
  )
}
