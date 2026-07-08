import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SuperuserSidebar } from '@/components/SuperuserSidebar'

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
      <SuperuserSidebar />
      {/* pt-14 on mobile gives space below the fixed top bar; md:pt-0 removes it on desktop */}
      <main className="flex-1 min-w-0 p-4 pt-16 md:pt-8 md:p-8">
        {children}
      </main>
    </div>
  )
}
