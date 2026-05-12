/**
 * Schemas Zod pra appointments. Cobre create direto + RPC wrappers
 * (attend, finalize) + CRUD (update, cancel, no-show).
 */

import { z } from 'zod'
import { OrcamentoItemSchema } from './lead.schemas'

// ── Enums (espelham CHECK constraints mig 62) ───────────────────────────────

const AppointmentStatus = z.enum([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'pre_consulta',
  'aguardando',
  'na_clinica',
  'em_consulta',
  'em_atendimento',
  'finalizado',
  'remarcado',
  'cancelado',
  'no_show',
  'bloqueado',
])

const AppointmentPaymentStatus = z.enum([
  'pendente',
  'parcial',
  'pago',
  'isento',
])

const AppointmentConsentImg = z.enum([
  'pendente',
  'assinado',
  'recusado',
  'nao_aplica',
])

// CRM_PHASE_2J: alinhado 1:1 com RPC banco (4 outcomes).
// UI oficial expoe 3 · 'perdido' permanece valido aqui para path dedicado
// (lead_lost) reaproveitar o mesmo Zod, mas FinalizeWizard nao oferece.
const AppointmentFinalizeOutcome = z.enum([
  'paciente',
  'orcamento',
  'paciente_orcamento',
  'perdido',
])

const TimeStr = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Esperado HH:MM ou HH:MM:SS')
const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')

// ── Create direto (paciente recorrente · sem passar por lead) ───────────────
//
// Pra criar appointment NOVO de um lead, prefira ScheduleAppointmentSchema
// (lead.actions.ts → scheduleAppointmentAction) que faz a transacao atomica
// de phase. Esse schema aqui e pra paciente ja existente OU bloqueio de slot.

export const CreateAppointmentSchema = z
  .object({
    leadId: z.string().uuid().nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
    subjectName: z.string().max(120),
    subjectPhone: z.string().max(20).nullable().optional(),
    professionalId: z.string().uuid().nullable().optional(),
    professionalName: z.string().max(120).optional(),
    scheduledDate: DateStr,
    startTime: TimeStr,
    endTime: TimeStr,
    procedureName: z.string().max(200).optional(),
    consultType: z.string().max(50).nullable().optional(),
    evalType: z.string().max(50).nullable().optional(),
    value: z.number().nonnegative().optional(),
    paymentStatus: AppointmentPaymentStatus.optional(),
    status: AppointmentStatus.optional(),
    origem: z.string().max(50).nullable().optional(),
    obs: z.string().max(2000).nullable().optional(),
    consentimentoImg: AppointmentConsentImg.optional(),
    recurrenceGroupId: z.string().uuid().nullable().optional(),
    recurrenceIndex: z.number().int().positive().nullable().optional(),
    recurrenceTotal: z.number().int().positive().nullable().optional(),
    recurrenceProcedure: z.string().max(200).nullable().optional(),
    recurrenceIntervalDays: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (v) => {
      // Modelo excludente forte (chk_appt_subject_xor da mig 62)
      const status = v.status ?? 'agendado'
      if (status === 'bloqueado') {
        return v.leadId == null && v.patientId == null
      }
      const subjects = (v.leadId ? 1 : 0) + (v.patientId ? 1 : 0)
      return subjects === 1
    },
    {
      message:
        'Deve setar EXATAMENTE um de leadId/patientId (ou nenhum se status=bloqueado)',
      path: ['leadId'],
    },
  )

// ── Update generico (data/horario/profissional/notas/status simples) ────────
//
// NAO usar pra: chegada (use AttendAppointmentSchema), finalizacao (use
// FinalizeAppointmentSchema), cancel (use CancelAppointmentSchema), no-show
// (use MarkNoShowSchema). Essas tem invariantes de phase do lead.

export const UpdateAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  scheduledDate: DateStr.optional(),
  startTime: TimeStr.optional(),
  endTime: TimeStr.optional(),
  professionalId: z.string().uuid().nullable().optional(),
  professionalName: z.string().max(120).optional(),
  procedureName: z.string().max(200).optional(),
  consultType: z.string().max(50).nullable().optional(),
  evalType: z.string().max(50).nullable().optional(),
  value: z.number().nonnegative().optional(),
  paymentMethod: z.string().max(50).nullable().optional(),
  paymentStatus: AppointmentPaymentStatus.optional(),
  status: AppointmentStatus.optional(),
  consentimentoImg: AppointmentConsentImg.optional(),
  obs: z.string().max(2000).nullable().optional(),
})

// ── Cancel · motivo obrigatorio (chk_appt_cancelled_consistency) ────────────

export const CancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  motivo: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── No-show · motivo obrigatorio (chk_appt_noshow_consistency) ──────────────

export const MarkNoShowSchema = z.object({
  appointmentId: z.string().uuid(),
  motivo: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── attend · paciente chegou ────────────────────────────────────────────────

export const AttendAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  chegadaEm: z.string().datetime().optional(),
})

// ── CRM_PHASE_2I · Anamnese intra-consulta ──────────────────────────────────

export const AppointmentAnamnesisUpsertSchema = z.object({
  appointmentId: z.string().uuid(),
  chiefComplaint: z.string().max(2000).nullable().optional(),
  medicalHistory: z.string().max(4000).nullable().optional(),
  medications: z.string().max(2000).nullable().optional(),
  allergies: z.string().max(2000).nullable().optional(),
  previousProcedures: z.string().max(2000).nullable().optional(),
  contraindications: z.string().max(2000).nullable().optional(),
  pregnancyLactation: z.string().max(500).nullable().optional(),
  autoimmuneDisease: z.string().max(500).nullable().optional(),
  anticoagulants: z.string().max(500).nullable().optional(),
  expectations: z.string().max(2000).nullable().optional(),
  professionalNotes: z.string().max(4000).nullable().optional(),
})

export const AppointmentAnamnesisCompleteSchema = z.object({
  appointmentId: z.string().uuid(),
})

// ── CRM_PHASE_2I · Consentimento informado intra-consulta ───────────────────

export const AppointmentConsentAcceptSchema = z.object({
  appointmentId: z.string().uuid(),
  termKey: z.string().min(2).max(100),
  termVersion: z.string().min(1).max(50),
  termTitle: z.string().min(2).max(300),
  signerName: z.string().min(2, 'Nome do assinante obrigatório (mín. 2)').max(200),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const AppointmentClinicalGateStatusSchema = z.object({
  appointmentId: z.string().uuid(),
})

// ── finalize · roteia outcome (paciente|orcamento|perdido) ──────────────────

export const FinalizeAppointmentSchema = z
  .object({
    appointmentId: z.string().uuid(),
    outcome: AppointmentFinalizeOutcome,
    value: z.number().nonnegative().nullable().optional(),
    paymentStatus: AppointmentPaymentStatus.nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    lostReason: z.string().max(500).nullable().optional(),
    orcamentoItems: z.array(OrcamentoItemSchema).nullable().optional(),
    orcamentoSubtotal: z.number().nonnegative().nullable().optional(),
    orcamentoDiscount: z.number().nonnegative().optional(),
    // CRM_PHASE_2I.1 · hard gate clinico · override admin
    clinicalOverride: z.boolean().optional(),
    clinicalOverrideReason: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (v) => {
      if (v.outcome === 'perdido') {
        return !!v.lostReason && v.lostReason.trim().length >= 2
      }
      return true
    },
    {
      message: 'lostReason obrigatorio quando outcome=perdido',
      path: ['lostReason'],
    },
  )
  .refine(
    (v) => {
      if (v.outcome === 'orcamento' || v.outcome === 'paciente_orcamento') {
        return (
          Array.isArray(v.orcamentoItems) &&
          v.orcamentoItems.length > 0 &&
          v.orcamentoSubtotal != null
        )
      }
      return true
    },
    {
      message:
        'orcamentoItems (>=1) + orcamentoSubtotal obrigatorios quando outcome=orcamento ou paciente_orcamento',
      path: ['orcamentoItems'],
    },
  )
  .refine(
    (v) => {
      // CRM_PHASE_2I.1 · override exige reason >= 5 chars
      if (v.clinicalOverride === true) {
        return (
          !!v.clinicalOverrideReason &&
          v.clinicalOverrideReason.trim().length >= 5
        )
      }
      return true
    },
    {
      message: 'clinicalOverrideReason obrigatorio (min 5 chars) quando clinicalOverride=true',
      path: ['clinicalOverrideReason'],
    },
  )
