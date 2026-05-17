'use client'

/**
 * RecurrenceSection · BLOCO 2.2A · Paridade V1 agenda-modal.recurrence.js
 *
 * Componente client opt-in renderizado no Step 4 (Revisão) do
 * NewAppointmentForm. Quando ativado, substitui o submit padrão de
 * `createAppointmentAction` (single) por `createAppointmentSeriesAction`
 * (série de N appointments ATÔMICA via RPC `appt_create_series`).
 *
 * Escopo desta versão (v1 do recurso):
 *   - Apenas modo "intervalo fixo" (totalSessions + intervalDays)
 *   - Mesmo horário/profissional/procedimento em toda série
 *   - Preview client-side com lista de datas calculadas
 *   - Pré-check de conflito server-side (lista todos antes da RPC)
 *   - Atomicidade real: all-or-nothing · RPC RAISE → rollback total
 *
 * Sem comportamento parcial: ou toda série é criada, ou nenhuma sessão é.
 *
 * Fora do escopo:
 *   - Fases mistas/cadência variável
 *   - Smart-pick automático
 *   - Edição/exclusão de séries
 *   - Block-time em série (subject XOR exigido)
 *
 * Não dispara WhatsApp, não toca cron, não cria wa_outbox.
 */

import * as React from 'react'
import { Button, FormField, Input, useToast } from '@clinicai/ui'
import { CalendarDays, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { createAppointmentSeriesAction } from '@/app/crm/_actions/appointment.actions'

export interface SeriesBasePayload {
  leadId: string | null
  patientId: string | null
  subjectName: string
  subjectPhone: string | null
  startDate: string
  startTime: string
  endTime: string
  professionalId: string | null
  professionalName: string
  procedureId: string | null
  procedureName: string
  consultType: string | null
  value: number
  origem: string | null
  obs: string | null
}

export interface RecurrenceSectionProps {
  /**
   * Callback que retorna o payload base (subject + tempo + profissional +
   * procedimento) coletado pelos steps 1-3 do form. Chamado ao submeter.
   */
  getBasePayload: () => SeriesBasePayload | null
  /**
   * Quando true, força form parent a desabilitar o submit padrão (modo série
   * ativo). Pai usa pra rotear submit.
   */
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  /**
   * Sinal pro pai marcar busy quando série está sendo criada (compartilha
   * estado de loading).
   */
  onBusy?: (busy: boolean) => void
  /**
   * Callback após série criada com sucesso (atômica) · pai pode redirecionar
   * pra agenda. Recebe groupId pra eventual navegação filtrada.
   * NÃO chamado em conflito de pré-check ou falha de RPC (UI mostra inline).
   */
  onSeriesCreated?: (result: {
    groupId: string
    createdCount: number
  }) => void
}

const MIN_SESSIONS = 2
const MAX_SESSIONS = 52
const MIN_INTERVAL_DAYS = 1
const MAX_INTERVAL_DAYS = 365

interface PreviewItem {
  index: number
  date: string
  label: string
}

type SeriesResult =
  | {
      kind: 'success'
      createdCount: number
      groupId: string
      totalRequested: number
    }
  | {
      kind: 'precheck_conflict'
      conflicts: Array<{ index: number; date: string }>
      totalRequested: number
    }
  | {
      kind: 'rpc_failed'
      reason: string
      totalRequested: number
    }

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(dateIso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY (ddd) sem dependência de Intl pesada
  const [y, m, d] = dateIso.split('-')
  return `${d}/${m}/${y}`
}

export function RecurrenceSection({
  getBasePayload,
  enabled,
  onEnabledChange,
  onBusy,
  onSeriesCreated,
}: RecurrenceSectionProps) {
  const toast = useToast()
  const [totalSessions, setTotalSessions] = React.useState(4)
  const [intervalDays, setIntervalDays] = React.useState(7)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<SeriesResult | null>(null)
  const [errors, setErrors] = React.useState<{
    total?: string
    interval?: string
  }>({})

  function validateSeriesFields(): boolean {
    const next: typeof errors = {}
    if (totalSessions < MIN_SESSIONS || totalSessions > MAX_SESSIONS) {
      next.total = `Total deve ser entre ${MIN_SESSIONS} e ${MAX_SESSIONS}`
    }
    if (intervalDays < MIN_INTERVAL_DAYS || intervalDays > MAX_INTERVAL_DAYS) {
      next.interval = `Intervalo deve ser entre ${MIN_INTERVAL_DAYS} e ${MAX_INTERVAL_DAYS} dias`
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const basePayload = enabled ? getBasePayload() : null

  const preview: PreviewItem[] = React.useMemo(() => {
    if (!enabled || !basePayload) return []
    if (
      totalSessions < MIN_SESSIONS ||
      totalSessions > MAX_SESSIONS ||
      intervalDays < MIN_INTERVAL_DAYS ||
      intervalDays > MAX_INTERVAL_DAYS
    ) {
      return []
    }
    const items: PreviewItem[] = []
    for (let i = 1; i <= totalSessions; i++) {
      const date = addDays(basePayload.startDate, (i - 1) * intervalDays)
      items.push({
        index: i,
        date,
        label: formatDateLabel(date),
      })
    }
    return items
  }, [enabled, basePayload, totalSessions, intervalDays])

  async function handleSubmitSeries() {
    if (!validateSeriesFields()) {
      toast.error('Revise os campos da série')
      return
    }
    const base = getBasePayload()
    if (!base) {
      toast.error('Complete os dados do agendamento (steps 1-3) antes de criar a série')
      return
    }

    setBusy(true)
    onBusy?.(true)
    setResult(null)
    try {
      const r = await createAppointmentSeriesAction({
        leadId: base.leadId,
        patientId: base.patientId,
        subjectName: base.subjectName,
        subjectPhone: base.subjectPhone,
        startDate: base.startDate,
        startTime: base.startTime,
        endTime: base.endTime,
        professionalId: base.professionalId,
        professionalName: base.professionalName,
        procedureId: base.procedureId,
        procedureName: base.procedureName,
        consultType: base.consultType,
        value: base.value,
        origem: base.origem,
        obs: base.obs,
        totalSessions,
        intervalDays,
        recurrenceProcedure: base.procedureName || undefined,
        skipConflictCheck: false,
      })

      if (!r.ok) {
        // Pré-check de conflito · nenhuma sessão criada
        if (r.error === 'schedule_conflict_in_series') {
          const details = r.details as
            | { conflicts?: Array<{ index: number; date: string }>; totalRequested?: number }
            | undefined
          setResult({
            kind: 'precheck_conflict',
            conflicts: details?.conflicts ?? [],
            totalRequested: details?.totalRequested ?? totalSessions,
          })
          toast.error(
            `Conflito em ${details?.conflicts?.length ?? 0} sessões · nenhuma foi criada`,
          )
          return
        }
        // RPC falhou (validação interna, permissão, etc.)
        if (r.error === 'series_rpc_failed') {
          const details = r.details as { reason?: string } | undefined
          setResult({
            kind: 'rpc_failed',
            reason: details?.reason ?? 'erro desconhecido',
            totalRequested: totalSessions,
          })
          toast.error('Nenhuma sessão foi criada · corrija o problema e tente novamente')
          return
        }
        // Outros erros (invalid_input, etc.)
        toast.error(`Falha ao criar série: ${r.error}`)
        setResult({ kind: 'rpc_failed', reason: r.error, totalRequested: totalSessions })
        return
      }

      const data = r.data
      setResult({
        kind: 'success',
        createdCount: data.createdCount,
        groupId: data.groupId,
        totalRequested: data.totalRequested,
      })
      toast.success(`Série criada com ${data.createdCount} sessões`)

      onSeriesCreated?.({
        groupId: data.groupId,
        createdCount: data.createdCount,
      })
    } finally {
      setBusy(false)
      onBusy?.(false)
    }
  }

  if (!enabled) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={false}
            onChange={() => onEnabledChange(true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Criar série de sessões</span>
            <span className="ml-2 text-xs text-[var(--muted-foreground)]">
              (ex: 5 consultas semanais)
            </span>
          </span>
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
          <div>
            <p className="text-sm font-medium">Modo série ativado</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Mesma hora/profissional/procedimento repetido em N sessões.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onEnabledChange(false)
            setResult(null)
            setErrors({})
          }}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          disabled={busy}
          aria-label="Desativar modo série"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          label="Total de sessões"
          htmlFor="recurrence-total-sessions"
          required
          error={errors.total}
        >
          <Input
            id="recurrence-total-sessions"
            type="number"
            min={MIN_SESSIONS}
            max={MAX_SESSIONS}
            value={totalSessions}
            onChange={(e) => setTotalSessions(parseInt(e.target.value, 10) || 0)}
            disabled={busy}
          />
        </FormField>
        <FormField
          label="Intervalo entre sessões (dias)"
          htmlFor="recurrence-interval-days"
          required
          error={errors.interval}
        >
          <Input
            id="recurrence-interval-days"
            type="number"
            min={MIN_INTERVAL_DAYS}
            max={MAX_INTERVAL_DAYS}
            value={intervalDays}
            onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 0)}
            disabled={busy}
          />
        </FormField>
      </div>

      {preview.length > 0 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            Pré-visualização ({preview.length} sessões)
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {preview.map((item) => (
              <li key={item.index} className="flex justify-between gap-2">
                <span className="text-[var(--muted-foreground)]">Sessão {item.index}</span>
                <span className="font-medium">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.kind === 'success' && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
            <p className="flex-1 font-medium">
              Série criada com {result.createdCount} sessões.
            </p>
          </div>
        </div>
      )}

      {result?.kind === 'precheck_conflict' && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">
                Nenhuma sessão foi criada. {result.conflicts.length} de{' '}
                {result.totalRequested} com conflito de agenda.
              </p>
              {result.conflicts.length > 0 && (
                <>
                  <p className="text-[var(--muted-foreground)]">
                    Conflitos identificados (corrija e tente novamente):
                  </p>
                  <ul className="space-y-0.5 text-[var(--muted-foreground)]">
                    {result.conflicts.slice(0, 10).map((c) => (
                      <li key={c.index}>
                        Sessão {c.index} · {formatDateLabel(c.date)}
                      </li>
                    ))}
                    {result.conflicts.length > 10 && (
                      <li>… (+{result.conflicts.length - 10} outros)</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {result?.kind === 'rpc_failed' && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">
                Nenhuma sessão foi criada. Corrija o problema e tente novamente.
              </p>
              <p className="text-[var(--muted-foreground)]">
                Motivo: <code className="rounded bg-[var(--muted)] px-1">{result.reason}</code>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="secondary"
          onClick={() => {
            onEnabledChange(false)
            setResult(null)
            setErrors({})
          }}
          disabled={busy}
        >
          Cancelar série
        </Button>
        <Button onClick={handleSubmitSeries} disabled={busy || preview.length === 0}>
          {busy ? 'Criando…' : `Criar ${preview.length || ''} sessões`}
        </Button>
      </div>
    </div>
  )
}
