/**
 * CommercialRecoveryRepository · CRM_PHASE_2RC.
 *
 * Read-model unificado da fila de recuperação comercial (mig 172).
 * Consome `public.commercial_recovery_queue_view` (UNION ALL de 4 fontes:
 * perdidos, appointments cancelado, appointments no_show, orcamentos draft).
 *
 * Ações seguras sobre `perdidos` (mig 173):
 *   - markDiscarded(perdidoId, reason) · seta is_recoverable=false
 *   - addNote(perdidoId, note) · append em perdidos.notes (timestamped)
 *
 * Reativação de lead perdido vive em LeadRepository.recover().
 *
 * ZERO envio WhatsApp · ZERO automação · UI consome diretamente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RecoverySourceType =
  | 'lead_lost'
  | 'appointment_cancelled'
  | 'appointment_no_show'
  | 'orcamento_frio'

export type RecoveryStatus = 'aberto' | 'recuperado' | 'descartado'

export type RecoveryPriority = 'alta' | 'media' | 'baixa'

export interface CommercialRecoveryItemDTO {
  itemId: string
  clinicId: string
  sourceType: RecoverySourceType
  sourceId: string
  leadId: string | null
  patientId: string | null
  appointmentId: string | null
  orcamentoId: string | null
  displayName: string | null
  phoneLast4: string | null
  reason: string | null
  notes: string | null
  priority: RecoveryPriority
  status: RecoveryStatus
  sourceEventAt: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListRecoveryQueueFilter {
  sourceType?: RecoverySourceType | 'all'
  status?: RecoveryStatus | 'all'
  priority?: RecoveryPriority | 'all'
  limit?: number
  offset?: number
}

export interface RecoveryQueueCounts {
  total: number
  byPriority: Record<RecoveryPriority, number>
  byStatus: Record<RecoveryStatus, number>
  bySource: Record<RecoverySourceType, number>
}

export interface RecoveryActionResult {
  ok: boolean
  error?: string
  idempotentSkip?: boolean
  id?: string
}

interface ViewRow {
  item_id: string
  clinic_id: string
  source_type: RecoverySourceType
  source_id: string
  lead_id: string | null
  patient_id: string | null
  appointment_id: string | null
  orcamento_id: string | null
  display_name: string | null
  phone_last4: string | null
  reason: string | null
  notes: string | null
  priority: RecoveryPriority
  status: RecoveryStatus
  source_event_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

function mapRow(r: ViewRow): CommercialRecoveryItemDTO {
  return {
    itemId: r.item_id,
    clinicId: r.clinic_id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    leadId: r.lead_id,
    patientId: r.patient_id,
    appointmentId: r.appointment_id,
    orcamentoId: r.orcamento_id,
    displayName: r.display_name,
    phoneLast4: r.phone_last4,
    reason: r.reason,
    notes: r.notes,
    priority: r.priority,
    status: r.status,
    sourceEventAt: r.source_event_at,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export class CommercialRecoveryRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista fila de recuperação com filtros opcionais. RLS herda das tabelas
   * fonte · multi-tenant garantido por clinic_id JWT.
   */
  async listQueue(filter: ListRecoveryQueueFilter = {}): Promise<{
    items: CommercialRecoveryItemDTO[]
    error?: string
  }> {
    let q = this.supabase
      .from('commercial_recovery_queue_view')
      .select('*')

    if (filter.sourceType && filter.sourceType !== 'all') {
      q = q.eq('source_type', filter.sourceType)
    }
    if (filter.status && filter.status !== 'all') {
      q = q.eq('status', filter.status)
    }
    if (filter.priority && filter.priority !== 'all') {
      q = q.eq('priority', filter.priority)
    }

    // Ordena por prioridade (alta primeiro) e data evento (mais recente)
    q = q.order('priority', { ascending: true })
      .order('source_event_at', { ascending: false, nullsFirst: false })

    if (filter.limit) {
      q = q.range(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit - 1)
    }

    const { data, error } = await q
    if (error) return { items: [], error: error.message }
    return { items: (data as ViewRow[] | null ?? []).map(mapRow) }
  }

  /**
   * Conta itens da fila por dimensão (priority/status/source). Útil pra KPI
   * cards na página de recuperação.
   */
  async getCounts(): Promise<RecoveryQueueCounts> {
    const empty: RecoveryQueueCounts = {
      total: 0,
      byPriority: { alta: 0, media: 0, baixa: 0 },
      byStatus: { aberto: 0, recuperado: 0, descartado: 0 },
      bySource: {
        lead_lost: 0,
        appointment_cancelled: 0,
        appointment_no_show: 0,
        orcamento_frio: 0,
      },
    }

    const { data, error } = await this.supabase
      .from('commercial_recovery_queue_view')
      .select('priority,status,source_type')

    if (error || !data) return empty

    const rows = data as Array<Pick<ViewRow, 'priority' | 'status' | 'source_type'>>
    const out = { ...empty, byPriority: { ...empty.byPriority }, byStatus: { ...empty.byStatus }, bySource: { ...empty.bySource } }
    out.total = rows.length
    for (const r of rows) {
      out.byPriority[r.priority] = (out.byPriority[r.priority] ?? 0) + 1
      out.byStatus[r.status] = (out.byStatus[r.status] ?? 0) + 1
      out.bySource[r.source_type] = (out.bySource[r.source_type] ?? 0) + 1
    }
    return out
  }

  /**
   * Marca perdido como descartado permanente (is_recoverable=false). Aplica
   * apenas para source_type='lead_lost' · outros sources não suportados
   * nesta fase (foundation).
   *
   * Wrapper de RPC `recovery_perdido_mark_discarded(p_id, p_reason)` (mig 173).
   */
  async markDiscarded(perdidoId: string, reason: string): Promise<RecoveryActionResult> {
    const { data, error } = await this.supabase.rpc('recovery_perdido_mark_discarded', {
      p_id: perdidoId,
      p_reason: reason,
    })
    if (error) return { ok: false, error: error.message }
    if (data && typeof data === 'object' && 'ok' in data) {
      const d = data as { ok: boolean; error?: string; idempotent_skip?: boolean; id?: string }
      return {
        ok: d.ok,
        error: d.error,
        idempotentSkip: d.idempotent_skip,
        id: d.id,
      }
    }
    return { ok: false, error: 'unexpected_response' }
  }

  /**
   * Append note em perdidos.notes (timestamped pela RPC). Mínimo 3 chars.
   *
   * Wrapper de RPC `recovery_perdido_add_note(p_id, p_note)` (mig 173).
   */
  async addNote(perdidoId: string, note: string): Promise<RecoveryActionResult> {
    const { data, error } = await this.supabase.rpc('recovery_perdido_add_note', {
      p_id: perdidoId,
      p_note: note,
    })
    if (error) return { ok: false, error: error.message }
    if (data && typeof data === 'object' && 'ok' in data) {
      const d = data as { ok: boolean; error?: string; id?: string }
      return { ok: d.ok, error: d.error, id: d.id }
    }
    return { ok: false, error: 'unexpected_response' }
  }
}
