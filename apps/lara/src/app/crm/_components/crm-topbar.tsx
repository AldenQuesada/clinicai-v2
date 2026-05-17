'use client'

/**
 * CrmTopbar · header global do CRM · R3_CRM_LIGHT_1C.
 *
 * Espelha header do legacy clinic-dashboard:
 *   - Breadcrumb dinâmico (esquerda)
 *   - Busca global placeholder (centro · disabled · sem rota de busca ainda)
 *   - "Fechar o Dia" pill vermelho (disabled · vide audit abrirFecharDia)
 *   - Notificações (read-only · count placeholder 0)
 *   - Tasks (read-only · count placeholder 0)
 *   - "+ Novo" dropdown (3 itens · só rotas EXISTENTES: agenda/novo,
 *     pacientes/novo, orcamentos/novo · /crm/leads/novo NÃO existe e
 *     ficou fora)
 *   - Avatar + nome + role (passado do server via props)
 *
 * Mobile: oculto (mobile usa header reduzido do `crm/layout.tsx`).
 *
 * ZERO mutation · placeholders disabled onde não há action segura.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  CheckSquare,
  ChevronDown,
  Moon,
  Plus,
  Search,
} from 'lucide-react'

interface CrmTopbarProps {
  displayName: string
  initials: string
  role: string | null
}

const BREADCRUMB_LABELS: Record<string, string> = {
  '/crm': 'Home',
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

/** "+ Novo" dropdown items · apenas rotas REAIS confirmadas no FS (R3_CRM_LIGHT audit). */
const NEW_DROPDOWN_ITEMS: readonly { href: string; label: string }[] = [
  { href: '/crm/agenda/novo', label: 'Novo agendamento' },
  { href: '/crm/pacientes/novo', label: 'Novo paciente' },
  { href: '/crm/orcamentos/novo', label: 'Novo orçamento' },
  // `/crm/leads/novo` NÃO existe · removido pra não criar 404.
]

function deriveBreadcrumb(pathname: string): string {
  // Match exato em paths conhecidos · fallback "CRM" pra rotas dinâmicas.
  if (BREADCRUMB_LABELS[pathname]) return BREADCRUMB_LABELS[pathname]
  // Prefix match pra subrotas como /crm/agenda/[id]
  for (const [path, label] of Object.entries(BREADCRUMB_LABELS)) {
    if (pathname.startsWith(path + '/')) return label
  }
  return 'CRM'
}

export function CrmTopbar({ displayName, initials, role }: CrmTopbarProps) {
  const pathname = usePathname()
  const breadcrumb = deriveBreadcrumb(pathname ?? '/crm')
  const newDropdownRef = React.useRef<HTMLDetailsElement>(null)

  // Fecha dropdown ao mudar rota (clicou em algo).
  React.useEffect(() => {
    if (newDropdownRef.current?.open) {
      newDropdownRef.current.removeAttribute('open')
    }
  }, [pathname])

  return (
    <header className="crm-topbar hidden md:flex">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/crm"
          className="text-[color:var(--crm-muted)] hover:text-[color:var(--crm-text)]"
        >
          CRM
        </Link>
        <span className="text-[color:var(--crm-muted-2)]">/</span>
        <span className="font-semibold text-[color:var(--crm-text)]">
          {breadcrumb}
        </span>
      </div>

      {/* Busca global · placeholder · disabled · 350x44 */}
      <div
        className="relative ml-6 flex items-center"
        title="Busca global · em validação"
      >
        <Search className="absolute left-3 h-4 w-4 text-[color:var(--crm-muted-2)]" />
        <input
          type="text"
          disabled
          placeholder="Buscar leads, pacientes..."
          aria-label="Busca global (em validação)"
          className="h-11 w-[350px] cursor-not-allowed rounded-xl border bg-white pl-10 pr-14 text-sm text-[color:var(--crm-muted)] placeholder:text-[color:var(--crm-muted-2)]"
          style={{
            borderColor: 'var(--crm-border)',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        />
        <kbd
          className="absolute right-3 rounded px-2 py-0.5 text-[10px] font-semibold text-[color:var(--crm-muted)]"
          style={{
            background: '#F3F4F6',
            border: '1px solid var(--crm-border)',
          }}
        >
          ⌘K
        </kbd>
      </div>

      <div className="flex-1" />

      {/* Fechar o Dia · pill vermelho · disabled · audit legacy abrirFecharDia */}
      <button
        type="button"
        disabled
        title="Finalização do dia será ativada após validação do fluxo operacional."
        aria-label="Fechar o Dia (em validação)"
        className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-[10px] px-6 text-sm font-bold text-white opacity-95"
        style={{
          background: 'var(--crm-red)',
          boxShadow: '0 8px 18px rgba(220, 38, 38, 0.18)',
        }}
      >
        <Moon className="h-4 w-4" />
        Fechar o Dia
      </button>

      {/* Notificações · read-only */}
      <button
        type="button"
        disabled
        title="Notificações · em validação"
        aria-label="Notificações"
        className="relative inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-[10px] text-[color:var(--crm-muted)]"
        style={{
          background: 'var(--crm-surface)',
          border: '1px solid var(--crm-border)',
        }}
      >
        <Bell className="h-4 w-4" />
      </button>

      {/* Tasks · read-only */}
      <button
        type="button"
        disabled
        title="Tarefas · em validação"
        aria-label="Tarefas"
        className="relative inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-[10px] text-[color:var(--crm-muted)]"
        style={{
          background: 'var(--crm-surface)',
          border: '1px solid var(--crm-border)',
        }}
      >
        <CheckSquare className="h-4 w-4" />
      </button>

      {/* + Novo dropdown · só rotas existentes (R3_CRM_LIGHT_1 audit) */}
      <details ref={newDropdownRef} className="relative">
        <summary
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] px-6 text-sm font-bold text-white"
          style={{
            background: 'var(--crm-gold)',
            listStyle: 'none',
            boxShadow: '0 8px 18px rgba(200, 169, 126, 0.18)',
          }}
        >
          <Plus className="h-4 w-4" />
          Novo
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        <nav
          className="absolute right-0 top-14 z-40 flex w-56 flex-col gap-0.5 rounded-xl border bg-white p-1.5"
          style={{
            borderColor: 'var(--crm-border)',
            boxShadow: 'var(--lara-shadow-md)',
          }}
        >
          {NEW_DROPDOWN_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-[color:var(--crm-text)] hover:bg-[color:var(--crm-soft)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </details>

      {/* Avatar + nome + role */}
      <div
        className="flex items-center gap-3 pl-4 ml-2 border-l"
        style={{ borderLeftColor: 'var(--crm-border)' }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: 'var(--crm-purple)' }}
          title={displayName}
        >
          {initials}
        </div>
        <div className="hidden lg:flex flex-col leading-tight">
          <span className="text-sm font-semibold text-[color:var(--crm-text)]">
            {displayName}
          </span>
          {role && (
            <span className="text-xs text-[color:var(--crm-muted)] capitalize">
              {role}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
