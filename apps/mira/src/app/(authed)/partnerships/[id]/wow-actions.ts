'use server'

/**
 * Server Actions · WowActions (sec 12 do detail).
 * Restrito a owner/admin.
 */

import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

/**
 * Gera link NPS publico pra parceira responder a pesquisa quarterly.
 * Retorna token · UI monta URL e copia pra clipboard.
 */
export async function issueNpsLinkAction(
  partnershipId: string,
): Promise<{ ok: boolean; token?: string; url?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!partnershipId) return { ok: false, error: 'partnership_id_required' }
  const r = await repos.b2bNps.issue(partnershipId)
  if (!r.ok || !r.token) {
    return { ok: false, error: r.error || 'nps_issue_failed' }
  }
  const base =
    process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'
  return {
    ok: true,
    token: r.token,
    url: `${base}/nps.html?t=${encodeURIComponent(r.token)}`,
  }
}
