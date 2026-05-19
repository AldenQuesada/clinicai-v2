/**
 * /crm/leads · lista de leads dentro do shell CRM.
 *
 * R3_CRM_3A (2026-05-17): substitui o redirect anterior por página real.
 * Razão (audit R3_CRM): clicar "Leads" no menu CRM levava o usuário pra
 * `/leads` (shell authed) · sidebar trocava · perda de contexto.
 *
 * Reusa `loadLeadsPageData` + `LeadsClient` do `/leads` (authed).
 * Diferença: aqui o shell CRM já é provido por `app/crm/layout.tsx`
 * (sidebar CRM + auth gate). Header usa `PageHeader` (padrão CRM)
 * em vez de `PageHero` (padrão authed).
 *
 * `/leads` (authed) segue funcional · não removemos. Bookmarks e
 * referências antigas continuam válidos.
 */

import { redirect } from 'next/navigation'
import { PageHeader } from '@clinicai/ui'
import { LEADS_PAGE_SIZE, loadLeadsPageData } from '@/lib/leads-page-data'
import { LeadsClient } from '@/app/(authed)/leads/LeadsClient'

export const dynamic = 'force-dynamic'

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const data = await loadLeadsPageData(sp)

  if (!data.canView) {
    redirect('/dashboard')
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Leads"
        description="Gerencie e acompanhe seus leads por fase."
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
    </div>
  )
}
