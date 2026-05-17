/**
 * CRM layout · shell light · R3_CRM_LIGHT_1 (2026-05-17).
 *
 * Mudança principal vs versão anterior:
 *   - Wrap raiz com `.crm-light-scope` (CSS vars invertidas pra light) ·
 *     apenas dentro do CRM, sem afetar Lara/Secretaria/Conversas.
 *   - Sidebar 224px → 56px · icon-only desktop · tooltip via title.
 *   - Topbar global clara (CrmTopbar) acima do main · breadcrumb + busca +
 *     Fechar Dia + Notificações + Tasks + "+ Novo" + avatar.
 *   - Mobile mantém drawer com labels (CrmMobileNav).
 *
 * Auth obrigatória · loadServerContext throw 401 se sem JWT (middleware
 * Lara redireciona pra /login).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ToastProvider } from '@clinicai/ui'
import { createServerClient, loadServerContext } from '@clinicai/supabase'
import { ProfileRepository } from '@clinicai/repositories'
import { CrmSidebarNav, CrmMobileNav } from './_components/crm-nav'
import { CrmTopbar } from './_components/crm-topbar'
import './_components/crm-light-scope.css'

interface CrmLayoutProps {
  children: React.ReactNode
}

export default async function CrmLayout({ children }: CrmLayoutProps) {
  // Auth gate · loadServerContext throw quando sem JWT/clinic. Em vez de
  // deixar virar 500 unfriendly, redirect explicito pra /login (middleware
  // Lara fecha auth flow).
  let ctx
  try {
    const result = await loadServerContext()
    ctx = result.ctx
  } catch {
    redirect('/login?next=/crm')
  }

  // Profile lookup pra topbar (avatar + nome + role).
  // Defensive · qualquer erro cai em fallback (não quebra o layout).
  let displayName = 'Usuário'
  let initials = 'U'
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        /* noop · ja autenticou via loadServerContext */
      },
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
      {/* R3_CRM_LIGHT_1A · escopo light isolado do resto do app */}
      <div className="crm-light-scope flex h-screen overflow-hidden">
        {/* R3_CRM_LIGHT_1B · sidebar rail dark 56px · icon-only desktop */}
        <aside className="crm-sidebar hidden md:flex" aria-label="Navegação CRM">
          {/* Logo monograma · centralizado · sem label */}
          <Link
            href="/crm"
            className="flex h-20 w-full items-center justify-center"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            title="CRM · Clínica Mirian"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
              style={{
                background: 'var(--crm-gold)',
                color: 'var(--crm-graphite)',
              }}
            >
              C
            </div>
          </Link>

          <CrmSidebarNav />

          {/* Footer · clinic_id curto · role pill */}
          <div
            className="border-t w-full px-2 py-3 text-center"
            style={{ borderTopColor: 'rgba(255,255,255,0.06)' }}
          >
            <p
              className="truncate text-[9px] uppercase tracking-widest"
              style={{ color: 'rgba(245,240,232,0.55)' }}
              title={ctx.clinic_id}
            >
              {ctx.clinic_id.slice(0, 4)}
            </p>
            {ctx.role && (
              <p
                className="mt-1 text-[8px] uppercase tracking-widest"
                style={{ color: 'rgba(200,169,126,0.85)' }}
                title={ctx.role}
              >
                {ctx.role.slice(0, 3)}
              </p>
            )}
          </div>
        </aside>

        {/* Topbar mobile compacto · drawer com labels */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header
            className="flex h-14 items-center gap-3 border-b px-4 md:hidden"
            style={{
              background: 'var(--crm-surface)',
              borderBottomColor: 'var(--crm-border)',
            }}
          >
            <Link href="/crm" className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: 'var(--crm-gold)',
                  color: '#FFFFFF',
                }}
              >
                C
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--crm-text)]">
                CRM
              </span>
            </Link>
            <CrmMobileNav />
          </header>

          {/* R3_CRM_LIGHT_1C · topbar global do CRM · desktop · 80px */}
          <CrmTopbar displayName={displayName} initials={initials} role={ctx.role ?? null} />

          {/* Conteúdo principal · padding 36/26 (contrato R3_CRM_LIGHT_2) */}
          <main
            className="crm-page flex-1 overflow-y-auto"
            style={{ background: 'var(--crm-bg)' }}
          >
            <div className="crm-content">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
