/**
 * mapMessageRow · row snake_case da tabela wa_messages → MessageDTO.
 */

import type { MessageDirection } from '../types/enums'
import type { MessageDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMessageRow(row: any): MessageDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id ?? ''),
    conversationId: String(row.conversation_id),
    phone: row.phone ?? null,
    direction: (row.direction ?? 'inbound') as MessageDirection,
    sender: String(row.sender ?? 'system'),
    content: String(row.content ?? ''),
    contentType: String(row.content_type ?? 'text'),
    mediaUrl: row.media_url ?? null,
    status: String(row.status ?? 'received'),
    sentAt: row.sent_at ?? new Date().toISOString(),
    // Sprint C · novos campos · undefined quando coluna nao existir (mig 86 pendente)
    internalNote: row.internal_note === true ? true : row.internal_note === false ? false : undefined,
    deliveryStatus: row.delivery_status ?? null,
    // Audit 2026-05-06 · template_id pra rotular B2B/voucher no dash novo
    templateId: row.template_id ?? null,
  }
}
