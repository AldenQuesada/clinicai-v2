/**
 * Cost control IA · Gap 2 do MIGRATION_DOCTRINE.
 *
 * Toda chamada Claude/Groq passa por checkBudget antes · recordUsage depois.
 * Default daily limit: 5 USD por clínica. Override via setting `_ai_budget_daily_limit_usd`
 * em clinic_data settings.
 *
 * Tabela `_ai_budget`:
 *   clinic_id uuid · day_bucket date · tokens_in int · tokens_out int · cost_usd numeric
 *   PK (clinic_id, day_bucket, source)
 *
 * RPC `_ai_budget_check(p_clinic_id, p_daily_limit_usd)` retorna jsonb:
 *   { allowed: boolean, used_usd: numeric, limit_usd: numeric, reason: text }
 *
 * Implementação atual usa service-role direto (lara/mira são server-side).
 * Quando dashboard precisar consultar, expor via RPC SECURITY INVOKER.
 */

import { createServiceRoleClient } from '@clinicai/supabase/server'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'shared' })

export interface BudgetCheckResult {
  allowed: boolean
  used_usd: number
  limit_usd: number
  reason?: string
}

const DEFAULT_DAILY_LIMIT_USD = 5.0

/**
 * Verifica se a clínica ainda tem budget pra chamar IA hoje.
 * Soma cost_usd das últimas 24h (day_bucket = current_date) e compara com limit.
 *
 * Falha aberta (allowed: true) se RPC der erro · não bloqueia operação se infra
 * está fora do ar. Loga warn pra investigação.
 */
export async function checkBudget(
  clinic_id: string,
  source: string,
): Promise<BudgetCheckResult> {
  if (!clinic_id) {
    return { allowed: false, used_usd: 0, limit_usd: 0, reason: 'clinic_id ausente' }
  }
  try {
    const supabase = createServiceRoleClient()
    // RPC retorna jsonb com used_usd / limit_usd / allowed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc('_ai_budget_check', {
      p_clinic_id: clinic_id,
      p_daily_limit_usd: DEFAULT_DAILY_LIMIT_USD,
    })
    if (error) {
      log.warn({ err: error, clinic_id, source }, 'budget_check RPC falhou · permitindo')
      return { allowed: true, used_usd: 0, limit_usd: DEFAULT_DAILY_LIMIT_USD }
    }
    const result = (data as BudgetCheckResult) ?? null
    if (!result) {
      return { allowed: true, used_usd: 0, limit_usd: DEFAULT_DAILY_LIMIT_USD }
    }
    return result
  } catch (err) {
    log.warn({ err, clinic_id, source }, 'budget_check exception · permitindo')
    return { allowed: true, used_usd: 0, limit_usd: DEFAULT_DAILY_LIMIT_USD }
  }
}

export interface UsageRecord {
  clinic_id: string
  user_id?: string | undefined
  source: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

/**
 * Registra uso de tokens · UPSERT em _ai_budget agregando por (clinic_id, day, source).
 * Chamado fire-and-forget após cada call · não bloqueia resposta ao paciente.
 */
export async function recordUsage(usage: UsageRecord): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    // RPC `_ai_budget_record` faz UPSERT com tokens += e cost +=
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.rpc('_ai_budget_record', {
      p_clinic_id: usage.clinic_id,
      p_user_id: usage.user_id ?? null,
      p_source: usage.source,
      p_model: usage.model,
      p_input_tokens: usage.input_tokens,
      p_output_tokens: usage.output_tokens,
      p_cost_usd: usage.cost_usd,
    })
    if (error) {
      log.error({ err: error, ...usage }, 'budget_record falhou')
    }
  } catch (err) {
    log.error({ err, ...usage }, 'budget_record exception')
  }
}
