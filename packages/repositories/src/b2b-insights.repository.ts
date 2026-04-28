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
import type { Database } from '@clinicai/supabase'

export type InsightSeverity = 'critical' | 'warning' | 'success' | 'info'
export type InsightKind =
  | 'over_cap'
  | 'health_red'
  | 'health_worsening'
  | 'low_conversion'
  | 'no_activity_60d'
  | 'nps_excellent'
  | 'high_impact'
  // System-level (sintetizados no app · nao vem da RPC). Usado pra puxar
  // alertas operacionais (sem WhatsApp ativo, NPS sem respostas, candidaturas
  // demoradas) pro sino · cada um aponta pra acao concreta.
  | 'system_no_senders'
  | 'system_nps_silent'
  | 'system_velocity_slow'
  | 'system_pending_apps'

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
  /** Quantos insights estao ativos mas silenciados (mig 800-21 · TTL nao expirado). */
  dismissed_count?: number
  insights: Insight[]
}

export interface DismissResult {
  ok: boolean
  kind?: InsightKind
  partnership_id?: string
  expires_at?: string
  ttl_days?: number
  error?: string
}

export interface UndoDismissResult {
  ok: boolean
  deleted?: number
  error?: string
}

export class B2BInsightsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

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

  /**
   * Silencia 1 insight server-side por N dias (default 7).
   * Mig 800-21 · upsert b2b_insight_dismissals + refresh TTL se ja existir.
   */
  async dismiss(
    kind: InsightKind,
    partnershipId: string,
    ttlDays: number = 7,
  ): Promise<DismissResult> {
    const { data, error } = await this.supabase.rpc('b2b_insight_dismiss', {
      p_kind: kind,
      p_partnership_id: partnershipId,
      p_ttl_days: ttlDays,
    })
    if (error) return { ok: false, error: error.message }
    return (data as DismissResult) ?? { ok: false, error: 'no_data' }
  }

  /**
   * Reverte dismissal · insight reaparece no proximo fetch.
   */
  async undoDismiss(
    kind: InsightKind,
    partnershipId: string,
  ): Promise<UndoDismissResult> {
    const { data, error } = await this.supabase.rpc('b2b_insight_undo_dismiss', {
      p_kind: kind,
      p_partnership_id: partnershipId,
    })
    if (error) return { ok: false, error: error.message }
    return (data as UndoDismissResult) ?? { ok: false, error: 'no_data' }
  }
}
