'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { MiraCronRun } from '@clinicai/repositories'

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function setCronEnabledAction(
  jobName: string,
  enabled: boolean,
  notes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.miraCronRegistry.setEnabled(jobName, enabled, notes)
  revalidatePath('/configuracoes')
  return r
}

export async function fetchCronRunsAction(jobName: string): Promise<MiraCronRun[]> {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  return repos.miraCronRegistry.runsRecent(jobName, 50).catch(() => [])
}
