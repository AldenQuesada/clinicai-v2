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
  constructor(private supabase: SupabaseClient<any>) {}

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
   */
  async complete(
    queueId: string,
    voucherId: string,
  ): Promise<{ ok: boolean; updated?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_complete', {
      p_queue_id: queueId,
      p_voucher_id: voucherId,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as { ok?: boolean; updated?: number }
    return { ok: r?.ok === true, updated: r?.updated }
  }

  /**
   * Marca queue item como failed (ou volta pra pending se attempts < 3).
   * Retorna o new_status pro caller logar.
   */
  async fail(
    queueId: string,
    errorMessage: string,
  ): Promise<{ ok: boolean; newStatus?: VoucherDispatchQueueStatus; attempts?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_dispatch_queue_fail', {
      p_queue_id: queueId,
      p_error: errorMessage,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as { ok?: boolean; new_status?: string; attempts?: number; error?: string }
    return {
      ok: r?.ok === true,
      newStatus: r?.new_status as VoucherDispatchQueueStatus | undefined,
      attempts: r?.attempts,
      error: r?.error,
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
