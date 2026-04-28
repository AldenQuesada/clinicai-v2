/**
 * B2BHealthRepository · espelho da RPC b2b_health_snapshot.
 *
 * Snapshot do dashboard de saude · counts (verde/amarelo/vermelho/sem
 * dado) + lista critical (parcerias yellow/red ordenadas) + total_active.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface HealthSnapshot {
  counts: {
    green: number
    yellow: number
    red: number
    unknown: number
  }
  critical: Array<{
    id: string
    name: string
    health_color: 'green' | 'yellow' | 'red' | 'unknown'
    tier: number | null
    pillar: string | null
    status: string
    dna_score: number | null
    contact_name: string | null
    contact_phone: string | null
  }>
  total_active: number
  generated_at: string
}

export class B2BHealthRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async snapshot(): Promise<HealthSnapshot> {
    const { data, error } = await this.supabase.rpc('b2b_health_snapshot')
    if (error) throw new Error(`[b2b_health_snapshot] ${error.message}`)
    return data as HealthSnapshot
  }

  async recalcAll(): Promise<{ ok: boolean }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_health_recalc_all')
    if (error) throw new Error(`[b2b_partnership_health_recalc_all] ${error.message}`)
    return data as { ok: boolean }
  }

  async recalcOne(id: string): Promise<{ ok: boolean }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_health_recalc', {
      p_id: id,
    })
    if (error) throw new Error(`[b2b_partnership_health_recalc] ${error.message}`)
    return data as { ok: boolean }
  }
}
