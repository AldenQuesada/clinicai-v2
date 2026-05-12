/**
 * /configuracoes/procedimentos · CRUD admin de procedimentos.
 *
 * Fonte canônica: public.clinic_procedimentos (RLS · admin/owner mutations).
 * Wizard de agendamento consome procedimentos ativos (via texto livre hoje ·
 * port futuro pode usar Select com FK).
 *
 * Esta página é admin/owner only. RLS reforça no DB · UI bloqueia botões pra
 * outros roles.
 */

import { PageHeader } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { ProceduresAdminClient } from './_client'

export const dynamic = 'force-dynamic'

interface PageSearch {
  q?: string
  status?: 'active' | 'inactive' | 'all'
  categoria?: string
}

export default async function ProceduresAdminPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const filter = {
    search: sp.q ?? null,
    status: sp.status ?? 'all',
    categoria: sp.categoria ?? null,
    limit: 200,
  } as const

  const [procedures, counts, categorias] = await Promise.all([
    repos.procedureAdmin.list(filter),
    repos.procedureAdmin.getCounts(),
    repos.procedureAdmin.listCategorias(),
  ])

  const canEdit = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        title="Procedimentos"
        description="Catálogo da clínica · usado por agendamento, orçamento e dashboards"
        breadcrumb={[
          { label: 'Configurações', href: '/configuracoes' },
          { label: 'Procedimentos' },
        ]}
      />
      {!canEdit && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ Você está em modo leitura · apenas owner/admin podem criar/editar
          procedimentos. RLS no banco bloqueia operações.
        </p>
      )}
      <ProceduresAdminClient
        items={procedures}
        counts={counts}
        categorias={categorias}
        currentFilter={{
          search: filter.search ?? '',
          status: filter.status,
          categoria: filter.categoria ?? 'all',
        }}
        canEdit={canEdit}
      />
    </div>
  )
}
