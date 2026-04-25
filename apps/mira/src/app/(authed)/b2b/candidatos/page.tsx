/**
 * /b2b/candidatos · REPLICA 1:1 do `b2b-candidates.ui.js` (tab Scout).
 *
 * Server component faz initial fetch (list + consumption + summary) em
 * paralelo · CandidatosClient toma conta da interatividade (filter,
 * action buttons, modal manual).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { CandidatosClient } from './CandidatosClient'
import type { CandidateStatus } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const VALID_STATUS: CandidateStatus[] = [
  'new',
  'approved',
  'approached',
  'responded',
  'negotiating',
  'signed',
  'declined',
  'archived',
]

export default async function CandidatosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filterStatus = (
    params.status && (VALID_STATUS as string[]).includes(params.status)
      ? params.status
      : null
  ) as CandidateStatus | null

  const { repos } = await loadMiraServerContext()

  // Carrega tudo em paralelo (mesmo padrão do _load() original)
  const [candidates, consumption, summary] = await Promise.all([
    repos.b2bScout
      .list({ status: filterStatus, limit: 200 })
      .catch(() => [] as never),
    repos.b2bScout.consumedCurrentMonth().catch(() => null),
    repos.b2bScout.summary().catch(() => null),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <CandidatosClient
          candidates={candidates}
          consumption={consumption}
          summary={summary}
          filterStatus={filterStatus}
        />
      </div>
    </main>
  )
}
