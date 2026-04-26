/**
 * /b2b/config/funnel · benchmarks de step-rate do funil B2B por clinica.
 *
 * Server component magro · carrega 5 funnel_benchmarks (1 por stage) e
 * entrega pra FunnelClient editar.
 *
 * Usa b2bFunnelBenchmarks.list() (mig 800-26 RPC b2b_funnel_benchmark_list).
 * Se a clinica ainda nao tem rows (clinica recem criada apos a mig sem o
 * seed default), preenche com fallback (90/60/50/80/35).
 *
 * Espelho 1:1 do padrao /b2b/config/tiers (mig 800-25).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BFunnelStage } from '@clinicai/repositories'
import { FunnelClient } from './FunnelClient'

export const dynamic = 'force-dynamic'

interface FallbackSeed {
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder: number
}

const FALLBACK: FallbackSeed[] = [
  {
    stage: 'delivered',
    targetPct: 90,
    label: 'Taxa de entrega · WhatsApp aceito',
    sortOrder: 1,
  },
  {
    stage: 'opened',
    targetPct: 60,
    label: 'Taxa de abertura · convidada engajou',
    sortOrder: 2,
  },
  {
    stage: 'scheduled',
    targetPct: 50,
    label: 'Taxa de agendamento · CTA do voucher funcionou',
    sortOrder: 3,
  },
  {
    stage: 'redeemed',
    targetPct: 80,
    label: 'Taxa de comparecimento · no-show < 20%',
    sortOrder: 4,
  },
  {
    stage: 'purchased',
    targetPct: 35,
    label: 'Taxa de fechamento · combo case, scripts ok',
    sortOrder: 5,
  },
]

export default async function ConfigFunnelPage() {
  const { repos } = await loadMiraServerContext()
  const rows = await repos.b2bFunnelBenchmarks.list().catch(() => [])

  // Garante 5 rows na UI mesmo se a clinica e nova / seed nao rodou
  const byStage = new Map<string, (typeof rows)[number]>()
  for (const r of rows) byStage.set(r.stage, r)

  const initialBenchmarks = FALLBACK.map((f) => {
    const existing = byStage.get(f.stage)
    if (existing) {
      return {
        stage: f.stage,
        targetPct: existing.targetPct,
        label: existing.label || f.label,
        sortOrder: existing.sortOrder || f.sortOrder,
        persisted: true as const,
      }
    }
    return {
      stage: f.stage,
      targetPct: f.targetPct,
      label: f.label,
      sortOrder: f.sortOrder,
      persisted: false as const,
    }
  })

  return <FunnelClient initialBenchmarks={initialBenchmarks} />
}
