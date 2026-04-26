/**
 * /b2b/analytics/crescimento · Cockpit semanal + Funil pipeline.
 *
 * Cockpit usa janela fixa de 12 SEMANAS (granularidade semanal independe
 * do filtro porque a UI mostra grid das ultimas 12 semanas literais).
 * Funil pipeline aceita o time range (default 30d).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Cockpit } from './Cockpit'
import { Funnel } from './Funnel'
import {
  TimeRangePicker,
  parseTimeRange,
} from '../_shared/TimeRangePicker'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function CrescimentoPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const tr = parseTimeRange(sp)
  const funnelDays = tr.days ?? Math.max(
    1,
    Math.ceil(
      (new Date(tr.toIso! + 'T23:59:59Z').getTime() -
        new Date(tr.fromIso! + 'T00:00:00Z').getTime()) /
        86400000,
    ),
  )

  const { repos } = await loadMiraServerContext()
  const [growth, funnel] = await Promise.all([
    repos.b2bMetricsV2.growthWeekly(12).catch(() => null),
    repos.b2bMetricsV2.pipelineFunnel(funnelDays).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Crescimento</h1>
            <p className="b2bm2-sub">
              Seu trabalho · meta 1 parceria/semana (cockpit fixo) + funil de
              conversão na janela selecionada.
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full">
            <Cockpit data={growth} />
          </div>
        </div>

        <div className="b2bm2-row">
          <div className="b2bm2-col-full">
            <Funnel data={funnel} />
          </div>
        </div>
      </div>
    </main>
  )
}
