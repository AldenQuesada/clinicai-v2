/**
 * MiraStateRepository · wraps mira_state_* RPCs.
 *
 * Modelo: (phone, state_key) → state_value jsonb. TTLs convencionais:
 *   voucher_confirm = 30min (decisao Alden) + reminder pre-expiry
 *   __processed__:* = 2h (dedup wa_message_id)
 *   cp_*            = 15min (cadastro de parceria 7-turno)
 *   default         = 15min
 *
 * RPCs em DB · ADR-012 boundary preservado (caller nunca chama supabase direto).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface MiraStateRow<T = Record<string, unknown>> {
  value: T
  expiresAt: string
}

export class MiraStateRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Set state · TTL em minutos. value=null → clear.
   */
  async set(
    phone: string,
    key: string,
    value: Record<string, unknown> | null,
    ttlMinutes = 15,
  ): Promise<{ ok: boolean; expiresAt?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('mira_state_set', {
      p_phone: phone,
      p_key: key,
      p_value: value,
      p_ttl_minutes: ttlMinutes,
    })
    if (error) return { ok: false, error: error.message }
    const ok = (data as { ok?: boolean })?.ok === true
    return { ok, expiresAt: (data as { expires_at?: string })?.expires_at }
  }

  /**
   * Get state · null se nao existir ou expirou.
   */
  async get<T = Record<string, unknown>>(
    phone: string,
    key: string,
  ): Promise<MiraStateRow<T> | null> {
    const { data, error } = await this.supabase.rpc('mira_state_get', {
      p_phone: phone,
      p_key: key,
    })
    if (error || !data) return null
    return {
      value: (data as { value: T }).value,
      expiresAt: (data as { expires_at: string }).expires_at,
    }
  }

  /**
   * Clear · key=null limpa todos os states do phone.
   */
  async clear(phone: string, key?: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('mira_state_clear', {
      p_phone: phone,
      p_key: key ?? null,
    })
    if (error) return 0
    return Number((data as { cleared_count?: number })?.cleared_count ?? 0)
  }

  /** Cleanup expired (cron-friendly · usado pelo /api/cron/mira-state-cleanup) */
  async cleanupExpired(): Promise<number> {
    const { data, error } = await this.supabase.rpc('mira_state_cleanup_expired')
    if (error) return 0
    return Number(data ?? 0)
  }

  /**
   * Reminder check (cron · 1min) · retorna lista de voucher_confirm states
   * elegiveis pra reminder (5min antes de expirar). Marca reminder_sent=true
   * inplace · nao re-dispara.
   */
  async reminderCheck(): Promise<
    Array<{ phone: string; state: Record<string, unknown>; expiresAt: string }>
  > {
    const { data, error } = await this.supabase.rpc('mira_state_reminder_check')
    if (error || !data) return []
    const rows = (data as { reminders?: unknown[] })?.reminders
    if (!Array.isArray(rows)) return []
    return rows.map((r) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phone: String((r as any).phone),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state: (r as any).state ?? {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresAt: String((r as any).expires_at),
    }))
  }
}
