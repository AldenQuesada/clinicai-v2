'use server'

/**
 * Server Actions · /semana/encerramentos.
 * Espelho 1:1 das chamadas do b2b-closure.ui.js · 4 RPCs:
 *   detectInactive, listPending (no page server), approve, dismiss.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function detectInactiveAction(): Promise<{ ok: boolean; flagged: number; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  try {
    const r = await repos.b2bClosure.detectInactive()
    revalidatePath('/semana/encerramentos')
    return r
  } catch (e) {
    return { ok: false, flagged: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function approveClosureAction(
  id: string,
  reason: string | null,
  templateKey = 'default',
): Promise<{ ok: boolean; letter?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  try {
    const r = await repos.b2bClosure.approve(id, reason, templateKey)
    revalidatePath('/semana/encerramentos')
    revalidatePath('/partnerships')
    return r
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function dismissClosureAction(
  id: string,
  note: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  try {
    const r = await repos.b2bClosure.dismiss(id, note)
    revalidatePath('/semana/encerramentos')
    return r
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
