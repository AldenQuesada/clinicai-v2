/**
 * B2BScoutRepository · espelho 1:1 do `js/b2b/b2b.scout.repository.js`
 * (clinic-dashboard). Consome 11 RPCs SECURITY DEFINER do schema antigo.
 *
 * Categorias (`B2BCandidates.CATEGORIES`) ficam no UI helper · esta classe
 * eh I/O puro.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CandidateStatus =
  | 'new'
  | 'approved'
  | 'approached'
  | 'responded'
  | 'negotiating'
  | 'signed'
  | 'declined'
  | 'archived'

export interface CandidateDTO {
  id: string
  name: string
  category: string
  tier_target: number | null
  contact_status: CandidateStatus
  dna_score: number | null
  dna_justification: string | null
  fit_reasons: string[] | null
  risk_flags: string[] | null
  address: string | null
  phone: string | null
  email: string | null
  instagram_handle: string | null
  website: string | null
  google_rating: number | null
  google_reviews: number | null
  referred_by: string | null
  referred_by_contact: string | null
  referred_by_reason: string | null
  notes: string | null
}

export interface ConsumptionDTO {
  scout_enabled: boolean
  total_brl: number
  budget_cap_brl: number
  pct_used: number
  capped: boolean
  breakdown: Record<string, { count: number; brl: number }> | null
  last_scan_at: string | null
}

export interface ScoutSummaryDTO {
  ok: boolean
  candidates_30d: number
  converted_30d: number
  cost_brl_30d: number
  conversion_rate_pct: number
  top_category: string | null
}

export interface SimilarCandidateDTO {
  id: string
  name: string
  phone: string | null
  category: string | null
  similarity: number | null
  match_reason: 'phone' | 'name'
}

export class B2BScoutRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  // ─── Candidatos ──────────────────────────────────────────────────────
  list(filters: {
    status?: CandidateStatus | null
    category?: string | null
    minScore?: number | null
    limit?: number
  } = {}): Promise<CandidateDTO[]> {
    return this.rpc<CandidateDTO[]>('b2b_candidate_list', {
      p_status: filters.status || null,
      p_category: filters.category || null,
      p_min_score: filters.minScore ?? null,
      p_limit: filters.limit ?? 100,
    })
  }

  setStatus(
    id: string,
    status: CandidateStatus,
    notes?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_candidate_set_status', {
      p_id: id,
      p_status: status,
      p_notes: notes || null,
    })
  }

  promote(id: string): Promise<{ ok: boolean; partnership_id?: string; error?: string }> {
    return this.rpc('b2b_candidate_promote', { p_id: id })
  }

  addManual(payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
    return this.rpc('b2b_candidate_add_manual', { p_payload: payload })
  }

  findSimilar(
    name: string,
    phone?: string | null,
  ): Promise<SimilarCandidateDTO[]> {
    return this.rpc<SimilarCandidateDTO[]>('b2b_candidate_find_similar', {
      p_name: name,
      p_phone: phone || null,
    })
  }

  // ─── Scout config ────────────────────────────────────────────────────
  consumedCurrentMonth(): Promise<ConsumptionDTO> {
    return this.rpc<ConsumptionDTO>('b2b_scout_consumed_current_month')
  }

  canScan(category: string): Promise<{ ok: boolean; reason?: string }> {
    return this.rpc('b2b_scout_can_scan', { p_category: category })
  }

  summary(): Promise<ScoutSummaryDTO | null> {
    return this.rpc<ScoutSummaryDTO | null>('b2b_scout_summary').catch(() => null)
  }
}
