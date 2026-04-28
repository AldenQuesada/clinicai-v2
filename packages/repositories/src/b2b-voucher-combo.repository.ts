/**
 * B2BVoucherComboRepository · catalogo editavel de combos de voucher.
 *
 * Storage: tabela `b2b_voucher_combos` (clinic-dashboard mig 0723) com 3 RPCs
 * SECURITY DEFINER que escopam por app_clinic_id() do JWT:
 *   - b2b_voucher_combos_list()
 *   - b2b_voucher_combo_upsert(payload)
 *   - b2b_voucher_combo_delete(id)
 *
 * Combos servem como source-of-truth pro form wizard de parceria + emit
 * voucher · um marcado is_default=true vira pre-select.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface B2BVoucherComboDTO {
  id: string
  clinicId: string
  label: string
  description: string | null
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComboRow(row: any): B2BVoucherComboDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    label: String(row.label),
    description: row.description ?? null,
    isDefault: Boolean(row.is_default),
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 100),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

export class B2BVoucherComboRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Lista combos da clinica · ordenados por is_active DESC, is_default DESC,
   * sort_order ASC, label ASC (mesma ordem do RPC).
   */
  async list(): Promise<B2BVoucherComboDTO[]> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_combos_list')
    if (error || !Array.isArray(data)) return []
    return (data as unknown[]).map(mapComboRow)
  }

  /**
   * Upsert · cria se id ausente, atualiza se id presente. Marcar is_default
   * desmarca outros automaticamente (logica no RPC).
   */
  async upsert(payload: {
    id?: string
    label: string
    description?: string | null
    isDefault?: boolean
    isActive?: boolean
    sortOrder?: number
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_combo_upsert', {
      p_payload: {
        id: payload.id || null,
        label: payload.label,
        description: payload.description ?? null,
        is_default: payload.isDefault ?? false,
        is_active: payload.isActive ?? true,
        sort_order: payload.sortOrder ?? 100,
      },
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; id?: string; error?: string }
    return {
      ok: result?.ok === true,
      id: result?.id,
      error: result?.error,
    }
  }

  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_combo_delete', { p_id: id })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }
}
