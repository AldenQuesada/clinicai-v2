'use server'

/**
 * Server Actions · /crm/recuperacao (CRM_PHASE_2RC + 2RC.1).
 *
 * 2RC mutations:
 *   - reactivateRecoveryLeadAction · wrap lead_recover RPC
 *   - markRecoveryDiscardedAction · wrap recovery_perdido_mark_discarded
 *   - addRecoveryNoteAction · wrap recovery_perdido_add_note
 *
 * 2RC.1 workflow mutations (mig 174):
 *   - createOrGetRecoveryWorkflowAction
 *   - updateRecoveryStageAction
 *   - updateRecoveryPriorityAction
 *   - setRecoveryNextActionAction
 *   - addRecoveryWorkflowNoteAction
 *   - markRecoveryRecoveredAction
 *   - discardRecoveryWorkflowAction
 *   - suggestRecoveryMessageAction · dry-run · zero send
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

// ── 2RC.1 · Workflow actions ────────────────────────────────────────────────

const RECOVERY_STAGE = z.enum([
  'novo',
  'em_analise',
  'primeira_tentativa',
  'aguardando_resposta',
  'retorno_agendado',
  'recuperado',
  'descartado',
  'arquivado',
])

const RECOVERY_PRIORITY = z.enum(['baixa', 'media', 'alta', 'urgente'])

const RECOVERY_NEXT_ACTION = z.enum([
  'ligar',
  'enviar_whatsapp_quando_liberado',
  'agendar_retorno',
  'revisar_orcamento',
  'marcar_descartado',
  'reativar_lead',
  'observar',
])

const RECOVERY_SOURCE_TYPE = z.enum([
  'lead_lost',
  'appointment_cancelled',
  'appointment_no_show',
  'orcamento_frio',
])

const CreateOrGetSchema = z.object({
  sourceType: RECOVERY_SOURCE_TYPE,
  sourceId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
  orcamentoId: z.string().uuid().nullable().optional(),
  priority: RECOVERY_PRIORITY.optional(),
})

const UpdateStageSchema = z.object({
  id: z.string().uuid(),
  stage: RECOVERY_STAGE,
  note: z.string().trim().min(3).max(500).nullable().optional(),
})

const UpdatePrioritySchema = z.object({
  id: z.string().uuid(),
  priority: RECOVERY_PRIORITY,
})

const SetNextActionSchema = z.object({
  id: z.string().uuid(),
  actionType: RECOVERY_NEXT_ACTION.nullable(),
  at: z.string().datetime({ offset: true }).nullable(),
  assignedTo: z.string().uuid().nullable().optional(),
})

const WorkflowNoteSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(3, 'note_too_short').max(1000, 'note_too_long'),
})

const RecoveredSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(3).max(500).nullable().optional(),
})

const DiscardWorkflowSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
})

const SuggestMessageSchema = z.object({
  sourceType: RECOVERY_SOURCE_TYPE,
  displayName: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(500).nullable().optional(),
})

function workflowLog(
  ctx: { clinic_id: string },
  action: string,
  payload: Record<string, unknown>,
  msg: string,
  level: 'info' | 'warn' = 'info',
) {
  const entry = { action, clinic_id: ctx.clinic_id, ...payload }
  if (level === 'warn') log.warn(entry, msg)
  else log.info(entry, msg)
}

export async function createOrGetRecoveryWorkflowAction(
  input: unknown,
): Promise<
  Result<{ id: string; existed: boolean; stage: string; priority: string; status: string }>
> {
  const parsed = CreateOrGetSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.createOrGetWorkflow(parsed.data)
  if (!r.ok || !r.id) {
    workflowLog(
      ctx,
      'crm.recovery.workflow.create',
      { error: r.error, source_type: parsed.data.sourceType },
      'recovery.workflow.create.failed',
      'warn',
    )
    return fail(r.error || 'rpc_error')
  }

  workflowLog(
    ctx,
    'crm.recovery.workflow.create',
    { workflow_id: r.id, existed: r.existed ?? false },
    'recovery.workflow.create.ok',
  )

  updateTag(CRM_TAGS.leads)

  return ok({
    id: r.id,
    existed: r.existed ?? false,
    stage: r.stage ?? 'novo',
    priority: r.priority ?? 'media',
    status: r.status ?? 'aberto',
  })
}

export async function updateRecoveryStageAction(
  input: unknown,
): Promise<Result<{ id: string; stage: string; idempotentSkip?: boolean }>> {
  const parsed = UpdateStageSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.updateWorkflowStage(
    parsed.data.id,
    parsed.data.stage,
    parsed.data.note ?? null,
  )
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.stage', { error: r.error }, 'workflow.stage.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.stage',
    { workflow_id: r.id, stage: r.stage },
    'workflow.stage.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    id: r.id ?? parsed.data.id,
    stage: r.stage ?? parsed.data.stage,
    idempotentSkip: r.idempotentSkip,
  })
}

export async function updateRecoveryPriorityAction(
  input: unknown,
): Promise<Result<{ id: string; priority: string; idempotentSkip?: boolean }>> {
  const parsed = UpdatePrioritySchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.updateWorkflowPriority(
    parsed.data.id,
    parsed.data.priority,
  )
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.priority', { error: r.error }, 'workflow.priority.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.priority',
    { workflow_id: r.id, priority: r.priority },
    'workflow.priority.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    id: r.id ?? parsed.data.id,
    priority: r.priority ?? parsed.data.priority,
    idempotentSkip: r.idempotentSkip,
  })
}

export async function setRecoveryNextActionAction(
  input: unknown,
): Promise<Result<{ id: string; actionType: string | null; at: string | null }>> {
  const parsed = SetNextActionSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.setWorkflowNextAction(parsed.data)
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.next_action', { error: r.error }, 'workflow.next_action.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.next_action',
    { workflow_id: r.id, action: r.actionType, at: r.at },
    'workflow.next_action.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    id: r.id ?? parsed.data.id,
    actionType: r.actionType ?? parsed.data.actionType,
    at: r.at ?? parsed.data.at,
  })
}

export async function addRecoveryWorkflowNoteAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = WorkflowNoteSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.addWorkflowNote(parsed.data.id, parsed.data.note)
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.note', { error: r.error }, 'workflow.note.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(ctx, 'crm.recovery.workflow.note', { workflow_id: r.id }, 'workflow.note.ok')
  updateTag(CRM_TAGS.leads)
  return ok({ id: r.id ?? parsed.data.id })
}

export async function markRecoveryRecoveredAction(
  input: unknown,
): Promise<Result<{ id: string; status: string; idempotentSkip?: boolean }>> {
  const parsed = RecoveredSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.markWorkflowRecovered(
    parsed.data.id,
    parsed.data.note ?? null,
  )
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.recovered', { error: r.error }, 'workflow.recovered.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.recovered',
    { workflow_id: r.id, idempotent: r.idempotentSkip ?? false },
    'workflow.recovered.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    id: r.id ?? parsed.data.id,
    status: r.status ?? 'recuperado',
    idempotentSkip: r.idempotentSkip,
  })
}

export async function discardRecoveryWorkflowAction(
  input: unknown,
): Promise<Result<{ id: string; status: string; idempotentSkip?: boolean }>> {
  const parsed = DiscardWorkflowSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.discardWorkflow(parsed.data.id, parsed.data.reason)
  if (!r.ok) {
    workflowLog(ctx, 'crm.recovery.workflow.discard', { error: r.error }, 'workflow.discard.failed', 'warn')
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.discard',
    { workflow_id: r.id, idempotent: r.idempotentSkip ?? false },
    'workflow.discard.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    id: r.id ?? parsed.data.id,
    status: r.status ?? 'descartado',
    idempotentSkip: r.idempotentSkip,
  })
}

/**
 * Gera texto sugerido para o atendente copiar. DRY-RUN · zero envio.
 * Texto vem de regra SQL estática (RPC IMMUTABLE).
 */
export async function suggestRecoveryMessageAction(
  input: unknown,
): Promise<Result<{ message: string }>> {
  const parsed = SuggestMessageSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const r = await repos.commercialRecovery.suggestWorkflowMessage(
    parsed.data.sourceType,
    parsed.data.displayName,
    parsed.data.reason ?? null,
  )
  if (!r.ok || !r.message) {
    workflowLog(
      ctx,
      'crm.recovery.workflow.suggest',
      { error: r.error },
      'workflow.suggest.failed',
      'warn',
    )
    return fail(r.error || 'rpc_error')
  }
  workflowLog(
    ctx,
    'crm.recovery.workflow.suggest',
    { source_type: parsed.data.sourceType, len: r.message.length },
    'workflow.suggest.ok',
  )
  return ok({ message: r.message })
}
