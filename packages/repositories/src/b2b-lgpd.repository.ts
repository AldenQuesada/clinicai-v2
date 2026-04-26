/**
 * B2BLgpdRepository · espelho de `b2b.lgpd.repository.js` legacy.
 *
 * 4 RPCs (mig 800-35):
 *   - anonymize(id, reason)         · b2b_partnership_anonymize
 *   - exportData(id)                · b2b_partnership_export_data
 *   - consentSet(id, type, granted) · b2b_consent_set
 *   - consentGet(id)                · b2b_consent_get
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ConsentType = 'comm' | 'analytics' | 'data_sharing' | 'marketing'

export interface ConsentEntry {
  granted: boolean
  source: string | null
  updated_at: string
  notes: string | null
}

export interface ConsentState {
  ok: boolean
  partnership_id: string
  consents: Partial<Record<ConsentType, ConsentEntry>>
}

export interface AnonymizeResult {
  ok: boolean
  partnership_id?: string
  new_name?: string
  reason?: string
  error?: string
}

export interface ExportData {
  ok: boolean
  exported_at: string
  partnership: Record<string, unknown>
  vouchers: unknown[]
  nps: unknown[]
  comments: unknown[]
  audit: unknown[]
  consents: unknown[]
  error?: string
}

export class B2BLgpdRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async anonymize(partnershipId: string, reason: string): Promise<AnonymizeResult> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_anonymize', {
      p_partnership_id: partnershipId,
      p_reason: reason,
    })
    if (error) return { ok: false, error: error.message }
    return (data as AnonymizeResult) ?? { ok: false, error: 'no_data' }
  }

  async exportData(partnershipId: string): Promise<ExportData | null> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_export_data', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return (data as ExportData) ?? null
  }

  async consentSet(
    partnershipId: string,
    type: ConsentType,
    granted: boolean,
    source?: string,
    notes?: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_consent_set', {
      p_partnership_id: partnershipId,
      p_type: type,
      p_granted: granted,
      p_source: source ?? 'ui_admin',
      p_notes: notes ?? null,
    })
    if (error) return { ok: false, error: error.message }
    return (data as { ok: boolean; id?: string; error?: string }) ?? { ok: false }
  }

  async consentGet(partnershipId: string): Promise<ConsentState | null> {
    const { data, error } = await this.supabase.rpc('b2b_consent_get', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return (data as ConsentState) ?? null
  }
}
