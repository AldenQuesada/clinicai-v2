/**
 * Anthropic SDK wrapper · singleton + helpers + cost tracking integration.
 *
 * Default model: Claude Sonnet 4.6 (sucessor do 3.5 que o Ivan usava em lara).
 * Override via env ANTHROPIC_MODEL.
 *
 * IMPORTANTE: NUNCA chame anthropic.messages.create diretamente em apps.
 * Use callAnthropic() · ela aplica:
 *  - cost control (Gap 2 do MIGRATION_DOCTRINE)
 *  - logging estruturado
 *  - error handling padronizado
 */

import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@clinicai/logger'
import { checkBudget, recordUsage } from './budget'

let _client: Anthropic | null = null

const log = createLogger({ app: 'shared' })

/**
 * Modelos canônicos · use as constantes ao invés de hardcoded strings.
 * Sonnet 4.6: balanço custo/qualidade pra Lara/Mira (cérebro principal).
 * Haiku 4.5: respostas rápidas e baratas · cold-open, classifier.
 * Opus 4.7: raciocínio complexo · análise médica detalhada (raro).
 */
export const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  HAIKU: 'claude-haiku-4-5-20251001',
  OPUS: 'claude-opus-4-7',
} as const

export type ModelId = (typeof MODELS)[keyof typeof MODELS]

/** Custo por token (USD) · atualizar quando Anthropic mudar pricing */
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurada')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

export function getDefaultModel(): ModelId {
  return (process.env.ANTHROPIC_MODEL as ModelId) || MODELS.SONNET
}

/** Calcula custo USD baseado em tokens reportados pela API */
function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_USD_PER_MTOK[model]
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

interface CallOptions {
  clinic_id: string
  user_id?: string
  request_id?: string
  /** identifier do contexto (ex: 'lara.webhook', 'mira.cold-open') · vai pro budget */
  source: string
  model?: ModelId
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens?: number
  temperature?: number
}

/**
 * Wrapper canônico pra chamar Claude · aplica budget check + logging + record usage.
 *
 * Usage:
 *   const text = await callAnthropic({
 *     clinic_id: ctx.clinic_id,
 *     source: 'lara.webhook',
 *     system: prompt,
 *     messages: [{ role: 'user', content: '...' }]
 *   })
 *
 * Throws:
 *  - 'BUDGET_EXCEEDED' se gastos do dia ultrapassam limit (per clinic)
 *  - erros de rede normais (caller trata)
 */
export async function callAnthropic(opts: CallOptions): Promise<string> {
  const model = opts.model ?? getDefaultModel()
  const budget = await checkBudget(opts.clinic_id, opts.source)
  if (!budget.allowed) {
    log.warn(
      { clinic_id: opts.clinic_id, source: opts.source, reason: budget.reason },
      'Budget excedido · request bloqueado',
    )
    throw new Error(`BUDGET_EXCEEDED · ${budget.reason}`)
  }

  const start = Date.now()
  const anthropic = getAnthropicClient()

  const response = await anthropic.messages.create({
    model,
    max_tokens: opts.max_tokens ?? 600,
    temperature: opts.temperature ?? 0.2,
    system: opts.system,
    messages: opts.messages,
  })

  const elapsed_ms = Date.now() - start
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const costUsd = calcCostUsd(model, inputTokens, outputTokens)

  // Record usage (fire-and-forget · log error se falhar mas nao bloqueia resposta)
  recordUsage({
    clinic_id: opts.clinic_id,
    user_id: opts.user_id,
    source: opts.source,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
  }).catch((err) => {
    log.error({ err, clinic_id: opts.clinic_id, source: opts.source }, 'Falha ao registrar usage')
  })

  log.info(
    {
      clinic_id: opts.clinic_id,
      user_id: opts.user_id,
      request_id: opts.request_id,
      source: opts.source,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      elapsed_ms,
    },
    'Anthropic call concluida',
  )

  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}
