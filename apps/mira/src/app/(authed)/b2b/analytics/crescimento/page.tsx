/**
 * /b2b/analytics/crescimento · espelho 1:1 da subtab "Crescimento" do
 * b2bm2.shell.js. Cockpit semanal (meta 1 parc/sem + streak) + Funil pipeline.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { Cockpit } from './Cockpit'
import { Funnel } from './Funnel'

export const dynamic = 'force-dynamic'

export default async function CrescimentoPage() {
  const { repos } = await loadMiraServerContext()
  const [growth, funnel] = await Promise.all([
    repos.b2bMetricsV2.growthWeekly(12).catch(() => null),
    repos.b2bMetricsV2.pipelineFunnel(30).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Crescimento</h1>
            <p className="b2bm2-sub">
              Seu trabalho · meta 1 parceria/semana + funil de conversão dos
              últimos 30 dias.
            </p>
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
