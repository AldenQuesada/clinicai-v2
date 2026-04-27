'use server'

/**
 * Server Action pra carregar combos+tierConfigs · usado pelo
 * PartnerCreateModal (overlay aberto via NewMenu).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { ComboLite, TierConfigLite } from './WizardClient'

export interface WizardLazyData {
  combos: ComboLite[]
  tierConfigs: TierConfigLite[]
}

export async function loadWizardLazyDataAction(): Promise<WizardLazyData> {
  const { repos } = await loadMiraServerContext()
  const [combosRaw, tierConfigsRaw] = await Promise.all([
    repos.b2bVoucherCombos.list().catch(() => []),
    repos.b2bTierConfigs.list().catch(() => []),
  ])
  return {
    combos: combosRaw.map((c) => ({
      label: c.label,
      isActive: c.isActive,
      isDefault: c.isDefault,
    })),
    tierConfigs: tierConfigsRaw.map((t) => ({
      tier: t.tier,
      label: t.label,
      description: t.description,
      colorHex: t.colorHex,
      defaultMonthlyCapBrl: t.defaultMonthlyCapBrl,
      defaultVoucherCombo: t.defaultVoucherCombo,
      defaultVoucherValidityDays: t.defaultVoucherValidityDays,
      defaultVoucherMonthlyCap: t.defaultVoucherMonthlyCap,
    })),
  }
}
