'use server'

/**
 * Server Actions de orcamentos · 6 actions cobrindo state machine e CRUD.
 *
 * UI nunca cria orcamento direto · sempre via lead.actions.ts →
 * createOrcamentoFromLeadAction (RPC lead_to_orcamento · soft-delete em
 * leads em transacao atomica).
 *
 * State machine: draft → sent → viewed → followup → negotiation → approved
 *                                                              → lost
 *
 * Aprovado != paciente · marcar approved NAO promove lead a paciente
 * automaticamente (modelo excludente forte ADR-001 · paciente exige dados
 * clinicos adicionais que UI captura separado).
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
  AddOrcamentoPaymentSchema,
  MarkOrcamentoApprovedSchema,
  MarkOrcamentoLostSchema,
  MarkOrcamentoSentSchema,
  SoftDeleteOrcamentoSchema,
  UpdateOrcamentoSchema,
} from '../_schemas/orcamento.schemas'

const log = createLogger({ app: 'lara' })

// ── 1. updateOrcamentoAction · campos editaveis em rascunho/negociacao ──────

export async function updateOrcamentoAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string }>> {
  const parsed = UpdateOrcamentoSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const { orcamentoId, ...patch } = parsed.data
  const updated = await repos.orcamentos.update(orcamentoId, patch)

  if (!updated) {
    log.warn(
      {
        action: 'crm.orc.update',
        clinic_id: ctx.clinic_id,
        orcamento_id: orcamentoId,
      },
      'orc.update.failed',
    )
    return fail('update_failed')
  }

  log.info(
    {
      action: 'crm.orc.update',
      clinic_id: ctx.clinic_id,
      orcamento_id: orcamentoId,
    },
    'orc.update.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId })
}

// ── 2. markOrcamentoSentAction · status=sent + sent_at ──────────────────────

export async function markOrcamentoSentAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string }>> {
  const parsed = MarkOrcamentoSentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.orcamentos.markSent(parsed.data.orcamentoId)

  if (!updated) {
    log.warn(
      {
        action: 'crm.orc.markSent',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
      },
      'orc.markSent.failed',
    )
    return fail('mark_sent_failed')
  }

  log.info(
    {
      action: 'crm.orc.markSent',
      clinic_id: ctx.clinic_id,
      orcamento_id: parsed.data.orcamentoId,
    },
    'orc.markSent.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId: parsed.data.orcamentoId })
}

// ── 3. markOrcamentoApprovedAction · status=approved + approved_at ──────────
//
// NAO promove lead a paciente automaticamente. Caller (UI) decide se chama
// promoteToPatientAction em sequencia (precisa dados clinicos adicionais).

export async function markOrcamentoApprovedAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string }>> {
  const parsed = MarkOrcamentoApprovedSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.orcamentos.markApproved(parsed.data.orcamentoId)

  if (!updated) {
    log.warn(
      {
        action: 'crm.orc.markApproved',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
      },
      'orc.markApproved.failed',
    )
    return fail('mark_approved_failed')
  }

  log.info(
    {
      action: 'crm.orc.markApproved',
      clinic_id: ctx.clinic_id,
      orcamento_id: parsed.data.orcamentoId,
    },
    'orc.markApproved.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId: parsed.data.orcamentoId })
}

// ── 4. markOrcamentoLostAction · reason obrigatorio ─────────────────────────

export async function markOrcamentoLostAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string }>> {
  const parsed = MarkOrcamentoLostSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.orcamentos.markLost(
    parsed.data.orcamentoId,
    parsed.data.reason,
  )

  if (!updated) {
    log.warn(
      {
        action: 'crm.orc.markLost',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
      },
      'orc.markLost.failed',
    )
    return fail('mark_lost_failed')
  }

  log.info(
    {
      action: 'crm.orc.markLost',
      clinic_id: ctx.clinic_id,
      orcamento_id: parsed.data.orcamentoId,
    },
    'orc.markLost.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId: parsed.data.orcamentoId })
}

// ── 5. addOrcamentoPaymentAction · append parcela ───────────────────────────
//
// Read-modify-write sem lock (single-user em pratica). Se concorrencia virar
// problema, migra pra RPC com lock pessimista.

export async function addOrcamentoPaymentAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string; paymentsCount: number }>> {
  const parsed = AddOrcamentoPaymentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const updated = await repos.orcamentos.addPayment(
    parsed.data.orcamentoId,
    parsed.data.payment,
  )

  if (!updated) {
    log.warn(
      {
        action: 'crm.orc.addPayment',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
      },
      'orc.addPayment.failed',
    )
    return fail('add_payment_failed')
  }

  log.info(
    {
      action: 'crm.orc.addPayment',
      clinic_id: ctx.clinic_id,
      orcamento_id: parsed.data.orcamentoId,
      payments_count: updated.payments.length,
      amount: parsed.data.payment.amount,
    },
    'orc.addPayment.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({
    orcamentoId: parsed.data.orcamentoId,
    paymentsCount: updated.payments.length,
  })
}

// ── 6. softDeleteOrcamentoAction · admin/owner only ─────────────────────────

export async function softDeleteOrcamentoAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string }>> {
  const parsed = SoftDeleteOrcamentoSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  // Defense-in-depth · soft-delete (UPDATE deleted_at) bate na UPDATE policy
  // de orcamentos que aceita owner|admin|receptionist|therapist. Restringimos
  // pra owner|admin porque esconder orcamento e decisao sensivel (audit).
  const roleCheck = requireRole(ctx.role, ['owner', 'admin'])
  if (roleCheck) {
    log.warn(
      {
        action: 'crm.orc.softDelete',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
        role: ctx.role,
      },
      'orc.softDelete.forbidden',
    )
    return roleCheck
  }

  const success = await repos.orcamentos.softDelete(parsed.data.orcamentoId)
  if (!success) {
    log.warn(
      {
        action: 'crm.orc.softDelete',
        clinic_id: ctx.clinic_id,
        orcamento_id: parsed.data.orcamentoId,
      },
      'orc.softDelete.failed',
    )
    return fail('soft_delete_failed')
  }

  log.info(
    {
      action: 'crm.orc.softDelete',
      clinic_id: ctx.clinic_id,
      orcamento_id: parsed.data.orcamentoId,
    },
    'orc.softDelete.ok',
  )
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId: parsed.data.orcamentoId })
}
