/**
 * B2BTierConfigRepository · configuracao por clinica de tiers (1/2/3).
 *
 * Storage: tabela `b2b_tier_configs` (mig 800-25) com 2 RPCs SECURITY DEFINER
 * escopados por app_clinic_id() do JWT:
 *   - b2b_tier_config_list()                · returns {ok, rows[]}
 *   - b2b_tier_config_upsert(p_payload)     · upsert por (clinic_id, tier)
 *
 * Substitui hardcode Premium/Padrão/Apoio · admin define labels/cores/defaults
 * que herdam ao cadastrar parceria (form /estudio/cadastrar le defaults).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface B2BTierConfigDTO {
  clinicId: string
  tier: 1 | 2 | 3
  label: string
  description: string | null
  colorHex: string
  defaultMonthlyCapBrl: number | null
  defaultVoucherCombo: string | null
  defaultVoucherValidityDays: number
  defaultVoucherMonthlyCap: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface B2BTierConfigUpsertInput {
  tier: 1 | 2 | 3
  label: string
  description?: string | null
  colorHex?: string | null
  defaultMonthlyCapBrl?: number | null
  defaultVoucherCombo?: string | null
  defaultVoucherValidityDays?: number | null
  defaultVoucherMonthlyCap?: number | null
  sortOrder?: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): B2BTierConfigDTO {
  const t = Number(row.tier)
  const tier = (t === 1 || t === 2 || t === 3 ? t : 1) as 1 | 2 | 3
  return {
    clinicId: String(row.clinic_id),
    tier,
    label: String(row.label ?? ''),
    description: row.description ?? null,
    colorHex: String(row.color_hex ?? '#C9A96E'),
    defaultMonthlyCapBrl:
      row.default_monthly_cap_brl == null ? null : Number(row.default_monthly_cap_brl),
    defaultVoucherCombo: row.default_voucher_combo ?? null,
    defaultVoucherValidityDays: Number(row.default_voucher_validity_days ?? 30),
    defaultVoucherMonthlyCap:
      row.default_voucher_monthly_cap == null ? null : Number(row.default_voucher_monthly_cap),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

export class B2BTierConfigRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista configs (3 rows · tier 1/2/3) da clinica · ordenado por tier ASC.
   */
  async list(): Promise<B2BTierConfigDTO[]> {
    const { data, error } = await this.supabase.rpc('b2b_tier_config_list')
    if (error) return []
    const result = data as { ok?: boolean; rows?: unknown[] } | null
    if (!result?.ok || !Array.isArray(result.rows)) return []
    return (result.rows as unknown[]).map(mapRow)
  }

  /**
   * Upsert config de 1 tier · por (clinic_id, tier). Tier obrigatorio.
   */
  async upsert(
    payload: B2BTierConfigUpsertInput,
  ): Promise<{ ok: boolean; tier?: number; error?: string }> {
    const body: Record<string, unknown> = {
      tier: payload.tier,
      label: payload.label,
      description: payload.description ?? null,
      color_hex: payload.colorHex ?? null,
      default_monthly_cap_brl:
        payload.defaultMonthlyCapBrl == null ? null : payload.defaultMonthlyCapBrl,
      default_voucher_combo: payload.defaultVoucherCombo ?? null,
      default_voucher_validity_days:
        payload.defaultVoucherValidityDays == null
          ? null
          : payload.defaultVoucherValidityDays,
      default_voucher_monthly_cap:
        payload.defaultVoucherMonthlyCap == null
          ? null
          : payload.defaultVoucherMonthlyCap,
      sort_order: payload.sortOrder ?? null,
    }
    const { data, error } = await this.supabase.rpc('b2b_tier_config_upsert', {
      p_payload: body,
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; tier?: number; error?: string } | null
    return {
      ok: result?.ok === true,
      tier: result?.tier,
      error: result?.error,
    }
  }
}
