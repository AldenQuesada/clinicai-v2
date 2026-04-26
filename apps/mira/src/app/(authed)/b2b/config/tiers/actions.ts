'use server'

/**
 * Server Actions · /b2b/config/tiers · upsert config de tier (1/2/3).
 *
 * RPC b2b_tier_config_upsert · 1 row por tier por clinica. Apos save,
 * revalidatePath('/b2b/config/tiers') + '/estudio/cadastrar' (Wizard
 * carrega defaults via SSR).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface SaveTierConfigInput {
  tier: 1 | 2 | 3
  label: string
  description?: string | null
  colorHex?: string | null
  defaultMonthlyCapBrl?: number | null
  defaultVoucherCombo?: string | null
  defaultVoucherValidityDays?: number | null
  defaultVoucherMonthlyCap?: number | null
  sortOrder?: number | null
}

export async function saveTierConfigAction(
  payload: SaveTierConfigInput,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)

  if (payload.tier !== 1 && payload.tier !== 2 && payload.tier !== 3) {
    return { ok: false, error: 'tier invalido (1/2/3)' }
  }
  const label = String(payload.label || '').trim()
  if (label.length < 2) {
    return { ok: false, error: 'Nome do tier obrigatorio (min 2 chars)' }
  }

  const r = await repos.b2bTierConfigs.upsert({
    tier: payload.tier,
    label,
    description: payload.description?.trim() || null,
    colorHex: payload.colorHex?.trim() || null,
    defaultMonthlyCapBrl:
      payload.defaultMonthlyCapBrl == null || isNaN(Number(payload.defaultMonthlyCapBrl))
        ? null
        : Number(payload.defaultMonthlyCapBrl),
    defaultVoucherCombo: payload.defaultVoucherCombo?.trim() || null,
    defaultVoucherValidityDays:
      payload.defaultVoucherValidityDays == null
        ? null
        : Number(payload.defaultVoucherValidityDays),
    defaultVoucherMonthlyCap:
      payload.defaultVoucherMonthlyCap == null ||
      isNaN(Number(payload.defaultVoucherMonthlyCap))
        ? null
        : Number(payload.defaultVoucherMonthlyCap),
    sortOrder: payload.sortOrder == null ? null : Number(payload.sortOrder),
  })

  revalidatePath('/b2b/config/tiers')
  revalidatePath('/estudio/cadastrar')
  return { ok: r.ok, error: r.error }
}
