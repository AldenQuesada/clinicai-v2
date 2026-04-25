/**
 * /b2b/segmento · REPLICA 1:1 do `b2b-segment.ui.js` + `b2b-segment-preview.ui.js`.
 *
 * Filtros (pillar/tier/status/saúde/NPS/atividade) → preview do alcance via
 * RPC b2b_broadcast_preview · botão "Copiar IDs" usa b2b_broadcast_partner_ids
 * pra exportar UUIDs pro clipboard.
 *
 * Disparo real fica pendente (precisa wiring com b2b-comm-dispatch ou wa_outbox).
 */

import { SegmentoClient } from './SegmentoClient'

export const dynamic = 'force-dynamic'

export default async function SegmentoPage() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <SegmentoClient />
      </div>
    </main>
  )
}
