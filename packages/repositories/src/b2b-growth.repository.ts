/**
 * B2BGrowthRepository · agregador para o painel "Crescer" do detail.
 *
 * 1 RPC: b2b_partner_growth_panel(id) (mig 800-17) · retorna em 1 round-trip
 * impact + trend + cost + conversion lifetime + nps + pitch_stats globais.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface GrowthPartnership {
  id: string
  name: string
  pillar: string | null
  tier: number | null
  is_image_partner: boolean
  status: string
  created_at: string
}

export interface GrowthConversionLifetime {
  vouchers_total: number
  vouchers_redeemed: number
  vouchers_purchased: number
  conv_pct: number
}

export interface GrowthCost {
  voucher_unit_cost_brl: number
  vouchers_brl: number
  monthly_cap_brl: number | null
  over_cap: boolean
}

export interface GrowthNPS {
  responses: number
  score: number | null
}

export interface GrowthHealthHistoryEntry {
  at: string
  color: 'green' | 'yellow' | 'red' | 'unknown'
  previous: 'green' | 'yellow' | 'red' | 'unknown' | null
}

export interface GrowthTrend {
  current: 'green' | 'yellow' | 'red' | 'unknown'
  first: 'green' | 'yellow' | 'red' | 'unknown'
  direction: 'improving' | 'stable' | 'worsening'
  changes_90d: number
  history: GrowthHealthHistoryEntry[]
}

export interface GrowthImpact {
  score: number
}

export interface GrowthPitchStats {
  partnerships_count: number
  vouchers_redeemed: number
  nps: number | null
}

export interface GrowthPanel {
  ok: boolean
  partnership: GrowthPartnership
  conversion_lifetime: GrowthConversionLifetime
  cost: GrowthCost
  nps: GrowthNPS
  trend: GrowthTrend
  impact: GrowthImpact
  pitch_stats: GrowthPitchStats
  error?: string
}

export class B2BGrowthRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  async panel(partnershipId: string): Promise<GrowthPanel | null> {
    const { data, error } = await this.supabase.rpc('b2b_partner_growth_panel', {
      p_partnership_id: partnershipId,
    })
    if (error) throw new Error(`[b2b_partner_growth_panel] ${error.message}`)
    return data as GrowthPanel | null
  }
}
