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
import { PageHeader, Button } from '@clinicai/ui'
import { Plus } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { KpiCards } from './_components/kpi-cards'
import { PatientFilters } from './_components/patient-filters'
import { SortHeader } from './_components/sort-header'
import { ExportButton } from './_components/export-button'
import { PatientListTable } from './_components/patient-list-table'

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

// Helpers de formatacao de coluna foram movidos pra _components/patient-list-table.tsx
// (Camada 7.5 · client wrapper precisa render JSX que depende deles).

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

  // Sort header em cima da tabela (sem mexer no DataTable existente · UI
  // separada que mostra os 6 sort options + dir)
  const sortOptions: Array<{ field: typeof sortField; label: string }> = [
    { field: 'name', label: 'Nome' },
    { field: 'total_revenue', label: 'Receita' },
    { field: 'last_procedure_at', label: 'Último atend.' },
    { field: 'first_procedure_at', label: 'Cadastro' },
    { field: 'updated_at', label: 'Atualizado' },
  ]

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

      <PatientListTable
        patients={patients}
        hasFilters={!!(search || status || sp.period || sp.from || sp.to)}
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
