/**
 * B2BSystemHealthRepository · espelho 1:1 do `b2b.system-health.repository.js`.
 *
 * 2 RPCs (mig 722):
 *   - snapshot()              · b2b_system_health · {dispatch, insights, vouchers, counts, computed_at}
 *   - auditRecent({limit, action}) · b2b_audit_log_recent · array de entries
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface SystemHealthSection {
  healthy: boolean
  last_at?: string | null
  last_status?: string | null
  cnt_30d?: number | null
  last_issued_at?: string | null
}

export interface SystemHealthCounts {
  partnerships_active: number
  active_templates: number
  active_admins: number
  crons_active: number
}

export interface SystemHealthSnapshot {
  ok: boolean
  computed_at: string
  dispatch: SystemHealthSection
  insights: SystemHealthSection
  vouchers: SystemHealthSection
  counts: SystemHealthCounts
}

export interface AuditEntry {
  id: string
  action: string
  partnership_id: string | null
  partnership_name: string | null
  from_value: string | null
  to_value: string | null
  notes: string | null
  created_at: string
  actor_name: string | null
}

export class B2BSystemHealthRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  async snapshot(): Promise<SystemHealthSnapshot | null> {
    const data = await this.rpc<SystemHealthSnapshot | null>('b2b_system_health')
    return data || null
  }

  async auditRecent(opts: { limit?: number; action?: string | null } = {}): Promise<AuditEntry[]> {
    const data = await this.rpc<AuditEntry[] | null>('b2b_audit_log_recent', {
      p_limit: opts.limit ?? 30,
      p_action: opts.action || null,
    })
    return Array.isArray(data) ? data : []
  }
}
