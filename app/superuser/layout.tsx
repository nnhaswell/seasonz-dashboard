import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const NAV = [
  { label: 'Overview',   href: '/superuser/overview',   icon: '◎' },
  { label: 'Users',      href: '/superuser/users',      icon: '⊹' },
  { label: 'Groups',     href: '/superuser/groups',     icon: '⊞' },
  { label: 'Champions',  href: '/superuser/champions',  icon: '✦' },
  { label: 'Summaries',  href: '/superuser/summaries',  icon: '♪' },
  { label: 'Activities', href: '/superuser/activities', icon: '◇' },
  { label: 'Waitlist',   href: '/superuser/waitlist',   icon: '✉' },
  { label: 'Analytics',  href: '/superuser/analytics',  icon: '∿' },
]

export default async function SuperuserLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superuser')
    .eq('id', user.id)
    .single()

  if (!profile?.is_superuser) redirect('/403')

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 min-h-screen bg-surface-low border-r border-white/[0.08] flex flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <span className="text-accent text-xl font-bold leading-none">✦</span>
            <span className="text-white font-semibold text-sm tracking-tight">Seasonz</span>
          </div>
          <p className="text-faint text-xs mt-1.5">Superuser Dashboard</p>
        </div>

        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <span className="text-base leading-none w-4 text-center opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 pb-5 pt-2 border-t border-white/[0.08]">
          <form action="/auth/signout" method="post">
            <button type="submit" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-white hover:bg-white/[0.04] transition-colors">
              <span className="text-base leading-none w-4 text-center opacity-70">↩</span>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  )
}
