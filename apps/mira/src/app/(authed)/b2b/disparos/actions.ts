'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BCommTemplateRaw } from '@clinicai/repositories'

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
