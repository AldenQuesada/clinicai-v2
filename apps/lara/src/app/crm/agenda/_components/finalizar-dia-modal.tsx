'use client'

/**
 * FinalizarDiaModal · CRM_FUNCTIONALITY_MULTI_AGENT Lote 3 · Agente B.
 *
 * Modal informativo (NÃO destrutivo) que mostra o status da agenda do dia.
 * Renderiza:
 *   1. Botão "Finalizar Dia" na toolbar (controla a abertura).
 *   2. Modal com:
 *      - Header com data alvo + filtro profissional (herdado via prop).
 *      - Cards de resumo (9 buckets canônicos mig 62).
 *      - Lista de "consultas em aberto" (pendentes + na_clinica +
 *        em_atendimento) ordenadas por startTime ASC.
 *      - Mensagem clara conforme tem ou não openItems.
 *      - Único botão de ação: "Ver agenda" (= fechar).
 *
 * Não há mutação aqui. RPC `appointment_finalize_day` é READ-ONLY (mig 876).
 * Operador finaliza appointments individualmente em /crm/agenda/[id].
 *
 * Fetch on-demand: a action é chamada apenas quando o usuário abre a modal
 * (evita custo se ninguém clicou). Re-fetch a cada abertura → sempre dado
 * fresco.
 */

import * as React from 'react'
import { Button, Modal, useToast } from '@clinicai/ui'
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  X,
} from 'lucide-react'
import {
  getFinalizarDiaReportAction,
  type FinalizarDiaReport,
} from '@/app/crm/_actions/appointment.actions'

interface FinalizarDiaModalProps {
  /** YYYY-MM-DD do dia alvo. */
  date: string
  /** UUID do profissional filtrado, ou null para todos. */
  professionalId: string | null
  /** Label do filtro de profissional (para header) · ex: "Todos" ou "Dra. X". */
  professionalLabel?: string
}

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguardando conf.',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  na_clinica: 'Na clínica',
  em_atendimento: 'Em atendimento',
}

const STATUS_TONE: Record<string, string> = {
  agendado: 'text-[var(--muted-foreground)] bg-[var(--muted)]/60',
  aguardando_confirmacao: 'text-amber-700 bg-amber-100',
  confirmado: 'text-blue-700 bg-blue-100',
  aguardando: 'text-violet-700 bg-violet-100',
  na_clinica: 'text-emerald-700 bg-emerald-100',
  em_atendimento: 'text-orange-700 bg-orange-100',
}

export function FinalizarDiaModal({
  date,
  professionalId,
  professionalLabel,
}: FinalizarDiaModalProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [report, setReport] = React.useState<FinalizarDiaReport | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const toast = useToast()

  const fetchReport = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getFinalizarDiaReportAction({
        date,
        professionalId,
      })
      if (r.ok) {
        setReport(r.data)
      } else {
        setError(r.error)
        toast.error('Falha ao carregar relatório do dia.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error'
      setError(msg)
      toast.error('Erro ao buscar relatório.')
    } finally {
      setLoading(false)
    }
  }, [date, professionalId, toast])

  function handleOpen() {
    setOpen(true)
    // Re-fetch sempre que abre · dado fresco
    void fetchReport()
  }

  function handleClose() {
    setOpen(false)
  }

  const openCount = report?.openItems.length ?? 0
  const isClean = !!report && !loading && !error && openCount === 0
  const summary = report?.summary

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Relatório do dia · listar consultas ainda em aberto"
        className="btn-outline btn-emerald"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Finalizar Dia
      </button>

      <Modal
        open={open}
        onOpenChange={(o) => setOpen(o)}
        title={`Finalizar Dia · ${date}`}
        description={
          professionalLabel
            ? `Profissional: ${professionalLabel}`
            : 'Todos os profissionais'
        }
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--muted-foreground)]">
              <Clock className="mr-2 h-4 w-4 animate-spin" />
              Carregando relatório do dia…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <strong>Erro ao carregar relatório.</strong>
              </div>
              <p className="mt-1 text-xs">{error}</p>
              <button
                type="button"
                onClick={() => void fetchReport()}
                className="mt-2 text-xs underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && summary && (
            <>
              {/* Banner de status do dia */}
              {isClean ? (
                <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">
                      Dia limpo · todas as consultas concluídas
                    </div>
                    <div className="text-xs text-emerald-800/80">
                      Nenhuma consulta em aberto. Você pode encerrar o dia.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">
                      Há {openCount}{' '}
                      {openCount === 1 ? 'consulta' : 'consultas'} em aberto
                    </div>
                    <div className="text-xs text-amber-800/80">
                      Finalize ou marque no-show antes de encerrar o dia.
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo agregado (cards) */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <SummaryCard label="Total" value={summary.total} tone="neutral" />
                <SummaryCard
                  label="Finalizados"
                  value={summary.finalizados}
                  tone="emerald"
                />
                <SummaryCard
                  label="Pendentes"
                  value={summary.pendentes}
                  tone={summary.pendentes > 0 ? 'amber' : 'neutral'}
                />
                <SummaryCard
                  label="Na clínica"
                  value={summary.naClinica}
                  tone={summary.naClinica > 0 ? 'emerald' : 'neutral'}
                />
                <SummaryCard
                  label="Em atend."
                  value={summary.emAtendimento}
                  tone={summary.emAtendimento > 0 ? 'orange' : 'neutral'}
                />
                <SummaryCard
                  label="Cancelados"
                  value={summary.cancelados}
                  tone="neutral"
                />
                <SummaryCard
                  label="No-show"
                  value={summary.noShow}
                  tone={summary.noShow > 0 ? 'red' : 'neutral'}
                />
                <SummaryCard
                  label="Bloqueados"
                  value={summary.bloqueados}
                  tone="neutral"
                />
                <SummaryCard
                  label="Remarcados"
                  value={summary.remarcados}
                  tone="neutral"
                />
              </div>

              {/* Lista de consultas em aberto */}
              {openCount > 0 && (
                <div className="rounded-md border border-[var(--border)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted-foreground)]">
                    <span>Consultas em aberto</span>
                    <span>{openCount}</span>
                  </div>
                  <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto">
                    {report.openItems.map((item) => {
                      const tone =
                        STATUS_TONE[item.status] ??
                        'text-[var(--muted-foreground)] bg-[var(--muted)]/60'
                      const label = STATUS_LABEL[item.status] ?? item.status
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm"
                        >
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-[var(--muted-foreground)]" />
                          <span className="w-16 flex-shrink-0 font-mono text-xs text-[var(--muted-foreground)]">
                            {item.startTime.slice(0, 5)}
                          </span>
                          <span className="flex-1 truncate text-[var(--foreground)]">
                            {item.subjectName || '—'}
                          </span>
                          {item.professionalName && (
                            <span className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block sm:max-w-[120px]">
                              {item.professionalName}
                            </span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
                          >
                            {label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              <X className="mr-1 h-3.5 w-3.5" />
              Ver agenda
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Helper · SummaryCard ──────────────────────────────────────────────────────

type SummaryTone = 'neutral' | 'emerald' | 'amber' | 'orange' | 'red'

const TONE_CLASSES: Record<SummaryTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  orange: 'border-orange-200 bg-orange-50 text-orange-900',
  red: 'border-red-200 bg-red-50 text-red-900',
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: SummaryTone
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${TONE_CLASSES[tone]}`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  )
}
