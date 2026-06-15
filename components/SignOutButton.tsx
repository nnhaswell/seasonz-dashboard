'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
        text-muted hover:text-white hover:bg-white/[0.04] transition-colors
      "
    >
      <span className="text-base leading-none w-4 text-center opacity-70">↩</span>
      Sign out
    </button>
  )
}
