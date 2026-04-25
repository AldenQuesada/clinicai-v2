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

/**
 * Score color · usado em b2b-cand-score (DNA score 0-10).
 * Espelho de _scoreColor() do b2b-candidates.ui.js linhas 80-85.
 */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return '#9CA3AF'
  if (score >= 8) return '#10B981'
  if (score >= 6) return '#F59E0B'
  return '#EF4444'
}

/**
 * Categorias canonicas do scout · espelho de B2BCandidates.CATEGORIES
 * (b2b-candidates.ui.js linhas 28-48). 17 categorias divididas em
 * Tier 1 (8) e Tier 2 (9).
 */
export interface ScoutCategory {
  value: string
  label: string
  tier: 1 | 2
}

export const SCOUT_CATEGORIES: ScoutCategory[] = [
  // Tier 1
  { value: 'salao_premium',           label: 'Salão premium',                tier: 1 },
  { value: 'endocrino_menopausa',     label: 'Endócrino menopausa',          tier: 1 },
  { value: 'acim_confraria',          label: 'ACIM / Confraria / 40+',       tier: 1 },
  { value: 'fotografo_casamento',     label: 'Fotógrafo de casamento',       tier: 1 },
  { value: 'joalheria',               label: 'Joalheria',                    tier: 1 },
  { value: 'perfumaria_nicho',        label: 'Perfumaria de nicho',          tier: 1 },
  { value: 'psicologia_40plus',       label: 'Psicologia / coaching 40+',    tier: 1 },
  { value: 'ortomolecular',           label: 'Ortomolecular / integrativa',  tier: 1 },
  // Tier 2
  { value: 'nutri_funcional',         label: 'Nutri funcional',              tier: 2 },
  { value: 'otica_premium',           label: 'Ótica premium',                tier: 2 },
  { value: 'vet_boutique',            label: 'Vet boutique',                 tier: 2 },
  { value: 'fotografo_familia',       label: 'Fotógrafo família',            tier: 2 },
  { value: 'atelier_noiva',           label: 'Atelier de noiva',             tier: 2 },
  { value: 'farmacia_manipulacao',    label: 'Farmácia manipulação',         tier: 2 },
  { value: 'floricultura_assinatura', label: 'Floricultura assinatura',      tier: 2 },
  { value: 'personal_stylist',        label: 'Personal stylist',             tier: 2 },
  { value: 'spa_wellness',            label: 'SPA / wellness',               tier: 2 },
]

export const CANDIDATE_STATUS_OPTIONS = [
  { value: 'new',          label: 'Novo' },
  { value: 'approved',     label: 'Aprovado' },
  { value: 'approached',   label: 'Abordado' },
  { value: 'responded',    label: 'Respondeu' },
  { value: 'negotiating',  label: 'Negociando' },
  { value: 'signed',       label: 'Fechado' },
  { value: 'declined',     label: 'Recusou' },
  { value: 'archived',     label: 'Arquivado' },
] as const

export function candidateStatusLabel(s: string | null | undefined): string {
  const opt = CANDIDATE_STATUS_OPTIONS.find((o) => o.value === s)
  return opt ? opt.label : (s || '')
}

/**
 * Tempo relativo · espelho de _fmtRelative() do b2b-candidates.ui.js
 * (linhas 137-150).
 */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d`
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}
