import Link from 'next/link'
import { WaitlistForm } from '@/components/WaitlistForm'

// Public landing — seasonz.ai
// Anonymous + authenticated visitors both see this. Champions/admins sign in
// via the link to /login, which routes them to their dashboard.
export const metadata = {
  title: 'Seasonz — a productive social network',
  description:
    'Life, organized in seasons. Seasonz is a productive social network that connects you with people in the same chapter of life — past, present and future.',
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <span className="text-accent text-xl font-bold leading-none">✦</span>
          <span className="font-semibold tracking-tight">Seasonz</span>
        </div>
        <Link
          href="/login"
          className="text-sm text-muted hover:text-white transition-colors"
        >
          Champion / Admin sign in →
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-8 py-16 max-w-2xl mx-auto w-full">
        <div className="flex flex-col items-center gap-5">
          {/* Season dots */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-past" />
            <span className="w-2.5 h-2.5 rounded-full bg-present" />
            <span className="w-2.5 h-2.5 rounded-full bg-future" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            A productive social network.
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-xl">
            Life, organized in seasons. Seasonz connects you with people in the same
            chapter — what you&apos;ve come through, what you&apos;re building now, and
            where you&apos;re headed next.
          </p>
        </div>

        {/* Waitlist */}
        <WaitlistForm />

        {/* Season pillars */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-md mt-6 text-left">
          <Pillar color="bg-past"    label="Past"    sub="where you've been" />
          <Pillar color="bg-present" label="Present" sub="what you're in" />
          <Pillar color="bg-future"  label="Future"  sub="where you're going" />
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 text-center">
        <p className="text-xs text-faint">seasonz.ai · 16 and over</p>
      </footer>
    </div>
  )
}

function Pillar({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-surface px-4 py-3.5">
      <span className={`block w-2 h-2 rounded-full ${color} mb-2`} />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-faint mt-0.5">{sub}</p>
    </div>
  )
}
