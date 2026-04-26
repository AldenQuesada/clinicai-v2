/**
 * /estudio/cadastrar · wizard 3-step pra cadastrar parceria.
 *
 * Server component magro · so renderiza header + WizardClient com combos
 * carregados (catalogo b2b_voucher_combos pra datalist + auto-pick por pillar).
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { WizardClient } from './WizardClient'

export const dynamic = 'force-dynamic'

export default async function CadastrarPartnershipPage() {
  const { repos } = await loadMiraServerContext()
  const [combosRaw, tierConfigsRaw] = await Promise.all([
    repos.b2bVoucherCombos.list().catch(() => []),
    repos.b2bTierConfigs.list().catch(() => []),
  ])
  const combos = combosRaw.map((c) => ({
    label: c.label,
    isActive: c.isActive,
    isDefault: c.isDefault,
  }))
  const tierConfigs = tierConfigsRaw.map((t) => ({
    tier: t.tier,
    label: t.label,
    description: t.description,
    colorHex: t.colorHex,
    defaultMonthlyCapBrl: t.defaultMonthlyCapBrl,
    defaultVoucherCombo: t.defaultVoucherCombo,
    defaultVoucherValidityDays: t.defaultVoucherValidityDays,
    defaultVoucherMonthlyCap: t.defaultVoucherMonthlyCap,
  }))

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/partnerships"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
                Estúdio · Cadastro
              </span>
              <h1 className="font-display text-xl text-[#F5F0E8] mt-0.5">Cadastrar parceria</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                3 passos · Identidade · Operação · Detalhes. Status inicial: prospect.
              </p>
            </div>
          </div>
        </div>

        <WizardClient mode="new" combos={combos} tierConfigs={tierConfigs} />
      </div>
    </main>
  )
}
