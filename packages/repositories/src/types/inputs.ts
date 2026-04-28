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
