'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { label: 'Overview',    href: '/superuser/overview',    icon: '◎' },
  { label: 'Users',       href: '/superuser/users',       icon: '⊹' },
  { label: 'Groups',      href: '/superuser/groups',      icon: '⊞' },
  { label: 'Champions',   href: '/superuser/champions',   icon: '✦' },
  { label: 'Summaries',   href: '/superuser/summaries',   icon: '♪' },
  { label: 'Activities',  href: '/superuser/activities',  icon: '◇' },
  { label: 'Waitlist',    href: '/superuser/waitlist',    icon: '✉' },
  { label: 'Analytics',   href: '/superuser/analytics',   icon: '∿' },
  { label: 'Tag Refresh', href: '/superuser/tag-refresh', icon: '✺' },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <>
      {NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
            pathname === item.href
              ? 'bg-accent/10 text-accent font-semibold'
              : 'text-muted hover:text-white hover:bg-white/[0.04]'
          )}
        >
          <span className="text-base leading-none w-4 text-center opacity-70">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <span className="text-accent text-xl font-bold leading-none">✦</span>
          <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
        </div>
        <p className="text-faint text-xs mt-1.5">Superuser Dashboard</p>
      </div>
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </nav>
      <div className="px-3 pb-5 pt-2 border-t border-white/[0.08] shrink-0">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <span className="text-base leading-none w-4 text-center opacity-70">↩</span>
            Sign out
          </button>
        </form>
      </div>
    </>
  )
}

export function SuperuserSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 min-h-screen bg-surface-low border-r border-white/[0.08] flex-col">
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-surface-low border-b border-white/[0.08] flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          aria-label="Open menu"
        >
          <span className="block w-5 h-0.5 bg-white/70 rounded-full" />
          <span className="block w-5 h-0.5 bg-white/70 rounded-full" />
          <span className="block w-5 h-0.5 bg-white/70 rounded-full" />
        </button>
        <span className="text-accent text-lg font-bold leading-none">✦</span>
        <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
      </div>

      {/* ── Mobile drawer overlay ────────────────────────────── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-surface-low flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <span className="text-accent text-xl font-bold leading-none">✦</span>
                <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-muted hover:text-white transition-colors text-lg"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <p className="text-faint text-xs px-5 pt-2 pb-3 border-b border-white/[0.08]">Superuser Dashboard</p>
            <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <div className="px-3 pb-6 pt-2 border-t border-white/[0.08] shrink-0">
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-white hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-base leading-none w-4 text-center opacity-70">↩</span>
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
