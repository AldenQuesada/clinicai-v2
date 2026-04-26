'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

export async function reloadSystemHealthAction() {
  const { repos } = await loadMiraServerContext()
  const snap = await repos.b2bSystemHealth.snapshot().catch(() => null)
  revalidatePath('/b2b/config/saude')
  return snap
}
