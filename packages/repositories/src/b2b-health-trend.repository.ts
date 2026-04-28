/**
 * B2BHealthTrendRepository · espelho de `b2b.health-trend.repository.js`.
 *
 * RPC: b2b_health_trend(uuid, int days) (mig 800-35).
 * Trend 90d com history dots + summary.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface HealthTrendHistoryEntry {
  color: 'green' | 'yellow' | 'red' | 'unknown'
  previous: 'green' | 'yellow' | 'red' | 'unknown' | null
  at: string
}

export interface HealthTrend {
  ok: boolean
  current: 'green' | 'yellow' | 'red' | 'unknown'
  first_in_window: 'green' | 'yellow' | 'red' | 'unknown' | null
  trend: 'improving' | 'stable' | 'worsening'
  days_window: number
  changes: number
  red_changes: number
  green_changes: number
  history: HealthTrendHistoryEntry[]
  error?: string
}

export class B2BHealthTrendRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  async byPartnership(partnershipId: string, days = 90): Promise<HealthTrend | null> {
    const { data, error } = await this.supabase.rpc('b2b_health_trend', {
      p_partnership_id: partnershipId,
      p_days: days,
    })
    if (error) return null
    return (data as HealthTrend) ?? null
  }
}
