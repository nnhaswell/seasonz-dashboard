'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { SignOutButton } from './SignOutButton'

interface NavItem {
  label: string
  href:  string
  icon:  string
}

interface SidebarProps {
  groupId:      string
  groupName:    string
  allGroups?:   { group_id: string; group_name: string }[]
  isSuperuser?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',    href: 'overview',    icon: '◎' },
  { label: 'Members',     href: 'members',     icon: '⊹' },
  { label: 'Messaging',   href: 'messaging',   icon: '✉' },
  { label: 'AI Assist',   href: 'ai-assist',   icon: '✦' },
  { label: 'Activities',  href: 'activities',  icon: '◇' },
  { label: 'Tag Refresh', href: 'tag-refresh', icon: '✺' },
  { label: 'Content',     href: 'content',     icon: '⊞' },
]

function SidebarContent({
  groupId, groupName, allGroups, isSuperuser, onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <>
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <span className="text-accent text-xl font-bold leading-none">✦</span>
          <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
        </div>
        <p className="text-faint text-xs mt-1.5">Champion Dashboard</p>
      </div>

      {/* Back to superuser */}
      {isSuperuser && (
        <Link
          href="/superuser/groups"
          onClick={onNavigate}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-muted hover:text-white border-b border-white/[0.08] transition-colors"
        >
          <span className="text-sm leading-none">‹</span>
          Back to dashboard
        </Link>
      )}

      {/* Group selector */}
      <div className="px-4 py-3 border-b border-white/[0.08]">
        {allGroups && allGroups.length > 1 ? (
          <select
            value={groupId}
            onChange={e => { router.push(`/champion/${e.target.value}/overview`); onNavigate?.() }}
            className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-accent cursor-pointer"
          >
            {allGroups.map(g => (
              <option key={g.group_id} value={g.group_id}>{g.group_name}</option>
            ))}
          </select>
        ) : (
          <div className="px-1">
            <p className="text-xs text-muted font-medium truncate">{groupName}</p>
            <p className="text-xs text-faint mt-0.5">Your group</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const href   = `/champion/${groupId}/${item.href}`
          const active = pathname === href
          return (
            <Link
              key={item.href}
              href={href}
              onClick={onNavigate}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-muted hover:text-white hover:bg-white/[0.04]'
              )}
            >
              <span className="text-base leading-none w-4 text-center opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-5 pt-2 border-t border-white/[0.08] shrink-0">
        <SignOutButton />
      </div>
    </>
  )
}

export function Sidebar({ groupId, groupName, allGroups = [], isSuperuser = false }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const props = { groupId, groupName, allGroups, isSuperuser }

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 min-h-screen bg-surface-low border-r border-white/[0.08] flex-col">
        <SidebarContent {...props} />
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────── */}
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
        <span className="text-white font-semibold text-sm tracking-tight">{groupName}</span>
      </div>

      {/* ── Mobile drawer overlay ───────────────────────────── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
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
            <div className="flex-1 flex flex-col overflow-hidden">
              <SidebarContent {...props} onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
