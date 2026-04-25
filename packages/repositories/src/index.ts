/**
 * @clinicai/repositories · barrel.
 *
 * Padrao canonico ADR-012 · UI/Service nunca chama supabase.from() direto.
 * Tudo passa por um Repository que aplica:
 *   - mapping snake -> camel (ADR-005 boundary)
 *   - clinic_id explicito multi-tenant (ADR-028)
 *   - DTOs tipados em vez de row bruto
 */

export { LeadRepository } from './lead.repository'
export { ConversationRepository, type StatusFilter } from './conversation.repository'
export { MessageRepository, type AIHistoryMessage } from './message.repository'
export { ClinicDataRepository } from './clinic-data.repository'
export { TemplateRepository } from './template.repository'
export { BudgetRepository } from './budget.repository'
export { InboxNotificationRepository } from './inbox-notification.repository'
export { ProfileRepository, type ProfileDTO } from './profile.repository'

// ── Mira repositories (B2B + admin · WhatsApp Evolution) ──────────────────
export { MiraStateRepository, type MiraStateRow } from './mira-state.repository'
export { B2BPartnershipRepository, type B2BPartnershipDTO } from './b2b-partnership.repository'
export {
  B2BVoucherRepository,
  type B2BVoucherDTO,
  type IssueVoucherInput,
} from './b2b-voucher.repository'
export { B2BAttributionRepository, type B2BAttributionDTO } from './b2b-attribution.repository'
export { B2BWASenderRepository, type B2BWASenderDTO } from './b2b-wa-sender.repository'
export {
  B2BCommTemplateRepository,
  type B2BCommTemplateDTO,
} from './b2b-comm-template.repository'
export {
  WaProAuditRepository,
  type WaProMessageInput,
  type WaProAuditInput,
} from './wa-pro-audit.repository'
export { WaNumberRepository, type WaNumberDTO } from './wa-number.repository'
export { MiraChannelRepository, type MiraChannelDTO } from './mira-channel.repository'
export { AppointmentRepository } from './appointment.repository'

export type {
  Funnel,
  ConversationStatus,
  MessageDirection,
  MessageSender,
  LeadDTO,
  ConversationDTO,
  MessageDTO,
  TemplateDTO,
  BudgetDayDTO,
  ClinicDataValue,
  CreateLeadInput,
  CreateConversationInput,
  SaveInboundMessageInput,
  SaveOutboundMessageInput,
  CreateTemplateInput,
  InboxNotificationInput,
} from './types'
