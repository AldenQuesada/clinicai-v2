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
import type { Database } from '@clinicai/supabase'

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

// ─── Conversion mensal (mig 800-16) ───────────────────────────────────

export interface MonthlyConversionCurrent {
  vouchers_issued: number
  vouchers_delivered: number
  vouchers_opened: number
  vouchers_scheduled: number
  vouchers_redeemed: number
  vouchers_purchased: number
  conv_issued_to_scheduled_pct: number
  conv_scheduled_to_redeemed_pct: number
  conv_redeemed_to_purchased_pct: number
  conv_total_pct: number
}

export interface MonthlyConversionPrevious {
  vouchers_issued: number
  vouchers_purchased: number
  conv_total_pct: number
}

export interface MonthlyConversionDelta {
  issued_pct: number | null
  conv_pp: number
}

export interface MonthlyConversion {
  ok: boolean
  partnership_id: string
  partnership_name: string
  is_image_partner: boolean
  pillar: string | null
  year_month: string
  prev_year_month: string
  current: MonthlyConversionCurrent
  previous: MonthlyConversionPrevious
  delta: MonthlyConversionDelta
  error?: string
}

export interface MonthlyConversionRow {
  partnership_id: string
  partnership_name: string
  is_image_partner: boolean
  pillar: string | null
  status: string
  vouchers_issued: number
  vouchers_purchased: number
  conv_total_pct: number
  vouchers_issued_prev: number
  conv_total_pct_prev: number
  delta_issued_pct: number | null
  delta_conv_pp: number
}

export class B2BPerformanceRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  async full(partnershipId: string): Promise<PerformanceFull | null> {
    const { data, error } = await this.supabase.rpc('b2b_partner_performance_full', {
      p_partnership_id: partnershipId,
    })
    if (error) throw new Error(`[b2b_partner_performance_full] ${error.message}`)
    return data as PerformanceFull | null
  }

  /**
   * Conversao detalhada de UMA parceria num mes especifico · com comparacao
   * vs mes anterior (delta_issued_pct + delta_conv_pp).
   * yearMonth: 'YYYY-MM' · ex: '2026-04'
   * RPC: b2b_partner_conversion_monthly (mig 800-16)
   */
  async monthlyConversion(
    yearMonth: string,
    partnershipId: string,
  ): Promise<MonthlyConversion | null> {
    const { data, error } = await this.supabase.rpc('b2b_partner_conversion_monthly', {
      p_year_month: yearMonth,
      p_partnership_id: partnershipId,
    })
    if (error) throw new Error(`[b2b_partner_conversion_monthly] ${error.message}`)
    return data as MonthlyConversion | null
  }

  /**
   * Lista TODAS parcerias com stats do mes · usado em UI ranking + cron mensal.
   * Inclui apenas parcerias com >= 1 voucher no mes OU mes anterior.
   * RPC: b2b_partner_conversion_monthly_all (mig 800-16)
   */
  async monthlyConversionAll(yearMonth: string): Promise<MonthlyConversionRow[]> {
    const { data, error } = await this.supabase.rpc(
      'b2b_partner_conversion_monthly_all',
      { p_year_month: yearMonth },
    )
    if (error) throw new Error(`[b2b_partner_conversion_monthly_all] ${error.message}`)
    return Array.isArray(data) ? (data as MonthlyConversionRow[]) : []
  }
}
