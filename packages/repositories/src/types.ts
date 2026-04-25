/**
 * DTOs camelCase + helpers de mapeamento snake -> camel.
 *
 * Repositories nunca expoem row bruto · sempre passam pelo mapper aqui.
 * Isso é o boundary do ADR-005 · SQL snake_case fica preso em src/, callers
 * (services/UI) só veem camelCase.
 *
 * Tipos locais ao package · types.generated.ts via supabase CLI vai entrar na
 * Fase 1 (placeholder no @clinicai/supabase ainda é `any`).
 */

export type Funnel = 'olheiras' | 'fullface' | 'procedimentos'
export type ConversationStatus = 'active' | 'paused' | 'archived' | 'resolved' | 'dra'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageSender = 'user' | 'lara' | 'humano' | 'system'

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface LeadDTO {
  id: string
  clinicId: string
  phone: string
  name: string | null
  phase: string
  temperature: string | null
  funnel: string | null
  leadScore: number
  aiPersona: string | null
  tags: string[]
  queixasFaciais: string[]
  idade: number | null
  dayBucket: number | null
  lastResponseAt: string | null
  createdAt: string
}

export interface ConversationDTO {
  id: string
  clinicId: string
  phone: string
  leadId: string | null
  displayName: string | null
  status: ConversationStatus
  aiEnabled: boolean
  aiPausedUntil: string | null
  pausedBy: string | null
  remoteJid: string | null
  reactivationSent: boolean
  lastMessageAt: string | null
  lastMessageText: string | null
  lastLeadMsg: string | null
  createdAt: string
}

export interface MessageDTO {
  id: string
  clinicId: string
  conversationId: string
  phone: string | null
  direction: MessageDirection
  sender: string
  content: string
  contentType: string
  mediaUrl: string | null
  status: string
  sentAt: string
}

export interface TemplateDTO {
  id: string
  clinicId: string
  name: string
  message: string | null
  content: string | null
  category: string | null
  triggerPhase: string | null
  active: boolean
  isActive: boolean
  sortOrder: number | null
  createdAt: string
}

export interface BudgetDayDTO {
  dayBucket: string
  costUsd: number
}

export interface ClinicDataValue<T = unknown> {
  clinicId: string
  key: string
  value: T
  updatedAt: string | null
}

// ── Inputs (Create / Update) ────────────────────────────────────────────────

export interface CreateLeadInput {
  phone: string
  name?: string | null
  phase?: string
  temperature?: string | null
  aiPersona?: string | null
  funnel?: string | null
  /**
   * Discriminator de origem (mig 800-01) · CHECK constraint cobre:
   *   'lara_recipient' (default), 'lara_vpi_partner',
   *   'b2b_partnership_referral', 'b2b_admin_registered'.
   */
  source?: string | null
  tags?: string[] | null
}

export interface CreateConversationInput {
  phone: string
  leadId: string
  displayName?: string | null
  status?: ConversationStatus
  aiEnabled?: boolean
}

export interface SaveInboundMessageInput {
  conversationId: string
  phone: string
  content: string
  contentType?: string
  mediaUrl?: string | null
  sentAt?: string
}

export interface SaveOutboundMessageInput {
  conversationId: string
  sender: 'lara' | 'humano' | 'system'
  content: string
  contentType?: string
  mediaUrl?: string | null
  status?: string
  sentAt?: string
  id?: string
}

export interface CreateTemplateInput {
  name: string
  content: string
  category?: string
  sortOrder?: number
  triggerPhase?: string | null
}

export interface InboxNotificationInput {
  clinicId: string
  conversationId: string
  source: string
  reason: string
  payload: Record<string, unknown>
}

/**
 * Resultado da varredura cross-tabela `LeadRepository.findInAnySystem`.
 *
 * `kind` segue ordem de relevancia (mais forte → mais fraco):
 *   patient            → leads.phase = 'patient' (ja virou paciente real)
 *   lead               → leads (qualquer phase != patient)
 *   voucher_recipient  → b2b_vouchers.recipient_phone (ja recebeu voucher antes)
 *   partner_referral   → b2b_attributions via lead_id (ja foi indicada via outra parceira)
 *
 * Usado pelo handler `b2b-emit-voucher` pra bloquear emissao duplicada.
 * Mensagem formatada construida em `formatDedupReply` (apps/mira).
 */
export type DedupHitKind = 'patient' | 'lead' | 'voucher_recipient' | 'partner_referral'

export interface DedupHit {
  kind: DedupHitKind
  id: string
  name: string | null
  phone: string
  /** ISO date · usada pra formatar "Set/24" no reply */
  since: string
  /** Nome da parceria origem · disponivel em voucher_recipient e partner_referral */
  partnershipName?: string | null
}

// ── Mappers (snake -> camel) ────────────────────────────────────────────────

// Boundary com supabase-js · types.ts ainda é any (Fase 1 regenera).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLeadRow(row: any): LeadDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    phone: String(row.phone ?? ''),
    name: row.name ?? null,
    phase: String(row.phase ?? 'lead'),
    temperature: row.temperature ?? null,
    funnel: row.funnel ?? null,
    leadScore: Number(row.lead_score ?? 0),
    aiPersona: row.ai_persona ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    queixasFaciais: Array.isArray(row.queixas_faciais) ? row.queixas_faciais : [],
    idade: row.idade != null ? Number(row.idade) : null,
    dayBucket: row.day_bucket != null ? Number(row.day_bucket) : null,
    lastResponseAt: row.last_response_at ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

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
  }
}

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
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTemplateRow(row: any): TemplateDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id ?? ''),
    name: String(row.name ?? ''),
    message: row.message ?? null,
    content: row.content ?? null,
    category: row.category ?? null,
    triggerPhase: row.trigger_phase ?? null,
    active: row.active !== false,
    isActive: row.is_active !== false,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : null,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}
