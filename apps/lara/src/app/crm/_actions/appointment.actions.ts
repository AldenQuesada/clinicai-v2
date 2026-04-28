'use server'

/**
 * Server Actions de appointments · 7 actions cobrindo CRUD + 2 RPC wrappers.
 *
 * Pra criar appointment NOVO de um lead, prefira lead.actions.ts →
 * scheduleAppointmentAction (transacao atomica + atualiza phase).
 * createAppointmentAction aqui e pra paciente recorrente OU bloqueio de slot.
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
import { z } from 'zod'
import {
  AttendAppointmentSchema,
  CancelAppointmentSchema,
  CreateAppointmentSchema,
  FinalizeAppointmentSchema,
  MarkNoShowSchema,
  UpdateAppointmentSchema,
} from '../_schemas/appointment.schemas'

const SoftDeleteAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
})

const log = createLogger({ app: 'lara' })

// ── 1. createAppointmentAction · paciente recorrente OU slot bloqueado ──────

export async function createAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = CreateAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const created = await repos.appointments.create(ctx.clinic_id, parsed.data)

  if (!created) {
    log.warn(
      {
        action: 'crm.appt.create',
        clinic_id: ctx.clinic_id,
        scheduled_date: parsed.data.scheduledDate,
      },
      'appt.create.failed',
    )
    return fail('insert_failed')
  }

  log.info(
    {
      action: 'crm.appt.create',
      clinic_id: ctx.clinic_id,
      appointment_id: created.id,
      lead_id: created.leadId,
      patient_id: created.patientId,
    },
    'appt.create.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: created.id })
}

// ── 2. updateAppointmentAction · campos editaveis simples ───────────────────

export async function updateAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = UpdateAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { appointmentId, ...patch } = parsed.data
  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.appointments.update(appointmentId, patch)

  if (!updated) {
    log.warn(
      {
        action: 'crm.appt.update',
        clinic_id: ctx.clinic_id,
        appointment_id: appointmentId,
      },
      'appt.update.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.appt.update',
      clinic_id: ctx.clinic_id,
      appointment_id: appointmentId,
    },
    'appt.update.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId })
}

// ── 3. cancelAppointmentAction · motivo obrigatorio ─────────────────────────

export async function cancelAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = CancelAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const cancelled = await repos.appointments.cancel(
    parsed.data.appointmentId,
    parsed.data.motivo,
  )

  if (!cancelled) {
    log.warn(
      {
        action: 'crm.appt.cancel',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
      },
      'appt.cancel.failed',
    )
    return fail('cancel_failed')
  }

  log.info(
    {
      action: 'crm.appt.cancel',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
    },
    'appt.cancel.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: parsed.data.appointmentId })
}

// ── 4. markNoShowAction · paciente nao apareceu ─────────────────────────────

export async function markNoShowAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = MarkNoShowSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.appointments.markNoShow(
    parsed.data.appointmentId,
    parsed.data.motivo,
  )

  if (!updated) {
    log.warn(
      {
        action: 'crm.appt.noShow',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
      },
      'appt.noShow.failed',
    )
    return fail('no_show_failed')
  }

  log.info(
    {
      action: 'crm.appt.noShow',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
    },
    'appt.noShow.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: parsed.data.appointmentId })
}

// ── 5. attendAppointmentAction · RPC wrapper · paciente chegou ──────────────

export async function attendAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string; idempotentSkip: boolean }>> {
  const parsed = AttendAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.attend(
    parsed.data.appointmentId,
    parsed.data.chegadaEm,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.attend',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        error: result.error,
      },
      'appt.attend.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.appt.attend',
      clinic_id: ctx.clinic_id,
      appointment_id: result.appointmentId,
      idempotent_skip: result.idempotentSkip,
    },
    'appt.attend.ok',
  )
  updateTag(CRM_TAGS.appointments)
  // Lead foi pra phase=compareceu se nao estava
  if (!result.idempotentSkip) updateTag(CRM_TAGS.leads)
  return ok({
    appointmentId: result.appointmentId,
    idempotentSkip: result.idempotentSkip,
  })
}

// ── 6. finalizeAppointmentAction · RPC wrapper · roteia outcome ─────────────
//
// outcome=paciente   → lead_to_paciente (promocao)
// outcome=orcamento  → lead_to_orcamento (cria + soft-delete lead)
// outcome=perdido    → lead_lost (reason obrigatorio)
//
// sub-RPC pode falhar mesmo com appt finalizado (estado terminal valido) ·
// UI deve checar `subCall` no result e mostrar warning.

export async function finalizeAppointmentAction(
  input: unknown,
): Promise<
  Result<{
    appointmentId: string
    leadId: string | null
    outcome: 'paciente' | 'orcamento' | 'perdido'
    subCallOk: boolean
  }>
> {
  const parsed = FinalizeAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.finalize({
    appointmentId: parsed.data.appointmentId,
    outcome: parsed.data.outcome,
    value: parsed.data.value ?? null,
    paymentStatus: parsed.data.paymentStatus ?? null,
    notes: parsed.data.notes ?? null,
    lostReason: parsed.data.lostReason ?? null,
    orcamentoItems: parsed.data.orcamentoItems ?? null,
    orcamentoSubtotal: parsed.data.orcamentoSubtotal ?? null,
    orcamentoDiscount: parsed.data.orcamentoDiscount ?? 0,
  })

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.finalize',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        outcome: parsed.data.outcome,
        error: result.error,
      },
      'appt.finalize.failed',
    )
    return fail(result.error)
  }

  // sub-RPC pode ter falhado individualmente (mesmo ok=true do finalize)
  const sub = (result.subCall ?? {}) as { ok?: boolean; error?: string }
  const subCallOk = sub.ok !== false

  log.info(
    {
      action: 'crm.appt.finalize',
      clinic_id: ctx.clinic_id,
      appointment_id: result.appointmentId,
      outcome: result.outcome,
      lead_id: result.leadId,
      sub_call_ok: subCallOk,
      sub_call_error: subCallOk ? undefined : sub.error,
    },
    subCallOk ? 'appt.finalize.ok' : 'appt.finalize.subCallFailed',
  )

  // Sempre invalida appointments. Outras tags dependem do outcome.
  updateTag(CRM_TAGS.appointments)
  updateTag(CRM_TAGS.leads)
  if (subCallOk && result.outcome === 'paciente') {
    updateTag(CRM_TAGS.patients)
  }
  if (subCallOk && result.outcome === 'orcamento') {
    updateTag(CRM_TAGS.orcamentos)
  }
  updateTag(CRM_TAGS.phaseHistory)

  return ok({
    appointmentId: result.appointmentId,
    leadId: result.leadId,
    outcome: result.outcome,
    subCallOk,
  })
}

// ── 7. softDeleteAppointmentAction · esconde sem perder audit ───────────────
//
// Soft-delete · admin/owner only (RLS DELETE policy). Hard-delete reservado
// pra service_role.

export async function softDeleteAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = SoftDeleteAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const success = await repos.appointments.softDelete(parsed.data.appointmentId)

  if (!success) {
    log.warn(
      {
        action: 'crm.appt.softDelete',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
      },
      'appt.softDelete.failed',
    )
    return fail('soft_delete_failed')
  }

  log.info(
    {
      action: 'crm.appt.softDelete',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
    },
    'appt.softDelete.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: parsed.data.appointmentId })
}
