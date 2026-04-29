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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-8">
          <p className="eyebrow mb-3">Painel · Lara</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Campanhas e <em>disparos</em>
          </h1>
          <p
            className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl"
          >
            Disparos manuais para grupos de leads · agendamento, segmentação por fase
            e controle de lote para evitar bloqueio do WhatsApp.
          </p>
        </div>

        <BroadcastDashboard broadcasts={broadcasts} />
        <BroadcastsClient broadcasts={broadcasts} />
      </div>
    </main>
  )
}
