/**
 * MiraCronRegistryRepository · controle dos cron jobs proativos da Mira.
 *
 * Tabelas: mira_cron_jobs (catalogo + enabled toggle) + mira_cron_runs
 * (log de execucoes). Mig 800-15.
 *
 * Padrao de uso:
 *   - UI: list() + setEnabled() · runsRecent(jobName) pra debug
 *   - Cron endpoint: runStart(jobName) → uuid|null · runFinish(id, status, ...)
 *
 * Helper `withCronJob()` encapsula start/finish (ver apps/mira/src/lib/cron-wrap.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type CronJobCategory =
  | 'alert'
  | 'digest'
  | 'reminder'
  | 'suggestion'
  | 'maintenance'
  | 'worker'
  | 'other'

export type CronRunStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'disabled'

export interface MiraCronJob {
  id: string
  job_name: string
  display_name: string
  description: string | null
  category: CronJobCategory
  cron_expr: string | null
  enabled: boolean
  notes: string | null
  last_run_at: string | null
  last_status: CronRunStatus | null
  runs_24h: number
  failures_24h: number
  updated_at: string
}

export interface MiraCronRun {
  id: string
  started_at: string
  finished_at: string | null
  status: CronRunStatus
  items_processed: number
  error_message: string | null
  meta: Record<string, unknown>
}

export class MiraCronRegistryRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  /**
   * Lista todos os jobs do clinic com info agregada (last_run, runs_24h, failures_24h).
   * Ordenado por categoria + display_name.
   */
  async list(): Promise<MiraCronJob[]> {
    const data = await this.rpc<MiraCronJob[] | null>('mira_cron_jobs_list')
    return Array.isArray(data) ? data : []
  }

  /**
   * Liga/desliga um job. notes = nota opcional do admin (porque desligou).
   */
  setEnabled(
    jobName: string,
    enabled: boolean,
    notes: string | null = null,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    return this.rpc('mira_cron_set_enabled', {
      p_job_name: jobName,
      p_enabled: enabled,
      p_notes: notes,
    })
  }

  /**
   * Ultimas N execucoes de um job · usado pra debug/audit na UI.
   */
  async runsRecent(jobName: string, limit: number = 50): Promise<MiraCronRun[]> {
    const data = await this.rpc<MiraCronRun[] | null>('mira_cron_runs_recent', {
      p_job_name: jobName,
      p_limit: limit,
    })
    return Array.isArray(data) ? data : []
  }

  // ─── Cron-side (chamado dos endpoints /api/cron/*) ────────────────────

  /**
   * Inicia um run · retorna run_id ou NULL se job desabilitado.
   * NULL = cron deve fazer noop (mira_cron_runs ja loga 'disabled' internamente).
   *
   * `clinicId` opcional: se nao passado, usa app_clinic_id() do JWT.
   * Cron endpoint usa service_role · sempre passar clinicId explicito.
   */
  async runStart(jobName: string, clinicId?: string): Promise<string | null> {
    const data = await this.rpc<string | null>('mira_cron_run_start', {
      p_job_name: jobName,
      p_clinic_id: clinicId ?? null,
    })
    return typeof data === 'string' ? data : null
  }

  /**
   * Finaliza um run · status: success | failed | skipped (NUNCA disabled · esse
   * vem do runStart). items = quantidade de itens processados (admins, vouchers,
   * etc · pra UI mostrar "5 admins notificados"). meta = info extra estruturada.
   */
  runFinish(
    runId: string,
    status: 'success' | 'failed' | 'skipped',
    items: number = 0,
    error: string | null = null,
    meta: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('mira_cron_run_finish', {
      p_run_id: runId,
      p_status: status,
      p_items: items,
      p_error: error,
      p_meta: meta,
    })
  }
}
