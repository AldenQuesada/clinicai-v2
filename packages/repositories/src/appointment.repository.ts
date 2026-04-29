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
import { v4 as uuidv4 } from 'uuid'
import {
  mapAppointmentRow,
  mapRpcResult,
  orcamentoItemsToDbShape,
  type AppointmentDTO,
  type AppointmentStatus,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
  type AppointmentFinalizeRpcInput,
  type AppointmentAttendResult,
  type AppointmentFinalizeResult,
  type RpcResult,
} from './types'
import {
  appointmentsOverlap,
  BLOCKS_CALENDAR,
} from './helpers/appointment-state'

const APPT_COLUMNS =
  'id, clinic_id, lead_id, patient_id, subject_name, subject_phone, ' +
  'professional_id, professional_name, room_idx, scheduled_date, start_time, ' +
  'end_time, procedure_name, consult_type, eval_type, value, payment_method, ' +
  'payment_status, status, origem, chegada_em, cancelado_em, motivo_cancelamento, ' +
  'no_show_em, motivo_no_show, consentimento_img, obs, recurrence_group_id, ' +
  'recurrence_index, recurrence_total, recurrence_procedure, recurrence_interval_days, ' +
  'created_at, updated_at, deleted_at'

export class AppointmentRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

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
      ? orcamentoItemsToDbShape(input.orcamentoItems)
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

  // ── Camada 8a · State machine + conflicts + aggregates + series ─────────

  /**
   * Wrapper de `appointment_change_status()` RPC (mig 72) · muda status com
   * matriz canonica + reason quando obrigatorio. NAO usar pra na_clinica
   * (use attend) ou finalizado (use finalize).
   */
  async changeStatus(
    appointmentId: string,
    newStatus: AppointmentStatus,
    reason?: string,
  ): Promise<
    RpcResult<{
      appointmentId: string
      fromStatus?: AppointmentStatus
      toStatus?: AppointmentStatus
      idempotentSkip?: boolean
      status?: AppointmentStatus
    }>
  > {
    const { data, error } = await this.supabase.rpc('appointment_change_status', {
      p_appointment_id: appointmentId,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRpcResult<any>(data)
  }

  /**
   * Verifica conflitos de horario antes de criar/editar appointment.
   *
   * Retorna 3 tipos de conflito (vazio = OK):
   *   - professional · prof ja tem appt no horario sobrepondo
   *   - room · sala ja ocupada
   *   - patient · paciente (lead OU patient) ja tem appt no horario
   *
   * Caller passa `excludeId` quando esta editando appt existente (nao
   * conflita consigo mesmo).
   *
   * Filtra appointments com status que BLOQUEIAM calendario
   * (cancelado/no_show/finalizado liberam slot).
   */
  async checkConflicts(
    clinicId: string,
    candidate: {
      scheduledDate: string
      startTime: string
      endTime: string
      professionalId?: string | null
      roomIdx?: number | null
      leadId?: string | null
      patientId?: string | null
    },
    excludeId?: string,
  ): Promise<{
    professional: AppointmentDTO[]
    room: AppointmentDTO[]
    patient: AppointmentDTO[]
  }> {
    // Busca todos os appts do dia que poderiam conflitar (1 query)
    const { data } = await this.supabase
      .from('appointments')
      .select(APPT_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('scheduled_date', candidate.scheduledDate)
      .is('deleted_at', null)

    const sameDay = ((data ?? []) as unknown[]).map(mapAppointmentRow)

    // Filtra: status que bloqueia + nao eh o proprio (excludeId)
    const eligible = sameDay.filter(
      (a) =>
        a.id !== excludeId &&
        BLOCKS_CALENDAR.has(a.status as AppointmentStatus),
    )

    // Reuse helper appointmentsOverlap pra cada candidato
    const overlap = (a: AppointmentDTO) =>
      appointmentsOverlap(
        { startTime: candidate.startTime, endTime: candidate.endTime },
        { startTime: a.startTime, endTime: a.endTime },
      )

    const professional = candidate.professionalId
      ? eligible.filter(
          (a) => a.professionalId === candidate.professionalId && overlap(a),
        )
      : []

    const room =
      candidate.roomIdx != null
        ? eligible.filter((a) => a.roomIdx === candidate.roomIdx && overlap(a))
        : []

    const patient = (() => {
      if (candidate.patientId) {
        return eligible.filter(
          (a) => a.patientId === candidate.patientId && overlap(a),
        )
      }
      if (candidate.leadId) {
        return eligible.filter(
          (a) => a.leadId === candidate.leadId && overlap(a),
        )
      }
      return []
    })()

    return { professional, room, patient }
  }

  /**
   * KPIs agregados pra dashboard da agenda.
   *
   * Filtra por scheduledDate range · 6 KPIs em 1 query (count by status).
   */
  async aggregates(
    clinicId: string,
    range: { startDate: string; endDate: string },
  ): Promise<{
    total: number
    agendado: number
    confirmado: number
    finalizado: number
    cancelado: number
    noShow: number
    bloqueado: number
    revenueTotal: number
    revenuePaid: number
  }> {
    const { data } = await this.supabase
      .from('appointments')
      .select('status, value, payment_status')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('scheduled_date', range.startDate)
      .lte('scheduled_date', range.endDate)

    const rows = (data ?? []) as Array<{
      status: string
      value: number | string | null
      payment_status: string | null
    }>

    let agendado = 0
    let confirmado = 0
    let finalizado = 0
    let cancelado = 0
    let noShow = 0
    let bloqueado = 0
    let revenueTotal = 0
    let revenuePaid = 0

    for (const r of rows) {
      const v = Number(r.value ?? 0)
      revenueTotal += v
      if (r.payment_status === 'pago') revenuePaid += v

      switch (r.status) {
        case 'agendado':
        case 'aguardando_confirmacao':
        case 'pre_consulta':
          agendado++
          break
        case 'confirmado':
        case 'aguardando':
        case 'na_clinica':
        case 'em_consulta':
        case 'em_atendimento':
          confirmado++
          break
        case 'finalizado':
          finalizado++
          break
        case 'cancelado':
        case 'remarcado':
          cancelado++
          break
        case 'no_show':
          noShow++
          break
        case 'bloqueado':
          bloqueado++
          break
      }
    }

    return {
      total: rows.length,
      agendado,
      confirmado,
      finalizado,
      cancelado,
      noShow,
      bloqueado,
      revenueTotal,
      revenuePaid,
    }
  }

  /**
   * Distribuicao de appointments por status atual · para dashboard health
   * (admin-only). Sem range · todos os appts nao-deletados da clinica.
   *
   * Cada status retorna count exato (group by). Usado pra detectar:
   *   - Volume anormal de no_show / cancelado (sinal de problema operacional)
   *   - Appts presos em estado intermediario (na_clinica/em_consulta de
   *     dias passados sem ter ido pra finalizado)
   */
  async statusDistribution(clinicId: string): Promise<Record<string, number>> {
    const { data } = await this.supabase
      .from('appointments')
      .select('status')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    const dist: Record<string, number> = {}
    for (const r of (data ?? []) as Array<{ status: string }>) {
      dist[r.status] = (dist[r.status] ?? 0) + 1
    }
    return dist
  }

  /**
   * Cria N appointments em sequencia (recurrence series).
   *
   * Compartilham `recurrence_group_id` (uuid gerado aqui) · cada appt tem
   * `recurrence_index` (1..N) e `recurrence_total` setado.
   * Datas calculadas: `firstDate` + `intervalDays` * (i-1).
   *
   * Retorna array de DTOs criados (em ordem) · loop sequencial pra detectar
   * conflitos por appt e parar (ou aceitar partial). Default: para no
   * primeiro erro · caller decide se faz cleanup.
   *
   * Pra serie sem conflict check, caller passa `skipConflictCheck=true`.
   */
  async createSeries(
    clinicId: string,
    base: CreateAppointmentInput,
    series: {
      firstDate: string // YYYY-MM-DD
      intervalDays: number
      total: number
      recurrenceProcedure?: string
    },
    opts: { skipConflictCheck?: boolean } = {},
  ): Promise<{
    created: AppointmentDTO[]
    failed: Array<{ index: number; date: string; error: string }>
  }> {
    if (series.total < 1 || series.total > 52) {
      throw new Error('createSeries · total must be 1..52')
    }
    if (series.intervalDays < 1 || series.intervalDays > 365) {
      throw new Error('createSeries · intervalDays must be 1..365')
    }

    const groupId = uuidv4()
    const created: AppointmentDTO[] = []
    const failed: Array<{ index: number; date: string; error: string }> = []

    const firstD = new Date(`${series.firstDate}T00:00:00.000Z`)

    for (let i = 1; i <= series.total; i++) {
      const d = new Date(firstD)
      d.setUTCDate(d.getUTCDate() + (i - 1) * series.intervalDays)
      const scheduledDate = d.toISOString().slice(0, 10)

      // Conflict check opcional · caller decide
      if (!opts.skipConflictCheck) {
        const conflicts = await this.checkConflicts(clinicId, {
          scheduledDate,
          startTime: base.startTime,
          endTime: base.endTime,
          professionalId: base.professionalId,
          roomIdx: null,
          leadId: base.leadId,
          patientId: base.patientId,
        })
        const hasConflict =
          conflicts.professional.length > 0 ||
          conflicts.patient.length > 0
        if (hasConflict) {
          failed.push({ index: i, date: scheduledDate, error: 'conflict' })
          continue
        }
      }

      const item = await this.create(clinicId, {
        ...base,
        scheduledDate,
        recurrenceGroupId: groupId,
        recurrenceIndex: i,
        recurrenceTotal: series.total,
        recurrenceProcedure: series.recurrenceProcedure ?? base.procedureName,
        recurrenceIntervalDays: series.intervalDays,
      })

      if (!item) {
        failed.push({ index: i, date: scheduledDate, error: 'insert_failed' })
        continue
      }
      created.push(item)
    }

    return { created, failed }
  }

  /**
   * Cria slot bloqueado (block time · almoco/ferias/manutencao etc).
   * Sem subject (lead_id=null, patient_id=null) · status=bloqueado · obs
   * carrega o motivo do bloqueio.
   *
   * chk_appt_subject_xor permite: se status=bloqueado, ambos NULL OK.
   */
  async createBlockTime(
    clinicId: string,
    input: {
      scheduledDate: string
      startTime: string
      endTime: string
      professionalId?: string | null
      reason: string // BlockReason ou texto
      obs?: string | null
    },
  ): Promise<AppointmentDTO | null> {
    return this.create(clinicId, {
      subjectName: `Bloqueado · ${input.reason}`,
      subjectPhone: null,
      leadId: null,
      patientId: null,
      professionalId: input.professionalId ?? null,
      professionalName: '',
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      endTime: input.endTime,
      procedureName: input.reason,
      status: 'bloqueado',
      origem: 'manual',
      obs: input.obs ?? input.reason,
    })
  }
}
