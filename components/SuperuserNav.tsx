'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { label: 'Overview',   href: '/superuser/overview',   icon: '◎' },
  { label: 'Users',      href: '/superuser/users',      icon: '⊹' },
  { label: 'Groups',     href: '/superuser/groups',     icon: '⊞' },
  { label: 'Champions',  href: '/superuser/champions',  icon: '✦' },
  { label: 'Summaries',  href: '/superuser/summaries',  icon: '♪' },
  { label: 'Analytics',  href: '/superuser/analytics',  icon: '∿' },
]

export function SuperuserNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
      {NAV.map(item => {
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
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
  )
}
