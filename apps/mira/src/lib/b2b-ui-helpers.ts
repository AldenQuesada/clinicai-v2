/**
 * b2b-ui-helpers · Replica 1:1 do `js/b2b/b2b.ui-helpers.js` do
 * clinic-dashboard. Mesmos labels PT-BR e mesma logica de health/tier.
 *
 * Single source of truth · NUNCA reescrever esses labels em pages.
 */

export const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  dna_check: 'Avaliar DNA',
  contract: 'Em contrato',
  active: 'Ativa',
  review: 'Em revisão',
  paused: 'Pausada',
  closed: 'Encerrada',
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_LABELS[s] || s
}

export const TYPE_LABELS: Record<string, string> = {
  transactional: 'Transacional',
  occasion: 'Ocasião',
  institutional: 'Institucional',
}

export function typeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return TYPE_LABELS[t] || t
}

export const HEALTH_COLORS: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#9CA3AF',
}

export function healthColor(c: string | null | undefined): string {
  return HEALTH_COLORS[c || 'unknown'] || HEALTH_COLORS.unknown
}

export const HEALTH_LABELS: Record<string, string> = {
  green: 'Saudável',
  yellow: 'Atenção',
  red: 'Crítica',
  unknown: 'Sem dado',
}

export function healthLabel(c: string | null | undefined): string {
  return HEALTH_LABELS[c || 'unknown'] || '—'
}

/**
 * Agrupamento por tier · usado em filter='active'.
 * Mantem chaves '1', '2', '3', 'untiered' (string) na ordem original.
 */
export function groupByTier<T extends { tier?: number | null }>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = { '1': [], '2': [], '3': [], untiered: [] }
  for (const p of items) {
    const t = p.tier
    if (t === 1 || t === 2 || t === 3) out[String(t)].push(p)
    else out.untiered.push(p)
  }
  return out
}

/**
 * Agrupamento por pillar · usado em filter='prospects'.
 */
export function groupByPillar<T extends { pillar?: string | null }>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const p of items) {
    const k = p.pillar || 'outros'
    if (!out[k]) out[k] = []
    out[k].push(p)
  }
  return out
}

/**
 * Agrupamento por status · usado em filter='inactive'.
 */
export function groupByStatus<T extends { status?: string | null }>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const p of items) {
    const k = p.status || 'outros'
    if (!out[k]) out[k] = []
    out[k].push(p)
  }
  return out
}
