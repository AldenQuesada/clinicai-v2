'use server'

/**
 * BLOCO 3.2D · Server Actions da Mesa Operacional.
 *
 * 4 mutations seguras que reusam RPCs/repositories canônicos já existentes
 * (mesmo padrão do Kanban 3.1 e Recuperação 2RC). Cada action é um wrapper
 * mínimo que:
 *   1. Zod valida input (motivo obrigatório onde aplicável)
 *   2. loadServerReposContext resolve auth + clinic_id
 *   3. role gate via requireRole quando a action canônica exige
 *   4. Chama repository tipado (sem RPC nova · sem migration · sem provider)
 *   5. Result<T,E> discriminated union
 *   6. updateTag(CRM_TAGS.X) + revalidatePath de Mesa/Kanban/Agenda
 *
 * Operações:
 *   - markLeadLostFromMesaAction       → repos.leads.markLost (lead_lost RPC)
 *   - recoverLeadFromMesaAction        → repos.leads.recover (lead_recover RPC)
 *                                         · role gate owner/admin/receptionist
 *   - markArrivedFromMesaAction        → repos.appointments.attend (appointment_attend)
 *   - cancelAppointmentFromMesaAction  → repos.appointments.cancel (UPDATE direto)
 *
 * Fora de escopo (vide spec 3.2D):
 *   - Criar orçamento (payload complexo · fica como link p/ /crm/orcamentos/novo)
 *   - Bulk actions
 *   - Provider WhatsApp · wa_outbox · Job 71
 *
 * CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · Agente C:
 *   - archiveLeadFromMesaAction   → repos.leads.archive (lead_archive RPC · mig 875)
 *   - unarchiveLeadFromMesaAction → repos.leads.unarchive (lead_unarchive RPC · mig 875)
 *   - Bucket `arquivado` deixa de ser read-only.
 */

import { revalidatePath } from 'next/cache'
import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  requireRole,
  updateTag,
  z,
  zodFail,
  type Result,
} from '../_actions/shared'

const log = createLogger({ app: 'lara' })

const RECOVERY_ROLES = ['owner', 'admin', 'receptionist'] as const

function revalidateMesaScope() {
  revalidatePath('/crm/mesa-operacional')
  revalidatePath('/crm/kanban')
  revalidatePath('/crm/dashboard')
}

// ── 1. markLeadLostFromMesaAction ──────────────────────────────────────────

const MesaMarkLostSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
})

export async function markLeadLostFromMesaAction(
  input: unknown,
): Promise<Result<{ leadId: string }>> {
  const parsed = MesaMarkLostSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.markLost(parsed.data.leadId, parsed.data.reason)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.mesa.lead_lost',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'mesa.lead_lost.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.mesa.lead_lost',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
    },
    'mesa.lead_lost.ok',
  )

  updateTag(CRM_TAGS.leads)
  revalidateMesaScope()
  return ok({ leadId: result.leadId })
}

// ── 2. recoverLeadFromMesaAction ───────────────────────────────────────────

const MesaRecoverSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
  toPhase: z.enum(['lead', 'agendado', 'orcamento']).optional(),
})

export async function recoverLeadFromMesaAction(
  input: unknown,
): Promise<Result<{ leadId: string; phaseAfter?: string }>> {
  const parsed = MesaRecoverSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECOVERY_ROLES)
  if (forbidden) return forbidden

  const toPhase = parsed.data.toPhase ?? 'lead'
  const result = await repos.leads.recover(parsed.data.leadId, toPhase, parsed.data.reason)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.mesa.lead_recover',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        to_phase: toPhase,
        error: result.error,
      },
      'mesa.lead_recover.failed',
    )
    return fail(result.error || 'rpc_error', {
      detail: 'detail' in result ? result.detail : undefined,
    })
  }

  log.info(
    {
      action: 'crm.mesa.lead_recover',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      to_phase: toPhase,
    },
    'mesa.lead_recover.ok',
  )

  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.phaseHistory)
  revalidateMesaScope()
  revalidatePath('/crm/recuperacao')
  return ok({ leadId: result.leadId, phaseAfter: result.phaseAfter })
}

// ── 3. markArrivedFromMesaAction ───────────────────────────────────────────

const MesaArrivedSchema = z.object({
  appointmentId: z.string().uuid(),
  chegadaEm: z.string().datetime({ offset: true }).optional(),
})

export async function markArrivedFromMesaAction(
  input: unknown,
): Promise<Result<{ appointmentId: string; idempotentSkip: boolean }>> {
  const parsed = MesaArrivedSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.appointments.attend(
    parsed.data.appointmentId,
    parsed.data.chegadaEm,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.mesa.appt_attend',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
        error: result.error,
      },
      'mesa.appt_attend.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.mesa.appt_attend',
      clinic_id: ctx.clinic_id,
      appointment_id: result.appointmentId,
      idempotent_skip: result.idempotentSkip,
    },
    'mesa.appt_attend.ok',
  )

  updateTag(CRM_TAGS.appointments)
  // appointment_attend (canon mig 191) NÃO altera leads.phase · invalida leads
  // tag por defesa apenas para cobrir mudanças correlatas em UPDATEs futuros
  // (ex: timestamps em leads quando paciente chega).
  if (!result.idempotentSkip) updateTag(CRM_TAGS.leads)
  revalidateMesaScope()
  revalidatePath('/crm/agenda')
  return ok({
    appointmentId: result.appointmentId,
    idempotentSkip: result.idempotentSkip,
  })
}

// ── 4. cancelAppointmentFromMesaAction ─────────────────────────────────────

const MesaCancelApptSchema = z.object({
  appointmentId: z.string().uuid(),
  motivo: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
})

export async function cancelAppointmentFromMesaAction(
  input: unknown,
): Promise<Result<{ appointmentId: string }>> {
  const parsed = MesaCancelApptSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const cancelled = await repos.appointments.cancel(
    parsed.data.appointmentId,
    parsed.data.motivo,
  )

  if (!cancelled) {
    log.warn(
      {
        action: 'crm.mesa.appt_cancel',
        clinic_id: ctx.clinic_id,
        appointment_id: parsed.data.appointmentId,
      },
      'mesa.appt_cancel.failed',
    )
    return fail('cancel_failed')
  }

  log.info(
    {
      action: 'crm.mesa.appt_cancel',
      clinic_id: ctx.clinic_id,
      appointment_id: parsed.data.appointmentId,
    },
    'mesa.appt_cancel.ok',
  )

  updateTag(CRM_TAGS.appointments)
  revalidateMesaScope()
  revalidatePath('/crm/agenda')
  return ok({ appointmentId: parsed.data.appointmentId })
}

// ── 5. archiveLeadFromMesaAction · CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 ────
//
// Wrapper de repos.leads.archive (mig 875). lifecycle_status: <atual> →
// 'arquivado' · phase preservado · idempotente (idempotent_skip=true se já
// estava arquivado). Reason ≥3 chars (espelha CHECK da RPC).

const MesaArchiveSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
})

export async function archiveLeadFromMesaAction(
  input: unknown,
): Promise<Result<{ leadId: string; idempotentSkip: boolean }>> {
  const parsed = MesaArchiveSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.archive(parsed.data.leadId, parsed.data.reason)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.mesa.lead_archive',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'mesa.lead_archive.failed',
    )
    return fail(result.error || 'rpc_error', {
      detail: 'detail' in result ? result.detail : undefined,
    })
  }

  log.info(
    {
      action: 'crm.mesa.lead_archive',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      idempotent_skip: !!result.idempotentSkip,
    },
    'mesa.lead_archive.ok',
  )

  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.phaseHistory)
  revalidateMesaScope()
  revalidatePath('/crm/recuperacao')
  return ok({ leadId: result.leadId, idempotentSkip: !!result.idempotentSkip })
}

// ── 6. unarchiveLeadFromMesaAction · CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 ──
//
// Wrapper de repos.leads.unarchive (mig 875). lifecycle_status: 'arquivado' →
// 'ativo' · phase preservado · NÃO idempotente (falha not_archived se
// lifecycle não era arquivado).

const MesaUnarchiveSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_too_short').max(500, 'reason_too_long'),
})

export async function unarchiveLeadFromMesaAction(
  input: unknown,
): Promise<Result<{ leadId: string }>> {
  const parsed = MesaUnarchiveSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.unarchive(parsed.data.leadId, parsed.data.reason)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.mesa.lead_unarchive',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'mesa.lead_unarchive.failed',
    )
    return fail(result.error || 'rpc_error', {
      detail: 'detail' in result ? result.detail : undefined,
    })
  }

  log.info(
    {
      action: 'crm.mesa.lead_unarchive',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
    },
    'mesa.lead_unarchive.ok',
  )

  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.phaseHistory)
  revalidateMesaScope()
  revalidatePath('/crm/recuperacao')
  return ok({ leadId: result.leadId })
}
