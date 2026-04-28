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

// ── CRM core enums (Camada 1 · ADR-001 modelo excludente) ──────────────────
//
// Espelho exato das CHECK constraints em mig 60-65. Mudar enum aqui exige
// migration nova + audit ADR (matriz de transicao vive em RPC
// `_lead_phase_transition_allowed`).

export type LeadPhase =
  | 'lead'
  | 'agendado'
  | 'reagendado'
  | 'compareceu'
  | 'paciente'
  | 'orcamento'
  | 'perdido'

export type LeadSource =
  | 'manual'
  | 'lara_recipient'
  | 'lara_vpi_partner'
  | 'b2b_partnership_referral'
  | 'b2b_admin_registered'
  | 'quiz'
  | 'landing_page'
  | 'import'
  | 'webhook'

export type LeadSourceType =
  | 'manual'
  | 'quiz'
  | 'import'
  | 'referral'
  | 'social'
  | 'whatsapp'
  | 'whatsapp_fullface'
  | 'landing_page'
  | 'b2b_voucher'
  | 'vpi_referral'

export type LeadTemperature = 'cold' | 'warm' | 'hot'
export type LeadPriority = 'normal' | 'high' | 'urgent'
export type LeadChannelMode = 'whatsapp' | 'phone' | 'email' | 'in_person'
export type PhaseOrigin =
  | 'auto_transition'
  | 'manual_override'
  | 'rule'
  | 'bulk_move'
  | 'import'
  | 'webhook'
  | 'rpc'

export type PatientStatus = 'active' | 'inactive' | 'blocked' | 'deceased'
export type PatientSex = 'F' | 'M' | 'O' | 'N'

export type AppointmentStatus =
  | 'agendado'
  | 'aguardando_confirmacao'
  | 'confirmado'
  | 'pre_consulta'
  | 'aguardando'
  | 'na_clinica'
  | 'em_consulta'
  | 'em_atendimento'
  | 'finalizado'
  | 'remarcado'
  | 'cancelado'
  | 'no_show'
  | 'bloqueado'

export type AppointmentPaymentStatus = 'pendente' | 'parcial' | 'pago' | 'isento'
export type AppointmentConsentImg = 'pendente' | 'assinado' | 'recusado' | 'nao_aplica'

export type OrcamentoStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'followup'
  | 'negotiation'
  | 'approved'
  | 'lost'

export type AppointmentFinalizeOutcome = 'paciente' | 'orcamento' | 'perdido'

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
  /**
   * FK pra wa_numbers.id (mig 800-49) · permite resolver credenciais Cloud API
   * per-tenant via createWhatsAppCloudFromWaNumber. Quando NULL, callers caem
   * em fallback de env global (deprecated em multi-tenant ADR-028).
   *
   * BUG LATENTE descoberto na auditoria Camada 3 (2026-04-28): callers da Lara
   * usavam `(conv as any).waNumberId` esperando o campo aqui · `mapConversationRow`
   * nao retornava. Resultado: blindagem N7 da Lara nunca funcionou de verdade ·
   * sempre caia em env global. Camada 3.5 fixa.
   */
  waNumberId: string | null
}

// ── CRM core DTOs (Camada 4 · ADR-001 + ADR-005 boundary) ──────────────────

/**
 * Patient (paciente ativo). UUID compartilhado com leads.id (modelo
 * excludente). Linha aqui implica leads.deleted_at IS NOT NULL.
 */
export interface PatientDTO {
  id: string
  clinicId: string
  name: string
  phone: string
  email: string | null
  cpf: string | null
  rg: string | null
  birthDate: string | null
  sex: PatientSex | null
  /** Endereco serializado · shape decidido pela UI */
  addressJson: Record<string, unknown> | null
  status: PatientStatus
  assignedTo: string | null
  notes: string | null
  totalProcedures: number
  totalRevenue: number
  firstProcedureAt: string | null
  lastProcedureAt: string | null
  /** Quando o lead transicionou pra phase=compareceu */
  sourceLeadPhaseAt: string | null
  /** Snapshot do lead.metadata + source/funnel no momento da promocao · imutavel */
  sourceLeadMeta: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Appointment com schema canonico v2 (mig 62). Subject dual: leadId OU
 * patientId (chk_appt_subject_xor garante exatamente um · exceto bloqueado).
 */
export interface AppointmentDTO {
  id: string
  clinicId: string
  leadId: string | null
  patientId: string | null
  /** Snapshot imutavel do nome no momento da criacao */
  subjectName: string
  subjectPhone: string | null
  professionalId: string | null
  professionalName: string
  roomIdx: number | null
  /** YYYY-MM-DD */
  scheduledDate: string
  /** HH:MM:SS */
  startTime: string
  endTime: string
  procedureName: string
  consultType: string | null
  evalType: string | null
  value: number
  paymentMethod: string | null
  paymentStatus: AppointmentPaymentStatus
  status: AppointmentStatus
  origem: string | null
  chegadaEm: string | null
  canceladoEm: string | null
  motivoCancelamento: string | null
  noShowEm: string | null
  motivoNoShow: string | null
  consentimentoImg: AppointmentConsentImg
  obs: string | null
  recurrenceGroupId: string | null
  recurrenceIndex: number | null
  recurrenceTotal: number | null
  recurrenceProcedure: string | null
  recurrenceIntervalDays: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Item dentro de orcamentos.items[]. Shape contratado em mig 63 · validado
 * pela UI/Server Action antes do INSERT (CHECK so garante array typeof).
 */
export interface OrcamentoItem {
  name: string
  qty: number
  unitPrice: number
  subtotal: number
  procedureCode?: string | null
}

/**
 * Pagamento dentro de orcamentos.payments[]. Shape solto · adicionado por
 * relatorios financeiros futuros. Campos abaixo sao convencao, nao gate DB.
 */
export interface OrcamentoPayment {
  date?: string
  method?: string
  amount?: number
  reference?: string
  [k: string]: unknown
}

/**
 * Orcamento clinico (NAO confundir com BudgetRepository · cost control IA).
 * Subject dual igual appointments. Total = subtotal - discount (CHECK
 * chk_orc_total_consistency garante coerencia).
 */
export interface OrcamentoDTO {
  id: string
  clinicId: string
  leadId: string | null
  patientId: string | null
  number: string | null
  title: string | null
  notes: string | null
  items: OrcamentoItem[]
  subtotal: number
  discount: number
  total: number
  status: OrcamentoStatus
  sentAt: string | null
  viewedAt: string | null
  approvedAt: string | null
  lostAt: string | null
  lostReason: string | null
  validUntil: string | null
  payments: OrcamentoPayment[]
  shareToken: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Audit trail imutavel de transicoes phase. UPDATE/DELETE proibidos via RLS
 * (so service_role) · repository expoe SO leitura + insert append-only.
 */
export interface PhaseHistoryDTO {
  id: string
  clinicId: string
  leadId: string | null
  fromPhase: LeadPhase | null
  fromStatus: string | null
  toPhase: LeadPhase
  toStatus: string | null
  origin: PhaseOrigin
  triggeredBy: string | null
  actorId: string | null
  reason: string | null
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

// ── CRM RPC result types ────────────────────────────────────────────────────
//
// Convencao do repositorio: TODAS as 9 RPCs CRM retornam jsonb com formato
// `{ ok: boolean, ...payload }`. Modelamos como discriminated union pra
// callers TypeScript poderem narrow sem cast.

export type RpcResult<TOk> = ({ ok: true } & TOk) | { ok: false; error: string; [k: string]: unknown }

export interface LeadCreateOk {
  leadId: string
  existed: boolean
  phase: LeadPhase
}
export type LeadCreateResult = RpcResult<LeadCreateOk>

export interface LeadToAppointmentOk {
  appointmentId: string
  leadId: string
  leadPhaseAfter: LeadPhase
}
export type LeadToAppointmentResult = RpcResult<LeadToAppointmentOk>

export interface AppointmentAttendOk {
  appointmentId: string
  idempotentSkip: boolean
  statusAfter: AppointmentStatus
}
export type AppointmentAttendResult = RpcResult<AppointmentAttendOk>

export interface AppointmentFinalizeOk {
  appointmentId: string
  leadId: string | null
  outcome: AppointmentFinalizeOutcome
  /** Resultado da sub-RPC (lead_to_paciente | lead_to_orcamento | lead_lost) */
  subCall: unknown
  note?: string
}
export type AppointmentFinalizeResult = RpcResult<AppointmentFinalizeOk>

export interface LeadToPacienteOk {
  patientId: string
  leadId: string
  idempotentSkip: boolean
  appointmentsRemapped: number
}
export type LeadToPacienteResult = RpcResult<LeadToPacienteOk>

export interface LeadToOrcamentoOk {
  orcamentoId: string
  leadId: string
  total: number
}
export type LeadToOrcamentoResult = RpcResult<LeadToOrcamentoOk>

export interface LeadLostOk {
  leadId: string
  phaseAfter?: LeadPhase
  idempotentSkip?: boolean
}
export type LeadLostResult = RpcResult<LeadLostOk>

export interface SdrChangePhaseOk {
  leadId: string
  fromPhase?: LeadPhase
  toPhase?: LeadPhase
  idempotentSkip?: boolean
}
export type SdrChangePhaseResult = RpcResult<SdrChangePhaseOk>

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
    waNumberId: row.wa_number_id ?? null,
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

// ── CRM core mappers (Camada 4) ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPatientRow(row: any): PatientDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: row.email ?? null,
    cpf: row.cpf ?? null,
    rg: row.rg ?? null,
    birthDate: row.birth_date ?? null,
    sex: (row.sex ?? null) as PatientSex | null,
    addressJson: row.address_json ?? null,
    status: (row.status ?? 'active') as PatientStatus,
    assignedTo: row.assigned_to ?? null,
    notes: row.notes ?? null,
    totalProcedures: Number(row.total_procedures ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    firstProcedureAt: row.first_procedure_at ?? null,
    lastProcedureAt: row.last_procedure_at ?? null,
    sourceLeadPhaseAt: row.source_lead_phase_at ?? null,
    sourceLeadMeta:
      row.source_lead_meta && typeof row.source_lead_meta === 'object'
        ? row.source_lead_meta
        : {},
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAppointmentRow(row: any): AppointmentDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    leadId: row.lead_id ?? null,
    patientId: row.patient_id ?? null,
    subjectName: String(row.subject_name ?? ''),
    subjectPhone: row.subject_phone ?? null,
    professionalId: row.professional_id ?? null,
    professionalName: String(row.professional_name ?? ''),
    roomIdx: row.room_idx != null ? Number(row.room_idx) : null,
    scheduledDate: String(row.scheduled_date ?? ''),
    startTime: String(row.start_time ?? ''),
    endTime: String(row.end_time ?? ''),
    procedureName: String(row.procedure_name ?? ''),
    consultType: row.consult_type ?? null,
    evalType: row.eval_type ?? null,
    value: Number(row.value ?? 0),
    paymentMethod: row.payment_method ?? null,
    paymentStatus: (row.payment_status ?? 'pendente') as AppointmentPaymentStatus,
    status: (row.status ?? 'agendado') as AppointmentStatus,
    origem: row.origem ?? null,
    chegadaEm: row.chegada_em ?? null,
    canceladoEm: row.cancelado_em ?? null,
    motivoCancelamento: row.motivo_cancelamento ?? null,
    noShowEm: row.no_show_em ?? null,
    motivoNoShow: row.motivo_no_show ?? null,
    consentimentoImg: (row.consentimento_img ?? 'pendente') as AppointmentConsentImg,
    obs: row.obs ?? null,
    recurrenceGroupId: row.recurrence_group_id ?? null,
    recurrenceIndex: row.recurrence_index != null ? Number(row.recurrence_index) : null,
    recurrenceTotal: row.recurrence_total != null ? Number(row.recurrence_total) : null,
    recurrenceProcedure: row.recurrence_procedure ?? null,
    recurrenceIntervalDays:
      row.recurrence_interval_days != null ? Number(row.recurrence_interval_days) : null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrcamentoItem(raw: any): OrcamentoItem {
  return {
    name: String(raw?.name ?? ''),
    qty: Number(raw?.qty ?? 0),
    unitPrice: Number(raw?.unit_price ?? raw?.unitPrice ?? 0),
    subtotal: Number(raw?.subtotal ?? 0),
    procedureCode: raw?.procedure_code ?? raw?.procedureCode ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOrcamentoRow(row: any): OrcamentoDTO {
  const itemsRaw = Array.isArray(row.items) ? row.items : []
  const paymentsRaw = Array.isArray(row.payments) ? row.payments : []
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    leadId: row.lead_id ?? null,
    patientId: row.patient_id ?? null,
    number: row.number ?? null,
    title: row.title ?? null,
    notes: row.notes ?? null,
    items: itemsRaw.map(mapOrcamentoItem),
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    total: Number(row.total ?? 0),
    status: (row.status ?? 'draft') as OrcamentoStatus,
    sentAt: row.sent_at ?? null,
    viewedAt: row.viewed_at ?? null,
    approvedAt: row.approved_at ?? null,
    lostAt: row.lost_at ?? null,
    lostReason: row.lost_reason ?? null,
    validUntil: row.valid_until ?? null,
    payments: paymentsRaw as OrcamentoPayment[],
    shareToken: row.share_token ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

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

// ── CRM RPC result mapper (snake_case keys → camelCase narrowed type) ───────
//
// Helper que pega o jsonb retornado por qualquer RPC CRM e converte chaves
// snake → camel sem perder o discriminator `ok`. Usado pelos repositories
// pra evitar `as` casts em cada caller.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRpcResult<T>(raw: any): T {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'rpc_returned_non_object' } as unknown as T
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw)) {
    out[snakeToCamelKey(k)] = v
  }
  return out as T
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
