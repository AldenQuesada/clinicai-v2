'use server'

/**
 * Server Actions · /estudio/padroes · defaults numericos da clinica
 * (cap voucher, validade, antecedencia, custo).
 *
 * Storage: clinic_data com key='b2b_voucher_defaults' · value JSON com
 * 4 campos: cap_brl, validity_days, lead_days, cost_brl.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  DEFAULT_VOUCHER_DEFAULTS,
  VOUCHER_DEFAULTS_KEY,
  type VoucherDefaults,
} from './defaults-config'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function getVoucherDefaults(): Promise<VoucherDefaults> {
  const { ctx, repos } = await loadMiraServerContext()
  const stored = await repos.clinicData.getSetting<Partial<VoucherDefaults>>(
    ctx.clinic_id,
    VOUCHER_DEFAULTS_KEY,
  )
  return {
    cap_brl: Number(stored?.cap_brl ?? DEFAULT_VOUCHER_DEFAULTS.cap_brl),
    validity_days: Number(stored?.validity_days ?? DEFAULT_VOUCHER_DEFAULTS.validity_days),
    lead_days: Number(stored?.lead_days ?? DEFAULT_VOUCHER_DEFAULTS.lead_days),
    cost_brl: Number(stored?.cost_brl ?? DEFAULT_VOUCHER_DEFAULTS.cost_brl),
  }
}

export async function saveVoucherDefaultsAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const next: VoucherDefaults = {
    cap_brl: Math.max(0, Number(formData.get('cap_brl') || DEFAULT_VOUCHER_DEFAULTS.cap_brl)),
    validity_days: Math.max(
      1,
      Number(formData.get('validity_days') || DEFAULT_VOUCHER_DEFAULTS.validity_days),
    ),
    lead_days: Math.max(
      0,
      Number(formData.get('lead_days') || DEFAULT_VOUCHER_DEFAULTS.lead_days),
    ),
    cost_brl: Math.max(0, Number(formData.get('cost_brl') || DEFAULT_VOUCHER_DEFAULTS.cost_brl)),
  }

  await repos.clinicData.upsertSetting(ctx.clinic_id, VOUCHER_DEFAULTS_KEY, next)
  revalidatePath('/estudio/padroes')
}
