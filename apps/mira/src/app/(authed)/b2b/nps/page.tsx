/**
 * /b2b/nps · NPS B2B (Net Promoter Score) das parcerias.
 *
 * Refactor 2026-04-26 · de tela vazia + 5 chips pra BI interpretativo:
 *   1. DiagnosticBanner   · headline + status global (vs benchmark 50/70)
 *   2. SnapshotRow 4-col  · score · promotoras% · detratoras% · respostas
 *   3. Heatmap por parceria (so com dados)
 *   4. NextActions        · max 3 acoes com link (empty state vira how-to)
 *   5. Tabela respostas + filtros (so com dados)
 *   6. Footer educacional · explicacao do que e NPS
 *
 * Empty state robusto: zero respostas mostra como ativar o cron.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { NpsClient } from './NpsClient'

export const dynamic = 'force-dynamic'

const VALID_BUCKETS = ['promoter', 'passive', 'detractor', 'pending'] as const
type ValidBucket = (typeof VALID_BUCKETS)[number]

function parseBucket(input?: string): ValidBucket | null {
  if (!input) return null
  return (VALID_BUCKETS as readonly string[]).includes(input)
    ? (input as ValidBucket)
    : null
}

export default async function NpsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>
}) {
  const sp = await searchParams
  const initialBucket = parseBucket(sp.bucket)

  const { repos } = await loadMiraServerContext()
  // Buscamos lista filtrada (pra render rapido) + lista geral (pra agregacao
  // por parceria · heatmap) + summary global. Limit alto na lista geral pra
  // capturar o universo todo (NPS B2B nao tem volume alto · 200 e teto seguro).
  const [filteredList, fullList, summary] = await Promise.all([
    repos.b2bNps.list({ bucket: initialBucket, limit: 200 }),
    initialBucket
      ? repos.b2bNps.list({ bucket: null, limit: 200 })
      : Promise.resolve(null),
    repos.b2bNps.summary(null).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Net Promoter Score</h1>
            <p className="b2bm2-sub">
              Pesquisa trimestral de satisfacao das parcerias ativas. Promotoras
              (9-10) menos detratoras (0-6) sobre o total de respostas. Benchmark
              de mercado: 50+ bom, 70+ excelencia.
            </p>
          </div>
        </header>

        <NpsClient
          initialItems={filteredList.items}
          fullItems={fullList ? fullList.items : filteredList.items}
          initialSummary={summary}
          initialBucket={initialBucket}
        />
      </div>
    </main>
  )
}
