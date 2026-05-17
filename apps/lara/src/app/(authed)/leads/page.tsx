/**
 * /leads · Server Component · port 1:1 do clinic-dashboard "Leads".
 *
 * Filtros lidos via searchParams (URL e a fonte unica de verdade pra:
 * shareable links, refresh sem perder estado, browser back/forward).
 *
 * KPIs no topo (Server Component aninhado · paraleliza counts).
 * Tabela + paginacao (limit=50 default · igual clinic-dashboard).
 *
 * Permissions: `patients:view` redireciona pra /dashboard se faltar.
 *
 * R3_CRM_3A (2026-05-17): lógica de filtros/load extraída pra
 * `@/lib/leads-page-data` e reaproveitada em `/crm/leads` dentro do
 * shell CRM. Esta rota mantém o shell authed (PageContainer + PageHero).
 */

import { redirect } from 'next/navigation'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { LEADS_PAGE_SIZE, loadLeadsPageData } from '@/lib/leads-page-data'
import { LeadsClient } from './LeadsClient'

export const dynamic = 'force-dynamic'

export default async function LeadsPage({
  searchParams,
}: {
  // Next 16 · searchParams agora e Promise<...>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const data = await loadLeadsPageData(sp)

  if (!data.canView) {
    redirect('/dashboard')
  }

  return (
    <PageContainer variant="wide">
      <PageHero
        kicker="Painel · Lara"
        title={<>Lista de <em>leads</em></>}
        lede="Pessoas em contato com a clínica · filtros, KPIs reativos e ações por linha."
      />

      <LeadsClient
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={LEADS_PAGE_SIZE}
        canEdit={data.canEdit}
        canDelete={data.canDelete}
        canCreate={data.canCreate}
      />
    </PageContainer>
  )
}
