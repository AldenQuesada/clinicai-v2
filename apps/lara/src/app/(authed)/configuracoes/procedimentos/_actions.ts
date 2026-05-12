'use server'

/**
 * Server Actions · /configuracoes/procedimentos (CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN).
 *
 * 3 mutations:
 *   - createProcedureAction · INSERT em clinic_procedimentos
 *   - updateProcedureAction · UPDATE parcial
 *   - setProcedureActiveAction · soft-toggle ativo
 *
 * RLS policies enforçam:
 *   - clinic_id = app_clinic_id() (multi-tenant)
 *   - app_role() ∈ ('admin','owner') para INSERT/UPDATE/DELETE
 *
 * Camada TS adiciona role gate explícito (defense-in-depth) via requireRole.
 *
 * ZERO envio WhatsApp · ZERO provider · ZERO wa_outbox.
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

// ── Zod schemas ─────────────────────────────────────────────────────────────

const ProcedureCreateSchema = z
  .object({
    nome: z.string().trim().min(2, 'nome_too_short').max(200, 'nome_too_long'),
    categoria: z.string().trim().max(100).nullable().optional(),
    tipo: z.string().trim().max(50).nullable().optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    preco: z.number().nonnegative().nullable().optional(),
    precoPromo: z.number().nonnegative().nullable().optional(),
    duracaoMin: z.number().int().positive().max(480).nullable().optional(),
    sessoes: z.number().int().positive().max(50).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (v) => {
      // promo só faz sentido se ≤ preco · permite promo null
      if (v.precoPromo == null) return true
      if (v.preco == null || v.preco <= 0) return false
      return v.precoPromo <= v.preco
    },
    { message: 'promo_maior_que_preco', path: ['precoPromo'] },
  )

const ProcedureUpdateSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string().trim().min(2).max(200).optional(),
    categoria: z.string().trim().max(100).nullable().optional(),
    tipo: z.string().trim().max(50).nullable().optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    preco: z.number().nonnegative().nullable().optional(),
    precoPromo: z.number().nonnegative().nullable().optional(),
    duracaoMin: z.number().int().positive().max(480).nullable().optional(),
    sessoes: z.number().int().positive().max(50).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (v) => {
      if (v.precoPromo == null) return true
      if (v.preco == null || v.preco <= 0) return false
      return v.precoPromo <= v.preco
    },
    { message: 'promo_maior_que_preco', path: ['precoPromo'] },
  )

const ProcedureSetActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
})

// ── createProcedureAction ───────────────────────────────────────────────────

export async function createProcedureAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = ProcedureCreateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const r = await repos.procedureAdmin.create(ctx.clinic_id, parsed.data)
  if (!r.ok || !r.id) {
    log.warn(
      {
        action: 'crm.procedure.create',
        clinic_id: ctx.clinic_id,
        error: r.error,
        nome: parsed.data.nome,
      },
      'procedure.create.failed',
    )
    return fail(r.error || 'create_failed')
  }

  log.info(
    {
      action: 'crm.procedure.create',
      clinic_id: ctx.clinic_id,
      procedure_id: r.id,
      nome: parsed.data.nome,
    },
    'procedure.create.ok',
  )

  updateTag(CRM_TAGS.appointments) // procedimentos impactam wizard
  return ok({ id: r.id })
}

// ── updateProcedureAction ───────────────────────────────────────────────────

export async function updateProcedureAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = ProcedureUpdateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const { id, ...rest } = parsed.data
  const r = await repos.procedureAdmin.update(id, rest)
  if (!r.ok) {
    log.warn(
      {
        action: 'crm.procedure.update',
        clinic_id: ctx.clinic_id,
        procedure_id: id,
        error: r.error,
      },
      'procedure.update.failed',
    )
    return fail(r.error || 'update_failed')
  }

  log.info(
    { action: 'crm.procedure.update', clinic_id: ctx.clinic_id, procedure_id: id },
    'procedure.update.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ id })
}

// ── setProcedureActiveAction ────────────────────────────────────────────────

export async function setProcedureActiveAction(
  input: unknown,
): Promise<Result<{ id: string; active: boolean }>> {
  const parsed = ProcedureSetActiveSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, ADMIN_ROLES)
  if (forbidden) return forbidden

  const r = await repos.procedureAdmin.setActive(parsed.data.id, parsed.data.active)
  if (!r.ok) {
    log.warn(
      {
        action: 'crm.procedure.set_active',
        clinic_id: ctx.clinic_id,
        procedure_id: parsed.data.id,
        active: parsed.data.active,
        error: r.error,
      },
      'procedure.set_active.failed',
    )
    return fail(r.error || 'set_active_failed')
  }

  log.info(
    {
      action: 'crm.procedure.set_active',
      clinic_id: ctx.clinic_id,
      procedure_id: parsed.data.id,
      active: parsed.data.active,
    },
    'procedure.set_active.ok',
  )
  updateTag(CRM_TAGS.appointments)
  return ok({ id: parsed.data.id, active: parsed.data.active })
}
