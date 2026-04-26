/**
 * B2BAttributionRepository · b2b_attributions (clinic-dashboard mig 0360).
 *
 * Atribui um lead/orcamento/paciente a uma parceria especifica · pra calcular
 * ROI e health score. Um lead pode ter N attributions (touchpoints multiplos).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface B2BAttributionDTO {
  id: string
  clinicId: string
  partnershipId: string
  leadId: string | null
  voucherId: string | null
  attributionType: string
  weight: number
  createdAt: string
  meta: Record<string, unknown> | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttributionRow(row: any): B2BAttributionDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    leadId: row.lead_id ?? null,
    voucherId: row.voucher_id ?? null,
    attributionType: String(row.attribution_type ?? 'voucher'),
    weight: Number(row.weight ?? 1),
    createdAt: row.created_at ?? new Date().toISOString(),
    meta: row.meta ?? null,
  }
}

export class B2BAttributionRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async listByPartnership(partnershipId: string, limit = 100): Promise<B2BAttributionDTO[]> {
    const { data } = await this.supabase
      .from('b2b_attributions')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapAttributionRow)
  }

  async listByLead(leadId: string): Promise<B2BAttributionDTO[]> {
    const { data } = await this.supabase
      .from('b2b_attributions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    return (data ?? []).map(mapAttributionRow)
  }

  /**
   * ROI agregado da parceria · RPC b2b_attribution_roi (mig 800-35).
   * Defensive: se b2b_attributions nao existe, retorna zeros.
   */
  async roi(partnershipId: string): Promise<{
    ok: boolean
    referred: number
    matched: number
    converted: number
    revenue_brl: number
    cost_brl: number
    net_brl: number
    roi_pct: number | null
    conversion_rate: number | null
    error?: string
  } | null> {
    const { data, error } = await this.supabase.rpc('b2b_attribution_roi', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return data as {
      ok: boolean; referred: number; matched: number; converted: number;
      revenue_brl: number; cost_brl: number; net_brl: number;
      roi_pct: number | null; conversion_rate: number | null;
    } | null
  }

  /**
   * Histórico de leads atribuídos · RPC b2b_attribution_leads (mig 800-35).
   */
  async leads(partnershipId: string, limit = 50): Promise<Array<{
    id: string
    lead_name: string | null
    lead_phone: string | null
    source: string | null
    status: string
    revenue_brl: number | null
    created_at: string
    converted_at: string | null
  }>> {
    const { data, error } = await this.supabase.rpc('b2b_attribution_leads', {
      p_partnership_id: partnershipId,
      p_limit: limit,
    })
    if (error) return []
    const r = data as { ok?: boolean; items?: Array<{
      id: string; lead_name: string | null; lead_phone: string | null;
      source: string | null; status: string; revenue_brl: number | null;
      created_at: string; converted_at: string | null;
    }> } | null
    return Array.isArray(r?.items) ? r.items : []
  }

  async create(input: {
    clinicId: string
    partnershipId: string
    leadId?: string
    voucherId?: string
    attributionType?: string
    weight?: number
    meta?: Record<string, unknown>
  }): Promise<B2BAttributionDTO | null> {
    const { data, error } = await this.supabase
      .from('b2b_attributions')
      .insert({
        clinic_id: input.clinicId,
        partnership_id: input.partnershipId,
        lead_id: input.leadId ?? null,
        voucher_id: input.voucherId ?? null,
        attribution_type: input.attributionType ?? 'voucher',
        weight: input.weight ?? 1,
        meta: input.meta ?? null,
      })
      .select()
      .single()
    if (error || !data) return null
    return mapAttributionRow(data)
  }
}
