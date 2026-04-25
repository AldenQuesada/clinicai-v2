/**
 * /b2b/candidaturas · REPLICA 1:1 do `b2b-applications.ui.js` (tab Candidaturas).
 *
 * Server component carrega lista por status (default: pending).
 * Sub-tabs internos via URL ?status=pending|approved|rejected.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { CandidaturasClient } from './CandidaturasClient'
import type { ApplicationStatus } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const VALID_STATUS: ApplicationStatus[] = ['pending', 'approved', 'rejected', 'archived']

export default async function CandidaturasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const subTab = (
    params.status && (VALID_STATUS as string[]).includes(params.status)
      ? params.status
      : 'pending'
  ) as ApplicationStatus

  const { repos } = await loadMiraServerContext()
  const items = await repos.b2bApplications.list(subTab, 100).catch(() => [])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <CandidaturasClient items={items} subTab={subTab} />
      </div>
    </main>
  )
}
