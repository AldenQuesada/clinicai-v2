'use server'

/**
 * Server Actions · /configuracoes/anamneses
 * CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · 3 mutations top-level:
 *   - createAnamnesisTemplateAction (insere template vazio · sem sessions/fields)
 *   - updateAnamnesisTemplateAction (campos cosméticos do template)
 *   - setAnamnesisTemplateActiveAction (toggle is_active)
 *
 * Sessions/fields/options NÃO são tocados aqui · admin avançado usa RPCs já
 * existentes (`reorder_anamnesis_*` etc) em fase futura.
 *
 * Hard gate clínico intocado (`appointment_finalize`, `appointment_anamnesis_*`,
 * `appointment_clinical_gate_status`).
 *
 * RLS no DB enforça multi-tenant + admin/owner. Camada TS adiciona defense-in-
 * depth via requireRole. ZERO provider · ZERO WhatsApp · ZERO wa_outbox.
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

const ADMIN_ROLES = ['owner', 'admin'] as const

const CATEGORY_VALUES = [
  'general',
  'facial',
  'body',
  'capillary',
  'epilation',
  'custom',
] as const

// ── Zod schemas ─────────────────────────────────────────────────────────────

const TemplateCreateSchema = z.object({
  name: z.string().trim().min(2, 'name_too_short').max(200, 'name_too_long'),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  isPreAppointmentForm: z.boolean().optional(),
  hasGeneralSession: z.boolean().optional(),
})

const TemplateUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  isPreAppointmentForm: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  hasGeneralSession: z.boolean().optional(),
})

const TemplateSetActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
})

// ── createAnamnesisTemplateAction ───────────────────────────────────────────

export async function createAnamnesisTemplateAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = TemplateCreateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const r = await repos.anamnesisTemplates.create(
    ctx.clinic_id,
    parsed.data,
    ctx.user_id ?? null,
  )
  if (!r.ok || !r.id) {
    log.warn(
      {
        action: 'crm.anamnesis_template.create',
        clinic_id: ctx.clinic_id,
        error: r.error,
        name: parsed.data.name,
      },
      'anamnesis_template.create.failed',
    )
    return fail(r.error || 'create_failed')
  }

  log.info(
    {
      action: 'crm.anamnesis_template.create',
      clinic_id: ctx.clinic_id,
      template_id: r.id,
      name: parsed.data.name,
    },
    'anamnesis_template.create.ok',
  )

  updateTag(CRM_TAGS.appointments)
  return ok({ id: r.id })
}

// ── updateAnamnesisTemplateAction ───────────────────────────────────────────

export async function updateAnamnesisTemplateAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = TemplateUpdateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const { id, ...rest } = parsed.data
  const r = await repos.anamnesisTemplates.update(id, rest, ctx.user_id ?? null)
  if (!r.ok) {
    log.warn(
      {
        action: 'crm.anamnesis_template.update',
        clinic_id: ctx.clinic_id,
        template_id: id,
        error: r.error,
      },
      'anamnesis_template.update.failed',
    )
    return fail(r.error || 'update_failed')
  }

  log.info(
    {
      action: 'crm.anamnesis_template.update',
      clinic_id: ctx.clinic_id,
      template_id: id,
    },
    'anamnesis_template.update.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ id })
}

// ── setAnamnesisTemplateActiveAction ────────────────────────────────────────

export async function setAnamnesisTemplateActiveAction(
  input: unknown,
): Promise<Result<{ id: string; active: boolean }>> {
  const parsed = TemplateSetActiveSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const r = await repos.anamnesisTemplates.setActive(
    parsed.data.id,
    parsed.data.active,
    ctx.user_id ?? null,
  )
  if (!r.ok) {
    log.warn(
      {
        action: 'crm.anamnesis_template.set_active',
        clinic_id: ctx.clinic_id,
        template_id: parsed.data.id,
        active: parsed.data.active,
        error: r.error,
      },
      'anamnesis_template.set_active.failed',
    )
    return fail(r.error || 'set_active_failed')
  }

  log.info(
    {
      action: 'crm.anamnesis_template.set_active',
      clinic_id: ctx.clinic_id,
      template_id: parsed.data.id,
      active: parsed.data.active,
    },
    'anamnesis_template.set_active.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ id: parsed.data.id, active: parsed.data.active })
}
