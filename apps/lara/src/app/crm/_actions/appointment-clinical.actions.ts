'use server'

/**
 * CRM_PHASE_2I · Server actions clínicas intra-consulta.
 *
 * 4 actions cobrindo anamnese + consent + gate status. Zero WhatsApp ·
 * zero provider · zero envio real. Worker 71 OFF preservado.
 */

import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  updateTag,
  zodFail,
  type Result,
} from './shared'
import {
  AppointmentAnamnesisUpsertSchema,
  AppointmentAnamnesisCompleteSchema,
  AppointmentConsentAcceptSchema,
  AppointmentClinicalGateStatusSchema,
} from '../_schemas/appointment.schemas'

const log = createLogger({ app: 'lara' })

// ── 1. upsert da anamnese (cria draft ou atualiza) ──────────────────────────

export async function upsertAppointmentAnamnesisAction(
  input: unknown,
): Promise<
  Result<{
    anamnesisId: string
    status: string
    action: 'created' | 'updated'
  }>
> {
  const parsed = AppointmentAnamnesisUpsertSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { appointmentId, ...form } = parsed.data
  const { ctx, repos } = await loadServerReposContext()

  const result = await repos.appointments.upsertAnamnesis(appointmentId, {
    chief_complaint: form.chiefComplaint ?? null,
    medical_history: form.medicalHistory ?? null,
    medications: form.medications ?? null,
    allergies: form.allergies ?? null,
    previous_procedures: form.previousProcedures ?? null,
    contraindications: form.contraindications ?? null,
    pregnancy_lactation: form.pregnancyLactation ?? null,
    autoimmune_disease: form.autoimmuneDisease ?? null,
    anticoagulants: form.anticoagulants ?? null,
    expectations: form.expectations ?? null,
    professional_notes: form.professionalNotes ?? null,
  })

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.anamnesis.upsert',
        clinic_id: ctx.clinic_id,
        appointment_id: appointmentId,
        error: result.error,
      },
      'appt.anamnesis.upsert.failed',
    )
    return fail(result.error ?? 'anamnesis_upsert_failed')
  }

  log.info(
    {
      action: 'crm.appt.anamnesis.upsert',
      clinic_id: ctx.clinic_id,
      appointment_id: appointmentId,
      anamnesis_action: result.action,
    },
    'appt.anamnesis.upsert.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({
    anamnesisId: result.anamnesisId!,
    status: result.status!,
    action: result.action!,
  })
}

// ── 2. mark complete ────────────────────────────────────────────────────────

export async function completeAppointmentAnamnesisAction(
  input: unknown,
): Promise<
  Result<{
    anamnesisId: string
    status: string
    completedAt: string
    idempotentSkip: boolean
  }>
> {
  const parsed = AppointmentAnamnesisCompleteSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.markAnamnesisComplete(
    parsed.data.appointmentId,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.anamnesis.complete',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        error: result.error,
      },
      'appt.anamnesis.complete.failed',
    )
    return fail(result.error ?? 'anamnesis_complete_failed')
  }

  log.info(
    {
      action: 'crm.appt.anamnesis.complete',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
      idempotent_skip: result.idempotentSkip,
    },
    'appt.anamnesis.complete.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({
    anamnesisId: result.anamnesisId!,
    status: result.status!,
    completedAt: result.completedAt!,
    idempotentSkip: result.idempotentSkip ?? false,
  })
}

// ── 3. accept consent ───────────────────────────────────────────────────────

export async function acceptAppointmentConsentAction(
  input: unknown,
): Promise<
  Result<{
    consentId: string
    accepted: boolean
    acceptedAt: string
    signerName: string
    idempotentSkip: boolean
  }>
> {
  const parsed = AppointmentConsentAcceptSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.acceptConsent({
    appointmentId: parsed.data.appointmentId,
    termKey: parsed.data.termKey,
    termVersion: parsed.data.termVersion,
    termTitle: parsed.data.termTitle,
    signerName: parsed.data.signerName,
    payload: parsed.data.payload,
  })

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.consent.accept',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        term_key: parsed.data.termKey,
        error: result.error,
      },
      'appt.consent.accept.failed',
    )
    return fail(result.error ?? 'consent_accept_failed')
  }

  log.info(
    {
      action: 'crm.appt.consent.accept',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
      term_key: parsed.data.termKey,
      idempotent_skip: result.idempotentSkip,
    },
    'appt.consent.accept.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({
    consentId: result.consentId!,
    accepted: result.accepted!,
    acceptedAt: result.acceptedAt!,
    signerName: result.signerName!,
    idempotentSkip: result.idempotentSkip ?? false,
  })
}

// ── 4. read gate status (server-only · UI usa RSC) ──────────────────────────

export async function getAppointmentClinicalGateStatusAction(
  input: unknown,
): Promise<
  Result<{
    anamnesis: {
      id: string | null
      status: string
      completedAt: string | null
    }
    consent: {
      signed: boolean
      rows: number
      legacyConsentimentoImg: string | null
    }
    gateStatus: 'ok' | 'warning'
    appointmentStatus: string
  }>
> {
  const parsed = AppointmentClinicalGateStatusSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.getClinicalGateStatus(
    parsed.data.appointmentId,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.clinical.gate',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        error: result.error,
      },
      'appt.clinical.gate.failed',
    )
    return fail(result.error ?? 'gate_status_failed')
  }

  return ok({
    anamnesis: result.anamnesis!,
    consent: result.consent!,
    gateStatus: result.gateStatus!,
    appointmentStatus: result.appointmentStatus!,
  })
}
