/**
 * /configuracoes/anamneses · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER.
 *
 * Builder admin de templates de anamnese. Lista templates da clínica com
 * KPIs (total · ativos · inativos · perguntas configuradas) + filtros
 * (busca · status · categoria) e ações top-level (criar template,
 * editar metadados, ativar/desativar).
 *
 * Sessions/fields/options são listados em modo preview na rota
 * `/configuracoes/anamneses/[id]` (read-only) · admin avançado de campos
 * vive em fase futura, reusando RPCs já existentes (`reorder_anamnesis_*`).
 *
 * Hard gate clínico intocado.
 */

import { PageHeader } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import type { AnamnesisTemplateCategory } from '@clinicai/repositories'
import { AnamnesisTemplatesAdminClient } from './_client'

export const dynamic = 'force-dynamic'

interface PageSearch {
  q?: string
  status?: 'active' | 'inactive' | 'all'
  category?: AnamnesisTemplateCategory | 'all'
}

export default async function AnamnesisTemplatesAdminPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const filter = {
    search: sp.q ?? null,
    status: sp.status ?? 'all',
    category: (sp.category ?? 'all') as AnamnesisTemplateCategory | 'all',
    limit: 200,
  } as const

  const [templates, counts] = await Promise.all([
    repos.anamnesisTemplates.list(filter),
    repos.anamnesisTemplates.getCounts(),
  ])

  const canEdit = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        title="Anamneses"
        description="Modelos de anamnese da clínica · usados no prontuário e fluxos clínicos. Hard gate e respostas continuam intactos."
        breadcrumb={[
          { label: 'Configurações', href: '/configuracoes' },
          { label: 'Anamneses' },
        ]}
      />
      {!canEdit && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ Você está em modo leitura · apenas owner/admin podem criar/editar
          modelos. RLS no banco bloqueia operações.
        </p>
      )}
      <AnamnesisTemplatesAdminClient
        items={templates}
        counts={counts}
        currentFilter={{
          search: sp.q ?? '',
          status: sp.status ?? 'all',
          category: (sp.category ?? 'all') as AnamnesisTemplateCategory | 'all',
        }}
        canEdit={canEdit}
      />
    </div>
  )
}
