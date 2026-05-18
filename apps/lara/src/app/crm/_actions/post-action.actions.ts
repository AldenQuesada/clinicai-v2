'use server'

/**
 * Server Actions de appointment_post_actions (CRM_PARITY_R4).
 *
 * Camada de UI para a fila interna de pós-ações enfileirada pelo
 * FinalizeWizard (R3). Apenas operações de staff dispatch:
 *   - markPostActionDoneAction       · staff executou manualmente
 *   - dismissPostActionAction        · staff optou por pular (com motivo)
 *   - cancelPostActionAction         · paciente recusou
 *
 * ZERO disparo externo · ZERO provider · ZERO worker · ZERO cron.
 * ZERO mutação em appointment_finalize, hard gate, ou leads.phase.
 *
 * Reads (`listPendingByClinic`, `listByAppointment`) são feitos direto via
 * RSC pelo padrão da Camada 5+ · este arquivo só tem mutations.
 */

import { z } from 'zod'
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

const log = createLogger({ app: 'lara' })

// ── Schemas ─────────────────────────────────────────────────────────────────

const MarkDoneSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).nullable().optional(),
})

const DismissSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(3, 'Motivo obrigatório (min 3 chars)').max(500),
})

const CancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
})

// ── Mark done · staff executou manualmente ─────────────────────────────────

export async function markPostActionDoneAction(
  input: unknown,
): Promise<Result<{ id: string; status: 'done' }>> {
  const parsed = MarkDoneSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  // CRM_PARITY_R4 · RLS já filtra por clinic_id · getById confirma posse.
  const existing = await repos.appointmentPostActions.getById(parsed.data.id)
  if (!existing) return fail('not_found')
  if (existing.status !== 'pending') {
    return fail('invalid_state', {
      current_status: existing.status,
      hint: 'Apenas pós-ações pending podem ser marcadas como done',
    })
  }

  const updated = await repos.appointmentPostActions.updateStatus(parsed.data.id, {
    status: 'done',
    notes: parsed.data.notes ?? null,
  })
  if (!updated) {
    log.warn(
      {
        action: 'crm.postAction.markDone',
        clinic_id: ctx.clinic_id,
        post_action_id: parsed.data.id,
      },
      'postAction.markDone.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.postAction.markDone',
      clinic_id: ctx.clinic_id,
      post_action_id: parsed.data.id,
      action_type: existing.actionType,
    },
    'postAction.markDone.ok',
  )
  updateTag(CRM_TAGS.postActions)
  return ok({ id: parsed.data.id, status: 'done' as const })
}

// ── Dismiss · staff optou por pular (motivo obrigatório) ───────────────────

export async function dismissPostActionAction(
  input: unknown,
): Promise<Result<{ id: string; status: 'dismissed' }>> {
  const parsed = DismissSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const existing = await repos.appointmentPostActions.getById(parsed.data.id)
  if (!existing) return fail('not_found')
  if (existing.status !== 'pending') {
    return fail('invalid_state', {
      current_status: existing.status,
      hint: 'Apenas pós-ações pending podem ser dismissed',
    })
  }

  const updated = await repos.appointmentPostActions.updateStatus(parsed.data.id, {
    status: 'dismissed',
    dismissedReason: parsed.data.reason.trim(),
  })
  if (!updated) {
    log.warn(
      {
        action: 'crm.postAction.dismiss',
        clinic_id: ctx.clinic_id,
        post_action_id: parsed.data.id,
      },
      'postAction.dismiss.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.postAction.dismiss',
      clinic_id: ctx.clinic_id,
      post_action_id: parsed.data.id,
      action_type: existing.actionType,
    },
    'postAction.dismiss.ok',
  )
  updateTag(CRM_TAGS.postActions)
  return ok({ id: parsed.data.id, status: 'dismissed' as const })
}

// ── Cancel · paciente recusou ou regra deixou de fazer sentido ─────────────

export async function cancelPostActionAction(
  input: unknown,
): Promise<Result<{ id: string; status: 'cancelled' }>> {
  const parsed = CancelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const existing = await repos.appointmentPostActions.getById(parsed.data.id)
  if (!existing) return fail('not_found')
  if (existing.status !== 'pending') {
    return fail('invalid_state', {
      current_status: existing.status,
      hint: 'Apenas pós-ações pending podem ser cancelled',
    })
  }

  const updated = await repos.appointmentPostActions.updateStatus(parsed.data.id, {
    status: 'cancelled',
    notes:
      parsed.data.reason && parsed.data.reason.trim().length > 0
        ? `[Cancelled] ${parsed.data.reason.trim()}`
        : null,
  })
  if (!updated) {
    log.warn(
      {
        action: 'crm.postAction.cancel',
        clinic_id: ctx.clinic_id,
        post_action_id: parsed.data.id,
      },
      'postAction.cancel.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.postAction.cancel',
      clinic_id: ctx.clinic_id,
      post_action_id: parsed.data.id,
      action_type: existing.actionType,
    },
    'postAction.cancel.ok',
  )
  updateTag(CRM_TAGS.postActions)
  return ok({ id: parsed.data.id, status: 'cancelled' as const })
}
