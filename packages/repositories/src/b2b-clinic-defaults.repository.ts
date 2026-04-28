/**
 * B2BClinicDefaultsRepository · espelho 1:1 do `b2b.clinic-defaults.repository.js`.
 *
 * 2 RPCs (mig 722) sobre clinics.settings->b2b_defaults:
 *   - get()              · b2b_clinic_defaults_get · {ok, defaults}
 *   - update(payload)    · b2b_clinic_defaults_update · {ok}
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface VoucherCTA {
  button_label: string
  whatsapp_message: string
}

export interface ClinicDefaultsRaw {
  voucher_monthly_cap: number
  voucher_validity_days: number
  voucher_min_notice_days: number
  voucher_unit_cost_brl: number
  voucher_cta?: VoucherCTA
  [k: string]: unknown
}

export interface ClinicDefaultsResponse {
  ok: boolean
  defaults: ClinicDefaultsRaw
}

export class B2BClinicDefaultsRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  async get(): Promise<ClinicDefaultsResponse> {
    const data = await this.rpc<ClinicDefaultsResponse | null>('b2b_clinic_defaults_get')
    return {
      ok: data?.ok === true,
      defaults: (data?.defaults || {}) as ClinicDefaultsRaw,
    }
  }

  update(payload: Partial<ClinicDefaultsRaw>): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_clinic_defaults_update', { p_payload: payload })
  }
}
