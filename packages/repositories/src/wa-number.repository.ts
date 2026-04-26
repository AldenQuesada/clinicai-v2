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

export interface WaNumberFullDTO extends WaNumberDTO {
  numberType: string | null
  professionalId: string | null
  professionalName: string | null
  accessScope: 'own' | 'full' | null
  permissions: { agenda?: boolean; pacientes?: boolean; financeiro?: boolean }
}

export interface WaNumberRegisterInput {
  phone: string
  professional_id: string
  label?: string | null
  access_scope?: 'own' | 'full'
  permissions?: { agenda?: boolean; pacientes?: boolean; financeiro?: boolean }
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

  /**
   * Lista wa_numbers do tipo professional_private com info completa (incluindo
   * professional_name via JOIN). Usado pela UI Configuracoes > Profissionais.
   *
   * Espelha `wa_pro_list_numbers()` RPC do clinic-dashboard que ja inclui
   * professional_name + access_scope + permissions.
   */
  async listProfessionalPrivate(clinicId: string): Promise<WaNumberFullDTO[]> {
    const { data, error } = await this.supabase.rpc('wa_pro_list_numbers')
    if (error || !Array.isArray(data)) return []
    return (data as Array<Record<string, unknown>>)
      .filter((r) => String(r.clinic_id ?? '') === clinicId || !r.clinic_id)
      .map((r) => ({
        id: String(r.id),
        clinicId: String(r.clinic_id ?? clinicId),
        phone: String(r.phone ?? ''),
        phoneNumberId: (r.phone_number_id as string) ?? null,
        label: (r.label as string) ?? null,
        isActive: r.is_active !== false,
        createdAt: String(r.created_at ?? new Date().toISOString()),
        numberType: (r.number_type as string) ?? null,
        professionalId: (r.professional_id as string) ?? null,
        professionalName: (r.professional_name as string) ?? null,
        accessScope: (r.access_scope as 'own' | 'full') ?? null,
        permissions:
          (r.permissions as { agenda?: boolean; pacientes?: boolean; financeiro?: boolean }) ?? {},
      }))
      .filter((n) => n.numberType === 'professional_private')
  }

  /**
   * Cadastra/atualiza phone via RPC `wa_pro_register_number` (SECURITY DEFINER).
   * Faz upsert por phone+professional_id · usado tanto pra criar como editar.
   */
  async register(payload: WaNumberRegisterInput): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_pro_register_number', {
      p_phone: payload.phone,
      p_professional_id: payload.professional_id,
      p_label: payload.label ?? null,
      p_access_scope: payload.access_scope ?? 'own',
      p_permissions: payload.permissions ?? { agenda: true, pacientes: true, financeiro: true },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  }

  /**
   * Soft-delete · marca is_active=false em wa_numbers (apenas
   * number_type=professional_private pra evitar tocar admins).
   */
  async deactivate(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('wa_numbers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('number_type', 'professional_private')
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Reseta quota diaria do profissional · usado quando admin atinge cap.
   * Update wa_pro_rate_limit (date=hoje · query_count=0, minute_count=0).
   */
  async resetQuota(professionalId: string): Promise<{ ok: boolean; error?: string }> {
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await this.supabase
      .from('wa_pro_rate_limit')
      .update({ query_count: 0, minute_count: 0 })
      .eq('professional_id', professionalId)
      .eq('date', today)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Soma de queries hoje (wa_pro_rate_limit) usado no Overview KPI.
   */
  async queriesToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await this.supabase
      .from('wa_pro_rate_limit')
      .select('query_count')
      .eq('date', today)
    if (!Array.isArray(data)) return 0
    return (data as Array<{ query_count?: number }>).reduce(
      (s, r) => s + (Number(r.query_count) || 0),
      0,
    )
  }

  /**
   * Lista phones de admins privados ativos (number_type=professional_private,
   * is_active=true). Usado pelo role-resolver da Mira pra detectar admin
   * vs partner. Retorna apenas array de phones (string) pra match rapido.
   */
  async listAdminPrivatePhones(): Promise<string[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.supabase
      .from('wa_numbers') as any)
      .select('phone')
      .eq('is_active', true)
      .eq('number_type', 'professional_private')
    if (!Array.isArray(data)) return []
    return (data as Array<{ phone?: string }>)
      .map((r) => String(r?.phone ?? ''))
      .filter((p) => p.length > 0)
  }
}
