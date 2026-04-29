/**
 * /campanhas · Server Component.
 *
 * Lista broadcasts manuais + dashboard analytics.
 *
 * Port 1:1 do clinic-dashboard (broadcast.ui.js + broadcast-dashboard.ui.js).
 * Birthday + retoque pos-procedimento ficam pra commit separado (escopo
 * limitado ao manual broadcast nesta entrega).
 */

import { redirect } from 'next/navigation'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'
import type { BroadcastDTO } from '@clinicai/repositories'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { BroadcastsClient } from './BroadcastsClient'
import { BroadcastDashboard } from './BroadcastDashboard'

export const dynamic = 'force-dynamic'

interface PageData {
  broadcasts: BroadcastDTO[]
  canBroadcast: boolean
}

async function loadData(): Promise<PageData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const canBroadcast = can(ctx.role, 'notifications:broadcast')
    if (!canBroadcast) {
      return { broadcasts: [], canBroadcast: false }
    }
    const result = await repos.broadcasts.list()
    return {
      broadcasts: result.ok ? (result.data ?? []) : [],
      canBroadcast: true,
    }
  } catch (e) {
    console.error('[/campanhas] loadData failed:', (e as Error).message)
    return { broadcasts: [], canBroadcast: false }
  }
}

export default async function CampanhasPage() {
  const { broadcasts, canBroadcast } = await loadData()

  if (!canBroadcast) {
    redirect('/dashboard')
  }

  return (
    <PageContainer variant="wide">
      <PageHero
        kicker="Painel · Lara"
        title={<>Campanhas de <em>disparo</em></>}
        lede="Broadcasts manuais · agendamento · dashboard de envio"
      />

      <BroadcastDashboard broadcasts={broadcasts} />
      <BroadcastsClient broadcasts={broadcasts} />
    </PageContainer>
  )
}
