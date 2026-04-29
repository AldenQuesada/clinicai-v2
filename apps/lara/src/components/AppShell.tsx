/**
 * AppShell · orquestrador server do (authed) layout.
 *
 * Estrutura (mirror Mira AppShell):
 *
 *   ┌──────┬─────────────────────────────────────────────────────────┐
 *   │ side │ AppHeaderThin (titulo + bell + Painel + UserMenu · 60px)│
 *   │ bar  ├─────────────────────────────────────────────────────────┤
 *   │ 56px │ children (page content · scroll proprio)                │
 *   └──────┴─────────────────────────────────────────────────────────┘
 *
 * Server component · carrega user + profile e passa pro Sidebar
 * (role) e UserMenu (perfil completo). Defensive · qualquer erro
 * cai pra fallback minimo (so children) sem quebrar a render.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { ProfileRepository } from '@clinicai/repositories'
import { AppSidebar } from './AppSidebar'
import { AppHeaderThin } from './AppHeaderThin'
import { NotificationPermissionBanner } from './NotificationPermissionBanner'
import type { UserMenuProfile } from './UserMenu'
import type { StaffRole } from '@/lib/permissions'

export async function AppShell({ children }: { children: React.ReactNode }) {
  let user: { id: string; email?: string } | null = null
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // ignore · esperado em Server Component
        }
      },
    })
    const result = await supabase.auth.getUser()
    user = result.data.user as { id: string; email?: string } | null
  } catch (e) {
    console.error('[AppShell] auth setup failed:', (e as Error).message)
    redirect('/login')
  }

  if (!user) redirect('/login')

  let firstName = ''
  let lastName = ''
  let role: StaffRole | null = null
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        /* noop · ja autenticou */
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = new ProfileRepository(supabase as any)
    const profile = await profiles.getById(user.id)
    firstName = profile?.firstName ?? ''
    // ProfileDTO atual nao expoe lastName · puxar direto se precisar.
    // Por agora exibe so firstName · suficiente pra header/dropdown.
    role = (profile?.role ?? null) as StaffRole | null
  } catch (e) {
    console.error('[AppShell] profile lookup failed:', (e as Error).message)
  }

  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    user.email?.split('@')[0] ||
    'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  const userMenuProfile: UserMenuProfile = {
    id: user.id,
    email: user.email ?? '',
    displayName: firstName || user.email?.split('@')[0] || 'Usuário',
    firstName,
    lastName,
    initials,
    role,
  }

  return (
    <div className="flex flex-1 min-h-0 w-full" style={{ minHeight: '100vh' }}>
      <AppSidebar role={role} />

      <div className="flex flex-col flex-1 min-w-0">
        <AppHeaderThin user={userMenuProfile} />
        <NotificationPermissionBanner />
        {children}
      </div>

      {/* hidden display name pra a11y · fallback se UserMenu nao montar */}
      <span style={{ display: 'none' }} aria-hidden>
        {displayName}
      </span>
    </div>
  )
}
