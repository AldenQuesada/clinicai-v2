'use client'

/**
 * SevenDaysKanban · BLOCO 3.5B · client component READ-ONLY.
 *
 * 8 colunas do pipeline `seven_days` (sem_data..dia_7_plus) renderizadas em
 * scroll horizontal no desktop. NÃO há drag-drop · NÃO há mutation · NÃO há
 * useDraggable/useDroppable. Apenas leitura + filtros URL.
 *
 * Cards reaproveitam visual do Kanban Evolução (`KanbanLeadCard` shape do
 * repository) com adaptações: idade do lead em destaque + bucket badge.
 *
 * Filtros (search + temperature) via URL searchParams. Phase filter passa
 * pela RPC (parametrizada via `?phase=`).
 */

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button, Input, Select } from '@clinicai/ui'
import { Phone, MessageCircle, ExternalLink, Search } from 'lucide-react'
import type { KanbanLeadCard, KanbanStageRpc } from '@clinicai/repositories'
import { SEVEN_DAYS_STAGE_SEED } from '@clinicai/repositories'

const TEMPERATURE_TONE: Record<string, { bg: string; text: string; border: string }> = {
  hot: {
    bg: 'bg-red-500/10',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/40',
  },
  warm: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-500/40',
  },
  cold: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-500/40',
  },
}

const TEMPERATURE_LABEL: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
}

const STAGE_TONE_CLASS: Record<'neutral' | 'info' | 'warning' | 'danger', { border: string; bg: string; text: string }> = {
  neutral: {
    border: 'border-[var(--border)]',
    bg: 'bg-[var(--color-border-soft)]/30',
    text: 'text-[var(--muted-foreground)]',
  },
  info: {
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/5',
    text: 'text-sky-700 dark:text-sky-300',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    text: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

const PHASE_OPTIONS = [
  { value: '', label: 'Todas as fases' },
  { value: 'lead', label: 'Lead' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'paciente', label: 'Paciente' },
  { value: 'orcamento', label: 'Orçamento' },
]

interface Props {
  stages: KanbanStageRpc[]
  currentQuery: string
  currentTemperature: string
  currentPhase: string | null
}

export function SevenDaysKanban({
  stages,
  currentQuery,
  currentTemperature,
  currentPhase,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = React.useState(currentQuery)

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  function applySearch() {
    setParam('q', searchInput.trim() || null)
  }

  // Map slug → seed pra obter tone/label
  const seedBySlug = new Map(SEVEN_DAYS_STAGE_SEED.map((s) => [s.slug, s]))

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="sd-search"
            className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]"
          >
            Busca
          </label>
          <div className="flex items-center gap-1">
            <Input
              id="sd-search"
              type="search"
              placeholder="Nome ou telefone"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch()
              }}
              className="w-48"
            />
            <Button type="button" size="sm" onClick={applySearch}>
              <Search className="h-3 w-3" />
              Buscar
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Temperatura
          </label>
          <Select
            value={currentTemperature}
            onChange={(e) => setParam('temperature', e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="hot">🔥 Quente</option>
            <option value="warm">⚡ Morno</option>
            <option value="cold">❄ Frio</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Fase
          </label>
          <Select
            value={currentPhase ?? ''}
            onChange={(e) => setParam('phase', e.target.value || null)}
          >
            {PHASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {(currentQuery || currentTemperature !== 'all' || currentPhase) && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('')
              router.push(pathname)
            }}
            className="ml-auto rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* 8 colunas · scroll horizontal no desktop · lista vertical no mobile */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3">
          {stages.map((stage) => {
            const seed = seedBySlug.get(stage.slug)
            const tone = seed?.tone ?? 'neutral'
            const toneClass = STAGE_TONE_CLASS[tone]
            const hint = seed?.hint ?? ''
            return (
              <section
                key={stage.slug}
                className={`flex min-h-[240px] flex-col gap-2 rounded-md border ${toneClass.border} ${toneClass.bg} p-2`}
              >
                <header className="flex items-baseline justify-between gap-2 border-b border-dashed border-[var(--border)] pb-2">
                  <div className="min-w-0">
                    <h3 className={`font-display-uppercase text-xs tracking-widest ${toneClass.text}`}>
                      {stage.label}
                    </h3>
                    {hint ? (
                      <p className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
                        {hint}
                      </p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold tabular-nums ${toneClass.text}`}>
                    {stage.leads.length}
                  </span>
                </header>

                {stage.leads.length === 0 ? (
                  <p className="rounded border border-dashed border-[var(--border)] px-2 py-4 text-center text-[10px] text-[var(--muted-foreground)]">
                    Sem leads
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {stage.leads.map((lead) => (
                      <SevenDaysCard key={lead.id} lead={lead} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Card individual · read-only ───────────────────────────────────────────

function sanitizePhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

function leadAgeLabel(createdAt: string | null): string {
  if (!createdAt) return ''
  try {
    const ms = Date.now() - new Date(createdAt).getTime()
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    if (days <= 0) {
      const hours = Math.floor(ms / (60 * 60 * 1000))
      if (hours <= 0) return 'agora'
      return `há ${hours}h`
    }
    if (days === 1) return 'há 1 dia'
    return `há ${days} dias`
  } catch {
    return ''
  }
}

function SevenDaysCard({ lead }: { lead: KanbanLeadCard }) {
  const phoneDigits = sanitizePhone(lead.phone)
  const tempTone =
    lead.temperature && TEMPERATURE_TONE[lead.temperature]
      ? TEMPERATURE_TONE[lead.temperature]
      : null
  const age = leadAgeLabel(lead.created_at)

  return (
    <article className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 transition-all hover:border-[var(--primary)]/50 hover:shadow-luxury-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={`/leads/${lead.id}`}
            className="block truncate text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)]"
            title={lead.name ?? ''}
          >
            {lead.name?.trim() || '(sem nome)'}
          </a>
          {lead.phone ? (
            <p className="truncate text-[10px] text-[var(--muted-foreground)]">
              {lead.phone}
            </p>
          ) : null}
        </div>
        {tempTone ? (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${tempTone.bg} ${tempTone.text} ${tempTone.border}`}
            title={`Temperatura: ${lead.temperature}`}
          >
            {TEMPERATURE_LABEL[lead.temperature ?? ''] ?? lead.temperature}
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--muted-foreground)]">
        {lead.phase ? (
          <span className="rounded border border-[var(--border)] px-1 py-0.5 uppercase tracking-widest">
            {lead.phase}
          </span>
        ) : null}
        {age ? <span>⏱ {age}</span> : null}
        {lead.isUnpositioned ? (
          <span className="rounded border border-dashed border-amber-500/50 bg-amber-500/10 px-1 py-0.5 uppercase tracking-widest text-amber-700 dark:text-amber-300">
            Calculado
          </span>
        ) : null}
      </div>

      <footer className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
        <a
          href={`/leads/${lead.id}`}
          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
        >
          <ExternalLink className="h-3 w-3" />
          Lead
        </a>
        <a
          href="/crm/kanban"
          className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40"
          title="Ver no Kanban Evolução"
        >
          Evolução
        </a>
        {phoneDigits ? (
          <>
            <a
              href={`tel:+${phoneDigits}`}
              className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
              title="Ligar"
            >
              <Phone className="h-3 w-3" />
              Ligar
            </a>
            <a
              href={`https://wa.me/${phoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-display-uppercase tracking-widest text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              title="Abrir WhatsApp web (sem mensagem automática)"
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </a>
          </>
        ) : null}
      </footer>
    </article>
  )
}
