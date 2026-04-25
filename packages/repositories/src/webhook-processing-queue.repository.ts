/**
 * WebhookProcessingQueueRepository · acesso a webhook_processing_queue
 * (clinicai-v2 mig 800-11).
 *
 * Wrapper das 5 RPCs canonicas + leitura raw da tabela pra observabilidade.
 *
 * Uso:
 *   - Webhook /api/webhook/evolution · enqueue() apos pre-validacao sincrona
 *   - Cron `/api/cron/webhook-processing-worker` · resetStuck() + pickPending()
 *     + complete()/fail() pra cada item
 *   - Admin/diag · listFailed() pra inspecionar itens que esgotaram retries
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinic_id resolvido
 * server-side via _default_clinic_id() (mono-clinica P1).
 *
 * Idempotency: wa_message_id e UNIQUE (source, wa_message_id) · INSERT ON
 * CONFLICT DO NOTHING. Repository expoe `enqueued` no resultado pra caller
 * distinguir "novo" de "retry idempotente".
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type WebhookQueueStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped'

export type WebhookQueueSource = 'evolution' | 'meta_cloud'
export type WebhookQueueRole = 'admin' | 'partner'

export interface WebhookQueueDTO {
  id: string
  clinicId: string
  source: WebhookQueueSource
  phone: string
  waMessageId: string
  payload: unknown
  role: WebhookQueueRole | null
  status: WebhookQueueStatus
  attempts: number
  processingStartedAt: string | null
  processedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface EnqueueWebhookInput {
  source: WebhookQueueSource
  phone: string
  waMessageId: string
  role?: WebhookQueueRole | null
  payload: unknown
}

export interface EnqueueWebhookResultDTO {
  ok: boolean
  id?: string
  /** true se INSERT efetivou; false se conflict (item ja existia · idempotente). */
  enqueued?: boolean
  error?: string
}

export interface PickedWebhookItemDTO {
  id: string
  clinicId: string
  source: WebhookQueueSource
  phone: string
  waMessageId: string
  payload: unknown
  role: WebhookQueueRole | null
  attempts: number
}

export interface WebhookCompleteResultDTO {
  ok: boolean
  updated?: number
  error?: string
  currentStatus?: WebhookQueueStatus
}

export interface WebhookFailResultDTO {
  ok: boolean
  newStatus?: WebhookQueueStatus
  attempts?: number
  error?: string
  currentStatus?: WebhookQueueStatus
}

export interface WebhookResetStuckResultDTO {
  ok: boolean
  resetCount: number
  thresholdMinutes: number
  items: Array<{
    queueId: string
    attempts: number
    processingStartedAt: string | null
  }>
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQueueRow(row: any): WebhookQueueDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    source: (row.source ?? 'evolution') as WebhookQueueSource,
    phone: String(row.phone ?? ''),
    waMessageId: String(row.wa_message_id ?? ''),
    payload: row.payload ?? null,
    role: (row.role ?? null) as WebhookQueueRole | null,
    status: (row.status ?? 'pending') as WebhookQueueStatus,
    attempts: Number(row.attempts ?? 0),
    processingStartedAt: row.processing_started_at ?? null,
    processedAt: row.processed_at ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPickedItem(raw: any): PickedWebhookItemDTO {
  return {
    id: String(raw.id),
    clinicId: String(raw.clinic_id),
    source: (raw.source ?? 'evolution') as WebhookQueueSource,
    phone: String(raw.phone ?? ''),
    waMessageId: String(raw.wa_message_id ?? ''),
    payload: raw.payload ?? null,
    role: (raw.role ?? null) as WebhookQueueRole | null,
    attempts: Number(raw.attempts ?? 0),
  }
}

export class WebhookProcessingQueueRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Enfileira 1 webhook · ON CONFLICT (source, wa_message_id) DO NOTHING.
   * Retorna { ok, id, enqueued } · enqueued=false significa idempotent retry.
   */
  async enqueue(input: EnqueueWebhookInput): Promise<EnqueueWebhookResultDTO> {
    if (!input.source) return { ok: false, error: 'source_required' }
    if (!input.phone) return { ok: false, error: 'phone_required' }
    if (!input.waMessageId) return { ok: false, error: 'wa_message_id_required' }
    if (!input.payload || typeof input.payload !== 'object') {
      return { ok: false, error: 'payload_required' }
    }

    const rpcPayload: Record<string, unknown> = {
      source: input.source,
      phone: input.phone,
      wa_message_id: input.waMessageId,
      payload: input.payload,
    }
    if (input.role) rpcPayload.role = input.role

    const { data, error } = await this.supabase.rpc('webhook_queue_enqueue', {
      p_payload: rpcPayload,
    })
    if (error) return { ok: false, error: error.message }

    const r = data as {
      ok?: boolean
      id?: string
      enqueued?: boolean
      error?: string
    }
    return {
      ok: r?.ok === true,
      id: r?.id,
      enqueued: r?.enqueued,
      error: r?.error,
    }
  }

  /**
   * Pega ate `limit` items pending · marca processing + processing_started_at.
   * FOR UPDATE SKIP LOCKED · multi-worker safe.
   */
  async pickPending(limit = 5): Promise<PickedWebhookItemDTO[]> {
    const { data, error } = await this.supabase.rpc('webhook_queue_pick', {
      p_limit: limit,
    })
    if (error) {
      throw new Error(`webhook_queue_pick.failed: ${error.message}`)
    }
    const r = data as { ok?: boolean; items?: unknown[] }
    if (!Array.isArray(r?.items)) return []
    return r.items.map(mapPickedItem)
  }

  /**
   * Marca queue item como done. Idempotency guard (mig 800-11): so atualiza
   * WHERE status='processing'. Quando 0 rows affected, retorna ok=false +
   * currentStatus pro caller decidir.
   */
  async complete(id: string): Promise<WebhookCompleteResultDTO> {
    const { data, error } = await this.supabase.rpc('webhook_queue_complete', {
      p_id: id,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as {
      ok?: boolean
      updated?: number
      error?: string
      current_status?: string
    }
    return {
      ok: r?.ok === true,
      updated: r?.updated,
      error: r?.error,
      currentStatus: r?.current_status as WebhookQueueStatus | undefined,
    }
  }

  /**
   * Marca queue item como failed (ou volta pending se attempts < 3).
   * Idempotency guard · so atualiza WHERE status='processing'.
   */
  async fail(id: string, errorMessage: string): Promise<WebhookFailResultDTO> {
    const { data, error } = await this.supabase.rpc('webhook_queue_fail', {
      p_id: id,
      p_error: errorMessage,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as {
      ok?: boolean
      new_status?: string
      attempts?: number
      error?: string
      current_status?: string
    }
    return {
      ok: r?.ok === true,
      newStatus: r?.new_status as WebhookQueueStatus | undefined,
      attempts: r?.attempts,
      error: r?.error,
      currentStatus: r?.current_status as WebhookQueueStatus | undefined,
    }
  }

  /**
   * Circuit breaker · reseta items 'processing' presos > thresholdMinutes
   * (default 5) pra 'pending'. Worker chama antes de pick.
   */
  async resetStuck(
    thresholdMinutes: number = 5,
  ): Promise<WebhookResetStuckResultDTO> {
    const { data, error } = await this.supabase.rpc('webhook_queue_reset_stuck', {
      p_threshold_minutes: thresholdMinutes,
    })
    if (error) {
      return {
        ok: false,
        resetCount: 0,
        thresholdMinutes,
        items: [],
        error: error.message,
      }
    }
    const r = data as {
      ok?: boolean
      reset_count?: number
      threshold_minutes?: number
      items?: Array<{
        queue_id?: string
        attempts?: number
        processing_started_at?: string | null
      }>
    }
    return {
      ok: r?.ok === true,
      resetCount: Number(r?.reset_count ?? 0),
      thresholdMinutes: Number(r?.threshold_minutes ?? thresholdMinutes),
      items: (r?.items ?? []).map((i) => ({
        queueId: String(i.queue_id ?? ''),
        attempts: Number(i.attempts ?? 0),
        processingStartedAt: i.processing_started_at ?? null,
      })),
    }
  }

  /**
   * Lista itens com status `failed` · UI/diag observabilidade.
   * Multi-tenant ADR-028 · clinic_id obrigatorio.
   */
  async listFailed(
    clinicId: string,
    limit: number = 50,
  ): Promise<WebhookQueueDTO[]> {
    if (!clinicId) return []
    const safeLimit = Math.max(1, Math.min(limit, 500))
    const { data } = await this.supabase
      .from('webhook_processing_queue')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(safeLimit)
    return (data ?? []).map(mapQueueRow)
  }

  /**
   * Conta items por status · dashboards/KPI.
   */
  async count(
    clinicId: string,
    filters: {
      status?: WebhookQueueStatus | WebhookQueueStatus[]
      sinceIso?: string
    } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('webhook_processing_queue')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filters.status) {
      const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
      q = q.in('status', arr as unknown as string[])
    }
    if (filters.sinceIso) q = q.gte('created_at', filters.sinceIso)

    const { count } = await q
    return count ?? 0
  }
}
