'use server'

/**
 * Server Actions · /b2b/config/funnel · upsert benchmark de step-rate.
 *
 * RPC b2b_funnel_benchmark_upsert · 1 row por stage por clinica. Apos
 * save, revalidatePath('/b2b/config/funnel') + '/b2b/analytics' (JourneyBar
 * carrega benchmarks via SSR).
 *
 * Espelho 1:1 do saveTierConfigAction (mig 800-25).
 */

import { revalidatePath } from 'next/cache'
import {
  B2B_FUNNEL_STAGES,
  type B2BFunnelStage,
} from '@clinicai/repositories'
import { loadMiraServerContext } from '@/lib/server-context'

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface SaveFunnelBenchmarkInput {
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder?: number | null
}

function isStage(s: unknown): s is B2BFunnelStage {
  return (
    typeof s === 'string' &&
    (B2B_FUNNEL_STAGES as readonly string[]).includes(s)
  )
}

export async function saveFunnelBenchmarkAction(
  payload: SaveFunnelBenchmarkInput,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)

  if (!isStage(payload.stage)) {
    return { ok: false, error: 'stage invalido' }
  }
  const target = Number(payload.targetPct)
  if (Number.isNaN(target) || target < 0 || target > 100) {
    return { ok: false, error: 'meta deve estar entre 0 e 100' }
  }
  const label = String(payload.label || '').trim()
  if (label.length < 2) {
    return { ok: false, error: 'Label obrigatoria (min 2 chars)' }
  }

  const r = await repos.b2bFunnelBenchmarks.upsert({
    stage: payload.stage,
    targetPct: Math.round(target),
    label,
    sortOrder: payload.sortOrder == null ? null : Number(payload.sortOrder),
  })

  revalidatePath('/b2b/config/regras')
  revalidatePath('/b2b/analytics')
  return { ok: r.ok, error: r.error }
}
