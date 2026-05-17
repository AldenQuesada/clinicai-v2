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
    <header
      className="hidden md:flex h-14 items-center gap-3 border-b px-6"
      style={{
        background: 'hsl(var(--card))',
        borderBottomColor: 'hsl(var(--border))',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/crm"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          CRM
        </Link>
        <span className="text-[hsl(var(--muted-foreground))]">/</span>
        <span className="font-medium text-[hsl(var(--foreground))]">
          {breadcrumb}
        </span>
      </div>

      {/* Busca global · placeholder · disabled */}
      <div
        className="relative ml-6 flex items-center"
        title="Busca global · em validação"
      >
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
        <input
          type="text"
          disabled
          placeholder="Buscar leads, pacientes…"
          aria-label="Busca global (em validação)"
          className="w-72 cursor-not-allowed rounded-md border bg-transparent py-1.5 pl-8 pr-12 text-xs text-[hsl(var(--muted-foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
          style={{ borderColor: 'hsl(var(--border))' }}
        />
        <kbd
          className="absolute right-2 rounded px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--muted-foreground))]"
          style={{
            background: 'hsl(var(--muted))',
            border: '1px solid hsl(var(--border))',
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
        className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white opacity-90"
        style={{
          background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
          boxShadow: '0 2px 8px rgba(220,38,38,0.20)',
        }}
      >
        <Moon className="h-3.5 w-3.5" />
        Fechar o Dia
      </button>

      {/* Notificações · read-only */}
      <button
        type="button"
        disabled
        title="Notificações · em validação"
        aria-label="Notificações"
        className="relative inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md text-[hsl(var(--muted-foreground))]"
      >
        <Bell className="h-4 w-4" />
      </button>

      {/* Tasks · read-only */}
      <button
        type="button"
        disabled
        title="Tarefas · em validação"
        aria-label="Tarefas"
        className="relative inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md text-[hsl(var(--muted-foreground))]"
      >
        <CheckSquare className="h-4 w-4" />
      </button>

      {/* + Novo dropdown · só rotas existentes */}
      <details ref={newDropdownRef} className="relative">
        <summary
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, #C9A96E, #A8895E)',
            listStyle: 'none',
            boxShadow: '0 2px 8px rgba(201,169,110,0.20)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo
          <ChevronDown className="h-3 w-3" />
        </summary>
        <nav
          className="absolute right-0 top-11 z-40 flex w-52 flex-col gap-0.5 rounded-md border bg-[hsl(var(--card))] p-1.5"
          style={{
            borderColor: 'hsl(var(--border))',
            boxShadow: 'var(--lara-shadow-md)',
          }}
        >
          {NEW_DROPDOWN_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2.5 py-1.5 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </details>

      {/* Avatar + nome + role */}
      <div className="flex items-center gap-2.5 border-l pl-4" style={{ borderLeftColor: 'hsl(var(--border))' }}>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
          }}
          title={displayName}
        >
          {initials}
        </div>
        <div className="hidden lg:flex flex-col leading-none">
          <span className="text-xs font-medium text-[hsl(var(--foreground))]">
            {displayName}
          </span>
          {role && (
            <span className="text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              {role}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
