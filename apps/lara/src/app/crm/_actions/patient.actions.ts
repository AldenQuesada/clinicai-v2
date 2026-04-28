'use server'

/**
 * Server Actions de patients · 3 actions (update, softDelete, addRevenue).
 *
 * UI nunca cria patient direto · sempre via lead.actions.ts →
 * promoteToPatientAction (RPC lead_to_paciente · UUID compartilhado com
 * leads.id, modelo excludente forte ADR-001).
 *
 * Role gating:
 *   - update: owner|admin|receptionist|therapist (RLS UPDATE policy mig 61)
 *   - softDelete: owner|admin (decisao de produto · soft-delete e mais
 *     restritivo que update normal · esconde paciente do sistema)
 *   - addRevenue: owner|admin|receptionist (todos que podem fazer UPDATE
 *     em agregados financeiros · defense-in-depth contra caller arbitrario
 *     mesmo sendo Server Action exposta)
 */

import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  requireRole,
  updateTag,
  zodFail,
  type Result,
} from './shared'
import {
  AddPatientRevenueSchema,
  SoftDeletePatientSchema,
  UpdatePatientSchema,
} from '../_schemas/patient.schemas'

const log = createLogger({ app: 'lara' })

// ── 1. updatePatientAction · campos editaveis ───────────────────────────────

export async function updatePatientAction(
  input: unknown,
): Promise<Result<{ patientId: string }>> {
  const parsed = UpdatePatientSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const { patientId, ...patch } = parsed.data
  const updated = await repos.patients.update(patientId, patch)

  if (!updated) {
    log.warn(
      {
        action: 'crm.patient.update',
        clinic_id: ctx.clinic_id,
        patient_id: patientId,
      },
      'patient.update.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.patient.update',
      clinic_id: ctx.clinic_id,
      patient_id: patientId,
    },
    'patient.update.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ patientId })
}

// ── 2. softDeletePatientAction · admin/owner only ───────────────────────────

export async function softDeletePatientAction(
  input: unknown,
): Promise<Result<{ patientId: string }>> {
  const parsed = SoftDeletePatientSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()

  // Defense-in-depth · soft-delete (UPDATE deleted_at) bate na UPDATE policy
  // de patients que aceita owner|admin|receptionist. Aqui restringimos pra
  // owner|admin porque esconder paciente do sistema e decisao sensivel.
  const roleCheck = requireRole(ctx.role, ['owner', 'admin'])
  if (roleCheck) {
    log.warn(
      {
        action: 'crm.patient.softDelete',
        clinic_id: ctx.clinic_id,
        patient_id: parsed.data.patientId,
        role: ctx.role,
      },
      'patient.softDelete.forbidden',
    )
    return roleCheck
  }

  const success = await repos.patients.softDelete(parsed.data.patientId)
  if (!success) {
    log.warn(
      {
        action: 'crm.patient.softDelete',
        clinic_id: ctx.clinic_id,
        patient_id: parsed.data.patientId,
      },
      'patient.softDelete.failed',
    )
    return fail('soft_delete_failed')
  }

  log.info(
    {
      action: 'crm.patient.softDelete',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
    },
    'patient.softDelete.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ patientId: parsed.data.patientId })
}

// ── 3. addPatientRevenueAction · agregado financeiro pos-finalize ───────────
//
// Chamado normalmente pos-finalizeAppointmentAction quando outcome NAO eh
// promote=paciente (paciente recorrente). RPC lead_to_paciente ja seta
// agregados na promocao inicial · esse helper cobre appointments seguintes.
//
// Defense-in-depth: action eh exposta · qualquer JWT da clinica poderia
// inflar agregados. Role gate exige owner|admin|receptionist (mesmos
// roles que podem fazer UPDATE patients · RLS mig 61).

export async function addPatientRevenueAction(
  input: unknown,
): Promise<Result<{ patientId: string }>> {
  const parsed = AddPatientRevenueSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()

  const roleCheck = requireRole(ctx.role, ['owner', 'admin', 'receptionist'])
  if (roleCheck) {
    log.warn(
      {
        action: 'crm.patient.addRevenue',
        clinic_id: ctx.clinic_id,
        patient_id: parsed.data.patientId,
        role: ctx.role,
      },
      'patient.addRevenue.forbidden',
    )
    return roleCheck
  }

  const success = await repos.patients.addRevenueAfterAppointment(
    parsed.data.patientId,
    parsed.data.amount,
    parsed.data.when,
  )

  if (!success) {
    log.warn(
      {
        action: 'crm.patient.addRevenue',
        clinic_id: ctx.clinic_id,
        patient_id: parsed.data.patientId,
        amount: parsed.data.amount,
      },
      'patient.addRevenue.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.patient.addRevenue',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
      amount: parsed.data.amount,
    },
    'patient.addRevenue.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ patientId: parsed.data.patientId })
}
