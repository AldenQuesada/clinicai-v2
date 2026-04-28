/**
 * Tipos de retorno das 9 RPCs canonicas CRM (mig 65).
 *
 * Convencao: TODAS retornam jsonb com formato `{ ok: boolean, ...payload }`.
 * Modelamos como discriminated union pra callers TS poderem narrow sem cast:
 *
 *   const r = await repos.leads.createViaRpc({...})
 *   if (r.ok) { r.leadId ... } else { r.error ... }
 */

import type {
  AppointmentFinalizeOutcome,
  AppointmentStatus,
  LeadPhase,
} from './enums'

export type RpcResult<TOk> =
  | ({ ok: true } & TOk)
  | { ok: false; error: string; [k: string]: unknown }

// ── lead_create ────────────────────────────────────────────────────────────
export interface LeadCreateOk {
  leadId: string
  existed: boolean
  phase: LeadPhase
}
export type LeadCreateResult = RpcResult<LeadCreateOk>

// ── lead_to_appointment ────────────────────────────────────────────────────
export interface LeadToAppointmentOk {
  appointmentId: string
  leadId: string
  leadPhaseAfter: LeadPhase
}
export type LeadToAppointmentResult = RpcResult<LeadToAppointmentOk>

// ── appointment_attend ─────────────────────────────────────────────────────
export interface AppointmentAttendOk {
  appointmentId: string
  idempotentSkip: boolean
  statusAfter: AppointmentStatus
}
export type AppointmentAttendResult = RpcResult<AppointmentAttendOk>

// ── appointment_finalize ───────────────────────────────────────────────────
export interface AppointmentFinalizeOk {
  appointmentId: string
  leadId: string | null
  outcome: AppointmentFinalizeOutcome
  /** Resultado da sub-RPC (lead_to_paciente | lead_to_orcamento | lead_lost) */
  subCall: unknown
  note?: string
}
export type AppointmentFinalizeResult = RpcResult<AppointmentFinalizeOk>

// ── lead_to_paciente ───────────────────────────────────────────────────────
export interface LeadToPacienteOk {
  patientId: string
  leadId: string
  idempotentSkip: boolean
  appointmentsRemapped: number
}
export type LeadToPacienteResult = RpcResult<LeadToPacienteOk>

// ── lead_to_orcamento ──────────────────────────────────────────────────────
export interface LeadToOrcamentoOk {
  orcamentoId: string
  leadId: string
  total: number
}
export type LeadToOrcamentoResult = RpcResult<LeadToOrcamentoOk>

// ── lead_lost ──────────────────────────────────────────────────────────────
export interface LeadLostOk {
  leadId: string
  phaseAfter?: LeadPhase
  idempotentSkip?: boolean
}
export type LeadLostResult = RpcResult<LeadLostOk>

// ── sdr_change_phase ───────────────────────────────────────────────────────
export interface SdrChangePhaseOk {
  leadId: string
  fromPhase?: LeadPhase
  toPhase?: LeadPhase
  idempotentSkip?: boolean
}
export type SdrChangePhaseResult = RpcResult<SdrChangePhaseOk>
