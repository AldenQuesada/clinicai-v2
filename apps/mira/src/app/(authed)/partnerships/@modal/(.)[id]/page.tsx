/**
 * Intercepting modal · /partnerships/(.)[id]
 *
 * Pedido Alden 2026-04-26: clicar no card abre OVERLAY (poupa click).
 * Lista fica visivel atras do modal · ESC + click outside fecham
 * (router.back · volta pra /partnerships preservando estado).
 *
 * Renderiza o mesmo PartnershipDetailLayout que /partnerships/[id]/page.tsx ·
 * zero duplicacao. URL muda pra /partnerships/[id] mas Next NAO desmonta a
 * lista (parallel routes + intercepting magic).
 *
 * Acesso direto a /partnerships/[id] (URL · reload) NAO ativa intercepting ·
 * cai em [id]/page.tsx full screen.
 */

import { notFound } from 'next/navigation'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  PartnershipDetailLayout,
  VALID_TABS,
  type DetailTabKey,
} from '../../[id]/PartnershipDetailLayout'
import { PartnershipModalShell } from './PartnershipModalShell'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function InterceptedPartnershipModal({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const { ctx, repos } = await loadMiraServerContext()

  const partnership = await repos.b2bPartnerships.getById(id)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    notFound()
  }

  const activeTab: DetailTabKey =
    sp.tab && VALID_TABS.includes(sp.tab) ? (sp.tab as DetailTabKey) : 'detail'

  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  const managers =
    activeTab === 'detail'
      ? await repos.b2bCollab.teamManagers().catch(() => [])
      : []

  return (
    <PartnershipModalShell partnershipId={id}>
      <PartnershipDetailLayout
        partnership={partnership}
        activeTab={activeTab}
        canManage={canManage}
        managers={managers.map((m) => m.name || m.email || 'sem-nome').filter(Boolean)}
        inModal
      />
    </PartnershipModalShell>
  )
}
