/**
 * Defaults voucher · types e constantes (separado pra "use server" do
 * actions.ts nao exportar nada nao-async).
 */

export interface VoucherDefaults {
  cap_brl: number
  validity_days: number
  lead_days: number
  cost_brl: number
}

export const DEFAULT_VOUCHER_DEFAULTS: VoucherDefaults = {
  cap_brl: 200,
  validity_days: 30,
  lead_days: 3,
  cost_brl: 80,
}

export const VOUCHER_DEFAULTS_KEY = 'b2b_voucher_defaults'
