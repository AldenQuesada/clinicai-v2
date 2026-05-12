'use client'

/**
 * Cliente · lista de itens da fila de recuperação + filtros + ações inline.
 *
 * 3 ações disponíveis:
 *   - Reativar lead (apenas source_type='lead_lost')
 *   - Descartar permanente (apenas source_type='lead_lost')
 *   - Adicionar nota (apenas source_type='lead_lost')
 *
 * Para source_type appointment_cancelled/no_show · link p/ /crm/agenda/[id]/editar
 * Para source_type orcamento_frio · link p/ /crm/orcamentos/[id]
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type {
  CommercialRecoveryItemDTO,
  RecoveryPriority,
  RecoverySourceType,
  RecoveryStatus,
  RecoveryQueueCounts,
} from '@clinicai/repositories'
import { Button } from '@clinicai/ui'
import {
  reactivateRecoveryLeadAction,
  markRecoveryDiscardedAction,
  addRecoveryNoteAction,
} from './_actions'

const SOURCE_LABEL: Record<RecoverySourceType, string> = {
  lead_lost: 'Lead perdido',
  appointment_cancelled: 'Cancelado',
  appointment_no_show: 'No-show',
  orcamento_frio: 'Orçamento frio',
}

const PRIORITY_LABEL: Record<RecoveryPriority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  aberto: 'Aberto',
  recuperado: 'Recuperado',
  descartado: 'Descartado',
}

interface Props {
  items: CommercialRecoveryItemDTO[]
  counts: RecoveryQueueCounts
  currentFilter: {
    source: RecoverySourceType | 'all'
    status: RecoveryStatus | 'all'
    priority: RecoveryPriority | 'all'
  }
  canAct: boolean
}

export function RecoveryList({ items, counts, currentFilter, canAct }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setFilter(key: 'source' | 'status' | 'priority', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`/crm/recuperacao?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 text-xs">
        <FilterGroup
          label="Origem"
          value={currentFilter.source}
          onChange={(v) => setFilter('source', v)}
          options={[
            { value: 'all', label: `Todas (${counts.total})` },
            { value: 'lead_lost', label: `Perdidos (${counts.bySource.lead_lost})` },
            {
              value: 'appointment_cancelled',
              label: `Cancelado (${counts.bySource.appointment_cancelled})`,
            },
            {
              value: 'appointment_no_show',
              label: `No-show (${counts.bySource.appointment_no_show})`,
            },
            { value: 'orcamento_frio', label: `Orç. frio (${counts.bySource.orcamento_frio})` },
          ]}
        />
        <FilterGroup
          label="Status"
          value={currentFilter.status}
          onChange={(v) => setFilter('status', v)}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'aberto', label: `Aberto (${counts.byStatus.aberto})` },
            { value: 'recuperado', label: `Recuperado (${counts.byStatus.recuperado})` },
            { value: 'descartado', label: `Descartado (${counts.byStatus.descartado})` },
          ]}
        />
        <FilterGroup
          label="Prioridade"
          value={currentFilter.priority}
          onChange={(v) => setFilter('priority', v)}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'alta', label: `Alta (${counts.byPriority.alta})` },
            { value: 'media', label: `Média (${counts.byPriority.media})` },
            { value: 'baixa', label: `Baixa (${counts.byPriority.baixa})` },
          ]}
        />
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Nenhum item encontrado com os filtros atuais.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map((it) => (
            <RecoveryRow key={`${it.sourceType}_${it.itemId}`} item={it} canAct={canAct} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function RecoveryRow({
  item,
  canAct,
}: {
  item: CommercialRecoveryItemDTO
  canAct: boolean
}) {
  const [open, setOpen] = useState<null | 'reactivate' | 'discard' | 'note'>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const dateLabel = item.sourceEventAt
    ? new Date(item.sourceEventAt).toLocaleDateString('pt-BR')
    : '—'

  const priorityColor =
    item.priority === 'alta'
      ? 'text-[var(--destructive)]'
      : item.priority === 'media'
        ? 'text-[var(--warning,_#b45309)]'
        : 'text-[var(--muted-foreground)]'

  const isLeadLost = item.sourceType === 'lead_lost'
  const canActOnRow = canAct && item.status === 'aberto'

  return (
    <div className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{item.displayName ?? 'Sem nome'}</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            {SOURCE_LABEL[item.sourceType]}
          </span>
          <span className={`text-[10px] uppercase tracking-widest ${priorityColor}`}>
            {PRIORITY_LABEL[item.priority]}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-[var(--muted-foreground)]">
          <span>{dateLabel}</span>
          {item.phoneLast4 && <span>tel {item.phoneLast4}</span>}
          {item.reason && <span title={item.reason}>motivo: {truncate(item.reason, 60)}</span>}
        </div>
        {item.notes && (
          <p className="whitespace-pre-wrap text-[11px] text-[var(--muted-foreground)]">
            {truncate(item.notes, 200)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Source-specific navigation */}
        {item.sourceType === 'appointment_cancelled' || item.sourceType === 'appointment_no_show' ? (
          <Link href={`/crm/agenda/${item.appointmentId}/editar`}>
            <Button size="sm" variant="outline">
              Reagendar
            </Button>
          </Link>
        ) : null}
        {item.sourceType === 'orcamento_frio' ? (
          <Link href={`/crm/orcamentos/${item.orcamentoId}`}>
            <Button size="sm" variant="outline">
              Abrir orçamento
            </Button>
          </Link>
        ) : null}
        {item.leadId && (
          <Link href={`/crm/leads/${item.leadId}`}>
            <Button size="sm" variant="ghost">
              Ver lead
            </Button>
          </Link>
        )}

        {/* lead_lost actions */}
        {isLeadLost && canActOnRow && (
          <>
            <Button size="sm" onClick={() => setOpen('reactivate')}>
              Reativar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen('note')}>
              Anotar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen('discard')}>
              Descartar
            </Button>
          </>
        )}
      </div>

      {/* Inline dialogs */}
      {open === 'reactivate' && isLeadLost && item.leadId && (
        <ReactivateDialog
          leadId={item.leadId}
          onClose={() => setOpen(null)}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'discard' && isLeadLost && (
        <DiscardDialog
          perdidoId={item.itemId}
          onClose={() => setOpen(null)}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'note' && isLeadLost && (
        <NoteDialog
          perdidoId={item.itemId}
          onClose={() => setOpen(null)}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {error && (
        <p className="col-span-full text-xs text-[var(--destructive)]">Erro: {error}</p>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Dialog primitives (inline · sem dependência de modal lib) ───────────────

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-luxury-lg">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function ReactivateDialog({
  leadId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  leadId: string
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [reason, setReason] = useState('')
  const [toPhase, setToPhase] = useState<'lead' | 'agendado' | 'orcamento'>('lead')
  const router = useRouter()

  return (
    <DialogShell title="Reativar lead" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await reactivateRecoveryLeadAction({ leadId, toPhase, reason })
            if (r.ok) {
              onClose()
              router.refresh()
            } else {
              setError(r.error)
            }
          })
        }}
        className="space-y-3"
      >
        <div>
          <label className="text-[10px] uppercase tracking-widest">Phase destino</label>
          <select
            value={toPhase}
            onChange={(e) => setToPhase(e.target.value as 'lead' | 'agendado' | 'orcamento')}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          >
            <option value="lead">lead</option>
            <option value="agendado">agendado</option>
            <option value="orcamento">orcamento</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest">Motivo</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            minLength={3}
            maxLength={500}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Reativando…' : 'Reativar'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

function DiscardDialog({
  perdidoId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  perdidoId: string
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [reason, setReason] = useState('')
  const router = useRouter()

  return (
    <DialogShell title="Descartar permanente" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await markRecoveryDiscardedAction({ perdidoId, reason })
            if (r.ok) {
              onClose()
              router.refresh()
            } else {
              setError(r.error)
            }
          })
        }}
        className="space-y-3"
      >
        <p className="text-xs text-[var(--muted-foreground)]">
          Marca como descartado permanente (não recuperável). Uso típico:
          faleceu, opt-out, número errado.
        </p>
        <div>
          <label className="text-[10px] uppercase tracking-widest">Motivo</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            minLength={3}
            maxLength={500}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? 'Descartando…' : 'Descartar'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

function NoteDialog({
  perdidoId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  perdidoId: string
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [note, setNote] = useState('')
  const router = useRouter()

  return (
    <DialogShell title="Adicionar nota" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await addRecoveryNoteAction({ perdidoId, note })
            if (r.ok) {
              onClose()
              router.refresh()
            } else {
              setError(r.error)
            }
          })
        }}
        className="space-y-3"
      >
        <div>
          <label className="text-[10px] uppercase tracking-widest">Nota (timestamped)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            required
            minLength={3}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar nota'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}
