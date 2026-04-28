/**
 * B2BSuggestionsRepository · cobertura do plano B2B (24 categorias).
 *
 * Espelha o B2BSuggestionsRepository do clinic-dashboard. Consome RPC
 * `b2b_suggestions_snapshot` que retorna 24 categorias do plano com state
 * (red/yellow/green) baseado em parcerias ativas + candidatos abertos.
 *
 * State logic:
 *   red    · 0 parcerias + 0 candidatos · gap urgente (scout ou manual)
 *   yellow · 0 parcerias + N candidatos · em triagem
 *   green  · 1+ parcerias ativas
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface SuggestionCategory {
  slug: string
  label: string
  tier: number
  pillar: string
  priority: number
  state: 'red' | 'yellow' | 'green'
  notes: string | null
  bestCandidateScore: number | null
  openCandidates: number
  activePartnerships: number
}

export interface SuggestionsSnapshot {
  categories: SuggestionCategory[]
  generatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): SuggestionCategory {
  return {
    slug: String(row.slug ?? ''),
    label: String(row.label ?? row.slug ?? ''),
    tier: Number(row.tier ?? 99),
    pillar: String(row.pillar ?? 'outros'),
    priority: Number(row.priority ?? 0),
    state: (row.state ?? 'red') as 'red' | 'yellow' | 'green',
    notes: row.notes ?? null,
    bestCandidateScore: row.best_candidate_score != null ? Number(row.best_candidate_score) : null,
    openCandidates: Number(row.open_candidates ?? 0),
    activePartnerships: Number(row.active_partnerships ?? 0),
  }
}

export class B2BSuggestionsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Retorna snapshot completo do plano · 24 categorias com state + counts.
   * Best-effort: se RPC nao existir em prod (clinic single-tenant), retorna
   * objeto vazio · UI mostra empty state.
   */
  async snapshot(): Promise<SuggestionsSnapshot> {
    const { data, error } = await this.supabase.rpc('b2b_suggestions_snapshot')
    if (error) {
      return { categories: [], generatedAt: new Date().toISOString() }
    }
    const payload = data as { categories?: unknown[]; generated_at?: string } | null
    const categories = Array.isArray(payload?.categories)
      ? (payload.categories as unknown[]).map(mapRow)
      : []
    return {
      categories,
      generatedAt: String(payload?.generated_at ?? new Date().toISOString()),
    }
  }
}
