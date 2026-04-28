/**
 * BudgetRepository · custo IA via `_ai_budget` + view `v_ai_budget_today`.
 *
 * Multi-tenant ADR-028 · clinic_id sempre arg.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetDayDTO } from './types'
import type { Database } from '@clinicai/supabase'

export class BudgetRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  async getTodayCost(clinicId: string): Promise<number> {
    const { data } = await this.supabase
      .from('v_ai_budget_today')
      .select('total_cost_usd')
      .eq('clinic_id', clinicId)
      .maybeSingle()

    return Number(data?.total_cost_usd ?? 0)
  }

  /**
   * Soma do custo nos ultimos N dias (default 7).
   * Filtro por day_bucket >= today - N.
   */
  async getRecentCost(clinicId: string, days = 7): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data } = await this.supabase
      .from('_ai_budget')
      .select('cost_usd')
      .eq('clinic_id', clinicId)
      .gte('day_bucket', cutoff)

    return ((data ?? []) as Array<{ cost_usd: number }>).reduce(
      (sum, r) => sum + Number(r.cost_usd ?? 0),
      0,
    )
  }

  /**
   * Lista custos diarios pra grafico · ascending por day_bucket.
   */
  async getDailyBreakdown(clinicId: string, days = 7): Promise<BudgetDayDTO[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data } = await this.supabase
      .from('_ai_budget')
      .select('day_bucket, cost_usd')
      .eq('clinic_id', clinicId)
      .gte('day_bucket', cutoff)
      .order('day_bucket', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({
      dayBucket: String(r.day_bucket),
      costUsd: Number(r.cost_usd ?? 0),
    }))
  }
}
