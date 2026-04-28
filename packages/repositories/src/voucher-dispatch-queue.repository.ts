/**
 * B2BVoucherDispatchQueueRepository · acesso a b2b_voucher_dispatch_queue
 * (clinicai-v2 mig 800-06).
 *
 * Wrapper das 5 RPCs canonicas + leitura raw da tabela pra UI admin.
 *
 * Uso tipico:
 *   - Webhook bulk submit (parceira manda lista no WhatsApp) → enqueue()
 *   - Cron worker (`/api/cron/b2b-voucher-dispatch-worker`) → pickPending()
 *     + complete()/fail() pra cada item
 *   - UI admin → listByPartnership()/listByBatch() + cancelBatch()
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinic_id resolvido
 * server-side pelo RPC enqueue (a partir do partnership_id).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type VoucherDispatchQueueStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface VoucherDispatchQueueDTO {
  id: string
  clinicId: string
  partnershipId: string
  recipientName: string
  recipientPhone: string
  recipientCpf: string | null
  combo: string | null
  notes: string | null
  scheduledAt: string
  status: VoucherDispatchQueueStatus
  voucherId: string | null
  errorMessage: string | null
  attempts: number
  lastAttemptAt: string | null
  processingStartedAt: string | null
  batchId: string | null
  submittedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface EnqueueItemInput {
  name: string
  phone: string
  cpf?: string
  combo?: string
  notes?: string
}

export interface EnqueueInput {
  partnershipId: string
  items: EnqueueItemInput[]
  scheduledAt?: string
  batchId?: string
  submittedBy?: string
}

export interface EnqueueResultItemDTO {
  ok: boolean
  queueId?: string
  recipientName?: string
  error?: string
}

export interface EnqueueResultDTO {
  ok: boolean
  batchId?: string
  count: number
  scheduledAt?: string
  items: EnqueueResultItemDTO[]
  error?: string
}

export interface PickedQueueItemDTO {
  queueId: string
  clinicId: string
  partnershipId: string
  recipientName: string
  recipientPhone: string
  recipientCpf: string | null
  combo: string | null
  notes: string | null
  batchId: string | null
  attempts: number
  submittedBy: string | null
}

/**
 * Resumo agregado de um batch · UI admin "ultimos lotes da clinica".
 * Computado client-side a partir do listByPartnership/raw query (sem RPC).
 */
export interface BatchSummaryDTO {
  batchId: string
  partnershipId: string
  total: number
  pending: number
  processing: number
  done: number
  failed: number
  cancelled: number
  scheduledAt: string
  submittedAt: string
  submittedBy: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQueueRow(row: any): VoucherDispatchQueueDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    recipientName: String(row.recipient_name ?? ''),
    recipientPhone: String(row.recipient_phone ?? ''),
    recipientCpf: row.recipient_cpf ?? null,
    combo: row.combo ?? null,
    notes: row.notes ?? null,
    scheduledAt: String(row.scheduled_at ?? new Date().toISOString()),
    status: (row.status ?? 'pending') as VoucherDispatchQueueStatus,
    voucherId: row.voucher_id ?? null,
    errorMessage: row.error_message ?? null,
    attempts: Number(row.attempts ?? 0),
    lastAttemptAt: row.last_attempt_at ?? null,
    processingStartedAt: row.processing_started_at ?? null,
    batchId: row.batch_id ?? null,
    submittedBy: row.submitted_by ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPickedItem(raw: any): PickedQueueItemDTO {
  return {
    queueId: String(raw.queue_id),
    clinicId: String(raw.clinic_id),
    partnershipId: String(raw.partnership_id),
    recipientName: String(raw.recipient_name ?? ''),
    recipientPhone: String(raw.recipient_phone ?? ''),
    recipientCpf: raw.recipient_cpf ?? null,
    combo: raw.combo ?? null,
    notes: raw.notes ?? null,
    batchId: raw.batch_id ?? null,
    attempts: Number(raw.attempts ?? 0),
    submittedBy: raw.submitted_by ?? null,
  }
}

export class B2BVoucherDispatchQueueRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Enfileira N vouchers via RPC b2b_dispatch_queue_enqueue.
   * Retorna { ok, batchId, count, items }. Items invalidos (sem name ou phone)
   * sao reportados em items[].ok=false sem bloquear bulk inteiro.
   */
  async enqueue(input: EnqueueInput): Promise<EnqueueResultDTO> {
    if (!input.partnershipId) {
      return { ok: false, count: 0, items: [], error: 'partnership_id_required' }
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { ok: false, count: 0, items: [], error: 'items_required' }
    }

    const payload: Record<string, unknown> = {
      partnership_id: input.partnershipId,
      items: input.items.map((it) => ({
        name: it.name,
        phone: it.phone,
        cpf: it.cpf,
        combo: it.combo,
        notes: it.notes,
      })),
    }
    if (input.scheduledAt) payload.scheduled_at = input.scheduledAt
    if (input.batchId) payload.batch_id = input.batchId
    if (input.submittedBy) payload.submitted_by = input.submittedBy

    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_enqueue', {
      p_payload: payload,
    })
    if (error) {
      return { ok: false, count: 0, items: [], error: error.message }
    }

    const result = data as {
      ok?: boolean
      batch_id?: string
      count?: number
      scheduled_at?: string
      items?: Array<{
        ok?: boolean
        queue_id?: string
        recipient_name?: string
        error?: string
      }>
      error?: string
    }
    return {
      ok: result?.ok === true,
      batchId: result?.batch_id,
      count: Number(result?.count ?? 0),
      scheduledAt: result?.scheduled_at,
      items: (result?.items ?? []).map((i) => ({
        ok: i.ok === true,
        queueId: i.queue_id,
        recipientName: i.recipient_name,
        error: i.error,
      })),
      error: result?.error,
    }
  }

  /**
   * Pega ate `limit` items pending elegiveis · marca como processing
   * (FOR UPDATE SKIP LOCKED no servidor · multi-worker safe).
   */
  async pickPending(limit = 10): Promise<PickedQueueItemDTO[]> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_pick', {
      p_limit: limit,
    })
    if (error) {
      throw new Error(`b2b_dispatch_queue_pick.failed: ${error.message}`)
    }
    const result = data as { ok?: boolean; items?: unknown[] }
    if (!Array.isArray(result?.items)) return []
    return result.items.map(mapPickedItem)
  }

  /**
   * Marca queue item como done · grava voucher_id emitido.
   *
   * Idempotency guard (mig 800-08): a RPC so atualiza WHERE status='processing'.
   * Quando 0 rows affected (zumbi · item ja foi resetado/processado por outro
   * worker), retorna { ok:false, error:'not_in_processing_state', currentStatus }.
   * Caller (cron worker) loga warn e NAO retenta o complete (item ja saiu da
   * fila ou foi resetado · proximo pick decide).
   */
  async complete(
    queueId: string,
    voucherId: string,
  ): Promise<{
    ok: boolean
    updated?: number
    error?: string
    currentStatus?: VoucherDispatchQueueStatus
  }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_complete', {
      p_queue_id: queueId,
      p_voucher_id: voucherId,
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
      currentStatus: r?.current_status as VoucherDispatchQueueStatus | undefined,
    }
  }

  /**
   * Marca queue item como done com voucher_id=null + error_message
   * 'dedup_hit:<kind>'. Decisao semantica (Fix F5 · mig 800-12): dedup
   * hit em bulk worker NAO e erro tecnico, e que o voucher ja existia
   * ou recipient ja era cliente · semelhante a complete() mas sem voucher.
   *
   * Idempotency guard manual: WHERE status='processing'. Em 0 rows
   * affected (race · status mudou), retorna { ok:false, error,
   * currentStatus } pro caller logar.
   *
   * Nao usa RPC porque b2b_dispatch_queue_complete clobbera error_message
   * pra NULL · esse caminho preserva a tag dedup_hit pra UI admin.
   */
  async markDedupHit(
    queueId: string,
    dedupKind: string,
  ): Promise<{
    ok: boolean
    error?: string
    currentStatus?: VoucherDispatchQueueStatus
  }> {
    const errorTag = `dedup_hit:${dedupKind}`
    const { data, error } = await this.supabase
      .from('b2b_voucher_dispatch_queue')
      .update({
        status: 'done',
        voucher_id: null,
        error_message: errorTag,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', queueId)
      .eq('status', 'processing')
      .select('id, status')
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) {
      // Idempotency guard hit · status mudou entre o pick e o markDedupHit.
      // Le status atual pra debug.
      const { data: cur } = await this.supabase
        .from('b2b_voucher_dispatch_queue')
        .select('status')
        .eq('id', queueId)
        .maybeSingle()
      return {
        ok: false,
        error: 'not_in_processing_state',
        currentStatus: cur?.status as VoucherDispatchQueueStatus | undefined,
      }
    }
    return { ok: true }
  }

  /**
   * Marca queue item como failed (ou volta pra pending se attempts < 3).
   * Retorna o new_status pro caller logar.
   *
   * Idempotency guard (mig 800-08): a RPC so atualiza WHERE status='processing'.
   * Quando 0 rows affected (item ja saiu de processing), retorna
   * { ok:false, error:'not_in_processing_state'|'race_status_changed_mid_fail',
   *   currentStatus }. Caller loga warn — fail nao deve forcar status volta.
   */
  async fail(
    queueId: string,
    errorMessage: string,
  ): Promise<{
    ok: boolean
    newStatus?: VoucherDispatchQueueStatus
    attempts?: number
    error?: string
    currentStatus?: VoucherDispatchQueueStatus
  }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_fail', {
      p_queue_id: queueId,
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
      newStatus: r?.new_status as VoucherDispatchQueueStatus | undefined,
      attempts: r?.attempts,
      error: r?.error,
      currentStatus: r?.current_status as VoucherDispatchQueueStatus | undefined,
    }
  }

  /**
   * Circuit breaker · reseta items 'processing' presos > thresholdMinutes
   * (default 5) pra 'pending'. Worker chama antes de cada pick. Retorna
   * count + lista de queue_ids resetados pra log/audit.
   *
   * Mig 800-08 · usa coluna processing_started_at (set pelo pick) pra detectar
   * zumbis (worker que travou ou foi morto sem completar).
   */
  async resetStuck(
    thresholdMinutes: number = 5,
  ): Promise<{
    ok: boolean
    resetCount: number
    thresholdMinutes: number
    items: Array<{
      queueId: string
      attempts: number
      processingStartedAt: string | null
    }>
    error?: string
  }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_reset_stuck', {
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
   * Cancela todos items pending do batch · status='cancelled'.
   * Nao toca em processing/done/failed.
   */
  async cancelBatch(batchId: string): Promise<{ ok: boolean; cancelled?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_cancel_batch', {
      p_batch_id: batchId,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as { ok?: boolean; cancelled?: number; error?: string }
    return {
      ok: r?.ok === true,
      cancelled: r?.cancelled,
      error: r?.error,
    }
  }

  /**
   * Lista items da fila por parceria · UI admin "vouchers pendentes da Yasmim".
   */
  async listByPartnership(
    partnershipId: string,
    filters: {
      status?: VoucherDispatchQueueStatus | VoucherDispatchQueueStatus[]
      limit?: number
      offset?: number
    } = {},
  ): Promise<VoucherDispatchQueueDTO[]> {
    let q = this.supabase
      .from('b2b_voucher_dispatch_queue')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('scheduled_at', { ascending: false })

    if (filters.status) {
      const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
      q = q.in('status', arr as unknown as string[])
    }

    const limit = Math.min(filters.limit ?? 100, 500)
    const offset = filters.offset ?? 0
    q = q.range(offset, offset + limit - 1)

    const { data } = await q
    return (data ?? []).map(mapQueueRow)
  }

  /**
   * Lista items de um batch · "ver bulk submit X".
   */
  async listByBatch(batchId: string): Promise<VoucherDispatchQueueDTO[]> {
    const { data } = await this.supabase
      .from('b2b_voucher_dispatch_queue')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true })
    return (data ?? []).map(mapQueueRow)
  }

  /**
   * Lista resumo dos N batches mais recentes da clinica · UI admin
   * "/vouchers/bulk" mostra ultimos lotes pra retomar/cancelar.
   *
   * Implementacao: SELECT raw com batch_id NOT NULL · agrega client-side em JS
   * (Supabase JS nao expoe GROUP BY direto · alternativa seria RPC dedicada,
   * mas pra <= 10 batches o N de rows e baixo · OK in-memory).
   *
   * Multi-tenant ADR-028 · clinic_id obrigatorio.
   */
  async listRecentBatches(
    clinicId: string,
    limit: number = 10,
  ): Promise<BatchSummaryDTO[]> {
    if (!clinicId) return []
    const safeLimit = Math.max(1, Math.min(limit, 50))

    // Pega ate ~500 rows pros N batches mais recentes (heuristica · 50 items por batch x 10 batches).
    const rowCap = Math.min(safeLimit * 100, 1000)

    const { data, error } = await this.supabase
      .from('b2b_voucher_dispatch_queue')
      .select(
        'batch_id, partnership_id, status, scheduled_at, created_at, submitted_by',
      )
      .eq('clinic_id', clinicId)
      .not('batch_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(rowCap)

    if (error || !data) return []

    type RawRow = {
      batch_id: string | null
      partnership_id: string
      status: string
      scheduled_at: string
      created_at: string
      submitted_by: string | null
    }

    const grouped = new Map<string, BatchSummaryDTO>()
    for (const r of data as RawRow[]) {
      const id = r.batch_id
      if (!id) continue
      const existing = grouped.get(id)
      if (!existing) {
        grouped.set(id, {
          batchId: id,
          partnershipId: String(r.partnership_id),
          total: 1,
          pending: r.status === 'pending' ? 1 : 0,
          processing: r.status === 'processing' ? 1 : 0,
          done: r.status === 'done' ? 1 : 0,
          failed: r.status === 'failed' ? 1 : 0,
          cancelled: r.status === 'cancelled' ? 1 : 0,
          scheduledAt: String(r.scheduled_at ?? r.created_at),
          submittedAt: String(r.created_at),
          submittedBy: r.submitted_by ?? null,
        })
        continue
      }
      existing.total += 1
      if (r.status === 'pending') existing.pending += 1
      else if (r.status === 'processing') existing.processing += 1
      else if (r.status === 'done') existing.done += 1
      else if (r.status === 'failed') existing.failed += 1
      else if (r.status === 'cancelled') existing.cancelled += 1
      // scheduled_at = MIN
      if (r.scheduled_at && r.scheduled_at < existing.scheduledAt) {
        existing.scheduledAt = String(r.scheduled_at)
      }
      // submittedAt = MAX created_at (pra "lote enviado em")
      if (r.created_at && r.created_at > existing.submittedAt) {
        existing.submittedAt = String(r.created_at)
      }
      // first non-null submittedBy ja foi setado no insert · noop
    }

    // Ordena por submittedAt DESC e corta no limit
    return Array.from(grouped.values())
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
      .slice(0, safeLimit)
  }

  /**
   * Conta items por filtros · usado em dashboards/KPI.
   */
  async count(
    clinicId: string,
    filters: {
      status?: VoucherDispatchQueueStatus | VoucherDispatchQueueStatus[]
      partnershipId?: string
      sinceIso?: string
    } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('b2b_voucher_dispatch_queue')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filters.status) {
      const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
      q = q.in('status', arr as unknown as string[])
    }
    if (filters.partnershipId) q = q.eq('partnership_id', filters.partnershipId)
    if (filters.sinceIso) q = q.gte('created_at', filters.sinceIso)

    const { count } = await q
    return count ?? 0
  }
}
