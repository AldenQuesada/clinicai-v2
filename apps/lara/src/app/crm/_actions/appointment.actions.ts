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

// ── Camada 8a · State machine + drag-drop + recurrence + block time ────────

const ChangeStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  newStatus: z.enum([
    'agendado',
    'aguardando_confirmacao',
    'confirmado',
    'pre_consulta',
    'aguardando',
    'remarcado',
    'cancelado',
    'no_show',
    'bloqueado',
  ]),
  reason: z.string().max(500).optional(),
})

/**
 * Wrapper de RPC `appointment_change_status` (mig 72) · transicoes leves
 * (agendado → confirmado, etc). NAO usar pra na_clinica/finalizado · use
 * attendAppointmentAction / finalizeAppointmentAction (RPCs dedicadas com
 * side-effects de phase do lead).
 */
export async function changeAppointmentStatusAction(
  input: unknown,
): Promise<Result<{ appointmentId: string; toStatus: string }>> {
  const parsed = ChangeStatusSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.changeStatus(
    parsed.data.appointmentId,
    parsed.data.newStatus,
    parsed.data.reason,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.appt.changeStatus',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        to_status: parsed.data.newStatus,
        error: result.error,
      },
      'appt.changeStatus.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.appt.changeStatus',
      clinic_id: ctx.clinic_id,
      appointment_id: result.appointmentId,
      from_status: result.fromStatus,
      to_status: result.toStatus ?? parsed.data.newStatus,
    },
    'appt.changeStatus.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({
    appointmentId: result.appointmentId,
    toStatus: result.toStatus ?? parsed.data.newStatus,
  })
}

const DragDropSchema = z.object({
  appointmentId: z.string().uuid(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  newEndTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  /** Se true, ignora conflitos · admin override */
  forceOverride: z.boolean().optional(),
})

/**
 * Drag-drop de appointment no calendario · valida conflitos antes de UPDATE.
 *
 * Re-roda checkConflicts(prof+sala+paciente) · se conflict, rejeita (a
 * menos que admin force).
 */
export async function dragDropAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = DragDropSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const appt = await repos.appointments.getById(parsed.data.appointmentId)
  if (!appt) {
    return fail('not_found')
  }

  // Conflict check (a menos que admin force)
  if (!parsed.data.forceOverride) {
    const conflicts = await repos.appointments.checkConflicts(
      ctx.clinic_id,
      {
        scheduledDate: parsed.data.newDate,
        startTime: parsed.data.newStartTime,
        endTime: parsed.data.newEndTime,
        professionalId: appt.professionalId,
        roomIdx: appt.roomIdx,
        leadId: appt.leadId,
        patientId: appt.patientId,
      },
      parsed.data.appointmentId, // exclude self
    )
    if (
      conflicts.professional.length > 0 ||
      conflicts.room.length > 0 ||
      conflicts.patient.length > 0
    ) {
      log.warn(
        {
          action: 'crm.appt.dragDrop',
          clinic_id: ctx.clinic_id,
          appointment_id: parsed.data.appointmentId,
          conflicts: {
            professional: conflicts.professional.map((a) => a.id),
            room: conflicts.room.map((a) => a.id),
            patient: conflicts.patient.map((a) => a.id),
          },
        },
        'appt.dragDrop.conflict',
      )
      return fail('conflict', {
        professional: conflicts.professional.length,
        room: conflicts.room.length,
        patient: conflicts.patient.length,
      })
    }
  }

  const updated = await repos.appointments.update(parsed.data.appointmentId, {
    scheduledDate: parsed.data.newDate,
    startTime: parsed.data.newStartTime,
    endTime: parsed.data.newEndTime,
  })
  if (!updated) {
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.appt.dragDrop',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
      new_date: parsed.data.newDate,
      new_start: parsed.data.newStartTime,
      forced: parsed.data.forceOverride ?? false,
    },
    'appt.dragDrop.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: parsed.data.appointmentId })
}

const CreateSeriesSchema = z.object({
  // base appointment (mesmo shape do CreateAppointmentSchema · simplificado)
  patientId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  subjectName: z.string().min(1).max(120),
  subjectPhone: z.string().max(20).nullable().optional(),
  professionalId: z.string().uuid().nullable().optional(),
  professionalName: z.string().max(120).optional(),
  procedureName: z.string().max(200).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  value: z.number().nonnegative().optional(),
  // recurrence
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intervalDays: z.number().int().min(1).max(365),
  total: z.number().int().min(2).max(52),
  recurrenceProcedure: z.string().max(200).optional(),
  skipConflictCheck: z.boolean().optional(),
})

/**
 * Cria N appointments em sequencia (recurrence series).
 *
 * Compartilham `recurrence_group_id`. Para no primeiro conflict por padrao ·
 * `skipConflictCheck=true` cria todos sem validar overlap.
 *
 * Retorna count de criados + lista de falhas pra UI mostrar.
 */
export async function createSeriesAction(
  input: unknown,
): Promise<
  Result<{
    createdCount: number
    failedCount: number
    failed: Array<{ index: number; date: string; error: string }>
  }>
> {
  const parsed = CreateSeriesSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()

  const result = await repos.appointments.createSeries(
    ctx.clinic_id,
    {
      leadId: parsed.data.leadId ?? null,
      patientId: parsed.data.patientId ?? null,
      subjectName: parsed.data.subjectName,
      subjectPhone: parsed.data.subjectPhone ?? null,
      professionalId: parsed.data.professionalId ?? null,
      professionalName: parsed.data.professionalName ?? '',
      scheduledDate: parsed.data.firstDate, // overridden by createSeries loop
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      procedureName: parsed.data.procedureName ?? '',
      value: parsed.data.value,
    },
    {
      firstDate: parsed.data.firstDate,
      intervalDays: parsed.data.intervalDays,
      total: parsed.data.total,
      recurrenceProcedure: parsed.data.recurrenceProcedure,
    },
    {
      skipConflictCheck: parsed.data.skipConflictCheck ?? false,
    },
  )

  log.info(
    {
      action: 'crm.appt.createSeries',
      clinic_id: ctx.clinic_id,
      created: result.created.length,
      failed: result.failed.length,
      total: parsed.data.total,
    },
    'appt.createSeries.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({
    createdCount: result.created.length,
    failedCount: result.failed.length,
    failed: result.failed,
  })
}

const CreateBlockTimeSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  professionalId: z.string().uuid().nullable().optional(),
  reason: z.enum([
    'almoco',
    'intervalo',
    'reuniao',
    'manutencao',
    'ferias',
    'pessoal',
    'outro',
  ]),
  obs: z.string().max(2000).nullable().optional(),
})

/**
 * Cria slot bloqueado (block time) · status='bloqueado' sem subject.
 * Usado pra reservar horarios pra almoco, ferias, manutencao etc.
 */
export async function createBlockTimeAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = CreateBlockTimeSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const created = await repos.appointments.createBlockTime(ctx.clinic_id, {
    scheduledDate: parsed.data.scheduledDate,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    professionalId: parsed.data.professionalId ?? null,
    reason: parsed.data.reason,
    obs: parsed.data.obs ?? null,
  })

  if (!created) {
    log.warn(
      {
        action: 'crm.appt.createBlockTime',
        clinic_id: ctx.clinic_id,
        scheduled_date: parsed.data.scheduledDate,
        reason: parsed.data.reason,
      },
      'appt.createBlockTime.failed',
    )
    return fail('insert_failed')
  }

  log.info(
    {
      action: 'crm.appt.createBlockTime',
      clinic_id: ctx.clinic_id,
      appointment_id: created.id,
      reason: parsed.data.reason,
    },
    'appt.createBlockTime.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ appointmentId: created.id })
}
