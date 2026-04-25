'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function recalcAllHealthAction(): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  try {
    const r = await repos.b2bHealth.recalcAll()
    revalidatePath('/b2b/saude')
    return r
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
