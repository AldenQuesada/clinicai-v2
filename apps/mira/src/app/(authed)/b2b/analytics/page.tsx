/**
 * /b2b/analytics · REPLICA 1:1 do `b2b-analytics.ui.js`.
 *
 * KPIs consolidados Mira B2B:
 *   - Candidaturas (conversão)
 *   - Vouchers (via Mira vs manual)
 *   - Jornada da convidada (funnel 6 etapas)
 *   - Tempo de resposta
 *   - Saúde das parcerias (bar verde/amarelo/vermelho)
 *   - Atividade Mira (WA + NPS + insights)
 *
 * Período configurável: 7d / 30d / 90d.
 */

import { AnalyticsClient } from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const sp = await searchParams
  const initialDays = Number(sp.days) === 7 || Number(sp.days) === 90 ? Number(sp.days) : 30

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <AnalyticsClient initialDays={initialDays} />
      </div>
    </main>
  )
}
