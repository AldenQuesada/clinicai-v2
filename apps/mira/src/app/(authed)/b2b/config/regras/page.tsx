/**
 * /b2b/config/regras · 2-col Tiers (esq) + Funnel (dir).
 *
 * Pedido Alden 2026-04-26 · fusao das 2 telas de configuracao de scoring
 * (tiers 1/2/3) + benchmarks de step-rate do funil B2B em uma so vista
 * "Regras" — sao dominios irmaos (parametrizacao de avaliacao).
 *
 * Server fetch paralelo · entrega Client Components ja existentes
 * (TiersClient, FunnelClient) sem duplicar nada. URLs antigas
 * (/b2b/config/tiers, /b2b/config/funnel) redirecionam pra ca.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BFunnelStage } from '@clinicai/repositories'
import { TiersClient } from '../tiers/TiersClient'
import { FunnelClient } from '../funnel/FunnelClient'

export const dynamic = 'force-dynamic'

interface TierFallbackSeed {
  tier: 1 | 2 | 3
  label: string
  description: string
  colorHex: string
  sortOrder: number
}

const TIER_FALLBACK: TierFallbackSeed[] = [
  {
    tier: 1,
    label: 'Premium',
    description: 'Parcerias estrategicas · alta exposicao + prioridade no calendario.',
    colorHex: '#C9A96E',
    sortOrder: 1,
  },
  {
    tier: 2,
    label: 'Padrão',
    description: 'Parcerias regulares · cadencia mensal de conteudo + voucher.',
    colorHex: '#9CA3AF',
    sortOrder: 2,
  },
  {
    tier: 3,
    label: 'Apoio',
    description: 'Parcerias institucionais leves · troca pontual · sem meta dura.',
    colorHex: '#6B7280',
    sortOrder: 3,
  },
]

interface FunnelFallbackSeed {
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder: number
}

const FUNNEL_FALLBACK: FunnelFallbackSeed[] = [
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

export default async function ConfigRegrasPage() {
  const { repos } = await loadMiraServerContext()
  const [tierRows, combos, funnelRows] = await Promise.all([
    repos.b2bTierConfigs.list().catch(() => []),
    repos.b2bVoucherCombos.list().catch(() => []),
    repos.b2bFunnelBenchmarks.list().catch(() => []),
  ])

  // Tiers · garante 3 rows na UI
  const byTier = new Map<number, (typeof tierRows)[number]>()
  for (const r of tierRows) byTier.set(Number(r.tier), r)
  const initialTiers = TIER_FALLBACK.map((f) => {
    const existing = byTier.get(f.tier)
    if (existing) {
      return {
        tier: f.tier,
        label: existing.label || f.label,
        description: existing.description ?? f.description,
        colorHex: existing.colorHex || f.colorHex,
        defaultMonthlyCapBrl: existing.defaultMonthlyCapBrl,
        defaultVoucherCombo: existing.defaultVoucherCombo,
        defaultVoucherValidityDays: existing.defaultVoucherValidityDays,
        defaultVoucherMonthlyCap: existing.defaultVoucherMonthlyCap,
        sortOrder: existing.sortOrder,
        persisted: true as const,
      }
    }
    return {
      tier: f.tier,
      label: f.label,
      description: f.description,
      colorHex: f.colorHex,
      defaultMonthlyCapBrl: null,
      defaultVoucherCombo: null,
      defaultVoucherValidityDays: 30,
      defaultVoucherMonthlyCap: null,
      sortOrder: f.sortOrder,
      persisted: false as const,
    }
  })

  const comboOptions = combos
    .filter((c) => c.isActive !== false)
    .map((c) => ({ label: c.label, isDefault: c.isDefault }))

  // Funnel · garante 5 rows na UI
  const byStage = new Map<string, (typeof funnelRows)[number]>()
  for (const r of funnelRows) byStage.set(r.stage, r)
  const initialBenchmarks = FUNNEL_FALLBACK.map((f) => {
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

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
      <div className="pb-2 border-b border-white/10">
        <span className="eyebrow text-[#C9A96E]">B2B · Configuração</span>
        <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
          🎯 Regras de avaliação
        </h1>
        <p className="text-[11px] text-[#9CA3AF] mt-1">
          Tiers de scoring (1/2/3) · esquerda · e benchmarks de step-rate do funil B2B · direita.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
          <header>
            <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
              🎯 Tiers · scoring
            </h3>
            <p className="text-[10px] text-[#6B7280] mt-0.5">
              Premium / Padrão / Apoio · cap, validade voucher, combo default herdado por nova parceria
            </p>
          </header>
          <TiersClient initialTiers={initialTiers} comboOptions={comboOptions} />
        </section>

        <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
          <header>
            <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
              📊 Funnel · benchmarks
            </h3>
            <p className="text-[10px] text-[#6B7280] mt-0.5">
              Step-rate alvo por stage (90/60/50/80/35) · usado em /b2b/analytics
            </p>
          </header>
          <FunnelClient initialBenchmarks={initialBenchmarks} />
        </section>
      </div>
    </div>
  )
}
