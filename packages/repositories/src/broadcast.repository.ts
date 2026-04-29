/**
 * BroadcastRepository · disparos de broadcast WhatsApp (manuais).
 *
 * Port 1:1 do clinic-dashboard/js/repositories/broadcast.repository.js (vanilla)
 * pra TS · mesmas RPCs · mesmas semanticas { ok, data, error }.
 *
 * RPCs consumidas (todas SECURITY DEFINER · validam role + clinic_id):
 *   wa_broadcast_list_with_stats       · lista broadcasts com stats agregadas
 *   wa_broadcast_create                · cria broadcast (status=draft)
 *   wa_broadcast_update                · edita broadcast em draft
 *   wa_broadcast_reschedule            · re-agenda + reseta outbox
 *   wa_broadcast_start                 · enfileira mensagens no wa_outbox
 *   wa_broadcast_cancel                · cancela + remove pendentes do outbox
 *   wa_broadcast_delete                · soft delete (broadcast + outbox)
 *   wa_broadcast_stats                 · stats isoladas (1 broadcast)
 *   wa_broadcast_leads                 · leads alvo paginados por segmento
 */

import type { SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>

// ── Types ──────────────────────────────────────────────────────────

export type BroadcastStatus = 'draft' | 'sending' | 'completed' | 'cancelled'

/** Filtros server-side · jsonb gravado em wa_broadcasts.target_filter. */
export interface BroadcastTargetFilter {
  phase?: string | null
  temperature?: 'cold' | 'warm' | 'hot' | null
  funnel?: string | null
  source_type?: string | null
  /** Queixa filtrada na origem (label humanizado · usado pra interpolar [queixa]) */
  queixa?: string | null
}

/** Linha agregada vinda de wa_broadcast_list_with_stats. */
export interface BroadcastDTO {
  id: string
  name: string
  content: string
  media_url: string | null
  media_caption: string | null
  media_position: 'above' | 'below'
  status: BroadcastStatus
  target_filter: BroadcastTargetFilter | null
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  total_targets: number
  sent_count: number
  failed_count: number
  /** Stats de eventos · podem nao vir (depende da RPC) */
  delivered?: number
  read?: number
  responded?: number
  batch_size: number
  batch_interval_min: number
}

/** Stats isoladas vindas de wa_broadcast_stats. */
export interface BroadcastStatsDTO {
  total_targets: number
  sent: number
  failed: number
  delivered: number
  read: number
  responded: number
  send_rate: number
  delivery_rate: number
  read_rate: number
  response_rate: number
}

/** Lead retornado por wa_broadcast_leads. */
export interface BroadcastLeadDTO {
  id: string
  name: string | null
  phone: string | null
  status: string | null
}

/** Segmento aceito por wa_broadcast_leads. */
export type BroadcastLeadSegment =
  | 'all'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'read'
  | 'responded'
  | 'no_response'

/** Input de create/update/reschedule. */
export interface BroadcastUpsertInput {
  name: string
  content: string
  media_url?: string | null
  media_caption?: string | null
  media_position?: 'above' | 'below'
  target_filter?: BroadcastTargetFilter | Record<string, unknown> | null
  scheduled_at?: string | null
  batch_size?: number
  batch_interval_min?: number
  selected_lead_ids?: string[] | null
}

export interface BroadcastCreateResult {
  id: string
  total_targets: number
}

export interface BroadcastStartResult {
  enqueued: number
  estimated_minutes: number
  scheduled_for?: string | null
}

export interface BroadcastCancelResult {
  removed_from_outbox: number
}

export interface RpcResult<T = unknown> {
  ok: boolean
  data: T | null
  error: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────

function ok<T>(data: T): RpcResult<T> {
  return { ok: true, data, error: null }
}

function err(e: unknown): RpcResult<never> {
  const msg =
    typeof e === 'string'
      ? e
      : (e as { message?: string } | null)?.message || 'Erro desconhecido'
  return { ok: false, data: null, error: msg }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcShape(data: any): { ok: boolean; error?: string; payload: any } {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'ok' in data) {
    return { ok: !!data.ok, error: data.error, payload: data }
  }
  return { ok: true, payload: data }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBroadcast(row: any): BroadcastDTO {
  return {
    id: String(row.id),
    name: row.name ?? '',
    content: row.content ?? '',
    media_url: row.media_url ?? null,
    media_caption: row.media_caption ?? null,
    media_position: (row.media_position === 'below' ? 'below' : 'above') as 'above' | 'below',
    status: (row.status || 'draft') as BroadcastStatus,
    target_filter: (row.target_filter ?? null) as BroadcastTargetFilter | null,
    scheduled_at: row.scheduled_at ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    total_targets: Number(row.total_targets ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    delivered: row.delivered != null ? Number(row.delivered) : undefined,
    read: row.read != null ? Number(row.read) : undefined,
    responded: row.responded != null ? Number(row.responded) : undefined,
    batch_size: Number(row.batch_size ?? 10),
    batch_interval_min: Number(row.batch_interval_min ?? 10),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(row: any): BroadcastLeadDTO {
  return {
    id: String(row.id),
    name: row.name ?? row.nome ?? null,
    phone: row.phone ?? row.telefone ?? null,
    status: row.status ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildUpsertParams(input: BroadcastUpsertInput): Record<string, any> {
  const selected =
    input.selected_lead_ids && input.selected_lead_ids.length > 0
      ? input.selected_lead_ids
      : null
  return {
    p_name: input.name,
    p_content: input.content,
    p_media_url: input.media_url ?? null,
    p_media_caption: input.media_caption ?? null,
    p_target_filter: input.target_filter ?? {},
    p_scheduled_at: input.scheduled_at ?? null,
    p_batch_size: input.batch_size ?? 10,
    p_batch_interval_min: input.batch_interval_min ?? 10,
    p_selected_lead_ids: selected,
    p_media_position: input.media_position ?? 'above',
  }
}

// ── Repository ──────────────────────────────────────────────────────

export class BroadcastRepository {
  constructor(private supabase: AnyClient) {}

  /** Lista broadcasts da clinica com stats agregadas. */
  async list(): Promise<RpcResult<BroadcastDTO[]>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_list_with_stats')
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'list_failed')
      const rows = Array.isArray(shape.payload)
        ? shape.payload
        : shape.payload?.broadcasts ?? shape.payload?.data ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ok((Array.isArray(rows) ? rows : []).map((r: any) => mapBroadcast(r)))
    } catch (e) {
      return err(e)
    }
  }

  /** Cria broadcast em draft (NAO inicia · use start() depois). */
  async create(input: BroadcastUpsertInput): Promise<RpcResult<BroadcastCreateResult>> {
    try {
      const { data, error } = await this.supabase.rpc(
        'wa_broadcast_create',
        buildUpsertParams(input),
      )
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'create_failed')
      return ok({
        id: String(shape.payload?.id ?? ''),
        total_targets: Number(shape.payload?.total_targets ?? 0),
      })
    } catch (e) {
      return err(e)
    }
  }

  /** Atualiza broadcast em draft (apenas drafts). */
  async update(id: string, input: BroadcastUpsertInput): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_update', {
        p_broadcast_id: id,
        ...buildUpsertParams(input),
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'update_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  /** Re-agenda broadcast · reseta outbox + reaplica scheduled_at. */
  async reschedule(
    id: string,
    input: BroadcastUpsertInput,
  ): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_reschedule', {
        p_broadcast_id: id,
        ...buildUpsertParams(input),
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'reschedule_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  /** Inicia broadcast · enfileira mensagens no wa_outbox respeitando batch+throttle. */
  async start(id: string): Promise<RpcResult<BroadcastStartResult>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_start', {
        p_broadcast_id: id,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'start_failed')
      return ok({
        enqueued: Number(shape.payload?.enqueued ?? 0),
        estimated_minutes: Number(shape.payload?.estimated_minutes ?? 0),
        scheduled_for: shape.payload?.scheduled_for ?? null,
      })
    } catch (e) {
      return err(e)
    }
  }

  /** Cancela broadcast em sending · remove pendentes do outbox. */
  async cancel(id: string): Promise<RpcResult<BroadcastCancelResult>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_cancel', {
        p_broadcast_id: id,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'cancel_failed')
      return ok({
        removed_from_outbox: Number(shape.payload?.removed_from_outbox ?? 0),
      })
    } catch (e) {
      return err(e)
    }
  }

  /** Soft delete · marca deleted_at + remove outbox pendente. */
  async remove(id: string): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_delete', {
        p_broadcast_id: id,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'delete_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  /** Stats agregadas (1 broadcast). */
  async stats(id: string): Promise<RpcResult<BroadcastStatsDTO>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_stats', {
        p_broadcast_id: id,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'stats_failed')
      const p = shape.payload || {}
      return ok({
        total_targets: Number(p.total_targets ?? 0),
        sent: Number(p.sent ?? 0),
        failed: Number(p.failed ?? 0),
        delivered: Number(p.delivered ?? 0),
        read: Number(p.read ?? 0),
        responded: Number(p.responded ?? 0),
        send_rate: Number(p.send_rate ?? 0),
        delivery_rate: Number(p.delivery_rate ?? 0),
        read_rate: Number(p.read_rate ?? 0),
        response_rate: Number(p.response_rate ?? 0),
      })
    } catch (e) {
      return err(e)
    }
  }

  /** Leads alvo · filtrados por segmento (all|sent|failed|delivered|read|responded|no_response). */
  async leads(
    id: string,
    segment: BroadcastLeadSegment = 'all',
  ): Promise<RpcResult<BroadcastLeadDTO[]>> {
    try {
      const { data, error } = await this.supabase.rpc('wa_broadcast_leads', {
        p_broadcast_id: id,
        p_segment: segment,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'leads_failed')
      const rows = Array.isArray(shape.payload)
        ? shape.payload
        : shape.payload?.leads ?? shape.payload?.data ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ok((Array.isArray(rows) ? rows : []).map((r: any) => mapLead(r)))
    } catch (e) {
      return err(e)
    }
  }
}
