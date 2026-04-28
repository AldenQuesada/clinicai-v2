/**
 * AppointmentRepository · acesso canonico a tabela `appointments` (mig 62).
 *
 * Multi-tenant ADR-028 · clinic_id e arg explicito em qualquer metodo que
 * toca varias linhas. Boundary do ADR-005 · retorna AppointmentDTO em
 * camelCase, nunca row bruto snake.
 *
 * Modelo excludente forte (ADR-001): subject dual `lead_id` ou `patient_id`
 * (CHECK chk_appt_subject_xor garante exatamente um · exceto bloqueado).
 * Mutacoes que mudam phase do lead (`appointment_attend`, `finalize`)
 * passam pelas RPCs canonicas (mig 65); CRUD direto fica em UPDATEs simples
 * (data/horario/profissional/notas).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'
import {
  mapAppointmentRow,
  mapRpcResult,
  type AppointmentDTO,
  type AppointmentStatus,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
  type AppointmentFinalizeRpcInput,
  type AppointmentAttendResult,
  type AppointmentFinalizeResult,
} from './types'

const APPT_COLUMNS =
  'id, clinic_id, lead_id, patient_id, subject_name, subject_phone, ' +
  'professional_id, professional_name, room_idx, scheduled_date, start_time, ' +
  'end_time, procedure_name, consult_type, eval_type, value, payment_method, ' +
  'payment_status, status, origem, chegada_em, cancelado_em, motivo_cancelamento, ' +
  'no_show_em, motivo_no_show, consentimento_img, obs, recurrence_group_id, ' +
  'recurrence_index, recurrence_total, recurrence_procedure, recurrence_interval_days, ' +
  'created_at, updated_at, deleted_at'

export class AppointmentRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Conta appointments num intervalo de tempo (`scheduled_date` >= start, < end).
   * Usado por crons digest/anomaly-check pra "agenda de amanha", etc.
   *
   * NOTA: legado usava coluna `starts_at`; schema canonico v2 (mig 62) tem
   * `scheduled_date date` + `start_time time` separados. Como o intervalo
   * tipico e dia inteiro, comparamos so `scheduled_date`.
   */
  async countInRange(
    clinicId: string,
    startIso: string,
    endIso: string,
  ): Promise<number> {
    // Aceita ISO datetime ou date string · DB faz cast implicito
    const startDate = startIso.slice(0, 10)
    const endDate = endIso.slice(0, 10)
    const { count } = await this.supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('scheduled_date', startDate)
      .lt('scheduled_date', endDate)
    return count ?? 0
  }

  async getById(id: string): Promise<AppointmentDTO | null> {
    const { data } = await this.supabase
      .from('appointments')
      .select(APPT_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapAppointmentRow(data) : null
  }

  /**
   * Agenda do dia · 1 query, ordenada por start_time. Inclui status=bloqueado
   * pra UI poder pintar slots reservados. UI filtra finalizados/cancelados se
   * quiser visao "ativos".
   */
  async listByDate(clinicId: string, date: string): Promise<AppointmentDTO[]> {
    const { data } = await this.supabase
      .from('appointments')
      .select(APPT_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('scheduled_date', date)
      .is('deleted_at', null)
      .order('start_time', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapAppointmentRow)
  }

  /**
   * Agenda de um intervalo (semana/mes). Caller decide grouping client-side.
   */
  async listByDateRange(
    clinicId: string,
    startDate: string,
    endDate: string,
    opts: { professionalId?: string | null } = {},
  ): Promise<AppointmentDTO[]> {
    let q = this.supabase
      .from('appointments')
      .select(APPT_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (opts.professionalId) q = q.eq('professional_id', opts.professionalId)

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapAppointmentRow)
  }

  /**
   * Lista appointments de um subject (lead OU patient) · timeline na pagina
   * do paciente/lead.
   */
  async listBySubject(
    clinicId: string,
    subject: { leadId?: string | null; patientId?: string | null },
    opts: { limit?: number } = {},
  ): Promise<AppointmentDTO[]> {
    if (!subject.leadId && !subject.patientId) return []
    const limit = Math.min(opts.limit ?? 100, 500)
    const col = subject.leadId ? 'lead_id' : 'patient_id'
    const value = subject.leadId ?? subject.patientId
    const { data } = await this.supabase
      .from('appointments')
      .select(APPT_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq(col, value as string)
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false })
      .limit(limit)
    return ((data ?? []) as unknown[]).map(mapAppointmentRow)
  }

  // ── Mutations (CRUD direto) ────────────────────────────────────────────────

  /**
   * Insert direto · usado quando ja existe paciente recorrente (sem passar
   * por lead). Pra criar agendamento NOVO a partir de um lead, prefira
   * `LeadRepository.toAppointment()` (RPC `lead_to_appointment` faz a
   * transacao atomica + atualiza phase).
   *
   * CHECK constraints validam: subject XOR (lead_id|patient_id), end > start,
   * value >= 0. Retorna null se DB rejeitou.
   */
  async create(
    clinicId: string,
    input: CreateAppointmentInput,
  ): Promise<AppointmentDTO | null> {
    if (!input.leadId && !input.patientId && input.status !== 'bloqueado') {
      return null
    }
    const row: Record<string, unknown> = {
      clinic_id: clinicId,
      lead_id: input.leadId ?? null,
      patient_id: input.patientId ?? null,
      subject_name: input.subjectName ?? '',
      subject_phone: input.subjectPhone ?? null,
      professional_id: input.professionalId ?? null,
      professional_name: input.professionalName ?? '',
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      end_time: input.endTime,
      procedure_name: input.procedureName ?? '',
      consult_type: input.consultType ?? null,
      eval_type: input.evalType ?? null,
      value: input.value ?? 0,
      payment_status: input.paymentStatus ?? 'pendente',
      status: input.status ?? 'agendado',
      origem: input.origem ?? null,
      obs: input.obs ?? null,
      consentimento_img: input.consentimentoImg ?? 'pendente',
      recurrence_group_id: input.recurrenceGroupId ?? null,
      recurrence_index: input.recurrenceIndex ?? null,
      recurrence_total: input.recurrenceTotal ?? null,
      recurrence_procedure: input.recurrenceProcedure ?? null,
      recurrence_interval_days: input.recurrenceIntervalDays ?? null,
    }
    const { data, error } = await this.supabase
      .from('appointments')
      .insert(row)
      .select(APPT_COLUMNS)
      .single()
    if (error || !data) return null
    return mapAppointmentRow(data)
  }

  /**
   * UPDATE generico (data/horario/profissional/notas/status simples).
   * NAO usa pra: chegada (use attend RPC) ou finalizacao (use finalize RPC) ·
   * essas precisam atualizar leads.phase em transacao atomica.
   *
   * Retorna o DTO atualizado ou null se nao bateu nada.
   */
  async update(
    id: string,
    input: UpdateAppointmentInput,
  ): Promise<AppointmentDTO | null> {
    const row: Record<string, unknown> = {}
    if (input.scheduledDate !== undefined) row.scheduled_date = input.scheduledDate
    if (input.startTime !== undefined) row.start_time = input.startTime
    if (input.endTime !== undefined) row.end_time = input.endTime
    if (input.professionalId !== undefined) row.professional_id = input.professionalId
    if (input.professionalName !== undefined) row.professional_name = input.professionalName
    if (input.procedureName !== undefined) row.procedure_name = input.procedureName
    if (input.consultType !== undefined) row.consult_type = input.consultType
    if (input.evalType !== undefined) row.eval_type = input.evalType
    if (input.value !== undefined) row.value = input.value
    if (input.paymentMethod !== undefined) row.payment_method = input.paymentMethod
    if (input.paymentStatus !== undefined) row.payment_status = input.paymentStatus
    if (input.status !== undefined) row.status = input.status
    if (input.motivoCancelamento !== undefined) row.motivo_cancelamento = input.motivoCancelamento
    if (input.motivoNoShow !== undefined) row.motivo_no_show = input.motivoNoShow
    if (input.consentimentoImg !== undefined) row.consentimento_img = input.consentimentoImg
    if (input.obs !== undefined) row.obs = input.obs

    if (Object.keys(row).length === 0) return this.getById(id)

    const { data, error } = await this.supabase
      .from('appointments')
      .update(row)
      .eq('id', id)
      .select(APPT_COLUMNS)
      .single()
    if (error || !data) return null
    return mapAppointmentRow(data)
  }

  /**
   * Cancela appointment · seta status + motivo + cancelado_em. Motivo
   * obrigatorio (CHECK chk_appt_cancelled_consistency). NAO mexe na phase
   * do lead · regra: cancelar 1 appt nao reverte phase (pode ter outro).
   * Caller (Server Action) decide se reverte phase quando todos os appts
   * estao cancelados.
   */
  async cancel(id: string, motivo: string): Promise<AppointmentDTO | null> {
    if (!motivo || !motivo.trim()) return null
    const { data, error } = await this.supabase
      .from('appointments')
      .update({
        status: 'cancelado',
        motivo_cancelamento: motivo.trim(),
        cancelado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select(APPT_COLUMNS)
      .single()
    if (error || !data) return null
    return mapAppointmentRow(data)
  }

  /**
   * No-show · paciente nao apareceu. Motivo obrigatorio
   * (chk_appt_noshow_consistency).
   */
  async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
    if (!motivo || !motivo.trim()) return null
    const { data, error } = await this.supabase
      .from('appointments')
      .update({
        status: 'no_show',
        motivo_no_show: motivo.trim(),
        no_show_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select(APPT_COLUMNS)
      .single()
    if (error || !data) return null
    return mapAppointmentRow(data)
  }

  /**
   * Soft-delete (deleted_at = now). Usado pra esconder o appt sem perder
   * audit. Hard-delete so via admin (RLS DELETE policy).
   */
  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }

  /**
   * Conta por status num intervalo · widget "pendentes hoje", etc.
   */
  async countByStatusInRange(
    clinicId: string,
    statuses: AppointmentStatus[],
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const { count } = await this.supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .in('status', statuses)
    return count ?? 0
  }

  // ── RPC wrappers (state-machine moves) ─────────────────────────────────────

  /**
   * Wrapper de `appointment_attend()` RPC · marca paciente chegou
   * (status=na_clinica) + atualiza leads.phase=compareceu em transacao
   * atomica. Idempotente: pode ser chamado 2x sem duplicar audit.
   *
   * Bloqueia se appt esta cancelado/no_show/bloqueado (retorna
   * `invalid_status_for_attend`).
   */
  async attend(
    appointmentId: string,
    chegadaEm?: string,
  ): Promise<AppointmentAttendResult> {
    const { data, error } = await this.supabase.rpc('appointment_attend', {
      p_appointment_id: appointmentId,
      p_chegada_em: chegadaEm ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as AppointmentAttendResult
    }
    return mapRpcResult<AppointmentAttendResult>(data)
  }

  /**
   * Wrapper de `appointment_finalize()` RPC · finaliza consulta + roteia
   * outcome:
   *   - paciente: chama lead_to_paciente (promove)
   *   - orcamento: chama lead_to_orcamento (cria orcamento + soft-delete lead)
   *   - perdido: chama lead_lost (reason obrigatorio)
   *
   * Sub-RPC pode falhar mesmo com appt finalizado (estado terminal valido) ·
   * UI deve checar `subCall` no result quando ok=true mas tem warning.
   */
  async finalize(input: AppointmentFinalizeRpcInput): Promise<AppointmentFinalizeResult> {
    const itemsForDb = input.orcamentoItems
      ? input.orcamentoItems.map((it) => ({
          name: it.name,
          qty: it.qty,
          unit_price: it.unitPrice,
          subtotal: it.subtotal,
          ...(it.procedureCode ? { procedure_code: it.procedureCode } : {}),
        }))
      : null
    const { data, error } = await this.supabase.rpc('appointment_finalize', {
      p_appointment_id: input.appointmentId,
      p_outcome: input.outcome,
      p_value: input.value ?? null,
      p_payment_status: input.paymentStatus ?? null,
      p_notes: input.notes ?? null,
      p_lost_reason: input.lostReason ?? null,
      p_orcamento_items: itemsForDb,
      p_orcamento_subtotal: input.orcamentoSubtotal ?? null,
      p_orcamento_discount: input.orcamentoDiscount ?? 0,
    })
    if (error) {
      return {
        ok: false,
        error: 'rpc_error',
        detail: error.message,
      } as AppointmentFinalizeResult
    }
    return mapRpcResult<AppointmentFinalizeResult>(data)
  }
}
