'use client'

/**
 * LeadsKanban · BLOCO 3.1 · client component com drag-drop @dnd-kit.
 *
 * 3 colunas do pipeline `evolution` (novo · em_conversa · em_negociacao).
 * Drag-end dispara Server Action `moveLeadKanbanStageAction` que chama
 * RPC `sdr_move_lead` · UPSERT em lead_pipeline_positions.
 *
 * Filtros (search + temperature) via URL searchParams · padrão V2.
 *
 * Optimistic update simples: ao começar drag, lead some da origem;
 * ao confirmar via server, refresh router. Se erro, toast warning.
 */

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Button, Input, Select, useToast } from '@clinicai/ui'
import { Phone, MessageCircle, ExternalLink, Search } from 'lucide-react'
import type { KanbanLeadCard, KanbanStageRpc } from '@clinicai/repositories'
import { moveLeadKanbanStageAction } from '../_actions'

const STAGE_LABEL_PT: Record<string, string> = {
  novo: 'Novo',
  em_conversa: 'Em conversa',
  em_negociacao: 'Em negociação',
}

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

interface LeadsKanbanProps {
  stages: KanbanStageRpc[]
  currentQuery: string
  currentTemperature: string
}

export function LeadsKanban({ stages, currentQuery, currentTemperature }: LeadsKanbanProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [busyLeadId, setBusyLeadId] = React.useState<string | null>(null)
  const [searchInput, setSearchInput] = React.useState(currentQuery)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // ── Sincroniza URL searchParams ───────────────────────────────────────────
  function updateUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '' || v === 'all') params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateUrl({ q: searchInput.trim() })
  }

  function handleTempChange(e: React.ChangeEvent<HTMLSelectElement>) {
    updateUrl({ temperature: e.target.value })
  }

  // ── Drag-end · chama Server Action e revalida ────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const stageSlug = String(over.id)

    // Validar stage destino
    if (!['novo', 'em_conversa', 'em_negociacao'].includes(stageSlug)) return

    // No-op se mesma coluna · find origem
    const fromStage = stages.find((s) => s.leads.some((l) => l.id === leadId))
    if (fromStage?.slug === stageSlug) return

    setBusyLeadId(leadId)
    try {
      const r = await moveLeadKanbanStageAction({
        leadId,
        stageSlug: stageSlug as 'novo' | 'em_conversa' | 'em_negociacao',
        origin: 'drag',
      })
      if (!r.ok) {
        toast.error(`Falha ao mover lead · ${r.error}`)
        return
      }
      toast.success(`Lead movido para "${STAGE_LABEL_PT[stageSlug] ?? stageSlug}"`)
      router.refresh()
    } catch (e) {
      toast.error(`Erro inesperado · ${(e as Error).message}`)
    } finally {
      setBusyLeadId(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Buscar
          </Button>
          {currentQuery && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('')
                updateUrl({ q: null })
              }}
            >
              Limpar
            </Button>
          )}
        </form>
        <Select
          value={currentTemperature}
          onChange={handleTempChange}
          className="sm:w-48"
          aria-label="Filtrar temperatura"
        >
          <option value="all">Todas as temperaturas</option>
          <option value="hot">Quente</option>
          <option value="warm">Morno</option>
          <option value="cold">Frio</option>
        </Select>
      </div>

      {/* Kanban grid */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stages.length === 0 ? (
            <div className="md:col-span-3 rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
              Pipeline <code>evolution</code> não encontrado. Verifique se as
              tabelas <code>pipelines</code> e <code>pipeline_stages</code> têm
              seed pra esta clínica.
            </div>
          ) : (
            stages.map((stage) => (
              <KanbanColumn
                key={stage.slug}
                stage={stage}
                busyLeadId={busyLeadId}
              />
            ))
          )}
        </div>
      </DndContext>
    </div>
  )
}

// ── Coluna droppable ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  stage: KanbanStageRpc
  busyLeadId: string | null
}

function KanbanColumn({ stage, busyLeadId }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.slug })
  const label = STAGE_LABEL_PT[stage.slug] ?? stage.label
  const headerColor = stage.color || 'var(--primary)'

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[400px] flex-col rounded-md border bg-[var(--card)] transition-colors ${
        isOver
          ? 'border-[var(--primary)]/60 ring-2 ring-inset ring-[var(--primary)]/30'
          : 'border-[var(--border)]'
      }`}
    >
      <div
        className="flex items-center justify-between rounded-t-md border-b border-[var(--border)] px-3 py-2"
        style={{ borderTopColor: headerColor, borderTopWidth: 3 }}
      >
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
          {stage.leads.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {stage.leads.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
            Nenhum lead nesta etapa.
            <br />
            Arraste um card aqui pra mover.
          </div>
        ) : (
          stage.leads.map((lead) => (
            <LeadKanbanCard
              key={lead.id}
              lead={lead}
              busy={busyLeadId === lead.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Card draggable ───────────────────────────────────────────────────────────

interface LeadKanbanCardProps {
  lead: KanbanLeadCard
  busy: boolean
}

function LeadKanbanCard({ lead, busy }: LeadKanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: lead.id,
    disabled: busy,
  })
  const temp = lead.temperature ? TEMPERATURE_TONE[lead.temperature] : undefined
  const tempLabel = lead.temperature ? TEMPERATURE_LABEL[lead.temperature] : null
  // BLOCO 3.1A · lead sem posição na pipeline (fallback do repo)
  const isUnpositioned = lead.isUnpositioned === true

  const style: React.CSSProperties = {
    opacity: isDragging || busy ? 0.5 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: busy ? 'wait' : isDragging ? 'grabbing' : 'grab',
    borderLeftWidth: 3,
    borderLeftColor: temp ? 'currentColor' : 'var(--border)',
  }

  // WhatsApp link · NÃO envia · só abre wa.me na nova aba (intent)
  const waHref = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`select-none rounded-md border bg-[var(--background)] p-3 shadow-luxury-sm transition-shadow hover:shadow-luxury-md ${
        temp ? temp.text : ''
      }`}
      role="article"
      aria-label={`Lead ${lead.name}`}
    >
      {/* Drag handle area · o card inteiro é draggable */}
      <div {...listeners} className="cursor-inherit">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-[var(--foreground)]">
            {lead.name || '(sem nome)'}
          </span>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {tempLabel && (
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${temp?.bg ?? ''} ${temp?.border ?? ''}`}
              >
                {tempLabel}
              </span>
            )}
            {isUnpositioned && (
              <span
                className="rounded-full border border-dashed border-[var(--muted-foreground)]/40 bg-[var(--muted)]/40 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-[var(--muted-foreground)]"
                title="Lead ainda sem posição no pipeline. Ao arrastar, a posição passa a ser persistida."
              >
                Sem posição
              </span>
            )}
          </div>
        </div>
        {lead.phone && (
          <p className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">
            {lead.phone}
          </p>
        )}
        {lead.phase && (
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
            phase: <code>{lead.phase}</code>
            {lead.priority && lead.priority !== 'normal' && (
              <>
                {' · '}
                <span className="font-semibold">
                  {lead.priority === 'urgent' ? 'urgente' : 'alta'}
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Actions inline (não-draggable) */}
      <div
        className="mt-2 flex items-center gap-1 border-t border-[var(--border)] pt-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <a
          href={`/leads/${lead.id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          title="Abrir detalhe do lead"
          aria-label="Abrir lead"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir
        </a>
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
            title="Abrir conversa no WhatsApp (não envia mensagem)"
            aria-label="WhatsApp do lead"
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp
          </a>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            title="Ligar"
            aria-label="Ligar pro lead"
          >
            <Phone className="h-3 w-3" />
            Ligar
          </a>
        )}
      </div>
    </div>
  )
}
