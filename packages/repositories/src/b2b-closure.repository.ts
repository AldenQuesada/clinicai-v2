/**
 * B2BClosureRepository · espelho 1:1 do `b2b.closure.repository.js`.
 * 4 RPCs: detectInactive, listPending, approve (gera carta), dismiss.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface ClosureCandidate {
  id: string
  name: string
  pillar: string | null
  tier: number | null
  status: string
  health_color: 'green' | 'yellow' | 'red' | 'unknown'
  dna_score: number | null
  closure_reason: string | null
  closure_suggested_at: string | null
  days_idle: number | null
}

export class B2BClosureRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  detectInactive(): Promise<{ ok: boolean; flagged: number }> {
    return this.rpc('b2b_closure_detect_inactive')
  }

  async listPending(): Promise<ClosureCandidate[]> {
    const data = await this.rpc<ClosureCandidate[] | null>('b2b_closure_list_pending')
    return Array.isArray(data) ? data : []
  }

  approve(
    id: string,
    reason: string | null,
    templateKey = 'default',
  ): Promise<{ ok: boolean; letter?: string; error?: string }> {
    return this.rpc('b2b_closure_approve', {
      p_id: id,
      p_reason: reason || null,
      p_template_key: templateKey,
    })
  }

  dismiss(
    id: string,
    note: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_closure_dismiss', {
      p_id: id,
      p_note: note || null,
    })
  }
}
