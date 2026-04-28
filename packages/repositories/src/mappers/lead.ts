/**
 * mapLeadRow · row snake_case da tabela leads → LeadDTO camelCase.
 * Boundary do ADR-005 · NUNCA expoe row bruto pra service/UI.
 */

import type {
  Funnel,
  LeadChannelMode,
  LeadPhase,
  LeadPriority,
  LeadSource,
  LeadSourceType,
  LeadTemperature,
  PhaseOrigin,
} from '../types/enums'
import type { LeadDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLeadRow(row: any): LeadDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),

    name: row.name ?? null,
    phone: String(row.phone ?? ''),
    email: row.email ?? null,
    cpf: row.cpf ?? null,
    rg: row.rg ?? null,
    birthDate: row.birth_date ?? null,
    idade: row.idade != null ? Number(row.idade) : null,

    phase: (row.phase ?? 'lead') as LeadPhase,
    phaseUpdatedAt: row.phase_updated_at ?? null,
    phaseUpdatedBy: row.phase_updated_by ?? null,
    phaseOrigin: (row.phase_origin ?? null) as PhaseOrigin | null,

    source: (row.source ?? 'manual') as LeadSource,
    sourceType: (row.source_type ?? 'manual') as LeadSourceType,
    sourceQuizId: row.source_quiz_id ?? null,
    funnel: (row.funnel ?? 'procedimentos') as Funnel,
    aiPersona: String(row.ai_persona ?? 'onboarder'),
    temperature: (row.temperature ?? 'warm') as LeadTemperature,
    priority: (row.priority ?? 'normal') as LeadPriority,
    leadScore: Number(row.lead_score ?? 0),
    dayBucket: row.day_bucket != null ? Number(row.day_bucket) : null,
    channelMode: (row.channel_mode ?? 'whatsapp') as LeadChannelMode,

    assignedTo: row.assigned_to ?? null,

    isInRecovery: row.is_in_recovery === true,
    lostReason: row.lost_reason ?? null,
    lostAt: row.lost_at ?? null,
    lostBy: row.lost_by ?? null,

    queixasFaciais: Array.isArray(row.queixas_faciais) ? row.queixas_faciais : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata:
      row.metadata && typeof row.metadata === 'object' ? row.metadata : {},

    waOptIn: row.wa_opt_in !== false,
    lastContactedAt: row.last_contacted_at ?? null,
    lastResponseAt: row.last_response_at ?? null,

    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}
