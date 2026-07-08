import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'

interface Props {
  children:  React.ReactNode
  params:    Promise<{ groupId: string }>
}

export default async function ChampionLayout({ children, params }: Props) {
  const { groupId } = await params
  const supabase    = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify caller is champion of this group (or superuser)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superuser')
    .eq('id', user.id)
    .single()

  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('group_id', groupId)
    .single()

  const hasAccess =
    profile?.is_superuser ||
    membership?.role === 'champion'

  if (!hasAccess) redirect('/403')

  // Fetch group name for the sidebar
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()

  // Fetch all groups this user champions (for the group switcher)
  const { data: allGroups } = await supabase
    .from('group_members')
    .select('group_id, groups(name)')
    .eq('user_id', user.id)
    .eq('role', 'champion')

  const groupList = (allGroups ?? []).map((row: any) => ({
    group_id:   row.group_id,
    group_name: row.groups?.name ?? 'Unknown',
  }))

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        groupId={groupId}
        groupName={group?.name ?? 'Your Group'}
        allGroups={groupList}
        isSuperuser={!!profile?.is_superuser}
      />
      <main className="flex-1 min-w-0 p-4 pt-16 md:pt-8 md:p-8">
        {children}
      </main>
    </div>
  )
}
