'use server'

/**
 * Server Actions · /dashboard
 *
 * Insights dismissal server-side (mig 800-21). Substitui o localStorage
 * antigo do banner — agora dismissar no celular some no desktop, e volta
 * automaticamente apos TTL (default 7d).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { revalidateB2BCache } from '@/lib/cached-queries'
import type { InsightKind } from '@clinicai/repositories'

export interface DismissInsightInput {
  kind: InsightKind
  partnership_id: string
  ttl_days?: number
}

export async function dismissInsightAction(
  input: DismissInsightInput,
): Promise<{ ok: boolean; expires_at?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  if (!input?.kind || !input?.partnership_id) {
    return { ok: false, error: 'missing_args' }
  }
  const r = await repos.b2bInsights.dismiss(
    input.kind,
    input.partnership_id,
    input.ttl_days ?? 7,
  )
  // Revalida ambas as superficies que renderizam insights
  revalidatePath('/dashboard')
  revalidatePath('/insights')
  revalidateB2BCache(ctx.clinic_id)
  if (!r.ok) return { ok: false, error: r.error || 'dismiss_failed' }
  return { ok: true, expires_at: r.expires_at }
}

export async function undoDismissInsightAction(
  kind: InsightKind,
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  if (!kind || !partnershipId) return { ok: false, error: 'missing_args' }
  const r = await repos.b2bInsights.undoDismiss(kind, partnershipId)
  revalidatePath('/dashboard')
  revalidatePath('/insights')
  revalidateB2BCache(ctx.clinic_id)
  if (!r.ok) return { ok: false, error: r.error || 'undo_failed' }
  return { ok: true }
}
