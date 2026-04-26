/**
 * timeRangeUtils · helpers PUROS de parseing/formatting de TimeRange.
 *
 * NAO tem 'use client'. Pode ser importado tanto em Server Components
 * quanto em Client Components. Antes esses helpers viviam dentro do
 * TimeRangePicker.tsx (que eh 'use client') · NextJS 16 nao permite
 * Server Component invocar funcao de modulo client (digest 941761223).
 *
 * TimeRangePicker.tsx (client) re-exporta dessa pra manter compat com
 * imports antigos.
 */

const PRESETS = [30, 60, 90] as const

export type TimeRange = {
  /** Dias desde hoje · 30/60/90 ou null se custom */
  days: number | null
  /** ISO YYYY-MM-DD · null se preset */
  fromIso: string | null
  toIso: string | null
}

/**
 * Parsea searchParams em TimeRange · default 30d.
 */
export function parseTimeRange(sp: { days?: string; from?: string; to?: string }): TimeRange {
  const fromIso = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null
  const toIso = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null
  if (fromIso && toIso) return { days: null, fromIso, toIso }
  const d = Number(sp.days)
  if ((PRESETS as readonly number[]).includes(d)) return { days: d, fromIso: null, toIso: null }
  return { days: 30, fromIso: null, toIso: null }
}

/**
 * Converte TimeRange em sinceIso pra usar em queries.
 */
export function timeRangeSinceIso(tr: TimeRange): string {
  if (tr.fromIso) return tr.fromIso + 'T00:00:00.000Z'
  const days = tr.days || 30
  return new Date(Date.now() - days * 86400000).toISOString()
}

export function timeRangeUntilIso(tr: TimeRange): string {
  if (tr.toIso) return tr.toIso + 'T23:59:59.999Z'
  return new Date().toISOString()
}

/**
 * Compact label pra exibir o range ativo (ex: "30 dias", "01/04 → 25/04").
 */
export function timeRangeLabel(tr: TimeRange): string {
  if (tr.fromIso && tr.toIso) {
    const fmt = (iso: string) => {
      const [, m, d] = iso.split('-')
      return `${d}/${m}`
    }
    return `${fmt(tr.fromIso)} → ${fmt(tr.toIso)}`
  }
  return `${tr.days ?? 30} dias`
}

export const TIME_RANGE_PRESETS = PRESETS
