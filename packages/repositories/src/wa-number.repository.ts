/**
 * WaNumberRepository · acesso a `wa_numbers`.
 *
 * Tabela canonica do clinic-dashboard que mapeia phone_number_id da Meta Cloud
 * + admin phones autorizados (is_active=true). Usado pra:
 *   - Resolver clinic_id no webhook entry (resolveClinicByPhoneNumberId)
 *   - Listar admins ativos pra dispatch proativo Mira (crons)
 *   - UI /configuracoes/professionals (P1)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WaNumberDTO {
  id: string
  clinicId: string
  phone: string
  phoneNumberId: string | null
  label: string | null
  isActive: boolean
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): WaNumberDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    phone: String(row.phone ?? ''),
    phoneNumberId: row.phone_number_id ?? null,
    label: row.label ?? null,
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

export class WaNumberRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async list(clinicId: string): Promise<WaNumberDTO[]> {
    const { data } = await this.supabase
      .from('wa_numbers')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async countActive(clinicId: string): Promise<number> {
    const { count } = await this.supabase
      .from('wa_numbers')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
    return count ?? 0
  }

  /**
   * Lista admins ativos · usado pelos crons proativos pra dispatch.
   * Phone tem que ter pelo menos 10 chars (E.164 minimo).
   */
  async listActive(clinicId: string): Promise<WaNumberDTO[]> {
    const { data } = await this.supabase
      .from('wa_numbers')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
    return ((data ?? []) as unknown[])
      .map(mapRow)
      .filter((n) => n.phone.length >= 10)
  }
}
