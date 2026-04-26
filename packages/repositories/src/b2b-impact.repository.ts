/**
 * B2BImpactRepository · espelho de `b2b.impact.repository.js` legacy.
 *
 * RPC: b2b_partnership_impact_score(uuid|null) (mig 800-35).
 * Score 0-100 normalizado pelo topo da rede.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ImpactScore {
  id?: string
  name?: string
  tier?: number | null
  pillar?: string | null
  status?: string
  health_color?: string
  vouchers_redeemed: number
  total_reach: number
  total_cost: number
  avg_nps: number
  raw_score: number
  impact_score: number
  ok?: boolean
  error?: string
}

export class B2BImpactRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async byPartnership(partnershipId: string): Promise<ImpactScore | null> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_impact_score', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return (data as ImpactScore) ?? null
  }

  async all(): Promise<ImpactScore[]> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_impact_score', {
      p_partnership_id: null,
    })
    if (error || !Array.isArray(data)) return []
    return data as ImpactScore[]
  }
}
