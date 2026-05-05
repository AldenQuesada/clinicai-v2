/**
 * Enums e literal-string types compartilhados pelos repositories.
 *
 * Camada 4: enums CRM core (LeadPhase, AppointmentStatus, OrcamentoStatus, ...)
 * espelham CHECK constraints em mig 60-65. Mudar enum aqui exige migration
 * nova + audit ADR (matriz de transicao vive em RPC
 * `_lead_phase_transition_allowed`).
 */

// ── Lara (legado pre-CRM) ──────────────────────────────────────────────────
export type Funnel = 'olheiras' | 'fullface' | 'procedimentos'
export type ConversationStatus = 'active' | 'paused' | 'archived' | 'resolved' | 'dra'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageSender = 'user' | 'lara' | 'humano' | 'system'

// ── Lead state machine ─────────────────────────────────────────────────────
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

// ── Patient ────────────────────────────────────────────────────────────────
export type PatientStatus = 'active' | 'inactive' | 'blocked' | 'deceased'
export type PatientSex = 'F' | 'M' | 'O' | 'N'

// ── Appointment ────────────────────────────────────────────────────────────
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

// ── Orcamento ──────────────────────────────────────────────────────────────
export type OrcamentoStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'followup'
  | 'negotiation'
  | 'approved'
  | 'lost'

// ── Cross-flow (appointment_finalize outcome) ──────────────────────────────
export type AppointmentFinalizeOutcome = 'paciente' | 'orcamento' | 'perdido'

// ── Dedup cross-tabela (LeadRepository.findInAnySystem) ────────────────────
export type DedupHitKind = 'patient' | 'lead' | 'voucher_recipient' | 'partner_referral'

// ── SLA · performance da secretaria ────────────────────────────────────────
//
// Cor do badge de tempo de espera da resposta humana. Calculada por
// `computeSla()` (packages/repositories/src/sla.ts) · UI nunca recalcula.
//
//   respondido    · não aguardando · sem pulso
//   verde         · < 3min         · sem pulso
//   amarelo       · 3-7min         · pulso suave
//   vermelho      · 7-15min        · pulso forte
//   critico       · 15-60min       · pulso forte
//   atrasado_fixo · 60min-24h      · sem pulso
//   antigo_parado · ≥ 24h          · sem pulso
export type ResponseColor =
  | 'respondido'
  | 'verde'
  | 'amarelo'
  | 'vermelho'
  | 'critico'
  | 'atrasado_fixo'
  | 'antigo_parado'

export type PulseBehavior = 'none' | 'suave' | 'forte'
