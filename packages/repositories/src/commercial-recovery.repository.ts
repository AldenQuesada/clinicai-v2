/**
 * CommercialRecoveryRepository · CRM_PHASE_2RC + 2RC.1.
 *
 * Read-model unificado da fila de recuperação comercial (mig 172).
 * Consome `public.commercial_recovery_queue_view` (UNION ALL de 4 fontes:
 * perdidos, appointments cancelado, appointments no_show, orcamentos draft).
 *
 * Workflow interno (mig 174) · CRM_PHASE_2RC.1:
 *   - commercial_recovery_workflow_view · queue + workflow_items LEFT JOIN
 *   - 8 RPCs SECURITY DEFINER (create_or_get, update_stage/priority,
 *     set_next_action, add_note, mark_recovered, discard, suggest_message)
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

export type RecoveryStatus = 'aberto' | 'recuperado' | 'descartado' | 'arquivado'

export type RecoveryPriority = 'alta' | 'media' | 'baixa' | 'urgente'

export type RecoveryStage =
  | 'novo'
  | 'em_analise'
  | 'primeira_tentativa'
  | 'aguardando_resposta'
  | 'retorno_agendado'
  | 'recuperado'
  | 'descartado'
  | 'arquivado'

export type RecoveryNextActionType =
  | 'ligar'
  | 'enviar_whatsapp_quando_liberado'
  | 'agendar_retorno'
  | 'revisar_orcamento'
  | 'marcar_descartado'
  | 'reativar_lead'
  | 'observar'

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

// ── Workflow types (2RC.1) ────────────────────────────────────────────────

export interface RecoveryWorkflowItemDTO {
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
  sourceNotes: string | null
  sourceEventAt: string | null
  resolvedAt: string | null

  workflowId: string | null
  stage: RecoveryStage
  priority: RecoveryPriority
  status: RecoveryStatus
  assignedTo: string | null
  nextActionType: RecoveryNextActionType | null
  nextActionAt: string | null
  workflowNote: string | null
  suggestedMessage: string | null
  workflowUpdatedAt: string | null
  nextActionOverdue: boolean
}

export interface RecoveryWorkflowCounts {
  total: number
  byStage: Record<RecoveryStage, number>
  byPriority: Record<RecoveryPriority, number>
  overdue: number
  assignedToMe: number
}

export interface ListRecoveryWorkflowFilter {
  sourceType?: RecoverySourceType | 'all'
  stage?: RecoveryStage | 'all'
  priority?: RecoveryPriority | 'all'
  status?: RecoveryStatus | 'all'
  assignedTo?: string | null
  overdueOnly?: boolean
  limit?: number
  offset?: number
}

export interface RecoveryWorkflowActionResult {
  ok: boolean
  error?: string
  id?: string
  existed?: boolean
  idempotentSkip?: boolean
  stage?: RecoveryStage
  priority?: RecoveryPriority
  status?: RecoveryStatus
  actionType?: RecoveryNextActionType | null
  at?: string | null
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

// Module-scoped twin de ViewRow pra commercial_recovery_workflow_view (2RC.1)
// Compartilhado entre listWorkflowQueue e os bucket helpers (overdue/today/upcoming).
interface WorkflowViewRow {
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
  source_notes: string | null
  source_event_at: string | null
  resolved_at: string | null
  workflow_id: string | null
  stage: RecoveryStage
  priority: RecoveryPriority
  status: RecoveryStatus
  assigned_to: string | null
  next_action_type: RecoveryNextActionType | null
  next_action_at: string | null
  workflow_note: string | null
  suggested_message: string | null
  workflow_updated_at: string | null
  next_action_overdue: boolean
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
      byPriority: { urgente: 0, alta: 0, media: 0, baixa: 0 },
      byStatus: { aberto: 0, recuperado: 0, descartado: 0, arquivado: 0 },
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

  // ── Workflow methods (CRM_PHASE_2RC.1 · mig 174) ─────────────────────────

  /**
   * Lista fila de recuperação com camada de workflow (mig 174).
   * Usa `commercial_recovery_workflow_view` (queue_view LEFT JOIN workflow_items).
   * Workflow overrides > queue computed values quando workflow row existe.
   */
  async listWorkflowQueue(
    filter: ListRecoveryWorkflowFilter = {},
  ): Promise<{ items: RecoveryWorkflowItemDTO[]; error?: string }> {
    let q = this.supabase.from('commercial_recovery_workflow_view').select('*')

    if (filter.sourceType && filter.sourceType !== 'all') {
      q = q.eq('source_type', filter.sourceType)
    }
    if (filter.stage && filter.stage !== 'all') {
      q = q.eq('stage', filter.stage)
    }
    if (filter.priority && filter.priority !== 'all') {
      q = q.eq('priority', filter.priority)
    }
    if (filter.status && filter.status !== 'all') {
      q = q.eq('status', filter.status)
    }
    if (filter.assignedTo !== undefined) {
      if (filter.assignedTo === null) q = q.is('assigned_to', null)
      else q = q.eq('assigned_to', filter.assignedTo)
    }
    if (filter.overdueOnly) {
      q = q.eq('next_action_overdue', true)
    }

    q = q
      .order('priority', { ascending: true })
      .order('next_action_at', { ascending: true, nullsFirst: false })
      .order('source_event_at', { ascending: false, nullsFirst: false })

    if (filter.limit) {
      q = q.range(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit - 1)
    }

    const { data, error } = await q
    if (error) return { items: [], error: error.message }

    const items: RecoveryWorkflowItemDTO[] = (data as WorkflowViewRow[] | null ?? []).map(
      (r) => this.mapWorkflowRow(r),
    )

    return { items }
  }

  // ── Bucket helpers (Lote 3 · scheduler view) ────────────────────────────
  //
  // 3 buckets read-only sobre commercial_recovery_workflow_view · status='aberto'
  //   - listOverdue   · next_action_at < now()
  //   - listToday     · next_action_at::date = current_date
  //   - listUpcoming  · next_action_at > now() · próximos 7 dias
  //
  // Zero side-effect · zero cron · zero envio. Só read.
  //
  // Compartilha o mesmo mapping de listWorkflowQueue.

  private mapWorkflowRow(r: WorkflowViewRow): RecoveryWorkflowItemDTO {
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
      sourceNotes: r.source_notes,
      sourceEventAt: r.source_event_at,
      resolvedAt: r.resolved_at,
      workflowId: r.workflow_id,
      stage: r.stage,
      priority: r.priority,
      status: r.status,
      assignedTo: r.assigned_to,
      nextActionType: r.next_action_type,
      nextActionAt: r.next_action_at,
      workflowNote: r.workflow_note,
      suggestedMessage: r.suggested_message,
      workflowUpdatedAt: r.workflow_updated_at,
      nextActionOverdue: r.next_action_overdue,
    }
  }

  /**
   * Itens com `next_action_at < now()` e status aberto. Ordenado pelo mais
   * antigo primeiro (maior atraso). Limit defensivo (default 50).
   *
   * READ-ONLY · não dispara envio · não muta workflow.
   */
  async listOverdue(limit = 50): Promise<{ items: RecoveryWorkflowItemDTO[]; error?: string }> {
    const nowIso = new Date().toISOString()
    const { data, error } = await this.supabase
      .from('commercial_recovery_workflow_view')
      .select('*')
      .eq('status', 'aberto')
      .not('next_action_at', 'is', null)
      .lt('next_action_at', nowIso)
      .order('next_action_at', { ascending: true })
      .limit(limit)

    if (error) return { items: [], error: error.message }
    return { items: (data as WorkflowViewRow[] | null ?? []).map((r) => this.mapWorkflowRow(r)) }
  }

  /**
   * Itens com `next_action_at` HOJE (na timezone do servidor Postgres) e
   * status aberto. Ordenado pelo horário ascendente (mais cedo primeiro).
   *
   * READ-ONLY.
   */
  async listToday(limit = 50): Promise<{ items: RecoveryWorkflowItemDTO[]; error?: string }> {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const { data, error } = await this.supabase
      .from('commercial_recovery_workflow_view')
      .select('*')
      .eq('status', 'aberto')
      .gte('next_action_at', startOfDay.toISOString())
      .lte('next_action_at', endOfDay.toISOString())
      .order('next_action_at', { ascending: true })
      .limit(limit)

    if (error) return { items: [], error: error.message }
    return { items: (data as WorkflowViewRow[] | null ?? []).map((r) => this.mapWorkflowRow(r)) }
  }

  /**
   * Itens com `next_action_at` nos PRÓXIMOS 7 dias (a partir de amanhã 00:00) e
   * status aberto. Ordenado pelo mais próximo. Default limit 20.
   *
   * READ-ONLY.
   */
  async listUpcoming(limit = 20): Promise<{ items: RecoveryWorkflowItemDTO[]; error?: string }> {
    const now = new Date()
    const startTomorrow = new Date(now)
    startTomorrow.setDate(startTomorrow.getDate() + 1)
    startTomorrow.setHours(0, 0, 0, 0)
    const endHorizon = new Date(now)
    endHorizon.setDate(endHorizon.getDate() + 7)
    endHorizon.setHours(23, 59, 59, 999)

    const { data, error } = await this.supabase
      .from('commercial_recovery_workflow_view')
      .select('*')
      .eq('status', 'aberto')
      .gte('next_action_at', startTomorrow.toISOString())
      .lte('next_action_at', endHorizon.toISOString())
      .order('next_action_at', { ascending: true })
      .limit(limit)

    if (error) return { items: [], error: error.message }
    return { items: (data as WorkflowViewRow[] | null ?? []).map((r) => this.mapWorkflowRow(r)) }
  }

  /**
   * Conta workflow itens · totais + by stage + by priority + overdue + assigned.
   */
  async getWorkflowCounts(currentUserId?: string | null): Promise<RecoveryWorkflowCounts> {
    const empty: RecoveryWorkflowCounts = {
      total: 0,
      byStage: {
        novo: 0,
        em_analise: 0,
        primeira_tentativa: 0,
        aguardando_resposta: 0,
        retorno_agendado: 0,
        recuperado: 0,
        descartado: 0,
        arquivado: 0,
      },
      byPriority: { baixa: 0, media: 0, alta: 0, urgente: 0 },
      overdue: 0,
      assignedToMe: 0,
    }

    const { data, error } = await this.supabase
      .from('commercial_recovery_workflow_view')
      .select('stage,priority,next_action_overdue,assigned_to')

    if (error || !data) return empty

    const rows = data as Array<{
      stage: RecoveryStage
      priority: RecoveryPriority
      next_action_overdue: boolean
      assigned_to: string | null
    }>

    const out: RecoveryWorkflowCounts = {
      total: rows.length,
      byStage: { ...empty.byStage },
      byPriority: { ...empty.byPriority },
      overdue: 0,
      assignedToMe: 0,
    }
    for (const r of rows) {
      out.byStage[r.stage] = (out.byStage[r.stage] ?? 0) + 1
      out.byPriority[r.priority] = (out.byPriority[r.priority] ?? 0) + 1
      if (r.next_action_overdue) out.overdue++
      if (currentUserId && r.assigned_to === currentUserId) out.assignedToMe++
    }
    return out
  }

  /**
   * Cria-ou-pega workflow item por (source_type, source_id). Idempotente.
   * RPC `commercial_recovery_workflow_create_or_get`.
   */
  async createOrGetWorkflow(input: {
    sourceType: RecoverySourceType
    sourceId: string
    leadId?: string | null
    appointmentId?: string | null
    orcamentoId?: string | null
    priority?: RecoveryPriority
  }): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_create_or_get',
      {
        p_source_type: input.sourceType,
        p_source_id: input.sourceId,
        p_lead_id: input.leadId ?? null,
        p_appointment_id: input.appointmentId ?? null,
        p_orcamento_id: input.orcamentoId ?? null,
        p_priority: input.priority ?? 'media',
      },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async updateWorkflowStage(
    id: string,
    stage: RecoveryStage,
    note?: string | null,
  ): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_update_stage',
      { p_id: id, p_stage: stage, p_note: note ?? null },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async updateWorkflowPriority(
    id: string,
    priority: RecoveryPriority,
  ): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_update_priority',
      { p_id: id, p_priority: priority },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async setWorkflowNextAction(input: {
    id: string
    actionType: RecoveryNextActionType | null
    at: string | null
    assignedTo?: string | null
  }): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_set_next_action',
      {
        p_id: input.id,
        p_action_type: input.actionType,
        p_at: input.at,
        p_assigned_to: input.assignedTo ?? null,
      },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async addWorkflowNote(id: string, note: string): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_add_note',
      { p_id: id, p_note: note },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async markWorkflowRecovered(
    id: string,
    note?: string | null,
  ): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_mark_recovered',
      { p_id: id, p_note: note ?? null },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  async discardWorkflow(
    id: string,
    reason: string,
  ): Promise<RecoveryWorkflowActionResult> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_discard',
      { p_id: id, p_reason: reason },
    )
    return mapWorkflowRpc(data, error?.message)
  }

  /**
   * Gera texto sugerido (dry-run · zero envio · regra SQL estática).
   * RPC IMMUTABLE · pure read.
   */
  async suggestWorkflowMessage(
    sourceType: RecoverySourceType,
    displayName: string,
    reason?: string | null,
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc(
      'commercial_recovery_workflow_suggest_message',
      {
        p_source_type: sourceType,
        p_display_name: displayName,
        p_reason: reason ?? null,
      },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true, message: typeof data === 'string' ? data : String(data ?? '') }
  }
}

function mapWorkflowRpc(
  data: unknown,
  errorMessage?: string,
): RecoveryWorkflowActionResult {
  if (errorMessage) return { ok: false, error: errorMessage }
  if (data && typeof data === 'object' && 'ok' in data) {
    const d = data as {
      ok: boolean
      error?: string
      id?: string
      existed?: boolean
      idempotent_skip?: boolean
      stage?: RecoveryStage
      priority?: RecoveryPriority
      status?: RecoveryStatus
      action_type?: RecoveryNextActionType | null
      at?: string | null
    }
    return {
      ok: d.ok,
      error: d.error,
      id: d.id,
      existed: d.existed,
      idempotentSkip: d.idempotent_skip,
      stage: d.stage,
      priority: d.priority,
      status: d.status,
      actionType: d.action_type ?? null,
      at: d.at ?? null,
    }
  }
  return { ok: false, error: 'unexpected_response' }
}
