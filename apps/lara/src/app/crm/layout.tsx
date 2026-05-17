/**
 * CRM layout · R3_CRM_LIGHT_5 (2026-05-17).
 *
 * Sidebar e Topbar transcritos LITERAL do clinic-dashboard:
 *   - Sidebar 260px (colapsado=64px default · localStorage 'crm_sidebar_collapsed')
 *   - Topbar 64px com breadcrumb + search + actions + theme toggle + avatar
 *
 * Server layout · auth + profile · passa hidratado pro CrmShell (client).
 * Sidebar default collapsed espelha legacy clinic-dashboard/js/sidebar.js L526.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ToastProvider } from '@clinicai/ui'
import { createServerClient, loadServerContext } from '@clinicai/supabase'
import { ProfileRepository } from '@clinicai/repositories'
import { CrmSidebarNav, CrmMobileNav } from './_components/crm-nav'
import { CrmTopbar } from './_components/crm-topbar'
import { CrmShell } from './_components/crm-shell'
import './_components/crm-light-scope.css'

interface CrmLayoutProps {
  children: React.ReactNode
}

export default async function CrmLayout({ children }: CrmLayoutProps) {
  let ctx
  try {
    const result = await loadServerContext()
    ctx = result.ctx
  } catch {
    redirect('/login?next=/crm')
  }

  let displayName = 'Usuário'
  let initials = 'U'
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    })
    const result = await supabase.auth.getUser()
    const user = result.data.user
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profiles = new ProfileRepository(supabase as any)
      const profile = await profiles.getById(user.id)
      const first = profile?.firstName ?? ''
      displayName = first || user.email?.split('@')[0] || 'Usuário'
      initials = (first || user.email || 'U').slice(0, 1).toUpperCase()
    }
  } catch (e) {
    console.error('[CrmLayout] profile lookup failed:', (e as Error).message)
  }

  return (
    <ToastProvider>
      <CrmShell
        logoText={
          <>
            <span className="sidebar-logo-name">ClinicAI</span>
            <span className="sidebar-logo-badge">Premium</span>
          </>
        }
        sidebarNav={<CrmSidebarNav />}
        sidebarFooter={
          <div className="sidebar-footer">
            <div className="sidebar-footer-avatar">MP</div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-name" title={ctx.clinic_id}>
                Clínica Mirian de Paula
              </span>
              <span className="sidebar-footer-plan">
                {ctx.role ? `Plano ${ctx.role}` : 'Plano Premium'}
              </span>
            </div>
          </div>
        }
        topbar={
          <CrmTopbar
            displayName={displayName}
            initials={initials}
            role={ctx.role ?? null}
          />
        }
        mobileHeader={
          <header
            className="flex h-14 items-center gap-3 border-b px-4 md:hidden"
            style={{
              background: 'var(--card)',
              borderBottomColor: 'var(--border)',
            }}
          >
            <Link href="/crm" className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark))',
                  color: '#fff',
                }}
              >
                C
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--text-primary)]">
                ClinicAI
              </span>
            </Link>
            <CrmMobileNav />
          </header>
        }
      >
        {children}
      </CrmShell>
    </ToastProvider>
  )
}
