'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type {
  B2BCommTemplateRaw,
  B2BCommTemplateSequenceGroup,
} from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function upsertCommTemplateAction(
  payload: Omit<Partial<B2BCommTemplateRaw>, 'id'> & { id?: string | null },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bTemplates.upsert(payload)
  revalidatePath('/b2b/disparos')
  return r
}

export async function deleteCommTemplateAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bTemplates.remove(id)
  revalidatePath('/b2b/disparos')
  return r
}

export async function reloadCommStatsAction() {
  const { repos } = await loadMiraServerContext()
  const stats = await repos.b2bTemplates.stats().catch(() => null)
  revalidatePath('/b2b/disparos')
  return stats
}

export async function reloadCommHistoryAction(opts?: {
  limit?: number
  eventKey?: string | null
}) {
  const { repos } = await loadMiraServerContext()
  const history = await repos.b2bTemplates
    .history({ limit: opts?.limit ?? 50, eventKey: opts?.eventKey ?? null })
    .catch(() => [])
  return history
}

// ═══════════════════════════════════════════════════════════════════════
// Mig 800-24 · sequencias de templates (drag-drop ordering)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lista todas sequencias agrupadas + grupo "Sem sequencia" no fim.
 * Tipos camelCase via DTO porque a aba Sequencias usa o shape rico.
 */
export async function listSequencesAction(): Promise<B2BCommTemplateSequenceGroup[]> {
  const { ctx, repos } = await loadMiraServerContext()
  if (!ctx.clinic_id) return []
  const groups = await repos.b2bTemplates.listSequences(ctx.clinic_id).catch(() => [])
  return groups
}

/**
 * Move template pra nova posicao dentro da mesma sequencia.
 */
export async function reorderTemplateAction(
  id: string,
  newOrder: number,
): Promise<{ ok: boolean; sequence_name?: string | null; new_order?: number; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bTemplates.reorder(id, newOrder)
  revalidatePath('/b2b/disparos')
  return r
}

/**
 * Atribui template a uma sequencia (vai pro fim) ou desatribui (null).
 * Tambem usado pra "criar sequencia" (atribuindo o primeiro template ao novo nome).
 */
export async function assignToSequenceAction(
  id: string,
  sequenceName: string | null,
): Promise<{ ok: boolean; sequence_name?: string | null; sequence_order?: number; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const trimmed = sequenceName == null ? null : sequenceName.trim()
  const r = await repos.b2bTemplates.assignToSequence(id, trimmed && trimmed.length ? trimmed : null)
  revalidatePath('/b2b/disparos')
  return r
}

/**
 * Renomeia uma sequencia inteira em batch (via UPDATE direto · 1 round-trip).
 * Soft fallback: se sequence destino ja existir, NAO mescla — retorna erro
 * pra UI tratar (evita conflito de ordens duplicadas).
 */
export async function renameSequenceAction(
  oldName: string,
  newName: string,
): Promise<{ ok: boolean; renamed?: number; error?: string }> {
  const { supabase, ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!ctx.clinic_id) return { ok: false, error: 'no_clinic' }
  const oldTrim = oldName.trim()
  const newTrim = newName.trim()
  if (!oldTrim || !newTrim) return { ok: false, error: 'missing_name' }
  if (oldTrim === newTrim) return { ok: true, renamed: 0 }

  // Verifica conflito · se newName ja existir, recusa
  const groups = await repos.b2bTemplates.listSequences(ctx.clinic_id).catch(() => [])
  if (groups.some((g) => g.name === newTrim)) {
    return { ok: false, error: 'name_already_exists' }
  }

  // UPDATE direto via supabase (RLS por clinic_id)
  const { error, data } = await supabase
    .from('b2b_comm_templates')
    .update({ sequence_name: newTrim })
    .eq('clinic_id', ctx.clinic_id)
    .eq('sequence_name', oldTrim)
    .select('id')

  if (error) return { ok: false, error: error.message }
  revalidatePath('/b2b/disparos')
  return { ok: true, renamed: Array.isArray(data) ? data.length : 0 }
}
