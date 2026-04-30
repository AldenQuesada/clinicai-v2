/**
 * mapConversationRow · row snake_case da tabela wa_conversations → DTO.
 */

import type { ConversationStatus } from '../types/enums'
import type { ConversationDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapConversationRow(row: any): ConversationDTO {
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
  }
}
