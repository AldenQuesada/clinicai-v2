/**
 * /b2b/analytics/parceiros · subtab "Parceiros" do b2bm2.shell.js.
 * Scatter (volume × conversao) + Heatmap (12 sem) + Ranking 90d.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Scatter } from './Scatter'
import { Heatmap } from './Heatmap'
import { Ranking } from './Ranking'

export const dynamic = 'force-dynamic'

export default async function ParceirosPage() {
  const { repos } = await loadMiraServerContext()
  const [performance, vouchers] = await Promise.all([
    repos.b2bMetricsV2.partnerPerformance(90),
    repos.b2bMetricsV2.recentVoucherIssuances(12).catch(() => []),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Parceiros</h1>
            <p className="b2bm2-sub">
              Performance das parcerias · scatter por volume × conversão,
              heatmap de atividade 12 semanas, ranking detalhado rolling 90d.
            </p>
          </div>
        </header>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full">
            <Scatter rows={performance} />
          </div>
        </div>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full">
            <Heatmap rows={performance} vouchers={vouchers} />
          </div>
        </div>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full">
            <Ranking rows={performance} />
          </div>
        </div>
      </div>
    </main>
  )
}
