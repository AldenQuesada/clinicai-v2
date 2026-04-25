/**
 * B2BCollabRepository · espelho 1:1 do `b2b.collab.repository.js`.
 *
 * 4 RPCs · usado pelo Disparos · Segmento + assignment de account manager:
 *   - assign(id, manager)            · b2b_partnership_assign
 *   - broadcastPreview(filters)      · b2b_broadcast_preview · {count, sample}
 *   - broadcastPartnerIds(filters)   · b2b_broadcast_partner_ids · {ok, count, ids}
 *   - teamManagers()                 · b2b_team_managers_list
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface BroadcastFilters {
  pillar?: string
  tier?: number
  status?: string
  health_color?: 'green' | 'yellow' | 'red' | 'unknown'
  has_voucher_in_30d?: boolean
  nps_min?: number
  nps_max?: number
}

export interface BroadcastSampleEntry {
  id: string
  name: string
  pillar: string | null
  tier: number | null
  status: string
  account_manager: string | null
}

export interface BroadcastPreview {
  count: number
  sample: BroadcastSampleEntry[]
}

export interface BroadcastPartnerIds {
  ok: boolean
  count: number
  ids: string[]
  error?: string
}

export interface TeamManager {
  user_id: string
  name: string | null
  email: string | null
  managed_count: number | null
}

export class B2BCollabRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  assign(id: string, manager: string | null): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_partnership_assign', {
      p_partnership_id: id,
      p_manager: manager || null,
    })
  }

  async broadcastPreview(filters: BroadcastFilters): Promise<BroadcastPreview> {
    const r = await this.rpc<BroadcastPreview | null>('b2b_broadcast_preview', {
      p_filters: filters || {},
    })
    return {
      count: r?.count ?? 0,
      sample: Array.isArray(r?.sample) ? r.sample : [],
    }
  }

  async broadcastPartnerIds(filters: BroadcastFilters): Promise<BroadcastPartnerIds> {
    const r = await this.rpc<BroadcastPartnerIds | null>('b2b_broadcast_partner_ids', {
      p_filters: filters || {},
    })
    return {
      ok: r?.ok === true,
      count: r?.count ?? 0,
      ids: Array.isArray(r?.ids) ? r.ids : [],
      error: r?.error,
    }
  }

  async teamManagers(): Promise<TeamManager[]> {
    const data = await this.rpc<TeamManager[] | null>('b2b_team_managers_list')
    return Array.isArray(data) ? data : []
  }
}
