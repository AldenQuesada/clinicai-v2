'use client'

/**
 * /crm/recuperacao · lista com workflow interno (CRM_PHASE_2RC.1).
 *
 * Consome commercial_recovery_workflow_view (queue + workflow LEFT JOIN).
 * Ações:
 *   - Iniciar workflow (cria workflow_item)
 *   - Mudar stage (kanban-lite)
 *   - Mudar priority (4 níveis)
 *   - Set próxima ação (tipo + prazo + responsável)
 *   - Add nota (audit trail)
 *   - Marcar recuperado · Descartar
 *   - Sugestão de abordagem (DRY-RUN · NUNCA envia)
 *   - 2RC mantém: Reativar (lead_recover) + ações sobre perdidos
 *
 * DRY-RUN absoluto · nenhuma ação grava em wa_outbox ou chama provider.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type {
  RecoveryNextActionType,
  RecoveryPriority,
  RecoverySourceType,
  RecoveryStage,
  RecoveryStatus,
  RecoveryWorkflowCounts,
  RecoveryWorkflowItemDTO,
} from '@clinicai/repositories'
import { Button } from '@clinicai/ui'
import {
  reactivateRecoveryLeadAction,
  createOrGetRecoveryWorkflowAction,
  updateRecoveryStageAction,
  updateRecoveryPriorityAction,
  setRecoveryNextActionAction,
  addRecoveryWorkflowNoteAction,
  markRecoveryRecoveredAction,
  discardRecoveryWorkflowAction,
  suggestRecoveryMessageAction,
} from './_actions'

// ── Labels ────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<RecoverySourceType, string> = {
  lead_lost: 'Lead perdido',
  appointment_cancelled: 'Cancelado',
  appointment_no_show: 'No-show',
  orcamento_frio: 'Orçamento frio',
}

const PRIORITY_LABEL: Record<RecoveryPriority, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  aberto: 'Aberto',
  recuperado: 'Recuperado',
  descartado: 'Descartado',
  arquivado: 'Arquivado',
}

const STAGE_LABEL: Record<RecoveryStage, string> = {
  novo: 'Novo',
  em_analise: 'Em análise',
  primeira_tentativa: '1ª tentativa',
  aguardando_resposta: 'Aguardando',
  retorno_agendado: 'Retorno agendado',
  recuperado: 'Recuperado',
  descartado: 'Descartado',
  arquivado: 'Arquivado',
}

const NEXT_ACTION_LABEL: Record<RecoveryNextActionType, string> = {
  ligar: 'Ligar',
  enviar_whatsapp_quando_liberado: 'WhatsApp (quando liberado)',
  agendar_retorno: 'Agendar retorno',
  revisar_orcamento: 'Revisar orçamento',
  marcar_descartado: 'Marcar descartado',
  reativar_lead: 'Reativar lead',
  observar: 'Apenas observar',
}

// ── Types ─────────────────────────────────────────────────────────────────

interface Props {
  items: RecoveryWorkflowItemDTO[]
  counts: RecoveryWorkflowCounts
  currentFilter: {
    source: RecoverySourceType | 'all'
    stage: RecoveryStage | 'all'
    priority: RecoveryPriority | 'all'
    status: RecoveryStatus | 'all'
    overdueOnly: boolean
  }
  canAct: boolean
}

type DialogKind =
  | null
  | 'reactivate'
  | 'discard_perdido'
  | 'note_perdido'
  | 'stage'
  | 'priority'
  | 'next_action'
  | 'workflow_note'
  | 'recovered'
  | 'discard_workflow'
  | 'suggest'

// ── Main component ────────────────────────────────────────────────────────

export function RecoveryList({ items, counts, currentFilter, canAct }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setFilter(key: 'source' | 'stage' | 'priority' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`/crm/recuperacao?${params.toString()}`)
  }

  function toggleOverdue() {
    const params = new URLSearchParams(searchParams.toString())
    if (currentFilter.overdueOnly) params.delete('overdue')
    else params.set('overdue', '1')
    router.push(`/crm/recuperacao?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <FilterGroup
          label="Origem"
          value={currentFilter.source}
          onChange={(v) => setFilter('source', v)}
          options={[
            { value: 'all', label: `Todas (${counts.total})` },
            { value: 'lead_lost', label: 'Perdidos' },
            { value: 'appointment_cancelled', label: 'Cancelado' },
            { value: 'appointment_no_show', label: 'No-show' },
            { value: 'orcamento_frio', label: 'Orç. frio' },
          ]}
        />
        <FilterGroup
          label="Estágio"
          value={currentFilter.stage}
          onChange={(v) => setFilter('stage', v)}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'novo', label: `Novo (${counts.byStage.novo})` },
            { value: 'em_analise', label: `Em análise (${counts.byStage.em_analise})` },
            { value: 'primeira_tentativa', label: `1ª tent. (${counts.byStage.primeira_tentativa})` },
            { value: 'aguardando_resposta', label: `Aguardando (${counts.byStage.aguardando_resposta})` },
            { value: 'retorno_agendado', label: `Retorno (${counts.byStage.retorno_agendado})` },
          ]}
        />
        <FilterGroup
          label="Prioridade"
          value={currentFilter.priority}
          onChange={(v) => setFilter('priority', v)}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'urgente', label: `Urgente (${counts.byPriority.urgente})` },
            { value: 'alta', label: `Alta (${counts.byPriority.alta})` },
            { value: 'media', label: `Média (${counts.byPriority.media})` },
            { value: 'baixa', label: `Baixa (${counts.byPriority.baixa})` },
          ]}
        />
        <FilterGroup
          label="Status"
          value={currentFilter.status}
          onChange={(v) => setFilter('status', v)}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'aberto', label: 'Aberto' },
            { value: 'recuperado', label: 'Recuperado' },
            { value: 'descartado', label: 'Descartado' },
          ]}
        />
        <button
          type="button"
          onClick={toggleOverdue}
          className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-[10px] font-display-uppercase tracking-widest transition-colors ${
            currentFilter.overdueOnly
              ? 'bg-[var(--destructive)]/15 text-[var(--destructive)]'
              : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40'
          }`}
        >
          {currentFilter.overdueOnly ? '✓ ' : ''}Atrasados ({counts.overdue})
        </button>
      </div>

      {/* Banner aviso · dry-run */}
      <p className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
        💡 Este painel é <strong>interno (dry-run)</strong> · sugestões de abordagem não disparam
        WhatsApp · canal Meta segue em aprovação.
      </p>

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

// ── FilterGroup ───────────────────────────────────────────────────────────

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

// ── RecoveryRow ───────────────────────────────────────────────────────────

function RecoveryRow({
  item,
  canAct,
}: {
  item: RecoveryWorkflowItemDTO
  canAct: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState<DialogKind>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const isLeadLost = item.sourceType === 'lead_lost'
  const hasWorkflow = item.workflowId !== null
  const canActOnRow = canAct && item.status === 'aberto'

  const dateLabel = item.sourceEventAt
    ? new Date(item.sourceEventAt).toLocaleDateString('pt-BR')
    : '—'

  const priorityColor =
    item.priority === 'urgente'
      ? 'text-[var(--destructive)] font-semibold'
      : item.priority === 'alta'
        ? 'text-[var(--destructive)]'
        : item.priority === 'media'
          ? 'text-amber-700'
          : 'text-[var(--muted-foreground)]'

  const nextActionBadge = item.nextActionAt
    ? new Date(item.nextActionAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  function close() {
    setOpen(null)
  }

  async function ensureWorkflowId(): Promise<string | null> {
    if (item.workflowId) return item.workflowId
    const r = await createOrGetRecoveryWorkflowAction({
      sourceType: item.sourceType,
      sourceId: item.itemId,
      leadId: item.leadId,
      appointmentId: item.appointmentId,
      orcamentoId: item.orcamentoId,
      priority: item.priority,
    })
    if (!r.ok) {
      setError(r.error)
      return null
    }
    return r.data.id
  }

  return (
    <div className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1fr_auto] md:items-start">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{item.displayName ?? 'Sem nome'}</span>
          <Pill>{SOURCE_LABEL[item.sourceType]}</Pill>
          <Pill>{STAGE_LABEL[item.stage]}</Pill>
          <span className={`text-[10px] uppercase tracking-widest ${priorityColor}`}>
            {PRIORITY_LABEL[item.priority]}
          </span>
          <Pill>{STATUS_LABEL[item.status]}</Pill>
          {nextActionBadge && (
            <span
              className={`text-[10px] uppercase tracking-widest ${
                item.nextActionOverdue ? 'text-[var(--destructive)] font-semibold' : 'text-[var(--muted-foreground)]'
              }`}
            >
              {item.nextActionOverdue ? '⏰ ATRASADO' : '⏱'} {nextActionBadge}
              {item.nextActionType ? ` · ${NEXT_ACTION_LABEL[item.nextActionType]}` : ''}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-[var(--muted-foreground)]">
          <span>{dateLabel}</span>
          {item.phoneLast4 && <span>tel {item.phoneLast4}</span>}
          {item.reason && <span title={item.reason}>motivo: {truncate(item.reason, 60)}</span>}
        </div>
        {item.workflowNote && (
          <p className="text-[11px] italic text-[var(--muted-foreground)]">{truncate(item.workflowNote, 140)}</p>
        )}
        {info && <p className="text-[11px] text-emerald-700">{info}</p>}
        {error && <p className="text-[11px] text-[var(--destructive)]">Erro: {error}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {/* Source-specific navigation */}
        {(item.sourceType === 'appointment_cancelled' || item.sourceType === 'appointment_no_show') && item.appointmentId && (
          <Link href={`/crm/agenda/${item.appointmentId}/editar`}>
            <Button size="sm" variant="outline">Reagendar</Button>
          </Link>
        )}
        {item.sourceType === 'orcamento_frio' && item.orcamentoId && (
          <Link href={`/crm/orcamentos/${item.orcamentoId}`}>
            <Button size="sm" variant="outline">Abrir orçamento</Button>
          </Link>
        )}
        {item.leadId && (
          <Link href={`/crm/leads/${item.leadId}`}>
            <Button size="sm" variant="ghost">Ver lead</Button>
          </Link>
        )}

        {/* Workflow actions */}
        {canActOnRow && (
          <>
            {!hasWorkflow && (
              <Button
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    setError(null)
                    const id = await ensureWorkflowId()
                    if (id) {
                      setInfo('Workflow iniciado')
                      router.refresh()
                    }
                  })
                }
                disabled={pending}
              >
                Iniciar
              </Button>
            )}
            {hasWorkflow && (
              <>
                <Button size="sm" variant="outline" onClick={() => setOpen('stage')}>Estágio</Button>
                <Button size="sm" variant="outline" onClick={() => setOpen('priority')}>Prio.</Button>
                <Button size="sm" variant="outline" onClick={() => setOpen('next_action')}>Próx. ação</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen('workflow_note')}>Anotar</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen('suggest')}>Sugerir</Button>
              </>
            )}
            {/* lead_lost · ações sobre perdidos (2RC) */}
            {isLeadLost && (
              <>
                <Button size="sm" onClick={() => setOpen('reactivate')}>Reativar</Button>
              </>
            )}
            {hasWorkflow && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setOpen('recovered')}>✓ Recuperado</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen('discard_workflow')}>Descartar</Button>
              </>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      {open === 'reactivate' && isLeadLost && item.leadId && (
        <ReactivateDialog
          leadId={item.leadId}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'stage' && item.workflowId && (
        <StageDialog
          workflowId={item.workflowId}
          currentStage={item.stage}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'priority' && item.workflowId && (
        <PriorityDialog
          workflowId={item.workflowId}
          currentPriority={item.priority}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'next_action' && item.workflowId && (
        <NextActionDialog
          workflowId={item.workflowId}
          currentType={item.nextActionType}
          currentAt={item.nextActionAt}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'workflow_note' && item.workflowId && (
        <NoteDialog
          workflowId={item.workflowId}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'recovered' && item.workflowId && (
        <RecoveredDialog
          workflowId={item.workflowId}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'discard_workflow' && item.workflowId && (
        <DiscardWorkflowDialog
          workflowId={item.workflowId}
          onClose={close}
          pending={pending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {open === 'suggest' && (
        <SuggestDialog
          sourceType={item.sourceType}
          displayName={item.displayName ?? ''}
          reason={item.reason}
          onClose={close}
          startTransition={startTransition}
          setError={setError}
        />
      )}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
      {children}
    </span>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Dialog primitives ─────────────────────────────────────────────────────

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

// ── Dialog: Reativar lead (2RC) ──────────────────────────────────────────

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
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <SelectField label="Phase destino" value={toPhase} onChange={(v) => setToPhase(v as 'lead' | 'agendado' | 'orcamento')}
          options={[{ value: 'lead', label: 'lead' }, { value: 'agendado', label: 'agendado' }, { value: 'orcamento', label: 'orcamento' }]} />
        <TextAreaField label="Motivo" value={reason} onChange={setReason} required minLength={3} maxLength={500} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Reativar" />
      </form>
    </DialogShell>
  )
}

// ── Dialog: Stage ─────────────────────────────────────────────────────────

function StageDialog({
  workflowId,
  currentStage,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
  currentStage: RecoveryStage
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [stage, setStage] = useState<RecoveryStage>(currentStage)
  const [note, setNote] = useState('')
  const router = useRouter()
  const stages: RecoveryStage[] = [
    'novo','em_analise','primeira_tentativa','aguardando_resposta','retorno_agendado','arquivado'
  ]
  return (
    <DialogShell title="Alterar estágio" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await updateRecoveryStageAction({ id: workflowId, stage, note: note || null })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <SelectField label="Estágio" value={stage} onChange={(v) => setStage(v as RecoveryStage)}
          options={stages.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
        <TextAreaField label="Nota (opcional)" value={note} onChange={setNote} maxLength={500} rows={2} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Salvar" />
      </form>
    </DialogShell>
  )
}

// ── Dialog: Priority ──────────────────────────────────────────────────────

function PriorityDialog({
  workflowId,
  currentPriority,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
  currentPriority: RecoveryPriority
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [priority, setPriority] = useState<RecoveryPriority>(currentPriority)
  const router = useRouter()
  const priorities: RecoveryPriority[] = ['urgente','alta','media','baixa']
  return (
    <DialogShell title="Alterar prioridade" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await updateRecoveryPriorityAction({ id: workflowId, priority })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <SelectField label="Prioridade" value={priority} onChange={(v) => setPriority(v as RecoveryPriority)}
          options={priorities.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Salvar" />
      </form>
    </DialogShell>
  )
}

// ── Dialog: NextAction ────────────────────────────────────────────────────
// Exportado para reuso em _recovery-buckets.tsx (Lote 3 · scheduler).

export function NextActionDialog({
  workflowId,
  currentType,
  currentAt,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
  currentType: RecoveryNextActionType | null
  currentAt: string | null
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [actionType, setActionType] = useState<RecoveryNextActionType | ''>(currentType ?? '')
  const [datetimeLocal, setDatetimeLocal] = useState<string>(() => {
    if (!currentAt) {
      const d = new Date()
      d.setHours(d.getHours() + 24)
      return toLocalIso(d)
    }
    return toLocalIso(new Date(currentAt))
  })
  const router = useRouter()
  const types: RecoveryNextActionType[] = [
    'ligar','agendar_retorno','revisar_orcamento','observar','enviar_whatsapp_quando_liberado',
    'marcar_descartado','reativar_lead',
  ]
  return (
    <DialogShell title="Próxima ação" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const at = datetimeLocal ? new Date(datetimeLocal).toISOString() : null
            const r = await setRecoveryNextActionAction({
              id: workflowId,
              actionType: actionType || null,
              at,
            })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <SelectField label="Tipo de ação" value={actionType} onChange={(v) => setActionType(v as RecoveryNextActionType | '')}
          options={[{ value: '', label: '—' }, ...types.map((t) => ({ value: t, label: NEXT_ACTION_LABEL[t] }))]} />
        <div>
          <label className="text-[10px] uppercase tracking-widest">Quando</label>
          <input
            type="datetime-local"
            value={datetimeLocal}
            onChange={(e) => setDatetimeLocal(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </div>
        {actionType === 'enviar_whatsapp_quando_liberado' && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            💡 Intenção apenas · WhatsApp não será enviado enquanto canal Meta não estiver aprovado.
          </p>
        )}
        <FormActions onClose={onClose} pending={pending} submitLabel="Salvar" />
      </form>
    </DialogShell>
  )
}

function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Dialog: Workflow Note ─────────────────────────────────────────────────

function NoteDialog({
  workflowId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
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
            const r = await addRecoveryWorkflowNoteAction({ id: workflowId, note })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <TextAreaField label="Nota" value={note} onChange={setNote} required minLength={3} maxLength={1000} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Salvar nota" />
      </form>
    </DialogShell>
  )
}

// ── Dialog: Recovered ─────────────────────────────────────────────────────

function RecoveredDialog({
  workflowId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [note, setNote] = useState('')
  const router = useRouter()
  return (
    <DialogShell title="Marcar como recuperado" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await markRecoveryRecoveredAction({ id: workflowId, note: note || null })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <TextAreaField label="Nota (opcional)" value={note} onChange={setNote} maxLength={500} rows={2} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Marcar recuperado" />
      </form>
    </DialogShell>
  )
}

// ── Dialog: Discard workflow ──────────────────────────────────────────────

function DiscardWorkflowDialog({
  workflowId,
  onClose,
  pending,
  startTransition,
  setError,
}: {
  workflowId: string
  onClose: () => void
  pending: boolean
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [reason, setReason] = useState('')
  const router = useRouter()
  return (
    <DialogShell title="Descartar workflow" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const r = await discardRecoveryWorkflowAction({ id: workflowId, reason })
            if (r.ok) { onClose(); router.refresh() } else setError(r.error)
          })
        }}
        className="space-y-3"
      >
        <TextAreaField label="Motivo" value={reason} onChange={setReason} required minLength={3} maxLength={500} />
        <FormActions onClose={onClose} pending={pending} submitLabel="Descartar" destructive />
      </form>
    </DialogShell>
  )
}

// ── Dialog: Suggest message (DRY-RUN) ─────────────────────────────────────

function SuggestDialog({
  sourceType,
  displayName,
  reason,
  onClose,
  startTransition,
  setError,
}: {
  sourceType: RecoverySourceType
  displayName: string
  reason: string | null
  onClose: () => void
  startTransition: React.TransitionStartFunction
  setError: (s: string | null) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  // Fetch on mount
  if (message === null && !loading) {
    setLoading(true)
    startTransition(async () => {
      const r = await suggestRecoveryMessageAction({
        sourceType,
        displayName: displayName || 'tudo bem',
        reason,
      })
      setLoading(false)
      if (r.ok) setMessage(r.data.message)
      else { setError(r.error); onClose() }
    })
  }

  async function copy() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <DialogShell title="Sugestão de abordagem" onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          ⚠️ DRY-RUN · não enviaremos WhatsApp enquanto o canal Meta não estiver aprovado.
          Use para falar pessoalmente ou copiar para outro canal manualmente.
        </p>
        <div>
          <label className="text-[10px] uppercase tracking-widest">Texto sugerido</label>
          <div className="mt-1 min-h-[100px] whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
            {loading ? 'Gerando…' : message ?? '—'}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Fechar</Button>
          <Button type="button" onClick={copy} disabled={!message}>
            {copied ? '✓ Copiado' : 'Copiar texto'}
          </Button>
        </div>
      </div>
    </DialogShell>
  )
}

// ── Field primitives ──────────────────────────────────────────────────────

function SelectField({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function TextAreaField({
  label, value, onChange, required, minLength, maxLength, rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  minLength?: number
  maxLength?: number
  rows?: number
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
      />
    </div>
  )
}

function FormActions({
  onClose, pending, submitLabel, destructive,
}: {
  onClose: () => void
  pending: boolean
  submitLabel: string
  destructive?: boolean
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
      <Button type="submit" variant={destructive ? 'destructive' : undefined} disabled={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </Button>
    </div>
  )
}

// Backwards-compat alias for 2RC dialogs (perdidos) — still importable
export const _2RC_NOTE_DIALOG = '_unused'
