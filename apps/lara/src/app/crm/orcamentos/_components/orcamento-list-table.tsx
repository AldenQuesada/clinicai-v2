'use client'

/**
 * OrcamentoListTable · client wrapper com bulk-select + acoes em lote +
 * export CSV (Camada 10).
 *
 * RSC pai (page.tsx) faz fetch + resolucao de nome (leads/patients via
 * findByIds em batch) e passa `subjectNames` serializado · este client mantem
 * state da selecao (Set<string>) e renderiza:
 *   - banner sticky com 3 acoes em lote (marcar enviado/aprovado/perdido)
 *   - botao "Exportar CSV" (respeita filtros do URL via activeFilters)
 *   - coluna checkbox via DataTable.bulkSelect
 *   - nome resolvido na coluna "Vinculado a" · UUID em tooltip/title
 *
 * Decisoes:
 *   - Selecao NUNCA persiste cross-page (mesmo behavior dos pacientes) ·
 *     URL navigation reseta selecao.
 *   - Bulk marcar perdido exige motivo unico aplicado a todos (>=3 chars).
 *   - Toast consolidado com sucesso parcial OK (X/Y atualizados · Z falharam).
 *   - Click em row continua navegando pro detalhe · checkbox e botoes
 *     fazem stopPropagation.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Modal,
  OrcamentoStatusBadge,
  Textarea,
  useToast,
  type DataTableColumn,
  type DataTablePagination,
} from '@clinicai/ui'
import { CheckCircle2, Download, Send, X, XCircle } from 'lucide-react'
import type { OrcamentoDTO } from '@clinicai/repositories'
import {
  bulkMarkOrcamentosApprovedAction,
  bulkMarkOrcamentosLostAction,
  bulkMarkOrcamentosSentAction,
  exportOrcamentosCsvAction,
} from '../_actions'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function expiryHint(
  validUntil: string | null,
  status: string,
): { label: string; tone: 'normal' | 'warn' | 'danger' } {
  if (!validUntil) return { label: '—', tone: 'normal' }
  if (status === 'approved' || status === 'lost') {
    return { label: formatDate(validUntil), tone: 'normal' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${validUntil}T00:00:00`)
  const days = Math.ceil((target.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { label: `${formatDate(validUntil)} · expirado`, tone: 'danger' }
  if (days <= 3) return { label: `${formatDate(validUntil)} · em ${days}d`, tone: 'warn' }
  return { label: formatDate(validUntil), tone: 'normal' }
}

type BulkAction = 'sent' | 'approved' | 'lost'

const BULK_LABELS: Record<BulkAction, string> = {
  sent: 'Marcar como Enviado',
  approved: 'Marcar como Aprovado',
  lost: 'Marcar como Perdido',
}

interface ActiveFilters {
  q?: string
  status?: string
  from?: string
  to?: string
}

interface OrcamentoListTableProps {
  orcamentos: ReadonlyArray<OrcamentoDTO>
  pagination?: DataTablePagination
  hasFilters: boolean
  /** Map serializado lead_id | patient_id → nome resolvido (Camada 10) */
  subjectNames: Record<string, string>
  /** Filtros ativos no URL · usados pelo export CSV pra recriar query */
  activeFilters: ActiveFilters
}

export function OrcamentoListTable({
  orcamentos,
  pagination,
  hasFilters,
  subjectNames,
  activeFilters,
}: OrcamentoListTableProps) {
  const router = useRouter()
  const { success, error, fromResult } = useToast()

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<BulkAction | null>(
    null,
  )
  const [lostModalOpen, setLostModalOpen] = React.useState(false)
  const [lostReason, setLostReason] = React.useState('')
  const [lostError, setLostError] = React.useState<string | null>(null)

  // Limpa selecao quando rows mudam (paginacao/filtro) · mesma UX dos pacientes
  const rowIdsKey = React.useMemo(
    () => orcamentos.map((o) => o.id).join(','),
    [orcamentos],
  )
  React.useEffect(() => {
    setSelected(new Set())
  }, [rowIdsKey])

  const onToggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onToggleAll = React.useCallback((ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  function clearSelection() {
    setSelected(new Set())
  }

  async function runBulkSentOrApproved(action: 'sent' | 'approved') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const r =
        action === 'sent'
          ? await bulkMarkOrcamentosSentAction({ ids })
          : await bulkMarkOrcamentosApprovedAction({ ids })

      if (!r.ok) {
        fromResult(r, {
          errorMessages: {
            invalid_input: 'Seleção inválida · ao menos 1 orçamento.',
            forbidden: 'Sem permissão para esta ação em lote.',
          },
        })
        return
      }
      const { updated, failed, total } = r.data
      const label = action === 'sent' ? 'enviado(s)' : 'aprovado(s)'
      if (failed === 0) {
        success(`${updated}/${total} orçamento(s) marcado(s) como ${label}`)
      } else {
        error(
          `${updated}/${total} marcado(s) como ${label} · ${failed} falharam (status ou validação) · ver console`,
        )
      }
      clearSelection()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function runBulkLost() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const reason = lostReason.trim()
    if (reason.length < 3) {
      setLostError('Motivo obrigatório (mín. 3 caracteres)')
      return
    }
    setBusy(true)
    setLostError(null)
    try {
      const r = await bulkMarkOrcamentosLostAction({ ids, reason })
      if (!r.ok) {
        fromResult(r, {
          errorMessages: {
            invalid_input: 'Seleção inválida ou motivo curto demais (mín. 3).',
            forbidden: 'Sem permissão para esta ação em lote.',
          },
        })
        return
      }
      const { updated, failed, total } = r.data
      if (failed === 0) {
        success(`${updated}/${total} orçamento(s) marcado(s) como perdido(s)`)
      } else {
        error(
          `${updated}/${total} marcado(s) como perdido(s) · ${failed} falharam · ver console`,
        )
      }
      setLostModalOpen(false)
      setLostReason('')
      clearSelection()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    setBusy(true)
    try {
      const r = await exportOrcamentosCsvAction(activeFilters)
      if (!r.ok) {
        if (r.error === 'empty_export') {
          error('Nenhum orçamento bate com os filtros atuais')
        } else {
          fromResult(r)
        }
        return
      }
      const blob = new Blob([r.data.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      if (r.data.truncated) {
        success(
          `${r.data.count} orçamentos exportados (limite atingido · use filtros para refinar)`,
        )
      } else {
        success(`${r.data.count} orçamento(s) exportado(s)`)
      }
    } finally {
      setBusy(false)
    }
  }

  function subjectLabel(o: OrcamentoDTO): {
    primary: string
    secondary: string
    uuid: string | null
  } {
    if (o.patientId) {
      const name = subjectNames[o.patientId]
      return {
        primary: name ?? `Paciente ${o.patientId.slice(0, 8)}`,
        secondary: 'Paciente',
        uuid: o.patientId,
      }
    }
    if (o.leadId) {
      const name = subjectNames[o.leadId]
      return {
        primary: name ?? `Lead ${o.leadId.slice(0, 8)}`,
        secondary: 'Lead',
        uuid: o.leadId,
      }
    }
    return { primary: '—', secondary: '', uuid: null }
  }

  const columns: DataTableColumn<OrcamentoDTO>[] = React.useMemo(
    () => [
      {
        key: 'title',
        label: 'Título',
        render: (o) => (
          <div className="flex flex-col">
            <span className="font-medium text-[var(--foreground)]">
              {o.title || 'Sem título'}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]/70">
              #{o.number ?? o.id.slice(0, 8)} · {formatDate(o.createdAt)}
            </span>
          </div>
        ),
      },
      {
        key: 'subject',
        label: 'Vinculado a',
        hideMobile: true,
        render: (o) => {
          const s = subjectLabel(o)
          return (
            <div
              className="flex flex-col"
              title={s.uuid ? `${s.secondary} · ${s.uuid}` : undefined}
            >
              <span className="text-sm text-[var(--foreground)]">
                {s.primary}
              </span>
              {s.secondary && (
                <span className="text-[10px] text-[var(--muted-foreground)]/70">
                  {s.secondary}
                </span>
              )}
            </div>
          )
        },
      },
      {
        key: 'total',
        label: 'Total',
        align: 'right',
        render: (o) => (
          <span className="font-display-italic text-[var(--foreground)]">
            {BRL.format(o.total)}
          </span>
        ),
      },
      {
        key: 'validity',
        label: 'Validade',
        hideMobile: true,
        render: (o) => {
          const hint = expiryHint(o.validUntil, o.status)
          return (
            <span
              className={
                hint.tone === 'danger'
                  ? 'text-rose-400'
                  : hint.tone === 'warn'
                    ? 'text-amber-400'
                    : 'text-[var(--muted-foreground)]'
              }
            >
              {hint.label}
            </span>
          )
        },
      },
      {
        key: 'status',
        label: 'Status',
        render: (o) => <OrcamentoStatusBadge status={o.status} />,
      },
    ],
    // subjectNames eh um objeto novo a cada page render do RSC · safe
    // como dep porque sempre passa pelo limpa-selecao do rowIdsKey acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjectNames],
  )

  // Empty state real · sem orcamentos
  if (orcamentos.length === 0) {
    return (
      <>
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={busy || !hasFilters}
            title={
              hasFilters
                ? 'Exportar (não há resultados com os filtros atuais)'
                : 'Aplique filtros para refinar antes de exportar'
            }
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
        <EmptyState
          variant="generic"
          title={
            hasFilters
              ? 'Nenhum orçamento bate com os filtros'
              : 'Nenhum orçamento ainda'
          }
          message={
            hasFilters
              ? 'Tente limpar os filtros ou ajustar o período.'
              : 'Crie um orçamento a partir de um lead ou agende um atendimento.'
          }
        />
      </>
    )
  }

  return (
    <>
      {/* Toolbar superior: export sempre · banner bulk só com selecao */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--muted-foreground)]/70">
          Selecione orçamentos para ações em lote · export CSV respeita filtros
          aplicados (máx. 5000 linhas).
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={busy}
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Ações em lote"
          className="sticky top-0 z-30 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-4 py-3 shadow-luxury-md backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 text-sm">
            <span className="font-display-uppercase tracking-widest text-[var(--primary)]">
              {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              disabled={busy}
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction('sent')}
              disabled={busy}
            >
              <Send className="h-4 w-4" />
              Marcar enviado
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction('approved')}
              disabled={busy}
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar aprovado
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setLostReason('')
                setLostError(null)
                setLostModalOpen(true)
              }}
              disabled={busy}
            >
              <XCircle className="h-4 w-4" />
              Marcar perdido
            </Button>
          </div>
        </div>
      )}

      <DataTable<OrcamentoDTO>
        rows={orcamentos}
        columns={columns}
        pagination={pagination}
        onRowClick={(o) => router.push(`/crm/orcamentos/${o.id}`)}
        rowKey={(o) => o.id}
        ariaLabel="Lista de orçamentos"
        bulkSelect={{
          selected,
          onToggle,
          onToggleAll,
        }}
      />

      {/* Confirmacao sent/approved · destrutivo só pra lost (modal proprio) */}
      <ConfirmDialog
        open={confirmAction === 'sent' || confirmAction === 'approved'}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirmAction(null)
        }}
        title={
          confirmAction
            ? `${BULK_LABELS[confirmAction]} (${selected.size}) ?`
            : ''
        }
        description={
          confirmAction === 'approved'
            ? 'Marcar como aprovado define approved_at=agora. Não promove lead a paciente automaticamente · cada conversão exige passos clínicos próprios.'
            : 'Marcar como enviado define sent_at=agora. Use quando o link/proposta já foi entregue ao cliente.'
        }
        confirmLabel="Sim, aplicar"
        cancelLabel="Cancelar"
        confirmVariant="default"
        onConfirm={async () => {
          if (confirmAction === 'sent' || confirmAction === 'approved') {
            await runBulkSentOrApproved(confirmAction)
          }
          setConfirmAction(null)
        }}
      />

      {/* Modal customizado pra "perdido" porque exige textarea com motivo */}
      <Modal
        open={lostModalOpen}
        onOpenChange={(o) => {
          if (!busy) {
            setLostModalOpen(o)
            if (!o) {
              setLostReason('')
              setLostError(null)
            }
          }
        }}
        title={`Marcar ${selected.size} orçamento(s) como perdido(s)?`}
        description="Operação irreversível via UI · o motivo será aplicado a todos os orçamentos selecionados (mín. 3 caracteres)."
        dismissable={!busy}
      >
        <div className="space-y-4">
          <FormField
            label="Motivo (obrigatório)"
            htmlFor="bulk-lost-reason"
            error={lostError ?? undefined}
            required
            hint="Ex: cliente desistiu · sem retorno · valor acima do orçamento · outro fornecedor"
          >
            <Textarea
              id="bulk-lost-reason"
              value={lostReason}
              onChange={(e) => {
                setLostReason(e.target.value)
                if (lostError) setLostError(null)
              }}
              disabled={busy}
              rows={4}
              maxLength={500}
              placeholder="Digite o motivo aplicado a todos os selecionados"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setLostModalOpen(false)
                setLostReason('')
                setLostError(null)
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={runBulkLost}
              disabled={busy || lostReason.trim().length < 3}
            >
              {busy ? 'Processando…' : 'Sim, marcar como perdido'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
