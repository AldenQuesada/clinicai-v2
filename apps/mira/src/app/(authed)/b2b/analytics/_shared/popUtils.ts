/**
 * popUtils · helpers para Period-over-Period comparison.
 *
 * Aplicado em todos os KPIs do /b2b/analytics:
 *   - Vouchers emitidos / usados
 *   - Conversao %
 *   - Revenue / Ticket medio / CAC (vem do RPC b2b_financial_kpis)
 *
 * Regras BI:
 *   - delta_pct null se previous = 0 (divisao indefinida)
 *   - "amostra anterior insuficiente" quando previous < 10 eventos
 *     (exibe '—' com tooltip explicando)
 *   - delta < 5% absoluto = "estavel" (cor cinza)
 *
 * NAO tem 'use client' · pode ser importado de Server Component.
 */

export type PopTone = 'green' | 'red' | 'gray' | 'neutral'

export interface PopDelta {
  /** Diferenca absoluta · null quando nao calculavel */
  abs: number | null
  /** Diferenca percentual · null quando previous=0 */
  pct: number | null
  /** Cor sugerida pra renderizar o chip */
  tone: PopTone
  /** Direcao do delta · '↑' positivo, '↓' negativo, '=' estavel/zero */
  arrow: '↑' | '↓' | '='
  /** True quando amostra do periodo anterior >= 10 eventos */
  sufficient: boolean
}

/**
 * Calcula PoP delta entre 2 valores numericos.
 *
 * @param current valor do periodo atual
 * @param previous valor do periodo anterior
 * @param prevSampleSize quantas observacoes geraram o `previous` (usado pra
 *   significancia estatistica · default = previous mesmo quando sao counts)
 * @param invertColors true quando "menos e melhor" (ex: CAC) · ai vermelho
 *   significa subiu e verde significa caiu.
 */
export function computePop(
  current: number | null,
  previous: number | null,
  prevSampleSize: number,
  invertColors: boolean = false,
): PopDelta {
  const sufficient = prevSampleSize >= 10
  if (current == null || previous == null) {
    return { abs: null, pct: null, tone: 'neutral', arrow: '=', sufficient }
  }
  const abs = current - previous
  const pct = previous > 0 ? Math.round(((abs / previous) * 100) * 10) / 10 : null

  // Estavel quando abs delta_pct < 5 (regra BI)
  let tone: PopTone = 'gray'
  let arrow: '↑' | '↓' | '=' = '='
  if (pct == null) {
    tone = 'neutral'
  } else if (Math.abs(pct) < 5) {
    tone = 'gray'
    arrow = '='
  } else if (pct > 0) {
    arrow = '↑'
    tone = invertColors ? 'red' : 'green'
  } else {
    arrow = '↓'
    tone = invertColors ? 'green' : 'red'
  }
  return { abs, pct, tone, arrow, sufficient }
}

/**
 * Formata range pra tooltip (ex: "vs últimos 30d (28/03 a 26/04)").
 */
export function formatPopTooltip(
  rangePrevFromIso: string,
  rangePrevToIso: string,
  days: number,
): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}`
  }
  return `vs últimos ${days}d (${fmt(rangePrevFromIso)} a ${fmt(rangePrevToIso)})`
}

/**
 * Helper pra calcular delta de vouchers a partir dos blobs current/previous
 * de b2b_mira_analytics (que nao retorna PoP nativo · calculamos no JS).
 */
export interface VoucherKpisPair {
  total: { current: number; previous: number; delta: PopDelta }
  purchased: { current: number; previous: number; delta: PopDelta }
  conversion_pct: { current: number; previous: number; delta: PopDelta }
}

export function computeVoucherPop(
  current: { total: number; purchased: number },
  previous: { total: number; purchased: number },
): VoucherKpisPair {
  const curConvPct = current.total > 0 ? (current.purchased / current.total) * 100 : 0
  const prvConvPct = previous.total > 0 ? (previous.purchased / previous.total) * 100 : 0
  return {
    total: {
      current: current.total,
      previous: previous.total,
      delta: computePop(current.total, previous.total, previous.total),
    },
    purchased: {
      current: current.purchased,
      previous: previous.purchased,
      delta: computePop(current.purchased, previous.purchased, previous.total),
    },
    conversion_pct: {
      current: Math.round(curConvPct * 10) / 10,
      previous: Math.round(prvConvPct * 10) / 10,
      delta: computePop(curConvPct, prvConvPct, previous.total),
    },
  }
}

export function formatBRL(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
