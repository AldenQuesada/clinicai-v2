/**
 * /semana/encerramentos · REPLICA 1:1 do `b2b-closure.ui.js` (tab Closure).
 *
 * Server component carrega RPC b2b_closure_list_pending.
 * EncerramentosClient cuida de detect/dismiss/approve via Server Actions.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { EncerramentosClient } from './EncerramentosClient'

export const dynamic = 'force-dynamic'

export default async function EncerramentosPage() {
  const { repos } = await loadMiraServerContext()
  const pending = await repos.b2bClosure.listPending().catch(() => [])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <EncerramentosClient pending={pending} />
      </div>
    </main>
  )
}
