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

export class MiraChannelRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

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
