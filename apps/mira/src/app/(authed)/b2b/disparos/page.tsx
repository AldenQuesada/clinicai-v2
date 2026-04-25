/**
 * /b2b/disparos · REPLICA 1:1 do `b2b-comm.shell.ui.js` + 7 sub-arquivos
 * (clinic-dashboard/js/b2b/ui/comm/*).
 *
 * Layout 3-col: stats sidebar + central preview + panel tabulado com
 * 6 sub-tabs internos (Eventos / Templates / Editor / Preview / Stats /
 * Histórico / Config).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { CommClient } from './CommClient'

export const dynamic = 'force-dynamic'

export default async function DisparosPage() {
  const { ctx, repos } = await loadMiraServerContext()
  void ctx

  const [templates, catalog, stats, history] = await Promise.all([
    repos.b2bTemplates.list({}).catch(() => []),
    repos.b2bTemplates.eventsCatalog().catch(() => []),
    repos.b2bTemplates.stats().catch(() => null),
    repos.b2bTemplates.history({ limit: 50 }).catch(() => []),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <CommClient
          initialTemplates={templates}
          catalog={catalog}
          stats={stats}
          initialHistory={history}
        />
      </div>
    </main>
  )
}
