'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'email' | 'otp' | 'reset' | 'resetSent'
type Method = 'password' | 'otp'

export default function LoginPage() {
  const [method, setMethod]   = useState<Method>('password')
  const [step, setStep]       = useState<Step>('email')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const router                = useRouter()
  const supabase              = createClient()

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Refresh router to sync session cookies with server
    router.refresh()
    await redirectUser(data.user?.id)
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({ email })

    if (error) {
      setError(error.message)
    } else {
      setStep('otp')
    }
    setLoading(false)
  }

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    })

    if (error) {
      setError(error.message)
    } else {
      setStep('resetSent')
    }
    setLoading(false)
  }

  async function redirectUser(userId: string | undefined) {
    if (!userId) {
      setError('No user returned')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_superuser')
      .eq('id', userId)
      .single()

    if (profile?.is_superuser) {
      router.push('/superuser/overview')
      return
    }

    const { data: championGroups } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId)
      .eq('role', 'champion')

    if (championGroups && championGroups.length > 0) {
      router.push(`/champion/${championGroups[0].group_id}/overview`)
      return
    }

    router.push('/403')
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'email',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Refresh router to sync session cookies with server
    router.refresh()
    await redirectUser(data.user?.id)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <span className="text-accent text-4xl font-bold leading-none mb-3">✦</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Seasonz</h1>
          <p className="text-muted text-sm mt-1">Champion Dashboard</p>
        </div>

        {step === 'email' ? (
          <div className="card flex flex-col gap-4">
            {/* Method Toggle */}
            <div className="flex gap-2 p-1 bg-surface rounded-lg">
              <button
                type="button"
                onClick={() => setMethod('password')}
                className={`
                  flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all
                  ${method === 'password'
                    ? 'bg-surface-high text-white'
                    : 'text-muted hover:text-white'
                  }
                `}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => setMethod('otp')}
                className={`
                  flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all
                  ${method === 'otp'
                    ? 'bg-surface-high text-white'
                    : 'text-muted hover:text-white'
                  }
                `}
              >
                Email Code
              </button>
            </div>

            {/* Password Login Form */}
            {method === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@seasonz.ai"
                    className="
                      w-full bg-surface-high border border-white/[0.08] rounded-lg
                      px-4 py-2.5 text-white placeholder-faint text-sm
                      focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors
                    "
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="
                      w-full bg-surface-high border border-white/[0.08] rounded-lg
                      px-4 py-2.5 text-white placeholder-faint text-sm
                      focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors
                    "
                  />
                </div>

                {error && <p className="text-sm text-past">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="
                    bg-accent text-accent-ink font-semibold text-sm
                    rounded-lg px-4 py-2.5
                    hover:opacity-90 active:opacity-80
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-opacity
                  "
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('reset'); setError('') }}
                  className="text-xs text-muted hover:text-white transition-colors text-center"
                >
                  Forgot password?
                </button>

                <p className="text-center text-xs text-faint">
                  Access is restricted to Seasonz Champions and admins.
                </p>
              </form>
            ) : (
              /* OTP Login Form */
              <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@seasonz.ai"
                    className="
                      w-full bg-surface-high border border-white/[0.08] rounded-lg
                      px-4 py-2.5 text-white placeholder-faint text-sm
                      focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors
                    "
                  />
                </div>

                {error && <p className="text-sm text-past">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="
                    bg-accent text-accent-ink font-semibold text-sm
                    rounded-lg px-4 py-2.5
                    hover:opacity-90 active:opacity-80
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-opacity
                  "
                >
                  {loading ? 'Sending…' : 'Send code'}
                </button>

                <p className="text-center text-xs text-faint">
                  Access is restricted to Seasonz Champions and admins.
                </p>
              </form>
            )}
          </div>

        ) : step === 'otp' ? (
          <form onSubmit={handleVerifyOtp} className="card flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted mb-4">
                We sent a 6-digit code to{' '}
                <span className="text-white">{email}</span>. Enter it below.
              </p>
              <label className="block text-sm font-medium text-muted mb-1.5">
                One-time code
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="
                  w-full bg-surface-high border border-white/[0.08] rounded-lg
                  px-4 py-2.5 text-white placeholder-faint text-sm tracking-widest
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  transition-colors text-center text-lg font-semibold
                "
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-past">{error}</p>}

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="
                bg-accent text-accent-ink font-semibold text-sm
                rounded-lg px-4 py-2.5
                hover:opacity-90 active:opacity-80
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-opacity
              "
            >
              {loading ? 'Verifying…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError('') }}
              className="text-xs text-faint hover:text-muted transition-colors text-center"
            >
              Use a different email
            </button>
          </form>

        ) : step === 'reset' ? (
          <form onSubmit={handleSendReset} className="card flex flex-col gap-4">
            <p className="text-sm text-muted">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@seasonz.ai"
                className="
                  w-full bg-surface-high border border-white/[0.08] rounded-lg
                  px-4 py-2.5 text-white placeholder-faint text-sm
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  transition-colors
                "
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-past">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email}
              className="
                bg-accent text-accent-ink font-semibold text-sm
                rounded-lg px-4 py-2.5
                hover:opacity-90 active:opacity-80
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-opacity
              "
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setError('') }}
              className="text-xs text-faint hover:text-muted transition-colors text-center"
            >
              Back to sign in
            </button>
          </form>

        ) : (
          <div className="card flex flex-col gap-4">
            <p className="text-sm text-muted">
              If an account exists for{' '}
              <span className="text-white">{email}</span>, a password reset link is on its way.
              Check your inbox.
            </p>
            <button
              type="button"
              onClick={() => { setStep('email'); setError('') }}
              className="
                bg-accent text-accent-ink font-semibold text-sm
                rounded-lg px-4 py-2.5
                hover:opacity-90 active:opacity-80 transition-opacity text-center
              "
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
