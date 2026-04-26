/**
 * B2BPartnershipHealthSnapshotRepository · espelho de `b2b.health-snapshot.repository.js`.
 *
 * RPC: b2b_partnership_health_snapshot(uuid) (mig 800-35).
 * Score 0-100 em real-time + triggers + metricas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PartnershipHealthSnapshotMetrics {
  days_since_last_voucher: number
  cap_used: number
  cap_total: number
  cap_used_pct: number
  vouchers_90d: number
  conv_90d: number
  conv_pct: number
  nps_avg: number | null
}

export interface PartnershipHealthSnapshot {
  ok: boolean
  partnership_id: string
  color: 'green' | 'yellow' | 'red' | 'unknown'
  score: number
  triggers: string[]
  metrics: PartnershipHealthSnapshotMetrics
  computed_at: string
  error?: string
}

export class B2BPartnershipHealthSnapshotRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async byPartnership(partnershipId: string): Promise<PartnershipHealthSnapshot | null> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_health_snapshot', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return (data as PartnershipHealthSnapshot) ?? null
  }
}
