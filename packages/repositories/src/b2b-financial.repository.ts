/**
 * B2BFinancialRepository · KPIs financeiros do programa B2B (mig 800-29).
 *
 * 1 RPC: b2b_financial_kpis(p_days) · retorna current + previous + delta
 * para Revenue, Ticket medio, CAC, Conversoes, Custos.
 *
 * Modelo CAC (decisao 2026-04-26):
 *   custo_voucher = SUM(b2b_partnerships.voucher_unit_cost_brl) por voucher
 *                   redimido no periodo.
 *   custo_imagem  = SUM(monthly_value_cap_brl) * meses no periodo, para
 *                   parcerias com is_image_partner=true.
 *   CAC = (custo_voucher + custo_imagem) / N conversoes.
 *
 * Modelo Revenue:
 *   Resolve UUID em b2b_vouchers.redeemed_by_appointment_id e soma
 *   appointments.value. Vouchers 'purchased' sem appointment ligado contam
 *   como conversao mas com revenue=0 (signal interpretativo avisa).
 *
 * PoP (Period-over-Period):
 *   periodo anterior = mesma duracao imediatamente antes (ex: 30d -> 30d
 *   anteriores). delta_pct null se previous = 0. Frontend deve esconder
 *   PoP quando previous_sample_size < 10 (regra BI · amostra fraca).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface FinancialSnapshot {
  /** Receita gerada por conversoes B2B no periodo (R$). */
  revenue: number
  /** N conversoes (vouchers status='purchased') */
  conversions: number
  /** Conversoes com appointment ligado e revenue > 0 */
  conversions_with_appt: number
  /** Conversoes sem appointment (ou com revenue zero) */
  conversions_without_appt: number
  /** Revenue / N conversoes (R$) · null se conversions=0 */
  ticket_medio: number | null
  /** Custo aquisicao cliente (R$ por conversao) · null se conversions=0 */
  cac: number | null
  /** Custo total acumulado de vouchers redimidos (R$) */
  cost_voucher: number
  /** Custo de parcerias de imagem proporcional (R$) */
  cost_image: number
  /** cost_voucher + cost_image */
  cost_total: number
  /** N parcerias ativas (active/review/contract) */
  partnerships_count: number
}

export interface FinancialDeltaEntry {
  /** Diferenca absoluta (current - previous) · null se nao calculavel */
  abs: number | null
  /** Diferenca percentual ((cur-prv)/prv * 100) · null se previous = 0 */
  pct: number | null
}

export interface FinancialDelta {
  revenue: FinancialDeltaEntry
  conversions: FinancialDeltaEntry
  ticket_medio: FinancialDeltaEntry
  cac: FinancialDeltaEntry
  /** Tamanho da amostra do periodo anterior · usado pra decidir exibir PoP */
  previous_sample_size: number
  /** True quando previous_sample_size >= 10 (regra BI · amostra estatisticamente valida) */
  previous_sample_sufficient: boolean
}

export interface FinancialSignal {
  kind:
    | 'no_conversions'
    | 'conversions_without_appt'
    | 'cac_rising'
    | 'cac_improving'
    | 'ticket_falling'
    | 'low_prior_sample'
  status: 'green' | 'amber' | 'red' | 'neutral'
  message: string
}

export interface FinancialKpisBlob {
  ok: boolean
  period_days: number
  range_current: { from: string; to: string }
  range_previous: { from: string; to: string }
  current: FinancialSnapshot
  previous: FinancialSnapshot
  delta: FinancialDelta
  signals: FinancialSignal[]
  /** Erro quando ok=false */
  error?: string
}

export class B2BFinancialRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca KPIs financeiros do periodo de p_days dias.
   * Retorna null em caso de erro · caller deve tratar (ex: rendering vazio).
   */
  async getKpis(days: number = 30): Promise<FinancialKpisBlob | null> {
    const { data, error } = await this.supabase.rpc('b2b_financial_kpis', {
      p_days: days,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[b2b_financial_kpis]', error.message)
      return null
    }
    if (!data || (data as FinancialKpisBlob)?.ok !== true) return null
    return data as FinancialKpisBlob
  }
}
