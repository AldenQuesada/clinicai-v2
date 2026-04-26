/**
 * /b2b/config/tiers · configuracao de tiers (1/2/3) por clinica.
 *
 * Server component magro · carrega 3 tier_configs + combos disponiveis
 * (datalist no form), entrega pra TiersClient editar.
 *
 * Usa b2bTierConfigs.list() (mig 800-25 RPC b2b_tier_config_list).
 * Se a clinica ainda nao tem rows (clinica recem criada apos a mig sem
 * o seed default), preenche com fallback Premium/Padrão/Apoio.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { TiersClient } from './TiersClient'

export const dynamic = 'force-dynamic'

interface FallbackSeed {
  tier: 1 | 2 | 3
  label: string
  description: string
  colorHex: string
  sortOrder: number
}

const FALLBACK: FallbackSeed[] = [
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

export default async function ConfigTiersPage() {
  const { repos } = await loadMiraServerContext()
  const [rows, combos] = await Promise.all([
    repos.b2bTierConfigs.list().catch(() => []),
    repos.b2bVoucherCombos.list().catch(() => []),
  ])

  // Garante 3 rows na UI mesmo se a clinica e nova / seed nao rodou
  const byTier = new Map<number, (typeof rows)[number]>()
  for (const r of rows) byTier.set(Number(r.tier), r)

  const initialTiers = FALLBACK.map((f) => {
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

  return <TiersClient initialTiers={initialTiers} comboOptions={comboOptions} />
}
