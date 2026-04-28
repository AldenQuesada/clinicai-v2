/**
 * CRM layout · sidebar fixa desktop + top bar mobile.
 *
 * Auth obrigatoria · loadServerContext throw 401 se sem JWT (middleware
 * Lara ja redireciona pra /login). ToastProvider envolve tudo pra Server
 * Actions usarem useToast nas client components filhas.
 *
 * Nav fixo:
 *   - /crm           → dashboard (cards + KPIs)
 *   - /crm/leads     → kanban + lista leads ativos
 *   - /crm/pacientes → lista pacientes
 *   - /crm/agenda    → calendario semanal
 *   - /crm/orcamentos → lista orcamentos abertos
 *
 * Camada 6 entrega o layout · pages das listas/forms entram nas Camadas 7-9.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ToastProvider } from '@clinicai/ui'
import { loadServerContext } from '@clinicai/supabase'
import { CrmSidebarNav, CrmMobileNav } from './_components/crm-nav'

interface CrmLayoutProps {
  children: React.ReactNode
}

export default async function CrmLayout({ children }: CrmLayoutProps) {
  // Auth gate · loadServerContext throw quando sem JWT/clinic. Em vez de
  // deixar virar 500 unfriendly, redirect explicito pra /login (middleware
  // Lara fecha auth flow). Camada 6 audit fix.
  let ctx
  try {
    const result = await loadServerContext()
    ctx = result.ctx
  } catch {
    redirect('/login?next=/crm')
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        {/* Sidebar desktop · fixa esquerda · 64px collapsed nao implementado nesta camada */}
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]">
          <Link
            href="/crm"
            className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-4"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-[var(--primary)] text-[var(--primary-foreground)] font-display-uppercase text-sm">
              C
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display-uppercase text-xs tracking-widest text-[var(--foreground)]">
                CRM
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Clínica Mirian
              </span>
            </div>
          </Link>

          <CrmSidebarNav />

          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
              Clínica
            </p>
            <p
              className="mt-0.5 truncate text-xs text-[var(--foreground)]"
              title={ctx.clinic_id}
            >
              {ctx.clinic_id.slice(0, 8)}…
            </p>
            {ctx.role && (
              <p className="mt-1 text-[10px] text-[var(--muted-foreground)] capitalize">
                {ctx.role}
              </p>
            )}
          </div>
        </aside>

        {/* Top bar mobile + content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 md:hidden">
            <Link href="/crm" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-[var(--primary)] text-[var(--primary-foreground)] font-display-uppercase text-xs">
                C
              </div>
              <span className="font-display-uppercase text-xs tracking-widest text-[var(--foreground)]">
                CRM
              </span>
            </Link>
            <CrmMobileNav />
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}

