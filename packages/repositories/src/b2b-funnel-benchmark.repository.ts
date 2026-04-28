/**
 * B2BFunnelBenchmarkRepository · benchmarks de step-rate do funil B2B
 * por clinica.
 *
 * Storage: tabela `b2b_funnel_benchmarks` (mig 800-26) com 2 RPCs
 * SECURITY DEFINER escopados por app_clinic_id() do JWT:
 *   - b2b_funnel_benchmark_list()                · returns {ok, rows[]}
 *   - b2b_funnel_benchmark_upsert(p_payload)     · upsert por (clinic_id, stage)
 *
 * Substitui o hardcode FUNNEL_BENCHMARKS em /b2b/analytics/page.tsx.
 * Stages permitidos (CHECK no banco): delivered, opened, scheduled,
 * redeemed, purchased.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type B2BFunnelStage =
  | 'delivered'
  | 'opened'
  | 'scheduled'
  | 'redeemed'
  | 'purchased'

export const B2B_FUNNEL_STAGES: B2BFunnelStage[] = [
  'delivered',
  'opened',
  'scheduled',
  'redeemed',
  'purchased',
]

export interface B2BFunnelBenchmarkDTO {
  clinicId: string
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface B2BFunnelBenchmarkUpsertInput {
  stage: B2BFunnelStage
  targetPct: number
  label: string
  sortOrder?: number | null
}

function isStage(s: unknown): s is B2BFunnelStage {
  return (
    typeof s === 'string' &&
    (B2B_FUNNEL_STAGES as readonly string[]).includes(s)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): B2BFunnelBenchmarkDTO {
  const stage = isStage(row.stage) ? row.stage : 'delivered'
  return {
    clinicId: String(row.clinic_id),
    stage,
    targetPct: Number(row.target_pct ?? 0),
    label: String(row.label ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

export class B2BFunnelBenchmarkRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Lista benchmarks (5 rows · 1 por stage) da clinica · ordenado por
   * sort_order ASC.
   */
  async list(): Promise<B2BFunnelBenchmarkDTO[]> {
    const { data, error } = await this.supabase.rpc(
      'b2b_funnel_benchmark_list',
    )
    if (error) return []
    const result = data as { ok?: boolean; rows?: unknown[] } | null
    if (!result?.ok || !Array.isArray(result.rows)) return []
    return (result.rows as unknown[]).map(mapRow)
  }

  /**
   * Upsert benchmark de 1 stage · por (clinic_id, stage).
   * Stage + target_pct + label obrigatorios.
   */
  async upsert(
    payload: B2BFunnelBenchmarkUpsertInput,
  ): Promise<{ ok: boolean; stage?: B2BFunnelStage; error?: string }> {
    const body: Record<string, unknown> = {
      stage: payload.stage,
      target_pct: payload.targetPct,
      label: payload.label,
      sort_order: payload.sortOrder ?? null,
    }
    const { data, error } = await this.supabase.rpc(
      'b2b_funnel_benchmark_upsert',
      { p_payload: body },
    )
    if (error) return { ok: false, error: error.message }
    const result = data as
      | { ok?: boolean; stage?: string; error?: string }
      | null
    return {
      ok: result?.ok === true,
      stage: isStage(result?.stage) ? result?.stage : undefined,
      error: result?.error,
    }
  }
}
