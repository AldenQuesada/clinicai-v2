'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function approveApplicationAction(
  id: string,
  note: string | null,
): Promise<{ ok: boolean; partnership_id?: string; partnership_name?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bApplications.approve(id, note)
  revalidatePath('/b2b/candidaturas')
  revalidatePath('/partnerships')
  return r
}

export async function rejectApplicationAction(
  id: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!reason.trim()) {
    return { ok: false, error: 'Motivo é obrigatório' }
  }
  const r = await repos.b2bApplications.reject(id, reason.trim())
  revalidatePath('/b2b/candidaturas')
  return r
}
