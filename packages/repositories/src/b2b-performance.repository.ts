/**
 * B2BPerformanceRepository · espelho 1:1 do `b2b.performance.repository.js`.
 *
 * 1 RPC: b2b_partner_performance_full(p_partnership_id) · retorna blob com
 * roi, vouchers (funnel), nps, health (current + trend), velocity, churn_risk,
 * partnership (meta).
 *
 * Usado pela tab Performance do detail da parceria.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PerformanceROI {
  revenue_brl: number
  cost_brl: number
  net_brl: number
  roi_pct: number | null
  referred: number
  converted: number
  conversion_rate: number | null
}

export interface PerformanceVouchers {
  total: number
  issued: number
  delivered: number
  opened: number
  redeemed: number
  expired: number
  cancelled: number
  redemption_rate_pct: number | null
  last_issued_at: string | null
}

export interface PerformanceNPS {
  responses_count: number
  responses?: number
  promoters: number
  passives: number
  detractors: number
  nps_score: number | null
  avg_score: number | null
}

export interface PerformanceHealthHistory {
  at: string
  color: 'green' | 'yellow' | 'red' | 'unknown'
  previous: 'green' | 'yellow' | 'red' | 'unknown' | null
}

export interface PerformanceHealth {
  current: 'green' | 'yellow' | 'red' | 'unknown'
  partner_age_days: number
  days_since_last_voucher: number | null
  trend: {
    trend: 'up' | 'down' | 'flat' | null
    changes: number
    history: PerformanceHealthHistory[]
  }
}

export interface PerformanceVelocity {
  insufficient_data?: boolean
  n: number
  avg_days: number
  min_days: number
  max_days: number
  delta_pct: number
}

export interface PerformanceChurnRisk {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  signals: string[]
}

export interface PerformanceFull {
  ok: boolean
  partnership: {
    id: string
    name: string
    status: string | null
    pillar: string | null
    tier: number | null
  }
  roi: PerformanceROI
  vouchers: PerformanceVouchers
  nps: PerformanceNPS
  health: PerformanceHealth
  velocity: PerformanceVelocity
  churn_risk: PerformanceChurnRisk
  error?: string
}

export class B2BPerformanceRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async full(partnershipId: string): Promise<PerformanceFull | null> {
    const { data, error } = await this.supabase.rpc('b2b_partner_performance_full', {
      p_partnership_id: partnershipId,
    })
    if (error) throw new Error(`[b2b_partner_performance_full] ${error.message}`)
    return data as PerformanceFull | null
  }
}
