/**
 * B2BMetricsV2Repository · espelho 1:1 do `b2bm2.repository.js`.
 *
 * 8 RPCs consumidas pela pagina Analytics v2:
 *   - growthWeekly(weeks)        · b2b_growth_weekly · meta semanal + streak
 *   - pipelineFunnel(days)       · b2b_pipeline_funnel · candidatos→ativa
 *   - partnerPerformance(days)   · b2b_partner_performance · classificacao 90d
 *   - criticalAlerts()           · b2b_critical_alerts · alertas urgentes
 *   - setImageFlag(id, isImage)  · b2b_partnership_set_image_flag
 *   - payback(days, partnerId)   · b2b_payback_analysis · ROI + payback dias
 *   - velocity(days, partnerId)  · b2b_partnership_velocity · dias 1a voucher
 *   - forecast(metaNew, vouch)   · b2b_forecast_month · projecao mes
 */

import type { SupabaseClient } from '@supabase/supabase-js'
// ─── Tipos raw das RPCs ────────────────────────────────────────────────

export interface GrowthWeek {
  start: string
  end: string
  count: number
  hit: boolean
  is_current?: boolean
  days_remaining?: number
  pct?: number
  new_count?: number
}

export interface GrowthWeekly {
  ok: boolean
  meta: number
  weeks: GrowthWeek[]
  current_week?: GrowthWeek
  streak: { current: number; max_window: number; window_weeks?: number }
}

export interface PipelineFunnel {
  ok: boolean
  period_days: number
  conversion_rate: number
  cumulative: {
    candidatos: number
    prospect: number
    dna_check: number
    contract: number
    active: number
  }
  current: {
    prospect: number
    dna_check: number
    contract: number
    active: number
  }
}

export type PartnerClassification =
  | 'novo'
  | 'ideal'
  | 'otimo'
  | 'aceitavel'
  | 'abaixo'
  | 'critico'
  | 'inativa'

export interface PartnerPerformanceRow {
  partnership_id: string
  name: string
  pillar: string | null
  category: string | null
  is_image_partner: boolean
  classification: PartnerClassification
  health_color: 'green' | 'yellow' | 'red' | 'unknown'
  vouchers_emitted: number
  vouchers_scheduled: number
  vouchers_attended: number
  vouchers_converted: number
  conversion_pct: number
  weeks_with_voucher: number
  last_voucher_at: string | null
  days_since_last_voucher: number | null
}

export type AlertSeverity = 'critical' | 'warning' | 'celebrate' | 'personal'

export interface CriticalAlert {
  partnership_id: string | null
  partnership_name: string | null
  is_image_partner: boolean
  severity: AlertSeverity
  message: string
  suggested_action: string | null
}

export interface PaybackData {
  revenue?: number
  cost?: number
  total_revenue?: number
  total_cost?: number
  total_created?: number
  created?: number
  total_redeemed?: number
  redeemed?: number
  roi_pct?: number
  avg_payback_days?: number
  payback_days?: number
}

export interface VelocityData {
  avg_days: number
  min_days: number
  max_days: number
  n: number
  delta_pct: number
}

export type ForecastStatus = 'acima' | 'ok' | 'atento' | 'risco'

export interface ForecastData {
  meta_new_partners: number
  new_realized: number
  new_projection: number
  pct_of_meta_new: number
  status_new: ForecastStatus
  meta_vouchers: number
  vouch_realized: number
  vouch_projection: number
  pct_of_meta_vouchers: number
  status_vouchers: ForecastStatus
  status_overall?: ForecastStatus
  days_passed: number
  prev_month_new_partners: number
  prev_month_vouchers: number
}

// ─── Repository ────────────────────────────────────────────────────────

export class B2BMetricsV2Repository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  growthWeekly(weeks: number = 12): Promise<GrowthWeekly | null> {
    return this.rpc<GrowthWeekly>('b2b_growth_weekly', { p_weeks: weeks })
  }

  pipelineFunnel(days: number = 30): Promise<PipelineFunnel | null> {
    return this.rpc<PipelineFunnel>('b2b_pipeline_funnel', { p_days: days })
  }

  async partnerPerformance(days: number = 90): Promise<PartnerPerformanceRow[]> {
    const data = await this.rpc<PartnerPerformanceRow[] | null>('b2b_partner_performance', {
      p_rolling_days: days,
    })
    return Array.isArray(data) ? data : []
  }

  async criticalAlerts(): Promise<CriticalAlert[]> {
    const data = await this.rpc<CriticalAlert[] | null>('b2b_critical_alerts')
    return Array.isArray(data) ? data : []
  }

  setImageFlag(partnershipId: string, isImage: boolean): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_partnership_set_image_flag', {
      p_partnership_id: partnershipId,
      p_is_image: isImage,
    })
  }

  payback(days: number = 90, partnerId: string | null = null): Promise<PaybackData | null> {
    return this.rpc<PaybackData>('b2b_payback_analysis', {
      p_days: days,
      p_partnership_id: partnerId,
    })
  }

  velocity(days: number = 30, partnerId: string | null = null): Promise<VelocityData | null> {
    return this.rpc<VelocityData>('b2b_partnership_velocity', {
      p_days: days,
      p_partnership_id: partnerId,
    })
  }

  forecast(metaNew: number | null = null, metaVouchers: number | null = null): Promise<ForecastData | null> {
    return this.rpc<ForecastData>('b2b_forecast_month', {
      p_meta_new_partners: metaNew,
      p_meta_vouchers: metaVouchers,
    })
  }

  /**
   * Lista emissoes recentes de vouchers (partnership_id + issued_at) pra
   * montar heatmap semanal · espelha o fetch direto a `b2b_vouchers`
   * REST do widget legado mas com client supabase autenticado.
   */
  async recentVoucherIssuances(weeks: number = 12): Promise<Array<{ partnership_id: string; issued_at: string }>> {
    const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString()
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('partnership_id, issued_at')
      .gte('issued_at', since)
      .eq('is_demo', false)
      .limit(5000)
    if (!Array.isArray(data)) return []
    return (data as Array<{ partnership_id: string | null; issued_at: string | null }>)
      .filter((v) => v.partnership_id && v.issued_at)
      .map((v) => ({
        partnership_id: String(v.partnership_id),
        issued_at: String(v.issued_at),
      }))
  }
}
