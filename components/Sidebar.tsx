'use client'

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
  { label: 'Overview',   href: 'overview',   icon: '◎' },
  { label: 'Members',    href: 'members',    icon: '⊹' },
  { label: 'Messaging',  href: 'messaging',  icon: '✉' },
  { label: 'AI Assist',  href: 'ai-assist',  icon: '✦' },
  { label: 'Activities',  href: 'activities',  icon: '◇' },
  { label: 'Tag Refresh', href: 'tag-refresh', icon: '✺' },
  { label: 'Content',    href: 'content',    icon: '⊞' },
]

export function Sidebar({ groupId, groupName, allGroups = [], isSuperuser = false }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <aside className="
      w-56 shrink-0 min-h-screen bg-surface-low
      border-r border-white/[0.08]
      flex flex-col
    ">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <span className="text-accent text-xl font-bold leading-none">✦</span>
          <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
        </div>
        <p className="text-faint text-xs mt-1.5">Champion Dashboard</p>
      </div>

      {/* Back to superuser dashboard (only for superusers viewing a group) */}
      {isSuperuser && (
        <Link
          href="/superuser/groups"
          className="
            flex items-center gap-2 px-5 py-2.5
            text-xs font-medium text-muted hover:text-white
            border-b border-white/[0.08] transition-colors
          "
        >
          <span className="text-sm leading-none">‹</span>
          Back to dashboard
        </Link>
      )}

      {/* Group selector */}
      <div className="px-4 py-3 border-b border-white/[0.08]">
        {allGroups.length > 1 ? (
          <select
            value={groupId}
            onChange={e => router.push(`/champion/${e.target.value}/overview`)}
            className="
              w-full bg-surface-high border border-white/[0.08] rounded-lg
              px-3 py-2 text-white text-xs font-medium
              focus:outline-none focus:border-accent cursor-pointer
            "
          >
            {allGroups.map(g => (
              <option key={g.group_id} value={g.group_id}>
                {g.group_name}
              </option>
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
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map(item => {
          const href    = `/champion/${groupId}/${item.href}`
          const active  = pathname === href

          return (
            <Link
              key={item.href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-muted hover:text-white hover:bg-white/[0.04]'
              )}
            >
              <span className="text-base leading-none w-4 text-center opacity-70">
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-5 pt-2 border-t border-white/[0.08]">
        <SignOutButton />
      </div>
    </aside>
  )
}
