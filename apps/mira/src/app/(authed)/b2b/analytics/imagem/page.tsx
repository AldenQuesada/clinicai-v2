/**
 * /b2b/analytics/imagem · ImageFocus dos parceiros pillar=imagem.
 *
 * Janela aplicada em b2b_partner_performance(days) · default 30d.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ImageFocus } from './ImageFocus'
import { TimeRangePicker } from '../_shared/TimeRangePicker'
import { parseTimeRange } from '../_shared/timeRangeUtils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function ImagemPage({ searchParams }: PageProps) {
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
  const performance = await repos.b2bMetricsV2.partnerPerformance(days).catch(() => [])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Imagem</h1>
            <p className="b2bm2-sub">
              Parcerias que carregam a percepção pública da Dra. Mirian. Qualquer
              queda de performance aqui merece atenção imediata.
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        <ImageFocus rows={performance} days={days} />
      </div>
    </main>
  )
}
