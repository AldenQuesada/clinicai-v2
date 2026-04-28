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
import { ToastProvider } from '@clinicai/ui'
import { loadServerContext } from '@clinicai/supabase'
import { LayoutDashboard, Users, Calendar, FileText, UserCircle } from 'lucide-react'

interface CrmLayoutProps {
  children: React.ReactNode
}

export default async function CrmLayout({ children }: CrmLayoutProps) {
  // Auth gate · throw 401 redireciona pro middleware tratar (login)
  const { ctx } = await loadServerContext()

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

          <nav className="flex flex-1 flex-col gap-0.5 p-2">
            <CrmNavLink href="/crm" icon={<LayoutDashboard className="w-4 h-4" />}>
              Dashboard
            </CrmNavLink>
            <CrmNavLink href="/crm/leads" icon={<UserCircle className="w-4 h-4" />}>
              Leads
            </CrmNavLink>
            <CrmNavLink href="/crm/pacientes" icon={<Users className="w-4 h-4" />}>
              Pacientes
            </CrmNavLink>
            <CrmNavLink href="/crm/agenda" icon={<Calendar className="w-4 h-4" />}>
              Agenda
            </CrmNavLink>
            <CrmNavLink href="/crm/orcamentos" icon={<FileText className="w-4 h-4" />}>
              Orçamentos
            </CrmNavLink>
          </nav>

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
            {/* Mobile drawer · TODO: extrair pra MobileNav component quando precisar */}
            <details className="ml-auto">
              <summary className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-[10px] font-display-uppercase tracking-widest text-[var(--foreground)]">
                Menu
              </summary>
              <nav className="absolute right-4 top-12 z-40 flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-luxury-md">
                <MobileNavLink href="/crm">Dashboard</MobileNavLink>
                <MobileNavLink href="/crm/leads">Leads</MobileNavLink>
                <MobileNavLink href="/crm/pacientes">Pacientes</MobileNavLink>
                <MobileNavLink href="/crm/agenda">Agenda</MobileNavLink>
                <MobileNavLink href="/crm/orcamentos">Orçamentos</MobileNavLink>
              </nav>
            </details>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}

function CrmNavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-3 rounded-md px-3 py-2 text-xs font-display-uppercase tracking-widest text-[var(--muted-foreground)] transition-colors hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]"
    >
      {icon}
      {children}
    </Link>
  )
}

function MobileNavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-xs font-display-uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]"
    >
      {children}
    </Link>
  )
}
