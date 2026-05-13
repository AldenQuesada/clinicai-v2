/**
 * Schemas Zod pra appointments. Cobre create direto + RPC wrappers
 * (attend, finalize) + CRUD (update, cancel, no-show).
 */

import { z } from 'zod'
import { OrcamentoItemSchema } from './lead.schemas'

// ── Enums (espelham CHECK constraints mig 62) ───────────────────────────────

// CRM_PHASE_2H.1 cleanup (2026-05-12): `pre_consulta` e `em_consulta` removidos
// (nunca foram canônicos no DB · zumbis da iteração inicial).
const AppointmentStatus = z.enum([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
  'na_clinica',
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
    // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE (mig 182): vínculo canônico
    // opcional. UI nova envia procedureId quando user selecionar do catálogo.
    // procedureName continua sendo gravado como snapshot.
    procedureId: z.string().uuid().nullable().optional(),
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
  // CRM_PHASE_2AUX: validações operacionais reforçadas
  .refine(
    (v) => {
      // Duração: end > start (mesmo dia)
      return v.endTime > v.startTime
    },
    {
      message: 'Horário final deve ser maior que o inicial',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      // Duração mínima 15min, máxima 4h (240min)
      const [sh, sm] = v.startTime.split(':').map((s) => parseInt(s, 10))
      const [eh, em] = v.endTime.split(':').map((s) => parseInt(s, 10))
      const durMin = eh * 60 + em - (sh * 60 + sm)
      return durMin >= 15 && durMin <= 240
    },
    {
      message: 'Duração deve estar entre 15 minutos e 4 horas',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      // Data não pode ser passada (hoje OK · ontem ou antes não)
      const todayIso = new Date().toISOString().slice(0, 10)
      return v.scheduledDate >= todayIso
    },
    {
      message: 'Data de agendamento não pode ser anterior a hoje',
      path: ['scheduledDate'],
    },
  )

// ── Update generico (data/horario/profissional/notas/status simples) ────────
//
// NAO usar pra: chegada (use AttendAppointmentSchema), finalizacao (use
// FinalizeAppointmentSchema), cancel (use CancelAppointmentSchema), no-show
// (use MarkNoShowSchema). Essas tem invariantes de phase do lead.

export const UpdateAppointmentSchema = z
  .object({
    appointmentId: z.string().uuid(),
    scheduledDate: DateStr.optional(),
    startTime: TimeStr.optional(),
    endTime: TimeStr.optional(),
    professionalId: z.string().uuid().nullable().optional(),
    professionalName: z.string().max(120).optional(),
    // CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE: aceita null pra mover row de
    // catálogo→manual sem destruir snapshot.
    procedureId: z.string().uuid().nullable().optional(),
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
  // CRM_PHASE_2AUX: validações operacionais (só quando os campos estiverem presentes)
  .refine(
    (v) => {
      if (v.startTime && v.endTime) return v.endTime > v.startTime
      return true
    },
    { message: 'Horário final deve ser maior que o inicial', path: ['endTime'] },
  )
  .refine(
    (v) => {
      if (v.startTime && v.endTime) {
        const [sh, sm] = v.startTime.split(':').map((s) => parseInt(s, 10))
        const [eh, em] = v.endTime.split(':').map((s) => parseInt(s, 10))
        const durMin = eh * 60 + em - (sh * 60 + sm)
        return durMin >= 15 && durMin <= 240
      }
      return true
    },
    {
      message: 'Duração deve estar entre 15 minutos e 4 horas',
      path: ['endTime'],
    },
  )
  .refine(
    (v) => {
      if (v.scheduledDate) {
        const todayIso = new Date().toISOString().slice(0, 10)
        return v.scheduledDate >= todayIso
      }
      return true
    },
    {
      message: 'Data não pode ser anterior a hoje',
      path: ['scheduledDate'],
    },
  )

// ── CRM_PHASE_2AUX · check de conflito pré-submit (UI wizard chama antes) ───

export const CheckAppointmentConflictSchema = z
  .object({
    appointmentId: z.string().uuid().nullable().optional(), // ao editar · exclude self
    scheduledDate: DateStr,
    startTime: TimeStr,
    endTime: TimeStr,
    professionalId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    patientId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'Horário final deve ser maior que o inicial',
    path: ['endTime'],
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
