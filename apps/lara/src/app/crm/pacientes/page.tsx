/**
 * /crm/pacientes · lista paginada de pacientes da clinica.
 *
 * RSC · reads via repos.patients direto (Camada 5 convention).
 * URL params: ?q=&status=&period=&from=&to=&sort=&dir=&page=
 *
 * Espelha clinic-dashboard legacy js/patients.js feature-by-feature
 * (KPIs header, sort 6 colunas, filtros, export CSV) · com modelo
 * excludente forte ADR-001 + tipos canonicos v2.
 *
 * 2 KPIs deferidos pra Camada 8 (Agenda): "Retorno" + "Return Days".
 */

import Link from 'next/link'
import { Suspense } from 'react'
import {
  PageHeader,
  DataTable,
  EmptyState,
  PatientStatusBadge,
  Button,
  type DataTableColumn,
} from '@clinicai/ui'
import { Plus, Eye } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import type { PatientDTO } from '@clinicai/repositories'
import { KpiCards } from './_components/kpi-cards'
import { PatientFilters } from './_components/patient-filters'
import { SortHeader } from './_components/sort-header'
import { ExportButton } from './_components/export-button'

export const dynamic = 'force-dynamic'

const PER_PAGE = 20

interface PageSearch {
  q?: string
  status?: 'active' | 'inactive' | 'blocked' | 'deceased'
  period?: string
  from?: string
  to?: string
  sort?: string
  dir?: string
  page?: string
}

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

/**
 * Status de retorno (espelho legacy js/patients.js · churnIndicator).
 *   - 'RISCO'   · sem contato > 180 dias OU sem registro algum (status active)
 *   - 'ATENCAO' · sem contato 90-180 dias
 *   - null      · sem alerta (recente OU paciente nao-active)
 */
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

export default async function PatientsListPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  // Resolve filtros + sort do URL
  const search = sp.q?.trim() || undefined
  const status = sp.status || undefined
  const sortField = (sp.sort ?? 'updated_at') as
    | 'name'
    | 'updated_at'
    | 'created_at'
    | 'total_revenue'
    | 'last_procedure_at'
    | 'first_procedure_at'
  const sortDir = (sp.dir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Period preset → createdSince/createdUntil
  let createdSince: string | undefined
  let createdUntil: string | undefined
  if (sp.period === 'custom') {
    if (sp.from) createdSince = `${sp.from}T00:00:00.000Z`
    if (sp.to) createdUntil = `${sp.to}T23:59:59.999Z`
  } else if (sp.period && /^\d+$/.test(sp.period)) {
    const days = parseInt(sp.period, 10)
    createdSince = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString()
  }

  const filterArgs = {
    search,
    status,
    createdSince,
    createdUntil,
  }

  // KPIs + lista + count + orcamentos abertos · todos em paralelo
  const todayIso = new Date().toISOString().slice(0, 10)
  const [aggregates, patients, totalCount, orcSentCount, orcSentRows] =
    await Promise.all([
      repos.patients.aggregates(ctx.clinic_id).catch(() => ({
        total: 0,
        active: 0,
        churn: 0,
        churnPct: 0,
        revenueTotal: 0,
        proceduresTotal: 0,
        ticketAvg: 0,
      })),
      repos.patients.list(ctx.clinic_id, {
        ...filterArgs,
        sort: sortField,
        sortDir,
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
      }),
      repos.patients.countWithFilters(ctx.clinic_id, filterArgs),
      repos.orcamentos.countByStatus(ctx.clinic_id, 'sent').catch(() => 0),
      repos.orcamentos
        .list(ctx.clinic_id, { status: 'sent', limit: 500 })
        .catch(() => []),
    ])

  const orcSentValue = orcSentRows.reduce((sum, o) => sum + Number(o.total), 0)

  // Colunas da DataTable
  const columns: ReadonlyArray<DataTableColumn<PatientDTO>> = [
    {
      key: 'name',
      label: 'Paciente', // SortHeader montado abaixo
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

  // Sort header em cima da tabela (sem mexer no DataTable existente · UI
  // separada que mostra os 6 sort options + dir)
  const sortOptions: Array<{ field: typeof sortField; label: string }> = [
    { field: 'name', label: 'Nome' },
    { field: 'total_revenue', label: 'Receita' },
    { field: 'last_procedure_at', label: 'Último atend.' },
    { field: 'first_procedure_at', label: 'Cadastro' },
    { field: 'updated_at', label: 'Atualizado' },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Pacientes"
        description={`${totalCount} ${totalCount === 1 ? 'paciente' : 'pacientes'} encontrado${totalCount === 1 ? '' : 's'} · clínica ${ctx.clinic_id.slice(0, 8)}…`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Pacientes' },
        ]}
        actions={
          <>
            <ExportButton status={status} />
            <Link href="/crm/pacientes/novo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Novo paciente
              </Button>
            </Link>
          </>
        }
      />

      <KpiCards
        total={aggregates.total}
        active={aggregates.active}
        churn={aggregates.churn}
        churnPct={aggregates.churnPct}
        revenueTotal={aggregates.revenueTotal}
        proceduresTotal={aggregates.proceduresTotal}
        ticketAvg={aggregates.ticketAvg}
        orcamentoOpenCount={orcSentCount}
        orcamentoOpenValue={orcSentValue}
      />

      <div className="mt-6">
        <Suspense fallback={null}>
          <PatientFilters />
        </Suspense>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
          Ordenar:
        </span>
        {sortOptions.map((o) => (
          <Suspense key={o.field} fallback={null}>
            <SortHeader field={o.field} label={o.label} className="text-xs" />
          </Suspense>
        ))}
      </div>

      <DataTable
        rows={patients}
        columns={columns}
        rowKey={(p) => p.id}
        ariaLabel="Lista de pacientes"
        rowHref={(p) => `/crm/pacientes/${p.id}`}
        emptyState={
          <EmptyState
            variant="leads"
            title={
              search || status ? 'Nenhum paciente com esses filtros' : 'Sem pacientes ainda'
            }
            message={
              search || status
                ? 'Tente limpar os filtros para ver outros resultados.'
                : 'Cadastre o primeiro paciente clicando em "Novo paciente" acima.'
            }
          />
        }
        pagination={{
          page,
          perPage: PER_PAGE,
          total: totalCount,
          baseHref: '/crm/pacientes',
          preserveParams: {
            q: search,
            status,
            period: sp.period,
            from: sp.from,
            to: sp.to,
            sort: sp.sort,
            dir: sp.dir,
          },
        }}
      />

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        2 KPIs deferidos pra Camada 8 (Agenda): Retorno (count com appointments
        futuros) + Return Days médio.
      </p>
    </div>
  )
}
