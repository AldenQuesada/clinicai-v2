/**
 * B2BAuditRepository · espelho de `b2b.audit.repository.js` legacy.
 *
 * RPC: b2b_partnership_audit_timeline(uuid, int limit) (mig 800-35).
 * Timeline cronologica de eventos auditados (status_change, voucher_*,
 * health_change, lgpd_*, etc).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditTimelineEntry {
  id: string
  action: string
  from_value: string | null
  to_value: string | null
  notes: string | null
  meta: Record<string, unknown>
  author: string | null
  created_at: string
}

export class B2BAuditRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async timeline(partnershipId: string, limit = 50): Promise<AuditTimelineEntry[]> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_audit_timeline', {
      p_partnership_id: partnershipId,
      p_limit: limit,
    })
    if (error) return []
    const r = data as { ok?: boolean; items?: AuditTimelineEntry[] } | null
    return Array.isArray(r?.items) ? r.items : []
  }
}
