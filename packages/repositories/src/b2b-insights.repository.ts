/**
 * B2BInsightsRepository · alertas/oportunidades cross-partnership.
 *
 * 1 RPC: b2b_insights_global() (mig 800-19) · escaneia todas as parcerias
 * active+review+contract da clinica e devolve lista priorizada por score.
 *
 * Consumo: dashboard banner top (1 alerta critical) + futura /insights page
 * (lista completa filtravel por kind/severity).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type InsightSeverity = 'critical' | 'warning' | 'success' | 'info'
export type InsightKind =
  | 'over_cap'
  | 'health_red'
  | 'health_worsening'
  | 'low_conversion'
  | 'no_activity_60d'
  | 'nps_excellent'
  | 'high_impact'

export interface Insight {
  kind: InsightKind
  severity: InsightSeverity
  title: string
  message: string
  partnership_id: string
  partnership_name: string
  action_url: string
  score: number
}

export interface InsightsGlobal {
  ok: boolean
  generated_at: string
  partnerships_scanned: number
  count: number
  insights: Insight[]
}

export class B2BInsightsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async global(): Promise<InsightsGlobal | null> {
    const { data, error } = await this.supabase.rpc('b2b_insights_global')
    if (error || !data) return null
    const r = data as InsightsGlobal
    if (r?.ok !== true) return null
    // Ordena por score DESC (defesa caso RPC nao garanta)
    if (Array.isArray(r.insights)) {
      r.insights = r.insights.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    }
    return r
  }
}
