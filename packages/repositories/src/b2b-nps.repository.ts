/**
 * B2BNpsRepository · espelho 1:1 do `b2b.nps.repository.js`.
 *
 * 6 RPCs:
 *   - issue(partnershipId)              · b2b_nps_issue
 *   - getByToken(token)                 · b2b_nps_get
 *   - submit(token, score, comment)     · b2b_nps_submit
 *   - summary(partnershipId|null)       · b2b_nps_summary · {ok, promoters, passives, detractors, nps, responses_count}
 *   - dispatchQuarterly()               · b2b_nps_quarterly_dispatch
 *   - list({bucket, limit})             · b2b_nps_responses_list · {items}
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type NpsBucket = 'promoter' | 'passive' | 'detractor' | 'pending'

export interface NpsResponseEntry {
  id: string
  partnership_id: string | null
  partnership_name: string | null
  score: number | null
  comment: string | null
  bucket: NpsBucket | null
  quarter_ref: string | null
  created_at: string
  opened_at: string | null
  responded_at: string | null
}

export interface NpsListResult {
  items: NpsResponseEntry[]
}

export interface NpsSummary {
  ok: boolean
  promoters: number
  passives: number
  detractors: number
  responses_count: number
  nps: number | null
}

export class B2BNpsRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  issue(partnershipId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
    return this.rpc('b2b_nps_issue', { p_partnership_id: partnershipId })
  }

  getByToken(token: string): Promise<unknown> {
    return this.rpc('b2b_nps_get', { p_token: token })
  }

  submit(
    token: string,
    score: number,
    comment: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_nps_submit', {
      p_token: token,
      p_score: score,
      p_comment: comment || null,
    })
  }

  async summary(partnershipId: string | null): Promise<NpsSummary | null> {
    const data = await this.rpc<NpsSummary | null>('b2b_nps_summary', {
      p_partnership_id: partnershipId || null,
    })
    return data || null
  }

  dispatchQuarterly(): Promise<{ ok: boolean; sent: number; error?: string }> {
    return this.rpc('b2b_nps_quarterly_dispatch')
  }

  async list(opts: {
    partnershipId?: string | null
    bucket?: NpsBucket | null
    limit?: number
  } = {}): Promise<NpsListResult> {
    const data = await this.rpc<NpsListResult | null>('b2b_nps_responses_list', {
      p_partnership_id: opts.partnershipId || null,
      p_bucket: opts.bucket || null,
      p_limit: opts.limit || 100,
    })
    return { items: data?.items ?? [] }
  }

  /**
   * IDs de parcerias que JA responderam NPS no periodo (default 90d).
   * Usado pelo smart filter "NPS pendente" pra calcular complement: parcerias
   * ativas - estas = pendentes.
   *
   * Defensivo: tenta `b2b_nps_responses_list` (RPC) com window-of-90d na
   * camada client · se RPC nao filtra por data, recorre a `responded_at`
   * dos items retornados.
   */
  async respondedPartnershipIdsSince(sinceIso: string): Promise<Set<string>> {
    const ids = new Set<string>()
    try {
      const data = await this.rpc<NpsListResult | null>('b2b_nps_responses_list', {
        p_partnership_id: null,
        p_bucket: null,
        p_limit: 500,
      })
      const items = data?.items ?? []
      for (const it of items) {
        if (!it.partnership_id) continue
        const ts = it.responded_at || it.created_at
        if (!ts) continue
        if (ts >= sinceIso) ids.add(it.partnership_id)
      }
    } catch {
      // ignore · retorna set vazio (filtro fica permissivo)
    }
    return ids
  }
}
