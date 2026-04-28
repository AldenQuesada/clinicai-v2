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
import type { Database } from '@clinicai/supabase'

export interface WaNumberDTO {
  id: string
  clinicId: string
  phone: string
  phoneNumberId: string | null
  label: string | null
  isActive: boolean
  createdAt: string
  /** Mig 800-31 · expor pra UI Channels diferenciar oficial/professional/outros */
  numberType: string | null
}

export interface WaNumberFullDTO extends WaNumberDTO {
  numberType: string | null
  professionalId: string | null
  professionalName: string | null
  accessScope: 'own' | 'full' | null
  permissions: {
    agenda?: boolean
    pacientes?: boolean
    financeiro?: boolean
    b2b?: boolean
    /** Per-message subscription overrides (mig 800-30+) · undefined = subscribed */
    msg?: { [key: string]: boolean }
  }
}

export interface WaNumberRegisterInput {
  phone: string
  professional_id: string
  label?: string | null
  access_scope?: 'own' | 'full'
  permissions?: {
    agenda?: boolean
    pacientes?: boolean
    financeiro?: boolean
    b2b?: boolean
    /** Per-message subscription overrides (mig 800-30+) · undefined = subscribed */
    msg?: { [key: string]: boolean }
  }
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
    numberType: (row.number_type as string) ?? null,
  }
}

export class WaNumberRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

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
   *
   * BUG FIX 2026-04-26: por default agora oculta inativos · soft-deleted ainda
   * aparecia na UI com opacity (parecia "duplicar registro"). Pra incluir
   * inativos passe `{includeInactive:true}`.
   */
  async listProfessionalPrivate(
    clinicId: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<WaNumberFullDTO[]> {
    const { data, error } = await this.supabase.rpc('wa_pro_list_numbers')
    if (error || !Array.isArray(data)) return []
    const all = (data as Array<Record<string, unknown>>)
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
          (r.permissions as {
            agenda?: boolean
            pacientes?: boolean
            financeiro?: boolean
            b2b?: boolean
            msg?: { [key: string]: boolean }
          }) ?? {},
      }))
      .filter((n) => n.numberType === 'professional_private')
    if (options.includeInactive) return all
    return all.filter((n) => n.isActive)
  }

  /**
   * Cadastra/atualiza phone via RPC `wa_pro_register_number` (SECURITY DEFINER).
   * Faz upsert por phone+professional_id · usado tanto pra criar como editar.
   *
   * BUG FIX 2026-04-26: o RPC retorna jsonb com shape `{ok: bool, id?, error?}`.
   * Antes, o repo so verificava o erro de transporte do PostgREST e devolvia
   * ok=true mesmo quando o RPC tinha retornado `{ok:false, error:'phone_invalid'}`.
   * Resultado: UI fechava modal sem ter salvado nada · agora propaga o erro.
   */
  async register(payload: WaNumberRegisterInput): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_pro_register_number', {
      p_phone: payload.phone,
      p_professional_id: payload.professional_id,
      p_label: payload.label ?? null,
      p_access_scope: payload.access_scope ?? 'own',
      p_permissions:
        payload.permissions ??
        { agenda: true, pacientes: true, financeiro: true, b2b: true },
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string; id?: string }
    if (obj && obj.ok === false) {
      return { ok: false, error: obj.error || 'rpc_failed' }
    }
    return { ok: true, data: obj }
  }

  /**
   * Cadastra/atualiza wa_number tipo oficial via RPC `wa_register_oficial`
   * (mig 800-31 · SECURITY DEFINER). Upsert por (clinic_id, phone, oficial).
   */
  async registerOficial(payload: {
    phone: string
    label?: string | null
    phone_number_id?: string | null
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_register_oficial', {
      p_phone: payload.phone,
      p_label: payload.label ?? null,
      p_phone_number_id: payload.phone_number_id ?? null,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, id: obj.id }
  }

  /**
   * Patch parcial wa_number (qualquer number_type) · label / phone_number_id
   * / is_active. Mig 800-31. Backend valida ownership via clinic_id.
   *
   * `phone_number_id: ''` (string vazia) → seta NULL na coluna.
   * `phone_number_id: undefined` → mantem valor atual.
   */
  async updateMeta(
    id: string,
    patch: { label?: string | null; phone_number_id?: string | null; is_active?: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_update_meta', {
      p_id: id,
      p_label: patch.label ?? null,
      p_phone_number_id:
        patch.phone_number_id === undefined ? null : (patch.phone_number_id ?? ''),
      p_is_active: patch.is_active ?? null,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
  }

  /**
   * Soft-delete generico (qualquer number_type) via RPC `wa_deactivate_any`
   * (mig 800-31). Diferente do `deactivate(id)` que so cobre professional_private.
   */
  async deactivateAny(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_deactivate_any', {
      p_id: id,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
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
   * Mapa professional_id → queries hoje · usado pela tela Profissionais
   * pra mostrar uso na row (alem do botao reset). Single query, agrupada
   * client-side pra evitar GROUP BY direto (RLS-safe).
   */
  async queriesByProfessionalToday(): Promise<Record<string, number>> {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await this.supabase
      .from('wa_pro_rate_limit')
      .select('professional_id, query_count')
      .eq('date', today)
    if (!Array.isArray(data)) return {}
    const out: Record<string, number> = {}
    for (const r of data as Array<{ professional_id?: string; query_count?: number }>) {
      const id = String(r.professional_id ?? '')
      if (!id) continue
      out[id] = (out[id] || 0) + (Number(r.query_count) || 0)
    }
    return out
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
    const { data } = await this.supabase.from('wa_numbers')
      .select('phone')
      .eq('is_active', true)
      .eq('number_type', 'professional_private')
    if (!Array.isArray(data)) return []
    return (data as Array<{ phone?: string }>)
      .map((r) => String(r?.phone ?? ''))
      .filter((p) => p.length > 0)
  }
}
