/**
 * B2BApplicationRepository · espelho 1:1 do
 * `js/b2b/b2b.application.repository.js` (clinic-dashboard).
 *
 * Candidaturas de parceria · Fluxo A da Mira (recebe pedidos via WhatsApp
 * e cadastra aqui pra aprovacao). 4 RPCs SECURITY DEFINER.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'archived'

export interface ApplicationDTO {
  id: string
  name: string
  category: string | null
  status: ApplicationStatus
  contact_name: string | null
  contact_phone: string | null
  requested_by_phone: string | null
  instagram: string | null
  address: string | null
  notes: string | null
  approval_note: string | null
  rejection_reason: string | null
  partnership_id: string | null
  partnership_name: string | null
  follow_up_count: number | null
  created_at: string
  resolved_at: string | null
}

export class B2BApplicationRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  async list(status: ApplicationStatus = 'pending', limit = 50): Promise<ApplicationDTO[]> {
    const data = await this.rpc<ApplicationDTO[] | null>('b2b_applications_list', {
      p_status: status,
      p_limit: limit,
    })
    return Array.isArray(data) ? data : []
  }

  create(payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
    return this.rpc('b2b_application_create', { p_payload: payload })
  }

  approve(
    id: string,
    note?: string | null,
  ): Promise<{ ok: boolean; partnership_id?: string; partnership_name?: string; error?: string }> {
    return this.rpc('b2b_application_approve', {
      p_application_id: id,
      p_note: note || null,
    })
  }

  reject(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_application_reject', {
      p_application_id: id,
      p_reason: reason,
    })
  }

  async countPending(): Promise<number> {
    try {
      const rows = await this.list('pending', 100)
      return rows.length
    } catch {
      return 0
    }
  }
}
