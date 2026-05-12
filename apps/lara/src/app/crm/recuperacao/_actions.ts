'use server'

/**
 * Server Actions · /crm/recuperacao (CRM_PHASE_2RC).
 *
 * 3 mutations:
 *   - reactivateRecoveryLeadAction · wrap lead_recover RPC
 *   - markRecoveryDiscardedAction · wrap recovery_perdido_mark_discarded
 *   - addRecoveryNoteAction · wrap recovery_perdido_add_note
 *
 * ZERO envio WhatsApp · ZERO chamada provider externo · ZERO wa_outbox.
 * Toda mutation valida Zod + role gate + log estruturado + updateTag.
 *
 * Role gate canon CRM: owner, admin, receptionist.
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
  z,
  type Result,
} from '@/app/crm/_actions/shared'

const log = createLogger({ app: 'lara' })

const RECOVERY_ROLES = ['owner', 'admin', 'receptionist'] as const

// ── Zod schemas ─────────────────────────────────────────────────────────────

const ReactivateSchema = z.object({
  leadId: z.string().uuid(),
  toPhase: z.enum(['lead', 'agendado', 'orcamento']),
  reason: z
    .string()
    .trim()
    .min(3, 'reason_too_short')
    .max(500, 'reason_too_long'),
})

const MarkDiscardedSchema = z.object({
  perdidoId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, 'reason_too_short')
    .max(500, 'reason_too_long'),
})

const AddNoteSchema = z.object({
  perdidoId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .min(3, 'note_too_short')
    .max(1000, 'note_too_long'),
})

// ── 1. reactivateRecoveryLeadAction ─────────────────────────────────────────

export async function reactivateRecoveryLeadAction(
  input: unknown,
): Promise<Result<{ leadId: string; phaseAfter?: string }>> {
  const parsed = ReactivateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.leads.recover(
    parsed.data.leadId,
    parsed.data.toPhase,
    parsed.data.reason,
  )

  if (!r.ok) {
    log.warn(
      {
        action: 'crm.recovery.reactivate',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        to_phase: parsed.data.toPhase,
        error: r.error,
      },
      'recovery.reactivate.failed',
    )
    return fail(r.error || 'rpc_error', {
      detail: 'detail' in r ? r.detail : undefined,
    })
  }

  log.info(
    {
      action: 'crm.recovery.reactivate',
      clinic_id: ctx.clinic_id,
      lead_id: r.leadId,
      to_phase: parsed.data.toPhase,
    },
    'recovery.reactivate.ok',
  )

  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.phaseHistory)

  return ok({ leadId: r.leadId, phaseAfter: r.phaseAfter })
}

// ── 2. markRecoveryDiscardedAction ──────────────────────────────────────────

export async function markRecoveryDiscardedAction(
  input: unknown,
): Promise<Result<{ id: string; idempotentSkip?: boolean }>> {
  const parsed = MarkDiscardedSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.markDiscarded(
    parsed.data.perdidoId,
    parsed.data.reason,
  )

  if (!r.ok) {
    log.warn(
      {
        action: 'crm.recovery.discard',
        clinic_id: ctx.clinic_id,
        perdido_id: parsed.data.perdidoId,
        error: r.error,
      },
      'recovery.discard.failed',
    )
    return fail(r.error || 'rpc_error')
  }

  log.info(
    {
      action: 'crm.recovery.discard',
      clinic_id: ctx.clinic_id,
      perdido_id: r.id,
      idempotent: r.idempotentSkip ?? false,
    },
    'recovery.discard.ok',
  )

  updateTag(CRM_TAGS.leads)

  return ok({ id: r.id ?? parsed.data.perdidoId, idempotentSkip: r.idempotentSkip })
}

// ── 3. addRecoveryNoteAction ────────────────────────────────────────────────

export async function addRecoveryNoteAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = AddNoteSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.addNote(
    parsed.data.perdidoId,
    parsed.data.note,
  )

  if (!r.ok) {
    log.warn(
      {
        action: 'crm.recovery.note',
        clinic_id: ctx.clinic_id,
        perdido_id: parsed.data.perdidoId,
        error: r.error,
      },
      'recovery.note.failed',
    )
    return fail(r.error || 'rpc_error')
  }

  log.info(
    {
      action: 'crm.recovery.note',
      clinic_id: ctx.clinic_id,
      perdido_id: r.id,
    },
    'recovery.note.ok',
  )

  updateTag(CRM_TAGS.leads)

  return ok({ id: r.id ?? parsed.data.perdidoId })
}
