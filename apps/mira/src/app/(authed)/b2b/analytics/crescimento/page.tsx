/**
 * /b2b/analytics/crescimento · pagina unica de crescimento + retorno.
 *
 * 2026-04-26: absorveu /b2b/analytics/retorno (Forecast/Payback/Velocity).
 * Razao: usuario reclamou de /retorno com cards enormes em fluxo separado ·
 * todos os widgets de "evolucao da operacao" passam a viver aqui pra dar
 * visao unificada (curto prazo · medio prazo · ROI · velocity).
 *
 * Layout:
 *   Linha 1 · Cockpit semanal | Forecast mensal           (curto vs proj.)
 *   Linha 2 · Pipeline funnel (full-width)                (estado pipeline)
 *   Linha 3 · Velocity | Payback / ROI                    (eficiencia)
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Cockpit } from './Cockpit'
import { Funnel } from './Funnel'
import { Forecast } from './Forecast'
import { Payback } from './Payback'
import { Velocity } from './Velocity'
import { TimeRangePicker } from '../_shared/TimeRangePicker'
import { parseTimeRange } from '../_shared/timeRangeUtils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function CrescimentoPage({ searchParams }: PageProps) {
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
  const [growth, funnel, forecast, payback, velocity] = await Promise.all([
    repos.b2bMetricsV2.growthWeekly(12).catch(() => null),
    repos.b2bMetricsV2.pipelineFunnel(days).catch(() => null),
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
            <h1 className="b2bm2-title">Crescimento</h1>
            <p className="b2bm2-sub">
              Cockpit semanal + projeção mensal + ROI/velocity dos vouchers.
              Tudo de evolução da operação numa vista só.
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        {/* Linha 1 · curto prazo (semana) | medio prazo (projecao mes) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Cockpit data={growth} />
          <div className="b2bm-widget">
            <Forecast data={forecast} />
          </div>
        </div>

        {/* Linha 2 · pipeline state (full-width pra dar destaque ao fluxo) */}
        <div style={{ marginBottom: 16 }}>
          <Funnel data={funnel} />
        </div>

        {/* Linha 3 · eficiencia · velocity (tempo) | payback (dinheiro) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
          }}
        >
          <div className="b2bm-widget">
            <Velocity data={velocity} />
          </div>
          <div className="b2bm-widget">
            <Payback days={days} data={payback} />
          </div>
        </div>
      </div>
    </main>
  )
}
