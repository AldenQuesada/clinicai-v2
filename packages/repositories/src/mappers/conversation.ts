/**
 * mapConversationRow · row snake_case da tabela wa_conversations → DTO.
 *
 * Aceita opcionalmente:
 *   - `lastHumanReplyAt` (ISO timestamp): última resposta humana válida ·
 *     usado pelo SLA secretária (computeSla).
 *   - `lastHumanReplyText`: conteúdo da mesma mensagem · usado pelo KPI
 *     Retorno (apps/lara/.../lib/returnPromises · detecta promessa de
 *     retorno como "vou verificar", "te retorno", etc).
 *
 * Ambos defaultam null · single-source-of-truth resolvido em
 * ConversationRepository.getLastHumanReplyByConvs() em batch.
 */

import { computeSla } from '../sla'
import type { ConversationStatus } from '../types/enums'
import type { ConversationDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapConversationRow(
  row: any,
  lastHumanReplyAt: string | null = null,
  lastHumanReplyText: string | null = null,
): ConversationDTO {
  const lastPatientMsgAt: string | null = row.last_lead_msg ?? null
  const sla = computeSla({ lastPatientMsgAt, lastHumanReplyAt })
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    phone: String(row.phone ?? ''),
    leadId: row.lead_id ?? null,
    displayName: row.display_name ?? null,
    status: (row.status ?? 'active') as ConversationStatus,
    aiEnabled: row.ai_enabled !== false,
    aiPausedUntil: row.ai_paused_until ?? null,
    pausedBy: row.paused_by ?? null,
    remoteJid: row.remote_jid ?? null,
    reactivationSent: row.reactivation_sent === true,
    lastMessageAt: row.last_message_at ?? null,
    lastMessageText: row.last_message_text ?? null,
    lastLeadMsg: row.last_lead_msg ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    waNumberId: row.wa_number_id ?? null,
    assignedTo: row.assigned_to ?? null,
    assignedAt: row.assigned_at ?? null,
    inboxRole: (row.inbox_role === 'secretaria' ? 'secretaria' : 'sdr') as 'sdr' | 'secretaria',
    contextType: row.context_type ?? null,
    handoffToSecretariaAt: row.handoff_to_secretaria_at ?? null,
    handoffToSecretariaBy: row.handoff_to_secretaria_by ?? null,
    // SLA · performance da secretaria + KPI Retorno
    lastPatientMsgAt,
    lastHumanReplyAt,
    lastHumanReplyText,
    waitingHumanResponse: sla.waitingHumanResponse,
    minutesWaiting: sla.minutesWaiting,
    responseColor: sla.responseColor,
    shouldPulse: sla.shouldPulse,
    pulseBehavior: sla.pulseBehavior,
  }
}
