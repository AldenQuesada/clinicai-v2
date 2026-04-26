/**
 * /b2b/analytics/parceiros · Scatter (volume × conv) + Heatmap + Ranking.
 *
 * Janela temporal aplicada em b2b_partner_performance(days) e
 * recentVoucherIssuances(weeks) · default 30d.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Scatter } from './Scatter'
import { Heatmap } from './Heatmap'
import { Ranking } from './Ranking'
import { TimeRangePicker } from '../_shared/TimeRangePicker'
import { parseTimeRange } from '../_shared/timeRangeUtils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function ParceirosPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const tr = parseTimeRange(sp)
  const days = tr.days ?? Math.max(
    1,
    Math.ceil(
      (new Date(tr.toIso! + 'T23:59:59Z').getTime() -
        new Date(tr.fromIso! + 'T00:00:00Z').getTime()) /
        86400000,
    ),
  )
  const heatmapWeeks = Math.min(24, Math.max(4, Math.ceil(days / 7)))

  const { repos } = await loadMiraServerContext()
  const [performance, vouchers] = await Promise.all([
    repos.b2bMetricsV2.partnerPerformance(days),
    repos.b2bMetricsV2.recentVoucherIssuances(heatmapWeeks).catch(() => []),
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
              heatmap de atividade ({heatmapWeeks} sem) e ranking detalhado.
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        {/* Layout 2-col · pedido Alden 2026-04-26.
            Esquerda: Ranking (tabela completa com todos parceiros).
            Direita: Scatter + Heatmap empilhados (visualizacoes de leitura
            rapida). Em telas <1100px colapsa pra single column. */}
        <div className="b2bm2-parceiros-2col">
          <div className="b2bm2-parceiros-main">
            <Ranking rows={performance} />
          </div>
          <aside className="b2bm2-parceiros-side">
            <Scatter rows={performance} />
            <Heatmap rows={performance} vouchers={vouchers} />
          </aside>
        </div>
      </div>
    </main>
  )
}
