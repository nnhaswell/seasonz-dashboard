import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Explicit destination (e.g. password recovery → /auth/reset).
      // Only allow same-origin relative paths to avoid open redirects.
      if (next.startsWith('/') && next !== '/') {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // Fetch the user's role to decide where to redirect them
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_superuser')
          .eq('id', user.id)
          .single()

        if (profile?.is_superuser) {
          return NextResponse.redirect(`${origin}/superuser/overview`)
        }

        // Check for champion role
        const { data: championGroups } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('role', 'champion')

        if (championGroups && championGroups.length > 0) {
          const firstGroupId = championGroups[0].group_id
          return NextResponse.redirect(
            `${origin}/champion/${firstGroupId}/overview`
          )
        }

        // Logged in but no qualifying role
        return NextResponse.redirect(`${origin}/403`)
      }
    }
  }

  // Auth error — back to login with error param
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
