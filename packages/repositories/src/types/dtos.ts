/**
 * DTOs camelCase devolvidos pelos repositories. Espelham schemas SQL com
 * naming convertido pra TS-friendly (snake_case fica preso em src/, callers
 * so veem camelCase) · ADR-005 boundary.
 */

import type {
  AppointmentConsentImg,
  AppointmentPaymentStatus,
  AppointmentStatus,
  ConversationStatus,
  DedupHitKind,
  Funnel,
  LeadChannelMode,
  LeadPhase,
  LeadPriority,
  LeadSource,
  LeadSourceType,
  LeadTemperature,
  MessageDirection,
  OrcamentoStatus,
  PatientSex,
  PatientStatus,
  PhaseOrigin,
} from './enums'

/**
 * LeadDTO · espelho 1:1 do schema canonico mig 60. Phase tipada como
 * LeadPhase (era `string` solto) · narrowing seguro em consumidores.
 *
 * Camada 4 audit (2026-04-28): expandido de 14 → 30 colunas pra cobrir
 * o schema completo. Callers existentes (Lara, Mira) continuam compativeis
 * porque so consomem o subset original; novos campos sao opcional/nullable.
 */
export interface LeadDTO {
  id: string
  clinicId: string

  // Identidade
  name: string | null
  phone: string
  email: string | null
  cpf: string | null
  rg: string | null
  birthDate: string | null
  idade: number | null

  // State machine
  phase: LeadPhase
  phaseUpdatedAt: string | null
  phaseUpdatedBy: string | null
  phaseOrigin: PhaseOrigin | null

  // Funil + roteamento
  source: LeadSource
  sourceType: LeadSourceType
  sourceQuizId: string | null
  funnel: Funnel
  aiPersona: string
  temperature: LeadTemperature
  priority: LeadPriority
  leadScore: number
  dayBucket: number | null
  channelMode: LeadChannelMode

  // Atribuicao
  assignedTo: string | null

  // Recovery / perdido
  isInRecovery: boolean
  lostReason: string | null
  lostAt: string | null
  lostBy: string | null

  // Payload Lara
  queixasFaciais: string[]
  /** Tags · campo legado mantido pra compat (na mig 60 tags nao existe; vem de Lara) */
  tags: string[]
  metadata: Record<string, unknown>

  // WhatsApp
  waOptIn: boolean
  lastContactedAt: string | null
  lastResponseAt: string | null

  // Timestamps
  createdAt: string
  updatedAt: string
  deletedAt: string | null
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
  /**
   * P-12 multi-atendente · profile id atribuido a esta conversa.
   * Soft-lock visual · null quando nao atribuida. Mig 87.
   */
  assignedTo: string | null
  /** P-12 · timestamp do ultimo assign · null quando unassigned. */
  assignedAt: string | null
}

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
  /** Sprint C · SC-03 (W-11) · nota interna entre atendentes (nao envia ao paciente) */
  internalNote?: boolean
  /** Sprint C · SC-01 (W-06) · status do envio: sent | delivered | read | failed */
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed' | null
}

export interface TemplateDTO {
  id: string
  clinicId: string
  name: string
  /** Slug snake-case · trigger pra quick-templates dropdown (ex: `/olheiras`) */
  slug: string | null
  message: string | null
  content: string | null
  category: string | null
  triggerPhase: string | null
  /** Tipo legacy clinic-dashboard · 8 valores · controla cor/icone da timeline */
  type: string | null
  /** Dia relativo a consulta · -7 (7d antes) · 0 (mesmo dia) · +30 (30d depois) */
  day: number | null
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
