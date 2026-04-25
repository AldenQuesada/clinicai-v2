/**
 * B2BAnalyticsRepository · espelho 1:1 do `b2b.analytics.repository.js`.
 *
 * 1 RPC: b2b_mira_analytics(p_days) · retorna blob com applications,
 * vouchers, timing, health, mira (NPS + WA + insights).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AnalyticsApplications {
  total: number
  pending: number
  approved: number
  rejected: number
  conversion_rate: number
}

export interface AnalyticsVouchers {
  total: number
  delivered: number
  opened: number
  scheduled: number
  redeemed: number
  purchased: number
  via_mira: number
  via_admin: number
  via_backfill: number
}

export interface AnalyticsTiming {
  avg_approval_hours: number
  max_approval_hours: number
  resolved_count: number
}

export interface AnalyticsHealth {
  total: number
  green: number
  yellow: number
  red: number
  unknown: number
}

export interface AnalyticsMiraNPS {
  responses: number
  nps_score: number | null
}

export interface AnalyticsMira {
  wa_senders_active: number
  wa_senders_total: number
  nps_responses: number
  insights_active: number
  nps_summary: AnalyticsMiraNPS
}

export interface AnalyticsBlob {
  ok: boolean
  period_days: number
  generated_at: string
  applications: AnalyticsApplications
  vouchers: AnalyticsVouchers
  timing: AnalyticsTiming
  health: AnalyticsHealth
  mira: AnalyticsMira
}

export class B2BAnalyticsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async get(days: number = 30): Promise<AnalyticsBlob | null> {
    const { data, error } = await this.supabase.rpc('b2b_mira_analytics', {
      p_days: days,
    })
    if (error) throw new Error(`[b2b_mira_analytics] ${error.message}`)
    return data as AnalyticsBlob
  }
}
