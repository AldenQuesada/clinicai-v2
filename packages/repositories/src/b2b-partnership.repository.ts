/**
 * B2BPartnershipRepository · acesso canonico a b2b_partnerships.
 *
 * Schema canonico vive em clinic-dashboard mig 0270 (62 cols). Aqui exponhe
 * apenas o subconjunto que a Mira P0 precisa (read + status update + lookup
 * by phone). Lifecycle complexo (DNA gating, monthly_targets, content) entra
 * na P1 via UI admin.
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinicId explicito.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface B2BPartnershipDTO {
  id: string
  clinicId: string
  name: string
  slug: string
  type: 'transactional' | 'occasion' | 'institutional'
  pillar: string
  category: string | null
  tier: number | null
  status: 'prospect' | 'dna_check' | 'contract' | 'active' | 'review' | 'paused' | 'closed'
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  contactInstagram: string | null
  voucherCombo: string | null
  voucherValidityDays: number
  voucherMonthlyCap: number | null
  healthColor: 'unknown' | 'green' | 'yellow' | 'red'
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPartnershipRow(row: any): B2BPartnershipDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    type: (row.type ?? 'institutional') as B2BPartnershipDTO['type'],
    pillar: String(row.pillar ?? 'outros'),
    category: row.category ?? null,
    tier: row.tier != null ? Number(row.tier) : null,
    status: (row.status ?? 'prospect') as B2BPartnershipDTO['status'],
    contactName: row.contact_name ?? null,
    contactPhone: row.contact_phone ?? null,
    contactEmail: row.contact_email ?? null,
    contactInstagram: row.contact_instagram ?? null,
    voucherCombo: row.voucher_combo ?? null,
    voucherValidityDays: Number(row.voucher_validity_days ?? 30),
    voucherMonthlyCap: row.voucher_monthly_cap != null ? Number(row.voucher_monthly_cap) : null,
    healthColor: (row.health_color ?? 'unknown') as B2BPartnershipDTO['healthColor'],
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function last8(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8)
}

export class B2BPartnershipRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async list(clinicId: string, filters: { status?: string; tier?: number; pillar?: string } = {}): Promise<B2BPartnershipDTO[]> {
    let q = this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('tier', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filters.status) q = q.eq('status', filters.status)
    if (filters.tier != null) q = q.eq('tier', filters.tier)
    if (filters.pillar) q = q.eq('pillar', filters.pillar)

    const { data } = await q
    return (data ?? []).map(mapPartnershipRow)
  }

  async getById(id: string): Promise<B2BPartnershipDTO | null> {
    const { data } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return data ? mapPartnershipRow(data) : null
  }

  async getBySlug(clinicId: string, slug: string): Promise<B2BPartnershipDTO | null> {
    const { data } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('slug', slug)
      .maybeSingle()
    return data ? mapPartnershipRow(data) : null
  }

  /**
   * Lookup pelo phone do parceiro · usado pelo intent classifier pra resolver
   * "quem mandou essa msg". Match por last8 (BR phone com/sem 9 inicial).
   */
  async getByPartnerPhone(clinicId: string, phone: string): Promise<B2BPartnershipDTO | null> {
    const phoneLast8 = last8(phone)
    if (!phoneLast8) return null

    // Junta b2b_partnership_wa_senders ativos e devolve a parceria
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.supabase
      .from('b2b_partnership_wa_senders') as any)
      .select('partnership_id, b2b_partnerships(*)')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .eq('phone_last8', phoneLast8)
      .maybeSingle()

    const row = (data as { b2b_partnerships?: unknown })?.b2b_partnerships
    return row ? mapPartnershipRow(row) : null
  }

  async setStatus(id: string, status: B2BPartnershipDTO['status'], reason?: string): Promise<boolean> {
    const { data } = await this.supabase.rpc('b2b_partnership_set_status', {
      p_id: id,
      p_status: status,
      p_reason: reason ?? null,
    })
    return (data as { ok?: boolean })?.ok === true
  }

  async upsert(slug: string, payload: Record<string, unknown>): Promise<{ id?: string; ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_upsert', {
      p_slug: slug,
      p_payload: payload,
    })
    if (error) return { ok: false, error: error.message }
    return {
      ok: (data as { ok?: boolean })?.ok === true,
      id: (data as { id?: string })?.id,
    }
  }
}
