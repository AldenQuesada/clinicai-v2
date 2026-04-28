/**
 * MiraChannelRepository · `mira_channels` (clinic-dashboard).
 *
 * Tabela canonica que mapeia `function_key` (ex: 'mira_admin_outbound',
 * 'mih_recipient_voucher') → wa_number_id + Evolution instance. Permite
 * trocar instancia por funcao sem hardcode no codigo.
 *
 * UI /configuracoes/channels (P1) lista + edita rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface MiraChannelDTO {
  id: string
  clinicId: string
  functionKey: string
  waNumberId: string | null
  evolutionInstance: string | null
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): MiraChannelDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    functionKey: String(row.function_key ?? ''),
    waNumberId: row.wa_number_id ?? null,
    evolutionInstance: row.evolution_instance ?? null,
    isActive: row.is_active !== false,
    notes: row.notes ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

/**
 * Resolve · combina mira_channels (function_key → wa_number_id) com
 * wa_numbers (id → phone_number_id) pra retornar o evolution instance.
 * Usado pelos crons + handlers pra escolher qual numero envia cada
 * funcao da Mira (em vez de env var hardcoded).
 *
 * Adicionado 2026-04-26 · pedido Alden #11 finalize · fonte-da-verdade UI.
 */
export interface MiraChannelInstance {
  functionKey: string
  phoneNumberId: string | null
  label: string | null
  waNumberId: string | null
}

export class MiraChannelRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Resolve qual phone_number_id (Evolution instance) usar pra uma funcao.
   * Lookup: function_key → mira_channels.wa_number_id → wa_numbers.phone_number_id.
   *
   * Retorna null se canal inativo, sem wa_number_id, ou wa_number sem instance.
   * Caller deve fazer fallback pra env var EVOLUTION_INSTANCE_MIRA.
   */
  async resolveInstance(
    clinicId: string,
    functionKey: string,
  ): Promise<MiraChannelInstance | null> {
    const { data, error } = await this.supabase
      .from('mira_channels')
      .select('function_key, label, wa_number_id, is_active, wa_numbers(phone_number_id)')
      .eq('clinic_id', clinicId)
      .eq('function_key', functionKey)
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    const waNum = Array.isArray(row.wa_numbers) ? row.wa_numbers[0] : row.wa_numbers
    const phoneNumberId = waNum?.phone_number_id ?? null
    if (!phoneNumberId) return null
    return {
      functionKey: String(row.function_key),
      phoneNumberId: String(phoneNumberId),
      label: row.label ?? null,
      waNumberId: row.wa_number_id ?? null,
    }
  }

  async list(clinicId: string): Promise<MiraChannelDTO[]> {
    const { data } = await this.supabase
      .from('mira_channels')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('function_key', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async update(
    id: string,
    patch: { evolutionInstance?: string | null; waNumberId?: string | null; isActive?: boolean; notes?: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    const update: Record<string, unknown> = {}
    if (patch.evolutionInstance !== undefined) update.evolution_instance = patch.evolutionInstance
    if (patch.waNumberId !== undefined) update.wa_number_id = patch.waNumberId
    if (patch.isActive !== undefined) update.is_active = patch.isActive
    if (patch.notes !== undefined) update.notes = patch.notes
    if (Object.keys(update).length === 0) return { ok: true }
    update.updated_at = new Date().toISOString()
    const { error } = await this.supabase.from('mira_channels').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
}
