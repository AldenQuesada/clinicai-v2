/**
 * B2BAdminPhonesRepository · espelho 1:1 do `b2b.admin-phones.repository.js`.
 *
 * 4 RPCs sobre b2b_admin_phones (mig 721):
 *   - list()                     · b2b_admin_phones_list
 *   - upsert(payload)            · b2b_admin_phone_upsert
 *   - revoke(phoneLast8)         · b2b_admin_phone_revoke
 *   - isAdmin(phone, capability) · b2b_is_admin_phone
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface B2BAdminPhoneRaw {
  phone_full: string
  phone_last8: string
  name: string
  is_active: boolean
  can_approve: boolean
  can_create: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface B2BAdminPhoneInput {
  phone_full: string
  name: string
  is_active?: boolean
  can_approve?: boolean
  can_create?: boolean
  notes?: string | null
}

export class B2BAdminPhonesRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  async list(): Promise<B2BAdminPhoneRaw[]> {
    const data = await this.rpc<B2BAdminPhoneRaw[] | null>('b2b_admin_phones_list')
    return Array.isArray(data) ? data : []
  }

  upsert(payload: B2BAdminPhoneInput): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_admin_phone_upsert', { p_payload: payload })
  }

  revoke(phoneLast8: string): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_admin_phone_revoke', { p_phone_last8: phoneLast8 })
  }

  isAdmin(
    phone: string,
    capability: 'any' | 'approve' | 'create' = 'any',
  ): Promise<{ ok: boolean; is_admin: boolean }> {
    return this.rpc('b2b_is_admin_phone', { p_phone: phone, p_capability: capability })
  }
}
