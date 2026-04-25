'use server'

/**
 * Server Actions · /b2b/candidatos.
 *
 * Replica 1:1 das chamadas do `b2b-candidates.ui.js` original:
 *   - setStatus → b2b_candidate_set_status
 *   - promote   → b2b_candidate_promote
 *   - addManual → b2b_candidate_add_manual
 *   - findSimilar → b2b_candidate_find_similar
 *
 * Edge function calls (Avaliar IA, Varrer scan) ficam no client porque
 * exigem fetch direto pra `<SUPABASE_URL>/functions/v1/<name>` com
 * token Bearer · client component dispara.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { CandidateStatus } from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function setCandidateStatusAction(
  id: string,
  status: CandidateStatus,
  notes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bScout.setStatus(id, status, notes)
  revalidatePath('/b2b/candidatos')
  return r
}

export async function promoteCandidateAction(
  id: string,
): Promise<{ ok: boolean; partnership_id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bScout.promote(id)
  revalidatePath('/b2b/candidatos')
  revalidatePath('/partnerships')
  return r
}

export async function addCandidateManualAction(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bScout.addManual(payload)
  revalidatePath('/b2b/candidatos')
  return r
}

export async function findSimilarCandidatesAction(
  name: string,
  phone: string | null,
) {
  const { repos } = await loadMiraServerContext()
  if (!name || name.length < 3) return []
  return repos.b2bScout.findSimilar(name, phone)
}
