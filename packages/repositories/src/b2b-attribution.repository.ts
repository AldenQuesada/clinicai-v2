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
