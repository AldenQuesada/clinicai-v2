/**
 * AppointmentRepository · acesso canonico a tabela `appointments` (mig 62).
 *
 * Multi-tenant ADR-028 · clinic_id e arg explicito em qualquer metodo que
 * toca varias linhas. Boundary do ADR-005 · retorna AppointmentDTO em
 * camelCase, nunca row bruto snake.
 *
 * Modelo excludente forte (ADR-001): subject dual `lead_id` ou `patient_id`
 * (CHECK chk_appt_subject_xor garante exatamente um · exceto bloqueado).
 *
 * Contrato canônico Phase 1C (mig 150 + mig 191):
 *   - `appointment_attend` muda APENAS appointments.status / chegada_em.
 *     NÃO altera leads.phase (compareceu deixou de ser phase canônica).
 *   - `appointment_finalize` é a única RPC que muta leads.phase, via sub-RPCs
 *     `lead_to_paciente` ou `lead_to_orcamento` conforme outcome.
 *   - CRUD direto (este repository) fica em UPDATEs simples de
 *     data/horario/profissional/notas · NÃO toca leads.
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
  'professional_id, professional_name, room_idx, room_id, scheduled_date, start_time, ' +
  'end_time, procedure_id, procedure_name, consult_type, eval_type, value, payment_method, ' +
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
      // CRM_PARITY_R1 (mig 190) · FK canônica · null fica sem sala vinculada.
      // room_idx legacy permanece intocado nesta mig (backfill em Round 5).
      room_id: input.roomId ?? null,
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      end_time: input.endTime,
      procedure_id: input.procedureId ?? null,
      procedure_name: input.procedureName ?? '',
      consult_type: input.consultType ?? null,
      eval_type: input.evalType ?? null,
      value: input.value ?? 0,
      // CRM_PARITY_PATCH_0A · paridade legado · payment_method texto livre
      // (vide PAYMENT_METHODS em legacy/js/agenda-smart.constants.js). `update()`
      // ja gravava esta coluna · agora `create()` tambem persiste quando
      // o wizard envia.
      payment_method: input.paymentMethod ?? null,
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
    // CRM_PARITY_R1 (mig 190) · FK opcional · permite atualizar/limpar sala.
    if (input.roomId !== undefined) row.room_id = input.roomId
    if (input.procedureId !== undefined) row.procedure_id = input.procedureId
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
   * Cancela appointment via RPC `appointment_change_status` (Fase 1D ·
   * 2026-05-11). Respeita matriz canônica + grava timestamps server-side
   * (`cancelado_em`, `motivo_cancelamento`). Motivo obrigatório (RPC
   * rejeita com `reason_required` se faltar · CHECK
   * `chk_appt_cancelled_consistency` no DB).
   *
   * NÃO mexe na phase do lead · regra: cancelar 1 appt não reverte phase
   * (pode ter outro). Caller decide se reverte phase quando todos os
   * appts estão cancelados.
   */
  async cancel(id: string, motivo: string): Promise<AppointmentDTO | null> {
    if (!motivo || !motivo.trim()) return null
    const result = await this.changeStatus(id, 'cancelado', motivo.trim())
    if (!result.ok) return null
    return this.getById(id)
  }

  /**
   * No-show via RPC `appointment_change_status` (Fase 1D · 2026-05-11) ·
   * paciente não apareceu. Respeita matriz + grava timestamps server-side
   * (`no_show_em`, `motivo_no_show`). Motivo obrigatório
   * (`chk_appt_noshow_consistency`).
   */
  async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
    if (!motivo || !motivo.trim()) return null
    const result = await this.changeStatus(id, 'no_show', motivo.trim())
    if (!result.ok) return null
    return this.getById(id)
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
   * Wrapper de `appointment_attend()` RPC · move appointment para `na_clinica`
   * (chegada do paciente). Idempotente: pode ser chamado 2x sem duplicar audit.
   *
   * **Contrato canônico Phase 1C (mig 150 · 2026-05-10):**
   * `leads.phase` permanece em `agendado`. `appointment_attend` NÃO promove
   * phase para `compareceu` (compareceu deixou de ser phase válida na mig 150
   * que reduziu o enum para `{lead, agendado, paciente, orcamento}`). A
   * promoção de phase só acontece em `appointment_finalize` conforme o
   * outcome (paciente|orcamento|paciente_orcamento) ou em `lead_lost`
   * (lifecycle_status, não phase).
   *
   * Bloqueia se appt está cancelado/no_show/bloqueado (retorna
   * `invalid_status_for_attend`).
   *
   * Hot-fix mig 191 (CRM_PARITY_R1_PHASE_C1 · 2026-05-18) recriou a função
   * SQL para remover o UPDATE residual em `leads.phase` herdado da mig 65.
   * O wrapper aqui mantém a assinatura · zero mudança de runtime no TS.
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
   * Mig 161 (CRM_PHASE_2G) · cria alertas internos quando paciente chega.
   * Cria 2 rows em appointment_internal_alerts (professional + secretaria)
   * via RPC SECURITY DEFINER. Idempotente · ON CONFLICT skip silencioso.
   * NÃO envia WhatsApp. NÃO depende de inbox_notifications. Worker 71 OFF.
   *
   * Chamado por attendAppointmentAction após RPC appointment_attend()
   * retornar ok=true. Falha do alerta NÃO bloqueia o fluxo de chegada
   * (best-effort · logamos warning).
   */
  async createArrivalInternalAlert(
    appointmentId: string,
  ): Promise<{ ok: boolean; createdCount?: number; error?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_arrival_internal_alert',
      { p_appointment_id: appointmentId },
    )
    if (error) {
      return { ok: false, error: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      createdCount: result.created_count ?? 0,
      error: result.reason ?? undefined,
    }
  }

  /**
   * Wrapper de `appointment_finalize()` RPC · finaliza consulta + roteia
   * outcome (3 clinicos · PATCH_0C_FINALIZE_BACKEND_GUARD 2026-05-17):
   *   - paciente: chama lead_to_paciente (promove)
   *   - orcamento: chama lead_to_orcamento (cria orcamento + soft-delete lead)
   *   - paciente_orcamento: chama ambos
   *
   * PERDA COMERCIAL NAO PASSA POR AQUI · use `lead_lost(reason)` RPC dedicado
   * (chamado por markLeadLostAction). Backend mig 151 ainda aceita
   * p_outcome='perdido' por compat · TS bloqueia desde aqui · mig staged em
   * clinic-dashboard bloqueia SQL nivel (RAISE EXCEPTION).
   *
   * Sub-RPC pode falhar mesmo com appt finalizado (estado terminal valido) ·
   * UI deve checar `subCall` no result quando ok=true mas tem warning.
   */
  async finalize(input: AppointmentFinalizeRpcInput): Promise<AppointmentFinalizeResult> {
    // PATCH_0C_FINALIZE_BACKEND_GUARD · defensive runtime guard.
    // TS ja restringe outcome a 3 valores · este check eh ultima linha
    // caso caller bypasse tipos (any/JSON dynamic).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((input.outcome as any) === 'perdido') {
      return {
        ok: false,
        error: 'invalid_outcome',
        detail:
          'appointment_finalize nao aceita perdido · use lead_lost RPC',
      } as AppointmentFinalizeResult
    }
    const itemsForDb = input.orcamentoItems
      ? orcamentoItemsToDbShape(input.orcamentoItems)
      : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc('appointment_finalize', {
      p_appointment_id: input.appointmentId,
      p_outcome: input.outcome,
      p_value: input.value ?? null,
      p_payment_status: input.paymentStatus ?? null,
      p_notes: input.notes ?? null,
      p_lost_reason: input.lostReason ?? null,
      p_orcamento_items: itemsForDb,
      p_orcamento_subtotal: input.orcamentoSubtotal ?? null,
      p_orcamento_discount: input.orcamentoDiscount ?? 0,
      // CRM_PHASE_2I.1 · hard gate override
      p_clinical_override: input.clinicalOverride ?? false,
      p_clinical_override_reason: input.clinicalOverrideReason ?? null,
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
      /** Legacy index-based · preservado durante deprecation period. */
      roomIdx?: number | null
      /** CRM_PARITY_R1 (mig 190) · FK canônica · prefere este se ambos forem fornecidos. */
      roomId?: string | null
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

    // CRM_PARITY_R1 · conflict por sala usa room_id (FK) prioritariamente.
    // Fallback em room_idx legacy durante deprecation period (Rounds 5-7).
    const room = (() => {
      if (candidate.roomId) {
        return eligible.filter((a) => a.roomId === candidate.roomId && overlap(a))
      }
      if (candidate.roomIdx != null) {
        return eligible.filter((a) => a.roomIdx === candidate.roomIdx && overlap(a))
      }
      return []
    })()

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

      // CRM_PHASE_2H.1: `pre_consulta` e `em_consulta` removidos (zumbis não-canônicos).
      switch (r.status) {
        case 'agendado':
        case 'aguardando_confirmacao':
          agendado++
          break
        case 'confirmado':
        case 'aguardando':
        case 'na_clinica':
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
   * CRM_PACIENTES_KPIS · Retorna appointments futuros (scheduled_date > today)
   * de pacientes ativos, com status ∈ "futuros agendáveis"
   * ({agendado, aguardando_confirmacao, confirmado}). Read-only.
   *
   * Faz JOIN inner com `patients` (patient_id NOT NULL) pra recuperar
   * `patients.name + status + last_procedure_at` numa query · usado pelos
   * 4 KPIs de Retorno da /crm/pacientes:
   *   1. count distinct patient_id (pacientes com retorno agendado)
   *   2. total active patients - count distinct (sem retorno)
   *   3. AVG(scheduledDate - lastProcedureAt) das rows aqui retornadas
   *   4. ordena por scheduled_date asc → top N pra UI "Próximos retornos"
   *
   * Ordem natural: scheduled_date ASC, start_time ASC. Caller pode passar
   * `limit` pra paginar (default 200 · suficiente pra cobrir top 10 +
   * derivação dos counts numa clinica pequena/média).
   *
   * Filtra `patient.status = 'active'` (somente pacientes em carteira
   * ativa). Pacientes blocked/deceased/inactive não contam pra "retorno".
   *
   * `nowDate` é caller-provided pra permitir testes determinísticos.
   * Default = today (UTC, YYYY-MM-DD).
   */
  async findUpcomingReturnsForActivePatients(
    clinicId: string,
    opts: { nowDate?: string; limit?: number } = {},
  ): Promise<
    Array<{
      appointmentId: string
      patientId: string
      patientName: string
      patientLastProcedureAt: string | null
      scheduledDate: string
      startTime: string
      professionalName: string
    }>
  > {
    const nowDate = opts.nowDate ?? new Date().toISOString().slice(0, 10)
    const limit = Math.min(opts.limit ?? 200, 1000)

    // PostgREST nested resource select · join via FK appointments.patient_id
    // → patients.id (mig 62). Filtra patient.status='active' via foreign
    // table operator (PostgREST 12+ syntax: `patients!inner(...)` + .eq
    // on nested col).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('appointments')
      .select(
        'id, patient_id, scheduled_date, start_time, professional_name, ' +
          'patients!inner(name, status, last_procedure_at)',
      )
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .not('patient_id', 'is', null)
      .gt('scheduled_date', nowDate)
      .in('status', ['agendado', 'aguardando_confirmacao', 'confirmado'])
      .eq('patients.status', 'active')
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit)

    if (error || !data) return []

    return (data as unknown as Array<{
      id: string
      patient_id: string
      scheduled_date: string
      start_time: string
      professional_name: string | null
      patients: {
        name: string | null
        status: string
        last_procedure_at: string | null
      }
    }>).map((r) => ({
      appointmentId: r.id,
      patientId: r.patient_id,
      patientName: r.patients?.name ?? '',
      patientLastProcedureAt: r.patients?.last_procedure_at ?? null,
      scheduledDate: r.scheduled_date,
      startTime: r.start_time,
      professionalName: r.professional_name ?? '',
    }))
  }

  /**
   * CRM_FUNCTIONALITY_MULTI_AGENT Lote 3 (mig 876) · wrapper read-only do RPC
   * `appointment_finalize_day(p_date, p_professional_id)`. Alimenta a modal
   * "Finalizar Dia" da agenda · puramente informativo · zero mutation no DB.
   *
   * Retorna:
   *   - `summary` · contagens por status (total + 9 buckets canônicos mig 62)
   *   - `openItems` · appointments pendentes/na_clinica/em_atendimento
   *      ordenados por start_time ASC (limit 500 client-safe)
   *
   * Caller decide UX (modal info-only). NÃO finaliza appointments
   * automaticamente · operador precisa finalizar 1-a-1 via
   * `appointment_finalize()` ou marcar no-show via `appointment_change_status`.
   *
   * `professionalId` opcional · null = todos os profissionais da clinica.
   */
  async getDayReport(
    date: string,
    professionalId: string | null = null,
  ): Promise<
    | {
        ok: true
        date: string
        professionalId: string | null
        summary: {
          total: number
          finalizados: number
          pendentes: number
          naClinica: number
          emAtendimento: number
          cancelados: number
          noShow: number
          bloqueados: number
          remarcados: number
        }
        openItems: Array<{
          id: string
          subjectName: string
          startTime: string
          status: AppointmentStatus
          professionalName: string
        }>
      }
    | { ok: false; error: string }
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_finalize_day',
      {
        p_date: date,
        p_professional_id: professionalId,
      },
    )

    if (error) {
      return { ok: false, error: error.message }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data as any) ?? {}
    if (r.ok !== true) {
      return { ok: false, error: r.error ?? 'rpc_returned_not_ok' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (r.summary ?? {}) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawOpen = (r.openItems ?? []) as Array<any>

    return {
      ok: true,
      date: r.date ?? date,
      professionalId: (r.professional_id ?? professionalId) || null,
      summary: {
        total: Number(s.total ?? 0),
        finalizados: Number(s.finalizados ?? 0),
        pendentes: Number(s.pendentes ?? 0),
        naClinica: Number(s.na_clinica ?? 0),
        emAtendimento: Number(s.em_atendimento ?? 0),
        cancelados: Number(s.cancelados ?? 0),
        noShow: Number(s.no_show ?? 0),
        bloqueados: Number(s.bloqueados ?? 0),
        remarcados: Number(s.remarcados ?? 0),
      },
      openItems: rawOpen.map((o) => ({
        id: String(o.id),
        subjectName: String(o.subjectName ?? ''),
        startTime: String(o.startTime ?? ''),
        status: o.status as AppointmentStatus,
        professionalName: String(o.professionalName ?? ''),
      })),
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
   * BLOCO 2.2A · Cria série recorrente ATOMICAMENTE via RPC
   * `appt_create_series` (mig V1 20260700000483 · preservada na mig V2 153).
   *
   * Atomicidade: a RPC é uma plpgsql function que itera o array `p_appts`,
   * chama `appt_upsert(item)` em cada e dá RAISE se qualquer um falhar — o
   * RAISE aborta a transação implícita da function, revertendo TODOS os
   * inserts anteriores. All-or-nothing real.
   *
   * Caminho da UI nova de recorrência (BLOCO 2.2). Substitui o loop
   * client-side `createSeries()` (best-effort com tolerância parcial) que
   * continua disponível pra callers legacy que aceitam série parcial.
   *
   * Conflict-check é responsabilidade do caller · idealmente faz pré-check
   * em todas as N datas ANTES de chamar este método. A RPC interna NÃO
   * valida conflito · só faz INSERTs em sequência.
   *
   * Payload por item · formato camelCase legacy que `appt_upsert` aceita
   * (ver mig V2 153, helper `_appt_upsert_one`):
   *   id, pacienteId, pacienteNome, pacientePhone,
   *   _professionalId, profissionalNome,
   *   data, horaInicio, horaFim,
   *   procedimento, tipoConsulta, tipoAvaliacao, valor,
   *   status, origem, obs,
   *   recurrenceGroupId, recurrenceIndex, recurrenceTotal,
   *   recurrenceProcedure, recurrenceIntervalDays
   *
   * NOTA: a RPC `appt_upsert` é legacy writer (não grava `procedure_id` FK
   * canônica · só `procedure_name` snapshot). Trade-off aceito pra ganhar
   * atomicidade · pendência ADR: futuro patch da RPC pra aceitar `procedure_id`.
   */
  async createSeriesAtomic(
    clinicId: string,
    base: CreateAppointmentInput,
    series: {
      firstDate: string // YYYY-MM-DD
      intervalDays: number
      total: number
      recurrenceProcedure?: string
    },
  ): Promise<
    | { ok: true; createdCount: number; groupId: string; appointmentIds: string[] }
    | { ok: false; error: string }
  > {
    if (series.total < 1 || series.total > 100) {
      return { ok: false, error: 'total_out_of_range_1_100' }
    }
    if (series.intervalDays < 1 || series.intervalDays > 365) {
      return { ok: false, error: 'interval_days_out_of_range_1_365' }
    }
    if (!base.leadId && !base.patientId) {
      return { ok: false, error: 'subject_required' }
    }

    const groupId = uuidv4()
    const subjectId = base.leadId ?? base.patientId
    const firstD = new Date(`${series.firstDate}T00:00:00.000Z`)

    const items: Array<Record<string, unknown>> = []
    for (let i = 1; i <= series.total; i++) {
      const d = new Date(firstD)
      d.setUTCDate(d.getUTCDate() + (i - 1) * series.intervalDays)
      const scheduledDate = d.toISOString().slice(0, 10)

      items.push({
        // id é gerado pela RPC se ausente · não passa pra evitar collision
        pacienteId: subjectId,
        pacienteNome: base.subjectName ?? '',
        pacientePhone: base.subjectPhone ?? null,
        _professionalId: base.professionalId ?? null,
        profissionalNome: base.professionalName ?? '',
        data: scheduledDate,
        horaInicio: base.startTime,
        horaFim: base.endTime,
        procedimento: base.procedureName ?? '',
        tipoConsulta: base.consultType ?? null,
        tipoAvaliacao: base.evalType ?? null,
        valor: base.value ?? 0,
        status: base.status ?? 'agendado',
        origem: base.origem ?? null,
        obs: base.obs ?? null,
        recurrenceGroupId: groupId,
        recurrenceIndex: i,
        recurrenceTotal: series.total,
        recurrenceProcedure: series.recurrenceProcedure ?? base.procedureName ?? null,
        recurrenceIntervalDays: series.intervalDays,
      })
    }

    const { data, error } = await this.supabase.rpc('appt_create_series', {
      p_appts: items as unknown as never,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    // RPC retorna { ok, count, ids[], group_ids[] } · ver mig V1 20260700000483
    const result = (data ?? {}) as {
      ok?: boolean
      count?: number
      ids?: string[]
      group_ids?: string[]
    }

    if (!result.ok) {
      return { ok: false, error: 'rpc_returned_not_ok' }
    }

    // Multi-tenant: `clinicId` é informacional pra log do caller · a RPC
    // resolve `app_clinic_id()` via JWT internamente. Suppressed unused warn.
    void clinicId

    return {
      ok: true,
      createdCount: result.count ?? items.length,
      groupId,
      appointmentIds: result.ids ?? [],
    }
  }

  /**
   * Cria N appointments em sequencia (recurrence series). BEST-EFFORT ·
   * tolerância parcial · não atômico. Mantido pra callers legacy.
   *
   * Para nova UI de recorrência (BLOCO 2.2/2.2A), prefira `createSeriesAtomic`
   * que usa RPC `appt_create_series` (all-or-nothing real).
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

  // ── CRM_PHASE_2I · Clinical (anamnese + consent intra-consulta) ─────────────

  /**
   * RPC `appointment_anamnesis_upsert` (mig 166) · cria ou atualiza ficha
   * clínica do appointment. Idempotente · 1 ativa por appointment.
   *
   * Distinto de `anamnesis_responses` (sistema pré-consulta · paciente
   * preenche via link público). Este fluxo é INTRA-consulta · profissional
   * preenche durante atendimento.
   */
  async upsertAnamnesis(
    appointmentId: string,
    payload: Record<string, unknown>,
  ): Promise<{
    ok: boolean
    appointmentId?: string
    anamnesisId?: string
    status?: 'draft' | 'complete' | 'archived'
    action?: 'created' | 'updated'
    error?: string
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_anamnesis_upsert',
      { p_appointment_id: appointmentId, p_payload: payload },
    )
    if (error) return { ok: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data as any) ?? {}
    return {
      ok: r.ok === true,
      appointmentId: r.appointment_id,
      anamnesisId: r.anamnesis_id,
      status: r.status,
      action: r.action,
      error: r.error,
    }
  }

  /**
   * RPC `appointment_anamnesis_mark_complete` (mig 166) · marca ficha como
   * complete. Idempotente · retornar `idempotent_skip=true` se já estava.
   */
  async markAnamnesisComplete(appointmentId: string): Promise<{
    ok: boolean
    anamnesisId?: string
    status?: string
    completedAt?: string
    idempotentSkip?: boolean
    error?: string
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_anamnesis_mark_complete',
      { p_appointment_id: appointmentId },
    )
    if (error) return { ok: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data as any) ?? {}
    return {
      ok: r.ok === true,
      anamnesisId: r.anamnesis_id,
      status: r.status,
      completedAt: r.completed_at,
      idempotentSkip: r.idempotent_skip,
      error: r.error,
    }
  }

  /**
   * RPC `appointment_consent_accept` (mig 166) · registra aceite de
   * consentimento informado intra-consulta. Idempotente por
   * (appointment, term_key, term_version).
   */
  async acceptConsent(input: {
    appointmentId: string
    termKey: string
    termVersion: string
    termTitle: string
    signerName: string
    payload?: Record<string, unknown>
  }): Promise<{
    ok: boolean
    consentId?: string
    accepted?: boolean
    acceptedAt?: string
    signerName?: string
    idempotentSkip?: boolean
    error?: string
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_consent_accept',
      {
        p_appointment_id: input.appointmentId,
        p_term_key: input.termKey,
        p_term_version: input.termVersion,
        p_term_title: input.termTitle,
        p_signer_name: input.signerName,
        p_payload: input.payload ?? {},
      },
    )
    if (error) return { ok: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data as any) ?? {}
    return {
      ok: r.ok === true,
      consentId: r.consent_id,
      accepted: r.accepted,
      acceptedAt: r.accepted_at,
      signerName: r.signer_name,
      idempotentSkip: r.idempotent_skip,
      error: r.error,
    }
  }

  /**
   * RPC `appointment_clinical_gate_status` (mig 166) · consolida estado
   * clínico do appointment (anamnese + consent). Retorna `gate_status`
   * ∈ {ok, warning}. Decisão 2I: warning-only · hard gate fica para 2I.1.
   */
  async getClinicalGateStatus(appointmentId: string): Promise<{
    ok: boolean
    appointmentId?: string
    anamnesis?: {
      id: string | null
      status: 'none' | 'draft' | 'complete' | 'archived'
      completedAt: string | null
    }
    consent?: {
      signed: boolean
      rows: number
      legacyConsentimentoImg: string | null
    }
    gateStatus?: 'ok' | 'warning'
    appointmentStatus?: string
    error?: string
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'appointment_clinical_gate_status',
      { p_appointment_id: appointmentId },
    )
    if (error) return { ok: false, error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (data as any) ?? {}
    if (r.ok !== true) return { ok: false, error: r.error }
    return {
      ok: true,
      appointmentId: r.appointment_id,
      anamnesis: {
        id: r.anamnesis?.id ?? null,
        status: r.anamnesis?.status ?? 'none',
        completedAt: r.anamnesis?.completed_at ?? null,
      },
      consent: {
        signed: r.consent?.signed === true,
        rows: r.consent?.rows ?? 0,
        legacyConsentimentoImg: r.consent?.legacy_consentimento_img ?? null,
      },
      gateStatus: r.gate_status,
      appointmentStatus: r.appointment_status,
    }
  }
}
