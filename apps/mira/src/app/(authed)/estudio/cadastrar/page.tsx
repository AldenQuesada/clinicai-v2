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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="max-w-[840px] mx-auto px-6 md:px-8 py-8 md:py-10 flex flex-col gap-6">
        <div className="flex items-start gap-4 pb-5 border-b border-[var(--b2b-border)]">
          <Link
            href="/partnerships"
            className="mt-1.5 p-1.5 rounded text-[var(--b2b-text-muted)] hover:text-[var(--b2b-ivory)] hover:bg-[rgba(201,169,110,0.08)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <span className="eyebrow">Estúdio · Cadastro</span>
            <h1 className="font-display text-[28px] md:text-[32px] text-[var(--b2b-ivory)] mt-1 leading-[1.15]">
              Cadastrar <em>parceria</em>
            </h1>
            <p className="text-[13px] text-[var(--b2b-text-dim)] mt-1.5 italic">
              3 passos · Identidade · Operação · Detalhes — status inicial <span className="not-italic font-mono text-[var(--b2b-champagne)]">prospect</span>.
            </p>
          </div>
        </div>

        <WizardClient mode="new" combos={combos} tierConfigs={tierConfigs} />
      </div>
    </main>
  )
}
