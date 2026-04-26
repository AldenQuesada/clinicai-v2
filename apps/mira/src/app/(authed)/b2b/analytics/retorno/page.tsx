/**
 * /b2b/analytics/retorno · Forecast mes + Payback ROI + Velocity.
 *
 * Forecast usa metas fixas (3 parcerias, 30 vouchers) · independe do range.
 * Payback e Velocity aceitam time range (default 30d · scale relevante).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Forecast } from './Forecast'
import { Payback } from './Payback'
import { Velocity } from './Velocity'
import { TimeRangePicker } from '../_shared/TimeRangePicker'
import { parseTimeRange } from '../_shared/timeRangeUtils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function RetornoPage({ searchParams }: PageProps) {
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

  const { repos } = await loadMiraServerContext()
  const [forecast, payback, velocity] = await Promise.all([
    repos.b2bMetricsV2.forecast(3, 30).catch(() => null),
    repos.b2bMetricsV2.payback(days, null).catch(() => null),
    repos.b2bMetricsV2.velocity(days, null).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Retorno</h1>
            <p className="b2bm2-sub">
              Projeção do mês (meta fixa) + ROI/payback e velocity dos vouchers
              na janela selecionada.
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full b2bm-widget">
            <Forecast data={forecast} />
          </div>
        </div>

        <div className="b2bm2-row b2bm2-row-2col">
          <div className="b2bm-widget">
            <Payback days={days} data={payback} />
          </div>
          <div className="b2bm-widget">
            <Velocity data={velocity} />
          </div>
        </div>
      </div>
    </main>
  )
}
