'use server'

/**
 * Server Actions de leads · 6 wrappers tipados das RPCs canonicas.
 *
 * Cada action segue o padrao da Camada 5 (ver shared.ts):
 *   1. Zod valida input · falha vira { ok:false, error:'invalid_input', details }
 *   2. loadServerReposContext() resolve auth + clinic_id (throw se sem JWT)
 *   3. Repository chama RPC tipada
 *   4. Result<T, E> discriminated union retornado pra UI
 *   5. updateTag('crm.leads') (+ tags relacionadas) apos mutacao
 *   6. Logger estruturado · phone hashed pra LGPD
 */

import {
  CRM_TAGS,
  createLogger,
  fail,
  hashPhone,
  loadServerReposContext,
  ok,
  updateTag,
  zodFail,
  type Result,
} from './shared'
import {
  ChangeLeadPhaseSchema,
  CreateLeadSchema,
  CreateOrcamentoFromLeadSchema,
  MarkLeadLostSchema,
  PromoteToPatientSchema,
  ScheduleAppointmentSchema,
} from '../_schemas/lead.schemas'

const log = createLogger({ app: 'lara' })

// ── 1. createLeadAction · entrada principal (UI manual + integracoes) ───────

export async function createLeadAction(
  input: unknown,
): Promise<Result<{ leadId: string; existed: boolean; phase: string }>> {
  const parsed = CreateLeadSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.createViaRpc(parsed.data)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.create',
        clinic_id: ctx.clinic_id,
        phone_hash: hashPhone(parsed.data.phone),
        error: result.error,
      },
      'lead.create.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.create',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      existed: result.existed,
    },
    'lead.create.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({
    leadId: result.leadId,
    existed: result.existed,
    phase: result.phase,
  })
}

// ── 2. scheduleAppointmentAction · lead → agendado + cria appointment ───────

export async function scheduleAppointmentAction(
  input: unknown,
): Promise<Result<{ appointmentId: string; leadId: string }>> {
  const parsed = ScheduleAppointmentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.toAppointment(parsed.data)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.toAppointment',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'lead.toAppointment.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.toAppointment',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      appointment_id: result.appointmentId,
    },
    'lead.toAppointment.ok',
  )
  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.appointments)
  return ok({
    appointmentId: result.appointmentId,
    leadId: result.leadId,
  })
}

// ── 3. promoteToPatientAction · lead → patient (sem passar por finalize) ────

export async function promoteToPatientAction(
  input: unknown,
): Promise<Result<{ patientId: string; appointmentsRemapped: number }>> {
  const parsed = PromoteToPatientSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.toPaciente(parsed.data.leadId, {
    totalRevenue: parsed.data.totalRevenue ?? null,
    firstAt: parsed.data.firstAt ?? null,
    lastAt: parsed.data.lastAt ?? null,
    notes: parsed.data.notes ?? null,
  })

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.toPaciente',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'lead.toPaciente.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.toPaciente',
      clinic_id: ctx.clinic_id,
      patient_id: result.patientId,
      appointments_remapped: result.appointmentsRemapped,
    },
    'lead.toPaciente.ok',
  )
  // Lead virou patient · soft-delete em leads + insert em patients
  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.patients)
  updateTag(CRM_TAGS.appointments) // FK remapeada
  updateTag(CRM_TAGS.orcamentos) // FK remapeada
  return ok({
    patientId: result.patientId,
    appointmentsRemapped: result.appointmentsRemapped,
  })
}

// ── 4. createOrcamentoFromLeadAction · cria orcamento + soft-delete lead ────

export async function createOrcamentoFromLeadAction(
  input: unknown,
): Promise<Result<{ orcamentoId: string; total: number }>> {
  const parsed = CreateOrcamentoFromLeadSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.toOrcamento(parsed.data)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.toOrcamento',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'lead.toOrcamento.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.toOrcamento',
      clinic_id: ctx.clinic_id,
      orcamento_id: result.orcamentoId,
      total: result.total,
    },
    'lead.toOrcamento.ok',
  )
  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.orcamentos)
  return ok({ orcamentoId: result.orcamentoId, total: result.total })
}

// ── 5. markLeadLostAction · marca perdido (reason obrigatorio) ──────────────

export async function markLeadLostAction(
  input: unknown,
): Promise<Result<{ leadId: string }>> {
  const parsed = MarkLeadLostSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.markLost(parsed.data.leadId, parsed.data.reason)

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.lost',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        error: result.error,
      },
      'lead.lost.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.lost',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
    },
    'lead.lost.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({ leadId: result.leadId })
}

// ── 6. changeLeadPhaseAction · wrapper generico (Kanban drag-drop) ──────────

export async function changeLeadPhaseAction(
  input: unknown,
): Promise<Result<{ leadId: string; fromPhase?: string; toPhase?: string }>> {
  const parsed = ChangeLeadPhaseSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const result = await repos.leads.changePhase(
    parsed.data.leadId,
    parsed.data.toPhase,
    parsed.data.reason ?? null,
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.lead.changePhase',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        to_phase: parsed.data.toPhase,
        error: result.error,
      },
      'lead.changePhase.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.lead.changePhase',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      from_phase: result.fromPhase,
      to_phase: result.toPhase,
    },
    'lead.changePhase.ok',
  )
  updateTag(CRM_TAGS.leads)
  updateTag(CRM_TAGS.phaseHistory)
  return ok({
    leadId: result.leadId,
    fromPhase: result.fromPhase,
    toPhase: result.toPhase,
  })
}
