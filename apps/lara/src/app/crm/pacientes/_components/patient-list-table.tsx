'use client'

/**
 * PatientListTable · client wrapper que monta DataTable de pacientes COM
 * bulk-select + banner de acoes em lote (Camada 7.5).
 *
 * RSC pai (page.tsx) faz fetch + passa `patients` serializado · este client
 * mantem state da selecao (Set<string>) e renderiza coluna checkbox + banner
 * sticky com acoes (mudar status / exportar selecionados).
 *
 * Decisao de arquitetura:
 *   - Columns sao montadas AQUI (nao no RSC) porque agora dependem de
 *     client-only callbacks (`onClick={(e)=>e.stopPropagation()}` ja era
 *     aceitavel em RSC, mas centralizar simplifica a vida).
 *   - Selecao NUNCA persiste cross-page (URL navigation reseta) · trade-off
 *     consciente · matches behaviour do legacy clinic-dashboard.
 *   - Bulk actions: status (active/inactive/blocked/deceased) + export CSV
 *     dos selecionados. Outros (delete em lote, atribuir, tag) ficam
 *     pra Camada 8+ se demanda surgir.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PatientStatusBadge,
  Select,
  useToast,
  type DataTableColumn,
  type DataTablePagination,
} from '@clinicai/ui'
import { Download, Eye, X } from 'lucide-react'
import type { PatientDTO, PatientStatus } from '@clinicai/repositories'
import {
  bulkUpdatePatientStatusAction,
  exportPatientsCsvAction,
} from '../_actions'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatPhoneDisplay(phone: string | null): string {
  if (!phone) return '—'
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return phone
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return 'sem registro'
  try {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'hoje'
    if (days === 1) return 'ontem'
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.floor(days / 30)}m`
    return `${Math.floor(days / 365)}a`
  } catch {
    return '—'
  }
}

/** Espelho do helper churnLevel da page.tsx · mantido sincronizado a olho. */
function churnLevel(
  lastAt: string | null,
  status: string,
): 'risco' | 'atencao' | null {
  if (status !== 'active') return null
  if (!lastAt) return 'risco'
  try {
    const days = Math.floor(
      (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (days > 180) return 'risco'
    if (days > 90) return 'atencao'
    return null
  } catch {
    return null
  }
}

const STATUS_OPTIONS: Array<{ value: PatientStatus; label: string }> = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'deceased', label: 'Falecido' },
]

const STATUS_LABEL: Record<PatientStatus, string> = {
  active: 'Ativos',
  inactive: 'Inativos',
  blocked: 'Bloqueados',
  deceased: 'Falecidos',
}

interface PatientListTableProps {
  patients: ReadonlyArray<PatientDTO>
  pagination: DataTablePagination
  /** Filtros aplicados · mostrados no empty-state msg */
  hasFilters: boolean
}

export function PatientListTable({
  patients,
  pagination,
  hasFilters,
}: PatientListTableProps) {
  const router = useRouter()
  const { success, error, fromResult } = useToast()

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pendingStatus, setPendingStatus] = React.useState<PatientStatus | ''>(
    '',
  )

  // Limpa selecao toda vez que rows mudarem (paginacao/filtro/sort).
  // Compara IDs · se conjunto mudou, drop selection (UX: selecionou na pag 1,
  // foi pra pag 2 → nao confuse).
  const rowIdsKey = React.useMemo(
    () => patients.map((p) => p.id).join(','),
    [patients],
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

  async function handleConfirmStatus() {
    if (!pendingStatus) return
    setBusy(true)
    try {
      const r = await bulkUpdatePatientStatusAction({
        ids: Array.from(selected),
        status: pendingStatus,
      })
      if (!r.ok) {
        fromResult(r, {
          errorMessages: {
            forbidden:
              'Apenas owner, admin ou recepção podem alterar status em lote.',
            invalid_input: 'Dados inválidos · selecione ao menos 1 paciente.',
          },
        })
        return
      }
      const { updated, failed, total } = r.data
      if (failed === 0) {
        success(`${updated}/${total} paciente(s) atualizado(s) para ${STATUS_LABEL[pendingStatus]}`)
      } else {
        error(
          `${updated}/${total} atualizado(s). ${failed} falharam · ver console.`,
        )
      }
      clearSelection()
      setPendingStatus('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleExportSelected() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const r = await exportPatientsCsvAction({
        ids: Array.from(selected),
      })
      if (!r.ok) {
        if (r.error === 'empty_export') {
          error('Nenhum paciente correspondente aos IDs selecionados')
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
      success(`${r.data.count} pacientes exportados`)
    } finally {
      setBusy(false)
    }
  }

  const columns: ReadonlyArray<DataTableColumn<PatientDTO>> = [
    {
      key: 'name',
      label: 'Paciente',
      render: (p) => (
        <div>
          <div className="text-sm font-medium text-[var(--foreground)]">
            {p.name || '—'}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {formatPhoneDisplay(p.phone)}
          </div>
          {p.email && (
            <div className="text-[10px] text-[var(--muted-foreground)]/70">
              {p.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => <PatientStatusBadge status={p.status} />,
    },
    {
      key: 'procedures',
      label: 'Procedimentos',
      align: 'right',
      hideMobile: true,
      render: (p) => (
        <span className="text-sm text-[var(--foreground)]">
          {p.totalProcedures}
        </span>
      ),
    },
    {
      key: 'revenue',
      label: 'Receita',
      align: 'right',
      render: (p) => (
        <span className="text-sm font-medium text-[var(--foreground)]">
          {p.totalRevenue > 0 ? BRL.format(p.totalRevenue) : '—'}
        </span>
      ),
    },
    {
      key: 'last_procedure',
      label: 'Último atendimento',
      hideMobile: true,
      render: (p) => {
        const level = churnLevel(p.lastProcedureAt, p.status)
        return (
          <div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {formatRelativeDate(p.lastProcedureAt)}
            </div>
            {level === 'risco' && (
              <div
                className="mt-0.5 text-[9px] font-display-uppercase tracking-widest text-rose-400"
                title={
                  p.lastProcedureAt
                    ? 'Sem contato há mais de 180 dias'
                    : 'Sem registro de atendimento'
                }
              >
                Risco
              </div>
            )}
            {level === 'atencao' && (
              <div
                className="mt-0.5 text-[9px] font-display-uppercase tracking-widest text-amber-400"
                title="Sem contato 90-180 dias"
              >
                Atenção
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (p) => (
        <Link
          href={`/crm/pacientes/${p.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="h-3 w-3" />
          Ver
        </Link>
      ),
    },
  ]

  return (
    <>
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
            <Select
              aria-label="Mudar status em lote"
              value={pendingStatus}
              onChange={(e) => {
                const v = e.target.value as PatientStatus | ''
                setPendingStatus(v)
                if (v) setConfirmOpen(true)
              }}
              disabled={busy}
              className="min-w-[180px]"
            >
              <option value="">Mudar status para…</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSelected}
              disabled={busy}
            >
              <Download className="h-4 w-4" />
              Exportar selecionados
            </Button>
          </div>
        </div>
      )}

      <DataTable
        rows={patients}
        columns={columns}
        rowKey={(p) => p.id}
        ariaLabel="Lista de pacientes"
        rowHref={(p) => `/crm/pacientes/${p.id}`}
        bulkSelect={{
          selected,
          onToggle,
          onToggleAll,
        }}
        emptyState={
          <EmptyState
            variant="leads"
            title={hasFilters ? 'Nenhum paciente com esses filtros' : 'Sem pacientes ainda'}
            message={
              hasFilters
                ? 'Tente limpar os filtros para ver outros resultados.'
                : 'Cadastre o primeiro paciente clicando em "Novo paciente" acima.'
            }
          />
        }
        pagination={pagination}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o)
          if (!o && !busy) setPendingStatus('')
        }}
        title={`Marcar ${selected.size} paciente(s) como ${pendingStatus ? STATUS_LABEL[pendingStatus] : ''}?`}
        description="A mudança de status afeta KPIs, churn e visibilidade nas listas filtradas. Pacientes marcados como Falecido ou Bloqueado não aparecem em campanhas Lara."
        confirmLabel="Sim, alterar status"
        cancelLabel="Cancelar"
        confirmVariant="default"
        onConfirm={handleConfirmStatus}
      />
    </>
  )
}
