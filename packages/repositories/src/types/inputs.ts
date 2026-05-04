/**
 * Inputs pros metodos `create()`/`update()`/RPC wrappers dos repositories.
 * camelCase · convertidos pra snake_case dentro de cada repo antes do DB call.
 */

import type {
  AppointmentConsentImg,
  AppointmentFinalizeOutcome,
  AppointmentPaymentStatus,
  AppointmentStatus,
  ConversationStatus,
  Funnel,
  LeadPhase,
  LeadPriority,
  LeadSource,
  LeadSourceType,
  LeadTemperature,
  OrcamentoStatus,
  PatientSex,
  PatientStatus,
} from './enums'
import type { OrcamentoItem, OrcamentoPayment } from './dtos'

// ── Lara/Mira (legado) ──────────────────────────────────────────────────────

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

/**
 * Update parcial de lead · todo campo `undefined` e omitido no UPDATE.
 * camelCase aqui · LeadRepository.update converte pra snake_case do DB.
 */
export interface UpdateLeadInput {
  name?: string | null
  phone?: string
  email?: string | null
  cpf?: string | null
  rg?: string | null
  birthDate?: string | null
  idade?: number | null
  funnel?: Funnel
  temperature?: LeadTemperature
  priority?: LeadPriority
  aiPersona?: string
  assignedTo?: string | null
  queixasFaciais?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
  waOptIn?: boolean
}

/**
 * Filtros pra LeadRepository.list · todos opcionais.
 */
export interface ListLeadsFilter {
  search?: string
  funnel?: Funnel
  funnels?: Funnel[]
  phase?: LeadPhase
  phases?: LeadPhase[]
  excludePhases?: LeadPhase[]
  temperature?: LeadTemperature
  sourceType?: LeadSourceType
  tags?: string[]
  createdSince?: string
  createdUntil?: string
  /** Sem resposta desde · `last_response_at < iso` OU NULL */
  noResponseSinceIso?: string
}

export interface CreateConversationInput {
  phone: string
  leadId: string
  displayName?: string | null
  status?: ConversationStatus
  aiEnabled?: boolean
  /**
   * FK pra wa_numbers.id · webhook deve passar o waNumberId resolvido pelo
   * phone_number_id da Meta. Trigger fn_wa_conversations_inbox_role_sync
   * (mig 91) copia o inbox_role do wa_numbers automaticamente.
   */
  waNumberId?: string | null
}

export interface SaveInboundMessageInput {
  conversationId: string
  phone: string
  content: string
  contentType?: string
  mediaUrl?: string | null
  sentAt?: string
  /**
   * Idempotência (mig 800-11 + audit 2026-05-04): `wamid` da Meta ou `key.id`
   * da Evolution. Popula `wa_messages.provider_msg_id` · UNIQUE
   * `(clinic_id, provider_msg_id)` bloqueia duplicata em retry do provider.
   */
  providerMsgId?: string | null
  /** Mesma fonte de providerMsgId · espelho em `wa_messages.wa_message_id` (legacy). */
  waMessageId?: string | null
  /** 'cloud' (Meta) ou 'evolution' (Baileys). Default DB = 'cloud'. */
  channel?: 'cloud' | 'evolution'
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
  /** wamid retornado pelo provider após send · ver SaveInboundMessageInput.providerMsgId. */
  providerMsgId?: string | null
  waMessageId?: string | null
  channel?: 'cloud' | 'evolution'
}

export interface CreateTemplateInput {
  name: string
  content: string
  category?: string
  sortOrder?: number
  triggerPhase?: string | null
  /** Tipo legacy · 8 valores: confirmacao/lembrete/engajamento/boas_vindas/consent_img/consent_info/manual */
  type?: string
  /** Dia relativo a consulta · -7 a +30 */
  day?: number
  /** Default true · false cria como inativo (rascunho) */
  active?: boolean
}

export interface UpdateTemplateInput {
  name?: string
  content?: string
  category?: string
  sortOrder?: number
  triggerPhase?: string | null
  type?: string
  day?: number
  active?: boolean
}

export interface InboxNotificationInput {
  clinicId: string
  conversationId: string
  source: string
  reason: string
  payload: Record<string, unknown>
}

// ── CRM core inputs (Camada 4) ──────────────────────────────────────────────

/**
 * Input pra `lead_create()` RPC. `clinic_id` resolvido pelo helper
 * app_clinic_id() (JWT) · NUNCA passado pelo caller.
 */
export interface LeadCreateRpcInput {
  phone: string
  name?: string | null
  email?: string | null
  source?: LeadSource
  sourceType?: LeadSourceType
  funnel?: Funnel
  temperature?: LeadTemperature
  metadata?: Record<string, unknown>
  assignedTo?: string | null
}

/**
 * Input pra `lead_to_appointment()` RPC.
 */
export interface LeadToAppointmentRpcInput {
  leadId: string
  /** YYYY-MM-DD */
  scheduledDate: string
  /** HH:MM ou HH:MM:SS */
  startTime: string
  endTime: string
  professionalId?: string | null
  professionalName?: string
  procedureName?: string
  consultType?: string | null
  evalType?: string | null
  value?: number
  origem?: string
  obs?: string | null
}

/**
 * Input pra `appointment_finalize()` RPC. Outcome roteia pra sub-RPC
 * (paciente|orcamento|perdido).
 */
export interface AppointmentFinalizeRpcInput {
  appointmentId: string
  outcome: AppointmentFinalizeOutcome
  value?: number | null
  paymentStatus?: AppointmentPaymentStatus | null
  notes?: string | null
  /** Obrigatorio se outcome=perdido */
  lostReason?: string | null
  /** Obrigatorio se outcome=orcamento */
  orcamentoItems?: OrcamentoItem[] | null
  orcamentoSubtotal?: number | null
  orcamentoDiscount?: number
}

/**
 * Input pra `lead_to_orcamento()` RPC.
 */
export interface LeadToOrcamentoRpcInput {
  leadId: string
  subtotal: number
  items: OrcamentoItem[]
  discount?: number
  notes?: string | null
  title?: string | null
  validUntil?: string | null
}

/**
 * Input pra criar appointment direto (UI agenda · sem passar por lead).
 * Ex: paciente recorrente marca consulta · setamos patientId.
 */
export interface CreateAppointmentInput {
  leadId?: string | null
  patientId?: string | null
  subjectName: string
  subjectPhone?: string | null
  professionalId?: string | null
  professionalName?: string
  scheduledDate: string
  startTime: string
  endTime: string
  procedureName?: string
  consultType?: string | null
  evalType?: string | null
  value?: number
  paymentStatus?: AppointmentPaymentStatus
  status?: AppointmentStatus
  origem?: string | null
  obs?: string | null
  consentimentoImg?: AppointmentConsentImg
  recurrenceGroupId?: string | null
  recurrenceIndex?: number | null
  recurrenceTotal?: number | null
  recurrenceProcedure?: string | null
  recurrenceIntervalDays?: number | null
}

export interface UpdateAppointmentInput {
  scheduledDate?: string
  startTime?: string
  endTime?: string
  professionalId?: string | null
  professionalName?: string
  procedureName?: string
  consultType?: string | null
  evalType?: string | null
  value?: number
  paymentMethod?: string | null
  paymentStatus?: AppointmentPaymentStatus
  status?: AppointmentStatus
  motivoCancelamento?: string | null
  motivoNoShow?: string | null
  consentimentoImg?: AppointmentConsentImg
  obs?: string | null
}

export interface UpdatePatientInput {
  name?: string
  phone?: string
  email?: string | null
  cpf?: string | null
  rg?: string | null
  birthDate?: string | null
  sex?: PatientSex | null
  addressJson?: Record<string, unknown> | null
  status?: PatientStatus
  assignedTo?: string | null
  notes?: string | null
}

export interface UpdateOrcamentoInput {
  title?: string | null
  notes?: string | null
  items?: OrcamentoItem[]
  subtotal?: number
  discount?: number
  total?: number
  status?: OrcamentoStatus
  sentAt?: string | null
  viewedAt?: string | null
  approvedAt?: string | null
  lostAt?: string | null
  lostReason?: string | null
  validUntil?: string | null
  payments?: OrcamentoPayment[]
  shareToken?: string | null
}
