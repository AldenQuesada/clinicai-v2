'use client'

/**
 * OrcamentoListTable · client wrapper que monta DataTable de orcamentos.
 *
 * Cliques em row → /crm/orcamentos/[id]. Sem bulk-select (decisao v1 ·
 * legacy nao tinha; bulk delete soft viria com Camada 10 audit).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DataTable,
  EmptyState,
  OrcamentoStatusBadge,
  type DataTableColumn,
  type DataTablePagination,
} from '@clinicai/ui'
import type { OrcamentoDTO } from '@clinicai/repositories'

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

interface OrcamentoListTableProps {
  orcamentos: ReadonlyArray<OrcamentoDTO>
  pagination?: DataTablePagination
  hasFilters: boolean
}

export function OrcamentoListTable({
  orcamentos,
  pagination,
  hasFilters,
}: OrcamentoListTableProps) {
  const router = useRouter()

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
        render: (o) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {o.patientId
              ? `Paciente · ${o.patientId.slice(0, 8)}`
              : o.leadId
                ? `Lead · ${o.leadId.slice(0, 8)}`
                : '—'}
          </span>
        ),
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
    [],
  )

  if (orcamentos.length === 0) {
    return (
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
    )
  }

  return (
    <DataTable<OrcamentoDTO>
      rows={orcamentos}
      columns={columns}
      pagination={pagination}
      onRowClick={(o) => router.push(`/crm/orcamentos/${o.id}`)}
      rowKey={(o) => o.id}
      ariaLabel="Lista de orçamentos"
    />
  )
}
