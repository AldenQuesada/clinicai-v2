/**
 * /crm/orcamentos · listagem + KPIs + filtros + bulk actions + export CSV.
 *
 * Server Component · busca via repos.orcamentos.list (filtros vem do URL).
 *
 * Funcionalidades cobertas (Camada 9 → 10):
 *   - 6 KPIs (total, em aberto, aprovados, conversão, ticket médio, valores)
 *   - Filtros: search title, status, range data criação
 *   - Paginação simples (limit 50)
 *   - Click em row → /crm/orcamentos/[id]
 *   - **Camada 10:** bulk actions (mark sent/approved/lost) + export CSV +
 *     resolução de nome de lead/paciente na listagem (bulk via findByIds).
 *
 * Diferido pra Camada 11: follow-up scheduler manual.
 */

import Link from 'next/link'
import { Button, Card, PageHeader } from '@clinicai/ui'
import { Plus } from 'lucide-react'
import type { OrcamentoStatus } from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import {
  OrcamentoKpiCards,
  computeOrcamentoKpis,
} from './_components/kpi-cards'
import { OrcamentoListTable } from './_components/orcamento-list-table'
import { OrcamentoFilters } from './_components/orcamento-filters'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: ReadonlyArray<OrcamentoStatus> = [
  'draft',
  'sent',
  'viewed',
  'followup',
  'negotiation',
  'approved',
  'lost',
]

interface PageSearch {
  q?: string
  status?: string
  from?: string
  to?: string
  page?: string
}

export default async function OrcamentosListPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const search = (sp.q ?? '').trim()
  const statusParam = sp.status ?? ''
  const createdFrom = sp.from ?? ''
  const createdTo = sp.to ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const perPage = 50
  const offset = (page - 1) * perPage

  const status =
    statusParam !== '' && statusParam !== 'open'
      ? VALID_STATUSES.includes(statusParam as OrcamentoStatus)
        ? (statusParam as OrcamentoStatus)
        : undefined
      : undefined
  const openOnly = statusParam === 'open'

  const { ctx, repos } = await loadServerReposContext()

  const orcamentos = await repos.orcamentos
    .list(ctx.clinic_id, {
      limit: perPage,
      offset,
      status,
      openOnly,
      search: search.length > 0 ? search : undefined,
      createdFrom: createdFrom.length > 0 ? createdFrom : undefined,
      createdTo: createdTo.length > 0 ? createdTo : undefined,
    })
    .catch(() => [])

  // Resolve nomes de lead/paciente em batch (Camada 10) · evita N+1 e
  // permite listagem mostrar nome ao invés de UUID truncado.
  const leadIds = Array.from(
    new Set(
      orcamentos.map((o) => o.leadId).filter((v): v is string => !!v),
    ),
  )
  const patientIds = Array.from(
    new Set(
      orcamentos.map((o) => o.patientId).filter((v): v is string => !!v),
    ),
  )

  const [leadsMap, patientsMap] = await Promise.all([
    leadIds.length
      ? repos.leads.findByIds(ctx.clinic_id, leadIds).catch(() => new Map())
      : Promise.resolve(new Map()),
    patientIds.length
      ? repos.patients
          .findByIds(ctx.clinic_id, patientIds)
          .catch(() => new Map())
      : Promise.resolve(new Map()),
  ])

  // Achata em registry serializavel (Server → Client component boundary
  // não passa Map nativo limpo; converte pra Record<id, name>).
  const subjectNames: Record<string, string> = {}
  for (const [id, lead] of leadsMap.entries()) {
    if (lead?.name) subjectNames[id] = lead.name
  }
  for (const [id, patient] of patientsMap.entries()) {
    if (patient?.name) subjectNames[id] = patient.name
  }

  const kpis = computeOrcamentoKpis(orcamentos)
  const hasFilters =
    search.length > 0 ||
    statusParam.length > 0 ||
    createdFrom.length > 0 ||
    createdTo.length > 0

  // Filtros ativos pra passar pro client · usados pelo export CSV
  // (recria os mesmos parâmetros via Server Action).
  const activeFilters = {
    q: search.length > 0 ? search : undefined,
    status: statusParam.length > 0 ? statusParam : undefined,
    from: createdFrom.length > 0 ? createdFrom : undefined,
    to: createdTo.length > 0 ? createdTo : undefined,
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Orçamentos"
        description="Pipeline de propostas comerciais"
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Orçamentos' },
        ]}
        actions={
          <Link href="/crm/orcamentos/novo">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Novo orçamento
            </Button>
          </Link>
        }
      />

      <OrcamentoKpiCards kpis={kpis} />

      <Card className="p-4">
        <OrcamentoFilters
          initial={{
            search,
            status: statusParam,
            createdFrom,
            createdTo,
          }}
        />

        <OrcamentoListTable
          orcamentos={orcamentos}
          hasFilters={hasFilters}
          subjectNames={subjectNames}
          activeFilters={activeFilters}
          pagination={{
            page,
            perPage,
            baseHref: '/crm/orcamentos',
            preserveParams: {
              q: search || undefined,
              status: statusParam || undefined,
              from: createdFrom || undefined,
              to: createdTo || undefined,
            },
          }}
        />
      </Card>

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        Bulk actions e export CSV ativos · follow-up scheduler manual fica pra
        Camada 11. Export limitado a 5000 linhas · use filtros para refinar.
      </p>
    </div>
  )
}
