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
