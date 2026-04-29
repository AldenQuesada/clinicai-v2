/**
 * /crm/orcamentos · listagem + KPIs + filtros.
 *
 * Server Component · busca via repos.orcamentos.list (filtros vem do URL).
 *
 * Funcionalidades cobertas (Camada 9):
 *   - 6 KPIs (total, em aberto, aprovados, conversão, ticket médio, valores)
 *   - Filtros: search title, status, range data criação
 *   - Paginação simples (limit 50)
 *   - Click em row → /crm/orcamentos/[id]
 *
 * Diferido pra Camada 10: bulk actions, export CSV, follow-up scheduler,
 * resolução de nome de paciente/lead na listagem (hoje só no detalhe).
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

  const kpis = computeOrcamentoKpis(orcamentos)
  const hasFilters =
    search.length > 0 ||
    statusParam.length > 0 ||
    createdFrom.length > 0 ||
    createdTo.length > 0

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
        Resolução de nome de paciente/lead na listagem, bulk actions, export CSV
        e follow-up automático → Camada 10.
      </p>
    </div>
  )
}
