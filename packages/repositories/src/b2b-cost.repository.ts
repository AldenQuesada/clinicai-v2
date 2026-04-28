/**
 * B2BCostRepository · espelho de `b2b.cost.repository.js` legacy.
 *
 * RPC: b2b_partnership_cost(uuid) (mig 800-35).
 * Custo real acumulado: vouchers redeemed * unit_cost + group_exposures.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface CostBreakdown {
  ok: boolean
  voucher_unit_cost_brl: number | null
  voucher_redeemed: number
  voucher_total_cost: number
  group_exposures: number
  group_reach: number
  group_total_cost: number
  total_cost: number
  monthly_cap_brl: number | null
  over_cap: boolean
  error?: string
}

export class B2BCostRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async byPartnership(partnershipId: string): Promise<CostBreakdown | null> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_cost', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return (data as CostBreakdown) ?? null
  }
}
