import { createServerClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'

export const dynamic = 'force-dynamic'

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const userInfo = user
    ? {
        email: user.email ?? '—',
        isAdmin: allowlist.length === 0 || allowlist.includes((user.email ?? '').toLowerCase()),
      }
    : null

  return <Shell user={userInfo}>{children}</Shell>
}
