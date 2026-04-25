/**
 * /b2b/nps · REPLICA 1:1 do `b2b-nps.ui.js`.
 *
 * Lista respostas NPS com banner de % geral + filtros por bucket
 * (todos/promotores/passivos/detratores/pendentes). Auto-flag servidor:
 * NPS ≤ 6 vira task 'nps_detractor_followup'.
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
  const [list, summary] = await Promise.all([
    repos.b2bNps.list({ bucket: initialBucket, limit: 200 }),
    repos.b2bNps.summary(null).catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <NpsClient
          initialItems={list.items}
          initialSummary={summary}
          initialBucket={initialBucket}
        />
      </div>
    </main>
  )
}
