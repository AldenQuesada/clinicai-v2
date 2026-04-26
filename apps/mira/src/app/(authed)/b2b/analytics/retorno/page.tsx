/**
 * /b2b/analytics/retorno · subtab "Retorno" do b2bm2.shell.js.
 * Forecast mes + Payback ROI + Velocity (3 widgets financeiros).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Forecast } from './Forecast'
import { Payback } from './Payback'
import { Velocity } from './Velocity'

export const dynamic = 'force-dynamic'

export default async function RetornoPage() {
  const { repos } = await loadMiraServerContext()
  const [forecast, payback, velocity] = await Promise.all([
    repos.b2bMetricsV2.forecast(3, 30).catch(() => null),
    repos.b2bMetricsV2.payback(90, null).catch(() => null),
    repos.b2bMetricsV2.velocity(30, null).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Retorno</h1>
            <p className="b2bm2-sub">
              Projeção do mês vs meta, ROI/payback dos vouchers e velocity até
              primeira voucher de novas parcerias.
            </p>
          </div>
        </header>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full b2bm-widget">
            <Forecast data={forecast} />
          </div>
        </div>

        <div className="b2bm2-row b2bm2-row-2col">
          <div className="b2bm-widget">
            <Payback days={90} data={payback} />
          </div>
          <div className="b2bm-widget">
            <Velocity data={velocity} />
          </div>
        </div>
      </div>
    </main>
  )
}
