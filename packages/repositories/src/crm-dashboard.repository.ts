/**
 * CrmDashboardRepository · CRM_PHASE_LEGACY.PORT.DASHBOARDS.
 *
 * Read-only aggregates para o dashboard CRM (/crm/dashboard).
 * Combina dados de várias tabelas/views v2:
 *   - appointments (agenda, status, profissional)
 *   - leads (funnel + lifecycle)
 *   - perdidos (recuperação)
 *   - orcamentos (ativo/draft)
 *   - patients (resultado final)
 *   - professional_profiles (segmentação)
 *
 * ZERO mutação · ZERO call provider · ZERO row em wa_outbox.
 *
 * Decisão arquitetural (port LEGACY):
 *   - Não copiar `sdr.js` literal · regrar usando status canônicos v2.
 *   - localStorage do legacy é descartado · filtros via searchParams.
 *   - Métricas derivadas (taxa, etc) são calculadas no caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CrmDashboardRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

export interface CrmDashboardFilters extends CrmDashboardRange {
  professionalId?: string | null
  origem?: string | null
}

export interface CrmDashboardSummary {
  leads: {
    total: number
    ativo: number
    perdido: number
    recuperacao: number
    arquivado: number
  }
  leadsByPhase: Record<string, number>
  appointments: {
    total: number
    agendado: number
    confirmado: number
    naClinica: number
    emAtendimento: number
    finalizado: number
    cancelado: number
    noShow: number
    remarcado: number
    bloqueado: number
  }
  patients: number
  orcamentos: {
    total: number
    draft: number
    aprovado: number
    fechado: number
    expirado: number
    cancelado: number
  }
  recovery: {
    perdidosTotal: number
    perdidosRecoverable: number
    perdidosRecovered: number
    perdidosDiscarded: number
    workflowOpen: number
    workflowOverdue: number
  }
  rates: {
    /** lead → agendamento (cobertura): appts agendados / leads no período */
    pctAgendamento: number
    /** agendado → comparecimento: appts compareceram (na_clinica+em_atendimento+finalizado) / appts agendados */
    pctComparecimento: number
    /** comparecimento → finalização: appts finalizados / appts compareceram */
    pctFinalizacao: number
    /** appts no_show / appts agendados */
    pctNoShow: number
    /** appts cancelado / appts agendados */
    pctCancelamento: number
  }
}

export interface CrmDashboardByProfessional {
  professionalId: string
  displayName: string
  specialty: string | null
  total: number
  agendado: number
  confirmado: number
  finalizado: number
  cancelado: number
  noShow: number
  bloqueado: number
}

export interface CrmDashboardFunnel {
  totalLeads: number
  agendado: number
  compareceu: number
  paciente: number
  orcamento: number
  perdido: number
  recuperado: number
}

export interface CrmDashboardOperationalLists {
  upcomingAppointments: Array<{
    id: string
    scheduledDate: string
    startTime: string
    subjectName: string | null
    professionalId: string | null
    professionalName: string | null
    status: string
  }>
  leadsWithoutAppointment: Array<{
    id: string
    name: string
    phone: string | null
    phase: string
    updatedAt: string
  }>
  recoveryOverdue: Array<{
    workflowId: string | null
    sourceType: string
    displayName: string | null
    stage: string
    priority: string
    nextActionAt: string | null
  }>
  recentOrcamentos: Array<{
    id: string
    leadId: string | null
    patientId: string | null
    status: string
    total: number | null
    createdAt: string
  }>
}

const APPT_BLOCKED_PROF_STATUSES = [
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
  'na_clinica',
  'em_atendimento',
  'finalizado',
  'remarcado',
  'cancelado',
  'no_show',
  'bloqueado',
] as const

function safePct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0
  return Math.round((numerator / denominator) * 100)
}

export class CrmDashboardRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * KPI summary completo · 1 dashboard payload.
   * Filtros: período obrigatório, profissional opcional, origem opcional.
   */
  async getSummary(
    clinicId: string,
    filters: CrmDashboardFilters,
  ): Promise<CrmDashboardSummary> {
    // Appointments no período (single query)
    let apptQ = this.supabase
      .from('appointments')
      .select('status, professional_id, origem')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('scheduled_date', filters.startDate)
      .lte('scheduled_date', filters.endDate)
    if (filters.professionalId) apptQ = apptQ.eq('professional_id', filters.professionalId)
    if (filters.origem) apptQ = apptQ.eq('origem', filters.origem)
    const { data: apptData } = await apptQ

    const apptRows = (apptData ?? []) as Array<{
      status: string
      professional_id: string | null
      origem: string | null
    }>

    const apptCounts = {
      total: apptRows.length,
      agendado: 0,
      confirmado: 0,
      naClinica: 0,
      emAtendimento: 0,
      finalizado: 0,
      cancelado: 0,
      noShow: 0,
      remarcado: 0,
      bloqueado: 0,
    }
    for (const r of apptRows) {
      switch (r.status) {
        case 'agendado':
        case 'aguardando_confirmacao':
          apptCounts.agendado++
          break
        case 'confirmado':
        case 'aguardando':
          apptCounts.confirmado++
          break
        case 'na_clinica':
          apptCounts.naClinica++
          break
        case 'em_atendimento':
          apptCounts.emAtendimento++
          break
        case 'finalizado':
          apptCounts.finalizado++
          break
        case 'cancelado':
          apptCounts.cancelado++
          break
        case 'no_show':
          apptCounts.noShow++
          break
        case 'remarcado':
          apptCounts.remarcado++
          break
        case 'bloqueado':
          apptCounts.bloqueado++
          break
      }
    }

    // Leads (não filtrados por período · contagem global ativa)
    const { data: leadData } = await this.supabase
      .from('leads')
      .select('phase, lifecycle_status')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    const leadRows = (leadData ?? []) as Array<{
      phase: string
      lifecycle_status: string | null
    }>

    const leadsByPhase: Record<string, number> = {}
    const leadsLifecycle = {
      total: leadRows.length,
      ativo: 0,
      perdido: 0,
      recuperacao: 0,
      arquivado: 0,
    }
    for (const r of leadRows) {
      leadsByPhase[r.phase] = (leadsByPhase[r.phase] ?? 0) + 1
      switch (r.lifecycle_status) {
        case 'ativo':
          leadsLifecycle.ativo++
          break
        case 'perdido':
          leadsLifecycle.perdido++
          break
        case 'recuperacao':
          leadsLifecycle.recuperacao++
          break
        case 'arquivado':
          leadsLifecycle.arquivado++
          break
      }
    }

    // Patients total
    const { count: patientsCount } = await this.supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .eq('status', 'active')

    // Orcamentos (todos · status dist)
    const { data: orcamentoData } = await this.supabase
      .from('orcamentos')
      .select('status')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    const orcamentoRows = (orcamentoData ?? []) as Array<{ status: string }>
    const orcamentos = {
      total: orcamentoRows.length,
      draft: 0,
      aprovado: 0,
      fechado: 0,
      expirado: 0,
      cancelado: 0,
    }
    for (const r of orcamentoRows) {
      switch (r.status) {
        case 'draft':
          orcamentos.draft++
          break
        case 'aprovado':
          orcamentos.aprovado++
          break
        case 'fechado':
          orcamentos.fechado++
          break
        case 'expirado':
          orcamentos.expirado++
          break
        case 'cancelado':
          orcamentos.cancelado++
          break
      }
    }

    // Recovery counts (perdidos + workflow)
    const [perdidosResp, workflowResp] = await Promise.all([
      this.supabase
        .from('perdidos')
        .select('is_recoverable, recovered_at')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null),
      this.supabase
        .from('commercial_recovery_workflow_view')
        .select('status, next_action_overdue')
        .eq('clinic_id', clinicId),
    ])
    const perdidosRows = (perdidosResp.data ?? []) as Array<{
      is_recoverable: boolean
      recovered_at: string | null
    }>
    const workflowRows = (workflowResp.data ?? []) as Array<{
      status: string
      next_action_overdue: boolean
    }>
    const recovery = {
      perdidosTotal: perdidosRows.length,
      perdidosRecoverable: 0,
      perdidosRecovered: 0,
      perdidosDiscarded: 0,
      workflowOpen: 0,
      workflowOverdue: 0,
    }
    for (const p of perdidosRows) {
      if (p.recovered_at) recovery.perdidosRecovered++
      else if (p.is_recoverable === false) recovery.perdidosDiscarded++
      else recovery.perdidosRecoverable++
    }
    for (const w of workflowRows) {
      if (w.status === 'aberto') recovery.workflowOpen++
      if (w.next_action_overdue) recovery.workflowOverdue++
    }

    const compareceu = apptCounts.naClinica + apptCounts.emAtendimento + apptCounts.finalizado
    const rates = {
      pctAgendamento: safePct(apptCounts.agendado, leadsLifecycle.ativo || leadsLifecycle.total),
      pctComparecimento: safePct(compareceu, apptCounts.agendado + compareceu + apptCounts.noShow + apptCounts.cancelado),
      pctFinalizacao: safePct(apptCounts.finalizado, compareceu),
      pctNoShow: safePct(apptCounts.noShow, apptCounts.total),
      pctCancelamento: safePct(apptCounts.cancelado, apptCounts.total),
    }

    return {
      leads: leadsLifecycle,
      leadsByPhase,
      appointments: apptCounts,
      patients: patientsCount ?? 0,
      orcamentos,
      recovery,
      rates,
    }
  }

  /**
   * Aggregates por profissional · 1 row por professional_id no período.
   * Inclui profissionais ativos sem appointments (linha com zeros).
   */
  async getByProfessional(
    clinicId: string,
    range: CrmDashboardRange,
  ): Promise<CrmDashboardByProfessional[]> {
    const [{ data: profs }, { data: appts }] = await Promise.all([
      this.supabase
        .from('professional_profiles')
        .select('id, display_name, specialty, is_active, agenda_enabled')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .eq('agenda_enabled', true)
        .order('display_name', { ascending: true }),
      this.supabase
        .from('appointments')
        .select('status, professional_id')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .gte('scheduled_date', range.startDate)
        .lte('scheduled_date', range.endDate)
        .not('professional_id', 'is', null),
    ])

    const profRows = (profs ?? []) as Array<{
      id: string
      display_name: string | null
      specialty: string | null
    }>
    const apptRows = (appts ?? []) as Array<{
      status: string
      professional_id: string
    }>

    const map = new Map<string, CrmDashboardByProfessional>()
    for (const p of profRows) {
      map.set(p.id, {
        professionalId: p.id,
        displayName: p.display_name ?? 'Sem nome',
        specialty: p.specialty,
        total: 0,
        agendado: 0,
        confirmado: 0,
        finalizado: 0,
        cancelado: 0,
        noShow: 0,
        bloqueado: 0,
      })
    }

    for (const a of apptRows) {
      let row = map.get(a.professional_id)
      if (!row) {
        // Profissional fora do pool ativo · cria placeholder
        row = {
          professionalId: a.professional_id,
          displayName: 'Profissional (inativo)',
          specialty: null,
          total: 0,
          agendado: 0,
          confirmado: 0,
          finalizado: 0,
          cancelado: 0,
          noShow: 0,
          bloqueado: 0,
        }
        map.set(a.professional_id, row)
      }
      row.total++
      switch (a.status) {
        case 'agendado':
        case 'aguardando_confirmacao':
          row.agendado++
          break
        case 'confirmado':
        case 'aguardando':
        case 'na_clinica':
        case 'em_atendimento':
          row.confirmado++
          break
        case 'finalizado':
          row.finalizado++
          break
        case 'cancelado':
        case 'remarcado':
          row.cancelado++
          break
        case 'no_show':
          row.noShow++
          break
        case 'bloqueado':
          row.bloqueado++
          break
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }

  /**
   * Funil por phase de lead (snapshot atual · todos leads ativos).
   * Phase canon: lead, agendado, paciente, orcamento (perdido vive em
   * perdidos table com lifecycle).
   *
   * Métrica `recuperado`: perdidos com recovered_at presente.
   */
  async getFunnel(clinicId: string): Promise<CrmDashboardFunnel> {
    const { data: leadData } = await this.supabase
      .from('leads')
      .select('phase')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .eq('lifecycle_status', 'ativo')

    const leadRows = (leadData ?? []) as Array<{ phase: string }>

    const funnel: CrmDashboardFunnel = {
      totalLeads: leadRows.length,
      agendado: 0,
      compareceu: 0,
      paciente: 0,
      orcamento: 0,
      perdido: 0,
      recuperado: 0,
    }

    for (const r of leadRows) {
      switch (r.phase) {
        case 'agendado':
          funnel.agendado++
          break
        case 'paciente':
          funnel.paciente++
          break
        case 'orcamento':
          funnel.orcamento++
          break
      }
    }

    // Compareceu = appointments com chegada_em IS NOT NULL (cross-ref por phase
    // não cobre · pois lead vai pra "paciente" só após lead_to_paciente).
    const { count: compareceuCount } = await this.supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .not('chegada_em', 'is', null)
    funnel.compareceu = compareceuCount ?? 0

    // Perdidos (snapshot total · não em período pq snapshot da pirâmide)
    const { count: perdidosCount } = await this.supabase
      .from('perdidos')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
    funnel.perdido = perdidosCount ?? 0

    const { count: recuperadoCount } = await this.supabase
      .from('perdidos')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .not('recovered_at', 'is', null)
    funnel.recuperado = recuperadoCount ?? 0

    return funnel
  }

  /**
   * Listas operacionais auxiliares · cards laterais do dashboard.
   * Limit fixos pra não inflar query.
   */
  async getOperationalLists(
    clinicId: string,
    range: CrmDashboardRange,
  ): Promise<CrmDashboardOperationalLists> {
    const todayIso = new Date().toISOString().slice(0, 10)

    const [upcomingResp, leadsNoApptResp, recoveryOverdueResp, recentOrcamentosResp] =
      await Promise.all([
        // 1. Próximos appointments (do range, futuro, status não terminal)
        this.supabase
          .from('appointments')
          .select(
            'id, scheduled_date, start_time, subject_name, professional_id, professional_name, status',
          )
          .eq('clinic_id', clinicId)
          .is('deleted_at', null)
          .gte('scheduled_date', todayIso)
          .lte('scheduled_date', range.endDate)
          .in('status', ['agendado', 'aguardando_confirmacao', 'confirmado', 'aguardando'])
          .order('scheduled_date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(10),

        // 2. Leads ativos sem appointment recente (phase=lead, lifecycle=ativo, ordenados por updated_at)
        this.supabase
          .from('leads')
          .select('id, name, phone, phase, updated_at')
          .eq('clinic_id', clinicId)
          .is('deleted_at', null)
          .eq('lifecycle_status', 'ativo')
          .eq('phase', 'lead')
          .order('updated_at', { ascending: false })
          .limit(10),

        // 3. Recovery workflow com next_action_at vencido
        this.supabase
          .from('commercial_recovery_workflow_view')
          .select(
            'workflow_id, source_type, display_name, stage, priority, next_action_at, next_action_overdue',
          )
          .eq('clinic_id', clinicId)
          .eq('next_action_overdue', true)
          .order('next_action_at', { ascending: true })
          .limit(10),

        // 4. Orçamentos recentes
        this.supabase
          .from('orcamentos')
          .select('id, lead_id, patient_id, status, total, created_at')
          .eq('clinic_id', clinicId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

    return {
      upcomingAppointments: (upcomingResp.data ?? []).map(
        (r: {
          id: string
          scheduled_date: string
          start_time: string
          subject_name: string | null
          professional_id: string | null
          professional_name: string | null
          status: string
        }) => ({
          id: r.id,
          scheduledDate: r.scheduled_date,
          startTime: r.start_time,
          subjectName: r.subject_name,
          professionalId: r.professional_id,
          professionalName: r.professional_name,
          status: r.status,
        }),
      ),
      leadsWithoutAppointment: (leadsNoApptResp.data ?? []).map(
        (r: { id: string; name: string | null; phone: string | null; phase: string; updated_at: string }) => ({
          id: r.id,
          name: r.name ?? 'Sem nome',
          phone: r.phone,
          phase: r.phase,
          updatedAt: r.updated_at,
        }),
      ),
      recoveryOverdue: (recoveryOverdueResp.data ?? []).map(
        (r: {
          workflow_id: string | null
          source_type: string
          display_name: string | null
          stage: string
          priority: string
          next_action_at: string | null
        }) => ({
          workflowId: r.workflow_id,
          sourceType: r.source_type,
          displayName: r.display_name,
          stage: r.stage,
          priority: r.priority,
          nextActionAt: r.next_action_at,
        }),
      ),
      recentOrcamentos: (recentOrcamentosResp.data ?? []).map(
        (r: {
          id: string
          lead_id: string | null
          patient_id: string | null
          status: string
          total: number | string | null
          created_at: string
        }) => ({
          id: r.id,
          leadId: r.lead_id,
          patientId: r.patient_id,
          status: r.status,
          total: r.total == null ? null : Number(r.total),
          createdAt: r.created_at,
        }),
      ),
    }
  }
}

// Expor termos canon para uso externo (validation/types)
export const CRM_DASHBOARD_APPT_STATUSES = APPT_BLOCKED_PROF_STATUSES
