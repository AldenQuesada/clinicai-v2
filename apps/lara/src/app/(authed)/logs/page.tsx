'use client'

/**
 * /logs · Logs de Transferencias WhatsApp.
 *
 * Pagina global de auditoria · consome GET /api/logs/assignment-events.
 * Mig 148 view + Mig 149 grants · API Onda 822b78e.
 *
 * Filtros: q · action · fromOwner · toOwner · actorRole · dateFrom · dateTo
 * · includeTechnical (toggle).
 * Refresh manual via botao · sem polling automatico.
 *
 * Profile_changed eh "Tecnico" · visualmente discreto (opacity reduzida).
 * Conversation_id vem na resposta · botao "Abrir conversa" leva pra
 * /conversas (busca manual pelo phone · paginas /conversas e /secretaria
 * usam state local, sem suporte a ?conv=).
 */

import { useState } from 'react'
import Link from 'next/link'
import { History, Filter, RefreshCw, ExternalLink, Search, X } from 'lucide-react'
import {
  useAssignmentLogs,
  DEFAULT_FILTERS,
  type LogsFilters,
  type LogsAction,
  type LogsOwner,
  type LogsActorRole,
  type AssignmentLogItem,
} from './hooks/useAssignmentLogs'

const OWNER_LABELS: Record<string, string> = {
  secretaria: 'Secretaria',
  alden: 'Alden',
  mirian: 'Mirian',
  luciana: 'Luciana',
  responsavel: 'Responsável',
}

const ACTION_LABELS: Record<string, string> = {
  assigned: 'Transferência',
  returned: 'Devolução',
  reassigned: 'Reatribuição',
  profile_changed: 'Técnico',
  updated: 'Atualização',
}

const ACTOR_OPTIONS: Array<{ value: LogsActorRole; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'anon', label: 'Anon' },
]

const OWNER_OPTIONS: Array<{ value: LogsOwner; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'secretaria', label: 'Secretaria' },
  { value: 'alden', label: 'Alden' },
  { value: 'mirian', label: 'Mirian' },
  { value: 'luciana', label: 'Luciana' },
  { value: 'responsavel', label: 'Responsável' },
]

const ACTION_OPTIONS: Array<{ value: LogsAction; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'assigned', label: 'Transferência' },
  { value: 'returned', label: 'Devolução' },
  { value: 'reassigned', label: 'Reatribuição' },
  { value: 'profile_changed', label: 'Técnico' },
]

function ownerLabel(owner: string | null | undefined): string {
  if (!owner) return 'Responsável'
  return OWNER_LABELS[owner] ?? 'Responsável'
}

function formatAuditAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeEvent(e: AssignmentLogItem): { text: string; isTechnical: boolean } {
  const fromOwner = ownerLabel(e.from_owner)
  const toOwner = ownerLabel(e.to_owner)
  const fromName = e.from_assigned_to_name?.trim() || fromOwner
  const toName = e.to_assigned_to_name?.trim() || toOwner

  switch (e.assignment_action) {
    case 'assigned':
      return { text: `${fromOwner} transferiu para ${toName}`, isTechnical: false }
    case 'returned':
      return { text: `${fromName} devolveu para ${toOwner}`, isTechnical: false }
    case 'reassigned':
      return { text: `Responsável alterado de ${fromName} para ${toName}`, isTechnical: false }
    case 'profile_changed':
      return { text: `Perfil técnico atualizado: ${fromName} → ${toName}`, isTechnical: true }
    case 'updated':
    default:
      return { text: 'Atualização de atribuição', isTechnical: true }
  }
}

function actionBadge(action: string): { label: string; color: string } {
  const label = ACTION_LABELS[action] ?? action
  switch (action) {
    case 'assigned':
      return { label, color: 'primary' }
    case 'returned':
      return { label, color: 'accent' }
    case 'reassigned':
      return { label, color: 'warning' }
    case 'profile_changed':
    case 'updated':
      return { label, color: 'muted' }
    default:
      return { label, color: 'muted' }
  }
}

export default function LogsPage() {
  const [filters, setFilters] = useState<LogsFilters>(DEFAULT_FILTERS)
  const { items, count, isLoading, isError, hasFetched, refresh } = useAssignmentLogs(filters)

  const transferCount = items.filter((e) => e.assignment_action === 'assigned').length
  const returnCount = items.filter((e) => e.assignment_action === 'returned').length
  const technicalCount = items.filter(
    (e) => e.assignment_action === 'profile_changed' || e.assignment_action === 'updated',
  ).length

  function update<K extends keyof LogsFilters>(key: K, value: LogsFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  const hasAnyFilter =
    filters.q !== '' ||
    filters.action !== '' ||
    filters.fromOwner !== '' ||
    filters.toOwner !== '' ||
    filters.actorRole !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.includeTechnical !== DEFAULT_FILTERS.includeTechnical

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--bg-0,0_0%_4%))] overflow-y-auto">
      {/* HEADER */}
      <header className="border-b border-white/[0.06] px-6 py-5 bg-[hsl(var(--chat-panel-bg))]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-[hsl(var(--primary))]/[0.08] text-[hsl(var(--primary))]">
              <History className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="font-display text-[18px] text-[hsl(var(--foreground))] leading-tight">
                Logs de Transferências
              </h1>
              <p className="text-[12px] text-[hsl(var(--muted-foreground))] leading-snug mt-0.5">
                Histórico de transferências e devoluções de conversas no WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            title="Atualizar logs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-white/[0.02] border border-white/[0.06] text-[hsl(var(--foreground))]/80 hover:bg-white/[0.04] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            Atualizar
          </button>
        </div>
      </header>

      <div className="px-6 py-5 space-y-5 max-w-[1400px] w-full mx-auto">
        {/* CARDS DE RESUMO */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total carregado" value={count} color="foreground" />
          <SummaryCard label="Transferências" value={transferCount} color="primary" />
          <SummaryCard label="Devoluções" value={returnCount} color="accent" />
          {filters.includeTechnical && (
            <SummaryCard label="Técnicos" value={technicalCount} color="muted" />
          )}
        </div>

        {/* FILTROS */}
        <div className="rounded-lg bg-[hsl(var(--chat-panel-bg))] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            <span className="font-meta uppercase text-[10px] tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Filtros
            </span>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" strokeWidth={2} />
                Limpar filtros
              </button>
            )}
          </div>

          {/* Linha 1 · busca + tipo + ator */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="md:col-span-2 relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]"
                strokeWidth={1.5}
              />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => update('q', e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-md py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:border-[hsl(var(--primary))]/40 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60"
              />
            </div>
            <SelectField
              label="Tipo"
              value={filters.action}
              options={ACTION_OPTIONS}
              onChange={(v) => update('action', v as LogsAction)}
            />
            <SelectField
              label="Ator"
              value={filters.actorRole}
              options={ACTOR_OPTIONS}
              onChange={(v) => update('actorRole', v as LogsActorRole)}
            />
          </div>

          {/* Linha 2 · origem + destino + datas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <SelectField
              label="Origem"
              value={filters.fromOwner}
              options={OWNER_OPTIONS}
              onChange={(v) => update('fromOwner', v as LogsOwner)}
            />
            <SelectField
              label="Destino"
              value={filters.toOwner}
              options={OWNER_OPTIONS}
              onChange={(v) => update('toOwner', v as LogsOwner)}
            />
            <DateField
              label="Data inicial"
              value={filters.dateFrom}
              onChange={(v) => update('dateFrom', v)}
            />
            <DateField
              label="Data final"
              value={filters.dateTo}
              onChange={(v) => update('dateTo', v)}
            />
          </div>

          {/* Linha 3 · toggle tecnico */}
          <label className="flex items-center gap-2 cursor-pointer text-[11.5px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] select-none w-fit">
            <input
              type="checkbox"
              checked={filters.includeTechnical}
              onChange={(e) => update('includeTechnical', e.target.checked)}
              className="cursor-pointer"
            />
            Incluir eventos técnicos (perfil/atualização)
          </label>
        </div>

        {/* TABELA · estados */}
        <div className="rounded-lg bg-[hsl(var(--chat-panel-bg))] border border-white/[0.06] overflow-hidden">
          {isLoading && !hasFetched && (
            <div className="px-4 py-8 text-center text-[12px] text-[hsl(var(--muted-foreground))]">
              Carregando logs...
            </div>
          )}

          {!isLoading && isError && (
            <div className="px-4 py-8 text-center text-[12px] text-[hsl(var(--muted-foreground))]">
              Não foi possível carregar os logs agora.
            </div>
          )}

          {!isError && hasFetched && items.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-[hsl(var(--muted-foreground))] italic">
              Nenhum log encontrado para os filtros selecionados.
            </div>
          )}

          {!isError && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Data/hora
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Evento
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Conversa/Paciente
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Telefone
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Origem
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Destino
                    </th>
                    <th className="text-left font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Ator
                    </th>
                    <th className="text-right font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))] px-3 py-2">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, idx) => {
                    const { text, isTechnical } = describeEvent(e)
                    const badge = actionBadge(e.assignment_action)
                    const colorVar = `hsl(var(--${badge.color}))`
                    return (
                      <tr
                        key={`${e.audit_at}-${idx}`}
                        className={`border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors ${
                          isTechnical ? 'opacity-65' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono tabular-nums text-[10.5px] text-[hsl(var(--muted-foreground))]">
                          {formatAuditAt(e.audit_at)}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex shrink-0 px-2 py-0.5 rounded-full text-[9.5px] font-meta uppercase tracking-[0.14em] border"
                              style={{
                                color: colorVar,
                                background: colorVar.replace(')', ' / 0.10)'),
                                borderColor: colorVar.replace(')', ' / 0.25)'),
                              }}
                            >
                              {badge.label}
                            </span>
                            <span className="text-[12px] text-[hsl(var(--foreground))] leading-snug">
                              {text}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top text-[hsl(var(--foreground))]/90">
                          {e.display_name || (
                            <span className="italic text-[hsl(var(--muted-foreground))]/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top font-mono tabular-nums text-[11px] text-[hsl(var(--muted-foreground))]">
                          {e.phone || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-top text-[hsl(var(--foreground))]/80">
                          {ownerLabel(e.from_owner)}
                        </td>
                        <td className="px-3 py-2.5 align-top text-[hsl(var(--foreground))]/80">
                          {ownerLabel(e.to_owner)}
                        </td>
                        <td className="px-3 py-2.5 align-top text-[hsl(var(--muted-foreground))] uppercase font-meta text-[9.5px] tracking-[0.14em]">
                          {e.actor_role || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                          {e.conversation_id ? (
                            <Link
                              href={`/secretaria?conversationId=${e.conversation_id}`}
                              title="Abrir conversa direto na inbox secretaria"
                              className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--primary))] hover:underline cursor-pointer"
                            >
                              Abrir conversa
                              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                            </Link>
                          ) : (
                            <span className="text-[11px] text-[hsl(var(--muted-foreground))]/60">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const colorVar = `hsl(var(--${color}))`
  return (
    <div
      className="rounded-lg bg-[hsl(var(--chat-panel-bg))] border border-white/[0.06] px-4 py-3"
      style={{ background: colorVar.replace(')', ' / 0.04)') }}
    >
      <div
        className="font-meta uppercase text-[9.5px] tracking-[0.14em]"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {label}
      </div>
      <div className="font-display text-[22px] mt-0.5" style={{ color: colorVar }}>
        {value}
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/[0.02] border border-white/[0.06] rounded-md py-1.5 px-2 text-[12px] focus:outline-none focus:border-[hsl(var(--primary))]/40 text-[hsl(var(--foreground))] cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[hsl(var(--chat-panel-bg))]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-meta uppercase text-[9.5px] tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/[0.02] border border-white/[0.06] rounded-md py-1.5 px-2 text-[12px] focus:outline-none focus:border-[hsl(var(--primary))]/40 text-[hsl(var(--foreground))]"
      />
    </label>
  )
}
