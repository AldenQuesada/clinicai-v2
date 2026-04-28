/**
 * mapPhaseHistoryRow · row snake_case da tabela phase_history → DTO.
 */

import type { LeadPhase, PhaseOrigin } from '../types/enums'
import type { PhaseHistoryDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPhaseHistoryRow(row: any): PhaseHistoryDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    leadId: row.lead_id ?? null,
    fromPhase: (row.from_phase ?? null) as LeadPhase | null,
    fromStatus: row.from_status ?? null,
    toPhase: String(row.to_phase ?? 'lead') as LeadPhase,
    toStatus: row.to_status ?? null,
    origin: (row.origin ?? 'rpc') as PhaseOrigin,
    triggeredBy: row.triggered_by ?? null,
    actorId: row.actor_id ?? null,
    reason: row.reason ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}
