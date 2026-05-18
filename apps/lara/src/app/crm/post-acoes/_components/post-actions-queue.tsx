'use client'

/**
 * PostActionsQueue · CRM_PARITY_R4.
 *
 * Tabela cliente para o staff dashboard de pós-ações. Renderiza rows com:
 *   - badge do action_type (google_review, vpi_indication, retouch_reminder,
 *     complaint_logged, payment_followup)
 *   - status badge (pending/done/dismissed/cancelled)
 *   - paciente/lead + data agendamento
 *   - schedule_at (com indicador de atraso)
 *   - botões: Marcar como done · Dispensar (modal motivo) · Cancelar
 *
 * Mutations via Server Actions:
 *   - markPostActionDoneAction
 *   - dismissPostActionAction (com motivo)
 *   - cancelPostActionAction
 *
 * ZERO disparo externo · ZERO provider.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type {
  AppointmentPostActionDTO,
  AppointmentPostActionType,
  AppointmentPostActionStatus,
} from '@clinicai/repositories'
import {
  Button,
  Modal,
  Textarea,
  FormField,
  useToast,
} from '@clinicai/ui'
import {
  markPostActionDoneAction,
  dismissPostActionAction,
  cancelPostActionAction,
} from '@/app/crm/_actions/post-action.actions'

interface ApptSummary {
  id: string
  subjectName: string
  scheduledDate: string
  startTime: string
  status: string
  professionalName: string
}

interface Props {
  items: AppointmentPostActionDTO[]
  apptById: Record<string, ApptSummary | undefined>
  currentStatus: AppointmentPostActionStatus | 'all'
  currentType: AppointmentPostActionType | null
}

const ACTION_LABELS: Record<AppointmentPostActionType, string> = {
  google_review: 'Avaliação Google',
  vpi_indication: 'VPI · Indicação',
  retouch_reminder: 'Retoque',
  complaint_logged: 'Queixa',
  payment_followup: 'Pagamento',
}

const STATUS_LABELS: Record<AppointmentPostActionStatus, string> = {
  pending: 'Pendente',
  done: 'Concluído',
  dismissed: 'Dispensado',
  cancelled: 'Cancelado',
}

function actionTypeStyle(t: AppointmentPostActionType): string {
  switch (t) {
    case 'google_review':
      return 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
    case 'vpi_indication':
      return 'border-purple-300 bg-purple-50 text-purple-900 dark:bg-purple-950/30 dark:text-purple-200'
    case 'retouch_reminder':
      return 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
    case 'complaint_logged':
      return 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
    case 'payment_followup':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
  }
}

function statusStyle(s: AppointmentPostActionStatus): string {
  switch (s) {
    case 'pending':
      return 'border-amber-300 bg-amber-50 text-amber-900'
    case 'done':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900'
    case 'dismissed':
      return 'border-zinc-300 bg-zinc-50 text-zinc-700'
    case 'cancelled':
      return 'border-zinc-300 bg-zinc-100 text-zinc-500'
  }
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isOverdue(scheduleAt: string | null, status: AppointmentPostActionStatus): boolean {
  if (status !== 'pending' || !scheduleAt) return false
  return new Date(scheduleAt) < new Date()
}

function buildStatusHref(
  status: AppointmentPostActionStatus | 'all',
  currentType: AppointmentPostActionType | null,
): string {
  const params = new URLSearchParams()
  params.set('status', status)
  if (currentType) params.set('type', currentType)
  return `/crm/post-acoes?${params.toString()}`
}

function buildTypeHref(
  type: AppointmentPostActionType | null,
  currentStatus: AppointmentPostActionStatus | 'all',
): string {
  const params = new URLSearchParams()
  params.set('status', currentStatus)
  if (type) params.set('type', type)
  return `/crm/post-acoes?${params.toString()}`
}

export function PostActionsQueue({
  items,
  apptById,
  currentStatus,
  currentType,
}: Props) {
  const router = useRouter()
  const { fromResult, success } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [dismissTarget, setDismissTarget] = React.useState<AppointmentPostActionDTO | null>(null)
  const [dismissReason, setDismissReason] = React.useState('')
  const [dismissError, setDismissError] = React.useState<string | null>(null)

  async function handleMarkDone(id: string) {
    setBusyId(id)
    try {
      const r = await markPostActionDoneAction({ id })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success('Marcado como concluído')
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(id: string) {
    setBusyId(id)
    try {
      const r = await cancelPostActionAction({ id, reason: null })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success('Cancelado')
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismissSubmit() {
    if (!dismissTarget) return
    if (dismissReason.trim().length < 3) {
      setDismissError('Motivo obrigatório (mínimo 3 caracteres)')
      return
    }
    setBusyId(dismissTarget.id)
    try {
      const r = await dismissPostActionAction({
        id: dismissTarget.id,
        reason: dismissReason.trim(),
      })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success('Dispensada')
      setDismissTarget(null)
      setDismissReason('')
      setDismissError(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  // Status filter tabs
  const statusTabs: Array<{ value: AppointmentPostActionStatus | 'all'; label: string }> = [
    { value: 'pending', label: 'Pendentes' },
    { value: 'done', label: 'Concluídas' },
    { value: 'dismissed', label: 'Dispensadas' },
    { value: 'cancelled', label: 'Canceladas' },
    { value: 'all', label: 'Todas' },
  ]

  const typeTabs: Array<{ value: AppointmentPostActionType | null; label: string }> = [
    { value: null, label: 'Todos os tipos' },
    { value: 'google_review', label: 'Google review' },
    { value: 'vpi_indication', label: 'VPI' },
    { value: 'retouch_reminder', label: 'Retoque' },
    { value: 'complaint_logged', label: 'Queixa' },
    { value: 'payment_followup', label: 'Pagamento' },
  ]

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-1 text-xs">
        {statusTabs.map((t) => (
          <Link
            key={t.value}
            href={buildStatusHref(t.value, currentType)}
            className={`rounded-md border px-2 py-1 ${
              currentStatus === t.value
                ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {typeTabs.map((t) => (
          <Link
            key={t.value ?? 'all'}
            href={buildTypeHref(t.value, currentStatus)}
            className={`rounded-md border px-2 py-1 ${
              (currentType ?? null) === t.value
                ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-[var(--border)] p-8 text-center"
          role="status"
        >
          <p className="text-sm text-[var(--muted-foreground)] italic">
            Nenhuma pós-ação{' '}
            {currentStatus === 'pending'
              ? 'pendente'
              : currentStatus === 'all'
                ? ''
                : STATUS_LABELS[currentStatus as AppointmentPostActionStatus].toLowerCase()}
            {currentType ? ` do tipo "${ACTION_LABELS[currentType]}"` : ''}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Fila de pós-ações">
            <thead className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Tipo</th>
                <th className="px-2 py-1 text-left font-medium">Status</th>
                <th className="px-2 py-1 text-left font-medium">Paciente / Lead</th>
                <th className="px-2 py-1 text-left font-medium">Agendamento</th>
                <th className="px-2 py-1 text-left font-medium">Agendado para</th>
                <th className="px-2 py-1 text-left font-medium">Criado em</th>
                <th className="px-2 py-1 text-left font-medium">Notas</th>
                <th className="px-2 py-1 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((it) => {
                const appt = apptById[it.appointmentId]
                const overdue = isOverdue(it.scheduleAt, it.status)
                return (
                  <tr
                    key={it.id}
                    className={overdue ? 'bg-red-50/40 dark:bg-red-950/10' : ''}
                  >
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 ${actionTypeStyle(it.actionType)}`}
                      >
                        {ACTION_LABELS[it.actionType]}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 ${statusStyle(it.status)}`}
                      >
                        {STATUS_LABELS[it.status]}
                      </span>
                      {overdue && (
                        <span
                          className="ml-1 inline-block rounded border border-red-400 bg-red-100 px-1 py-0.5 text-[10px] text-red-800 dark:bg-red-900/40 dark:text-red-200"
                          aria-label="Atrasada"
                        >
                          Atrasada
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {appt ? (
                        <Link
                          href={`/crm/agenda/${appt.id}`}
                          className="font-medium hover:underline"
                        >
                          {appt.subjectName || '—'}
                        </Link>
                      ) : (
                        <span className="italic text-[var(--muted-foreground)]">
                          (sem acesso)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {appt ? (
                        <>
                          <div>{appt.scheduledDate.split('-').reverse().join('/')}</div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {appt.startTime} · {appt.professionalName || 'Sem prof.'}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {it.scheduleAt ? (
                        <span
                          className={
                            overdue ? 'font-semibold text-red-700' : ''
                          }
                        >
                          {formatDateBR(it.scheduleAt)}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)]">
                      {formatDateBR(it.createdAt)}
                    </td>
                    <td className="px-2 py-2 max-w-[16ch] truncate" title={it.notes ?? ''}>
                      {it.notes || (it.dismissedReason ? `Dispensada: ${it.dismissedReason}` : '—')}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {it.status === 'pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleMarkDone(it.id)}
                            disabled={busyId === it.id}
                          >
                            Concluir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDismissTarget(it)
                              setDismissReason('')
                              setDismissError(null)
                            }}
                            disabled={busyId === it.id}
                          >
                            Dispensar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancel(it.id)}
                            disabled={busyId === it.id}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)] italic">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] italic text-[var(--muted-foreground)]">
        Esta fila é interna · ações reais (mensagem WhatsApp, registro Google,
        enrollment VPI) são executadas manualmente pela staff. Nenhuma
        integração externa é disparada automaticamente.
      </p>

      {/* Dismiss reason modal */}
      <Modal
        open={dismissTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDismissTarget(null)
            setDismissReason('')
            setDismissError(null)
          }
        }}
        title="Dispensar pós-ação"
        description="Informe um motivo (registrado para auditoria · zero envio externo)."
      >
        <div className="space-y-3">
          <FormField
            label="Motivo"
            htmlFor="dismiss-reason"
            required
            error={dismissError ?? undefined}
          >
            <Textarea
              id="dismiss-reason"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex: paciente já fez avaliação · não se aplica · outro motivo"
              invalid={!!dismissError}
            />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
            <Button
              variant="ghost"
              onClick={() => setDismissTarget(null)}
              disabled={busyId === dismissTarget?.id}
            >
              Voltar
            </Button>
            <Button
              onClick={handleDismissSubmit}
              disabled={busyId === dismissTarget?.id}
            >
              {busyId === dismissTarget?.id ? 'Dispensando…' : 'Dispensar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
