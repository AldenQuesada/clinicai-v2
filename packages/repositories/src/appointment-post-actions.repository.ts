/**
 * AppointmentPostActionsRepository · CRM_PARITY_R3.
 *
 * Acesso a `public.appointment_post_actions` (mig 197). Fila interna de
 * pós-ações disparadas no finalize · paridade legacy `clinic_op_queue` +
 * `clinic_op_tasks` (localStorage no clinic-dashboard).
 *
 * Multi-tenant ADR-028 · todas queries filtradas por clinic_id.
 *
 * O que NÃO faz:
 *   - Não executa ações (sem worker · staff dispatcha manualmente)
 *   - Não dispara WhatsApp / provider / pg_net
 *   - Não toca appointment_finalize / hard gate
 *   - Não muta `wa_outbox` · queue interna isolada
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AppointmentPostActionType =
  | 'google_review'
  | 'vpi_indication'
  | 'retouch_reminder'
  | 'complaint_logged'
  | 'payment_followup'

export type AppointmentPostActionStatus =
  | 'pending'
  | 'done'
  | 'dismissed'
  | 'cancelled'

export interface AppointmentPostActionDTO {
  id: string
  clinicId: string
  appointmentId: string
  actionType: AppointmentPostActionType
  status: AppointmentPostActionStatus
  scheduleAt: string | null
  executedAt: string | null
  dismissedAt: string | null
  dismissedReason: string | null
  payload: Record<string, unknown>
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CreateAppointmentPostActionInput {
  appointmentId: string
  actionType: AppointmentPostActionType
  scheduleAt?: string | null
  payload?: Record<string, unknown>
  notes?: string | null
  createdBy?: string | null
}

export interface UpdateAppointmentPostActionStatusInput {
  status: AppointmentPostActionStatus
  executedAt?: string | null
  dismissedAt?: string | null
  dismissedReason?: string | null
  notes?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): AppointmentPostActionDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    appointmentId: String(row.appointment_id),
    actionType: String(row.action_type) as AppointmentPostActionType,
    status: String(row.status ?? 'pending') as AppointmentPostActionStatus,
    scheduleAt: row.schedule_at ?? null,
    executedAt: row.executed_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    dismissedReason: row.dismissed_reason ?? null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

const COLS =
  'id, clinic_id, appointment_id, action_type, status, schedule_at, ' +
  'executed_at, dismissed_at, dismissed_reason, payload, notes, ' +
  'created_by, created_at, updated_at, deleted_at'

export class AppointmentPostActionsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async listByAppointment(
    appointmentId: string,
  ): Promise<AppointmentPostActionDTO[]> {
    const { data } = await this.supabase
      .from('appointment_post_actions')
      .select(COLS)
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async listPendingByClinic(
    clinicId: string,
    options?: { actionType?: AppointmentPostActionType; limit?: number },
  ): Promise<AppointmentPostActionDTO[]> {
    let query = this.supabase
      .from('appointment_post_actions')
      .select(COLS)
      .eq('clinic_id', clinicId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('schedule_at', { ascending: true, nullsFirst: false })

    if (options?.actionType) {
      query = query.eq('action_type', options.actionType)
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    const { data } = await query
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  /**
   * Listagem flexível por status arbitrário (ou todos) · usada pelo staff
   * dashboard R4 para mostrar histórico (done/dismissed/cancelled).
   * Ordena por created_at desc para mostrar mais recentes primeiro.
   */
  async listByClinic(
    clinicId: string,
    options?: {
      status?: AppointmentPostActionStatus | 'all'
      actionType?: AppointmentPostActionType
      limit?: number
    },
  ): Promise<AppointmentPostActionDTO[]> {
    let query = this.supabase
      .from('appointment_post_actions')
      .select(COLS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status)
    }
    if (options?.actionType) {
      query = query.eq('action_type', options.actionType)
    }
    query = query.limit(options?.limit ?? 200)

    const { data } = await query
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  /**
   * Lista pós-ações para múltiplos appointment_ids · usado pela aba
   * post-actions do perfil do paciente (mostra fila across todos os
   * agendamentos daquele paciente).
   */
  async listByAppointmentIds(
    appointmentIds: ReadonlyArray<string>,
  ): Promise<AppointmentPostActionDTO[]> {
    if (appointmentIds.length === 0) return []
    const { data } = await this.supabase
      .from('appointment_post_actions')
      .select(COLS)
      .in('appointment_id', appointmentIds as string[])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async getById(id: string): Promise<AppointmentPostActionDTO | null> {
    const { data } = await this.supabase
      .from('appointment_post_actions')
      .select(COLS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapRow(data) : null
  }

  async create(
    clinicId: string,
    input: CreateAppointmentPostActionInput,
  ): Promise<AppointmentPostActionDTO | null> {
    const row: Record<string, unknown> = {
      clinic_id: clinicId,
      appointment_id: input.appointmentId,
      action_type: input.actionType,
      status: 'pending',
      schedule_at: input.scheduleAt ?? null,
      payload: input.payload ?? {},
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    }
    const { data, error } = await this.supabase
      .from('appointment_post_actions')
      .insert(row)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  /**
   * Bulk create · usado pelo finalize action para enfileirar múltiplas
   * pós-ações numa única ida ao banco. Falha de uma row NÃO desfaz as
   * outras (insert non-transactional · best-effort consistente com pattern
   * dual-write da R2).
   */
  async createBatch(
    clinicId: string,
    inputs: ReadonlyArray<CreateAppointmentPostActionInput>,
  ): Promise<AppointmentPostActionDTO[]> {
    if (inputs.length === 0) return []
    const rows = inputs.map((input) => ({
      clinic_id: clinicId,
      appointment_id: input.appointmentId,
      action_type: input.actionType,
      status: 'pending',
      schedule_at: input.scheduleAt ?? null,
      payload: input.payload ?? {},
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    }))
    const { data } = await this.supabase
      .from('appointment_post_actions')
      .insert(rows)
      .select(COLS)
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  /**
   * Marca uma pós-ação como executada/dismissed/cancelled. Usado pelo
   * dashboard da secretaria quando ela manualmente registra que ligou,
   * mandou mensagem fora do sistema, ou optou por pular.
   */
  async updateStatus(
    id: string,
    input: UpdateAppointmentPostActionStatusInput,
  ): Promise<AppointmentPostActionDTO | null> {
    const row: Record<string, unknown> = { status: input.status }
    if (input.status === 'done') {
      row.executed_at = input.executedAt ?? new Date().toISOString()
    } else if (input.status === 'dismissed') {
      row.dismissed_at = input.dismissedAt ?? new Date().toISOString()
      if (input.dismissedReason !== undefined) {
        row.dismissed_reason = input.dismissedReason
      }
    }
    if (input.notes !== undefined) row.notes = input.notes
    const { data, error } = await this.supabase
      .from('appointment_post_actions')
      .update(row)
      .eq('id', id)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('appointment_post_actions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }
}
