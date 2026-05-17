'use server'

/**
 * BLOCO 3.1 · Server Actions do Kanban CRM.
 *
 * Apenas 1 action porque carregamento é feito direto pelo server component
 * via repository (não precisa de action explícita pra read). Mutação de
 * stage acontece no drag-end · chama `sdr_move_lead` via repository.
 *
 * Padrão Camada 5:
 *   1. Zod valida input
 *   2. loadServerReposContext() resolve auth + clinic_id
 *   3. Repository chama RPC tipada (sdr_move_lead)
 *   4. Result<T, E> discriminated union
 *   5. revalidatePath('/crm/kanban') + updateTag(CRM_TAGS.leads)
 *   6. Logger estruturado
 *
 * Sem WhatsApp · sem provider · sem wa_outbox.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  updateTag,
  zodFail,
  type Result,
} from '../_actions/shared'

const log = createLogger({ app: 'lara' })

// 3 stages canônicos do pipeline `evolution` (mig V1 20260509000000)
const KANBAN_STAGES = ['novo', 'em_conversa', 'em_negociacao'] as const
type KanbanStageSlug = (typeof KANBAN_STAGES)[number]

const MoveKanbanStageSchema = z.object({
  leadId: z.string().uuid(),
  stageSlug: z.enum(KANBAN_STAGES),
  origin: z.enum(['drag', 'manual']).optional(),
})

// ── moveLeadKanbanStageAction · drop em coluna do kanban ───────────────────

export async function moveLeadKanbanStageAction(
  input: unknown,
): Promise<
  Result<{
    leadId: string
    pipeline: string
    stage: KanbanStageSlug
  }>
> {
  const parsed = MoveKanbanStageSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()

  const result = await repos.leads.moveKanbanStage(
    parsed.data.leadId,
    parsed.data.stageSlug,
    parsed.data.origin ?? 'drag',
  )

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.kanban.move_stage',
        clinic_id: ctx.clinic_id,
        lead_id: parsed.data.leadId,
        stage_slug: parsed.data.stageSlug,
        error: result.error,
      },
      'kanban.move.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.kanban.move_stage',
      clinic_id: ctx.clinic_id,
      lead_id: result.data.leadId,
      pipeline: result.data.pipeline,
      stage: result.data.stage,
    },
    'kanban.move.ok',
  )

  // Invalida caches relevantes · kanban + lista de leads + dashboard
  updateTag(CRM_TAGS.leads)
  revalidatePath('/crm/kanban')
  revalidatePath('/(authed)/leads')
  revalidatePath('/crm/dashboard')

  return ok({
    leadId: result.data.leadId,
    pipeline: result.data.pipeline,
    stage: result.data.stage as KanbanStageSlug,
  })
}
