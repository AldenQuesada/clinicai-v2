/**
 * B2BGeoRepository · espelho 1:1 do `b2b.geo.repository.js`.
 * Lat/lng das parcerias pro mapa vivo (Maringá centro).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface GeoPoint {
  id: string
  name: string
  pillar: string | null
  tier: number | null
  health_color: string | null
  lat: number | null
  lng: number | null
}

export class B2BGeoRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async list(): Promise<GeoPoint[]> {
    const { data, error } = await this.supabase.rpc('b2b_partnerships_geo_list')
    if (error) throw new Error(`[b2b_partnerships_geo_list] ${error.message}`)
    return Array.isArray(data) ? (data as GeoPoint[]) : []
  }

  async setGeo(partnershipId: string, lat: number, lng: number): Promise<{ ok: boolean }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_set_geo', {
      p_partnership_id: partnershipId,
      p_lat: lat,
      p_lng: lng,
    })
    if (error) throw new Error(`[b2b_partnership_set_geo] ${error.message}`)
    return data as { ok: boolean }
  }
}
