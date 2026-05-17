'use client'

/**
 * CrmTopbar · header global do CRM · R3_CRM_LIGHT_5.
 *
 * LITERAL clinic-dashboard/index.html L125-240 + style.css L502-700.
 * Classes: .header / .header-breadcrumb / .breadcrumb-* / .header-spacer /
 *          .header-search / .search-icon / .search-input / .search-shortcut /
 *          .header-action / .header-action-btn / .badge / .btn-new /
 *          .theme-toggle / .avatar-btn / .avatar-circle / .avatar-info
 *
 * Mobile: oculto (mobile usa header reduzido do layout).
 * ZERO mutation · placeholders disabled onde sem action segura.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CheckSquare,
  ChevronDown,
  Home,
  Moon,
  Plus,
  Search,
} from 'lucide-react'
// PATCH_D · usar AlertBell real (appointment_internal_alerts mig 161
// + useAppointmentInternalAlerts hook polling 30s). Substitui o Bell
// disabled antigo que era apenas placeholder.
import { AlertBell } from '@/components/AlertBell'

interface CrmTopbarProps {
  displayName: string
  initials: string
  role: string | null
}

const BREADCRUMB_LABELS: Record<string, string> = {
  '/crm': 'CRM',
  '/crm/dashboard': 'Dashboard',
  '/crm/leads': 'Leads',
  '/crm/kanban': 'Kanban Evolution',
  '/crm/kanban/seven-days': 'Kanban 7 Dias',
  '/crm/mesa-operacional': 'Mesa Operacional',
  '/crm/agenda': 'Agenda',
  '/crm/pacientes': 'Pacientes',
  '/crm/orcamentos': 'Orçamentos',
  '/crm/recuperacao': 'Recuperação',
}

const NEW_DROPDOWN_ITEMS: readonly { href: string; label: string }[] = [
  { href: '/crm/agenda/novo', label: 'Novo agendamento' },
  { href: '/crm/pacientes/novo', label: 'Novo paciente' },
  { href: '/crm/orcamentos/novo', label: 'Novo orçamento' },
]

function deriveBreadcrumb(pathname: string): { section: string; current: string } {
  const section = 'CRM'
  if (BREADCRUMB_LABELS[pathname]) {
    return { section, current: BREADCRUMB_LABELS[pathname] }
  }
  for (const [path, label] of Object.entries(BREADCRUMB_LABELS)) {
    if (pathname.startsWith(path + '/')) {
      return { section, current: label }
    }
  }
  return { section, current: 'CRM' }
}

export function CrmTopbar({ displayName, initials, role }: CrmTopbarProps) {
  const pathname = usePathname()
  const { section, current } = deriveBreadcrumb(pathname ?? '/crm')
  const newDropdownRef = React.useRef<HTMLDetailsElement>(null)
  const avatarDropdownRef = React.useRef<HTMLDetailsElement>(null)

  React.useEffect(() => {
    if (newDropdownRef.current?.open) {
      newDropdownRef.current.removeAttribute('open')
    }
    if (avatarDropdownRef.current?.open) {
      avatarDropdownRef.current.removeAttribute('open')
    }
  }, [pathname])

  return (
    <header className="header hidden md:flex">
      {/* Breadcrumb · index.html L130-138 */}
      <div className="header-breadcrumb">
        <span className="breadcrumb-icon">
          <Home />
        </span>
        <span className="breadcrumb-sep">/</span>
        <Link
          href="/crm"
          className="breadcrumb-text"
          style={{ textDecoration: 'none' }}
        >
          {section}
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{current}</span>
      </div>

      {/* Search · index.html L143-160 · sem spacer antes · breadcrumb cola no search */}
      <div className="header-search">
        <span className="search-icon">
          <Search />
        </span>
        <input
          type="text"
          disabled
          placeholder="Buscar leads, pacientes... (⌘K)"
          title="Busca global · em validação · use os menus laterais por enquanto"
          aria-label="Busca global · em validação"
          className="search-input"
        />
        <span className="search-shortcut">⌘K</span>
      </div>

      {/* Fechar o Dia · index.html L164-170 LITERAL */}
      <button
        type="button"
        disabled
        title="Finalização do dia será ativada após validação do fluxo operacional."
        aria-label="Fechar o Dia (em validação)"
        className="fechar-dia-btn"
      >
        <Moon />
        Fechar o Dia
      </button>

      {/* Notificações · AlertBell real (mig 161 · polling 30s) ·
          PATCH_D substituiu placeholder disabled por dados reais */}
      <div className="header-action">
        <AlertBell />
      </div>

      {/* Tasks · em validação · PATCH_D: badge fake "24" removida ·
          title explicativo · index.html L188-193 */}
      <div className="header-action">
        <button
          type="button"
          disabled
          title="Tarefas · módulo em validação · sem dados reais ainda"
          aria-label="Tarefas · em validação"
          className="header-action-btn"
        >
          <CheckSquare />
        </button>
      </div>

      {/* + Novo dropdown · index.html L196-220 · LITERAL .btn-new */}
      <details ref={newDropdownRef} className="header-action">
        <summary
          className="btn-new"
          style={{ listStyle: 'none' }}
        >
          <Plus />
          <span>Novo</span>
          <ChevronDown style={{ width: 13, height: 13, opacity: 0.7 }} />
        </summary>
        <nav
          className="absolute right-0 top-11 z-40 flex w-56 flex-col gap-0.5 rounded-xl border bg-white p-1.5"
          style={{
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {NEW_DROPDOWN_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--bg)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </details>

      {/* Theme toggle · placeholder · index.html L223-225 */}
      <button
        type="button"
        disabled
        title="Tema escuro · recurso em preparação · não afeta a operação atual"
        aria-label="Alternar tema · em preparação"
        className="theme-toggle"
      >
        <Moon />
      </button>

      {/* Avatar · index.html L228-260 */}
      <details ref={avatarDropdownRef} className="header-action">
        <summary
          className="avatar-btn"
          style={{ listStyle: 'none' }}
        >
          <div className="avatar-circle" title={displayName}>
            {initials}
          </div>
          <div className="avatar-info">
            <span className="avatar-name">{displayName}</span>
            {role && <span className="avatar-role">{role}</span>}
          </div>
          <ChevronDown style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
        </summary>
      </details>
    </header>
  )
}
