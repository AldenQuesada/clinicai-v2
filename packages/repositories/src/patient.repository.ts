/**
 * PatientRepository · acesso canonico a tabela `patients` (mig 61).
 *
 * Multi-tenant ADR-028. Boundary do ADR-005 · retorna PatientDTO em
 * camelCase, nunca row bruto snake.
 *
 * IMPORTANTE: criar paciente NUNCA e via INSERT direto · paciente nasce
 * sempre via `lead_to_paciente()` RPC (chamada por LeadRepository.toPaciente
 * ou por appointment_finalize com outcome=paciente). Esse repository expoe
 * leitura + UPDATE de campos editaveis (nome, contato, endereco, notas) +
 * soft-delete · NUNCA `create()` direto.
 *
 * UUID e compartilhado com leads.id (modelo excludente forte ADR-001).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mapPatientRow,
  type PatientDTO,
  type PatientStatus,
  type UpdatePatientInput,
} from './types'

const PATIENT_COLUMNS =
  'id, clinic_id, name, phone, email, cpf, rg, birth_date, sex, address_json, ' +
  'status, assigned_to, notes, total_procedures, total_revenue, ' +
  'first_procedure_at, last_procedure_at, source_lead_phase_at, source_lead_meta, ' +
  'created_at, updated_at, deleted_at'

export class PatientRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<PatientDTO | null> {
    const { data } = await this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapPatientRow(data) : null
  }

  /**
   * Busca por telefone (variants ja normalizados pelo caller via
   * phoneVariants do package utils). Retorna o mais recente.
   */
  async findByPhoneVariants(
    clinicId: string,
    variants: string[],
  ): Promise<PatientDTO | null> {
    if (!variants.length) return null
    const { data } = await this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? mapPatientRow(data) : null
  }

  /**
   * Lista pacientes da clinica · paginada, sort customizavel, filtros.
   *
   * Sort default: updated_at desc. Camada 7 expande pra sort por name,
   * total_revenue, last_procedure_at via opt `sort`.
   *
   * Filtros: status, assignedTo, createdSince, lastProcedureSince,
   * search (busca por nome/phone/email/cpf · ilike).
   */
  async list(
    clinicId: string,
    opts: {
      limit?: number
      offset?: number
      status?: PatientStatus
      assignedTo?: string | null
      /** ISO datetime · created_at >= since */
      createdSince?: string
      /** ISO datetime · created_at <= until */
      createdUntil?: string
      /** ISO datetime · last_procedure_at >= since (filtra retorno recente) */
      lastProcedureSince?: string
      /** Substring · ilike em name OR phone OR email OR cpf */
      search?: string
      /** Coluna pra ordenar · default 'updated_at' */
      sort?:
        | 'name'
        | 'updated_at'
        | 'created_at'
        | 'total_revenue'
        | 'last_procedure_at'
        | 'first_procedure_at'
      /** asc/desc · default desc */
      sortDir?: 'asc' | 'desc'
    } = {},
  ): Promise<PatientDTO[]> {
    const limit = Math.min(opts.limit ?? 50, 500)
    const offset = opts.offset ?? 0
    const sortCol = opts.sort ?? 'updated_at'
    const sortDir = opts.sortDir ?? 'desc'

    let q = this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order(sortCol, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (opts.status) q = q.eq('status', opts.status)
    if (opts.assignedTo !== undefined && opts.assignedTo !== null) {
      q = q.eq('assigned_to', opts.assignedTo)
    }
    if (opts.createdSince) q = q.gte('created_at', opts.createdSince)
    if (opts.createdUntil) q = q.lte('created_at', opts.createdUntil)
    if (opts.lastProcedureSince) {
      q = q.gte('last_procedure_at', opts.lastProcedureSince)
    }
    if (opts.search) {
      const pattern = `%${opts.search.trim()}%`
      q = q.or(
        `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},cpf.ilike.${pattern}`,
      )
    }

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapPatientRow)
  }

  /**
   * Conta pacientes com filtros (mesmo shape do `list`) · usado pra mostrar
   * total na paginacao + "X pacientes encontrados" quando filtros ativos.
   */
  async countWithFilters(
    clinicId: string,
    opts: {
      status?: PatientStatus
      assignedTo?: string | null
      createdSince?: string
      createdUntil?: string
      lastProcedureSince?: string
      search?: string
    } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    if (opts.status) q = q.eq('status', opts.status)
    if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo)
    if (opts.createdSince) q = q.gte('created_at', opts.createdSince)
    if (opts.createdUntil) q = q.lte('created_at', opts.createdUntil)
    if (opts.lastProcedureSince) {
      q = q.gte('last_procedure_at', opts.lastProcedureSince)
    }
    if (opts.search) {
      const pattern = `%${opts.search.trim()}%`
      q = q.or(
        `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},cpf.ilike.${pattern}`,
      )
    }

    const { count } = await q
    return count ?? 0
  }

  /**
   * Busca textual basica · ilike em name/phone/email/cpf. UI usa pra search
   * box. Limite baixo (20) pra evitar full-table scan.
   */
  async search(clinicId: string, query: string, limit = 20): Promise<PatientDTO[]> {
    const q = query.trim()
    if (q.length < 2) return []
    const pattern = `%${q}%`
    const { data } = await this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .or(
        `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},cpf.ilike.${pattern}`,
      )
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit, 100))
    return ((data ?? []) as unknown[]).map(mapPatientRow)
  }

  /**
   * Conta pacientes ativos da clinica · widget dashboard.
   */
  async count(
    clinicId: string,
    opts: { status?: PatientStatus } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
    if (opts.status) q = q.eq('status', opts.status)
    const { count } = await q
    return count ?? 0
  }

  /**
   * KPIs agregados da clinica · usado pelo header da lista de pacientes
   * (Camada 7). 8 metricas em 2 queries (1 select + 1 head count) + 1 client
   * sum. Os 2 KPIs de retorno (count com appointments futuros + dias medio)
   * ficam pra Camada 8 quando AppointmentRepository expor essas queries.
   *
   * `churnDays` define o cutoff: pacientes ativos sem ultimo procedimento
   * em N dias = churn. Default 90 dias (3 meses).
   */
  async aggregates(
    clinicId: string,
    opts: { churnDays?: number } = {},
  ): Promise<{
    total: number
    active: number
    churn: number
    churnPct: number
    revenueTotal: number
    proceduresTotal: number
    ticketAvg: number
  }> {
    const churnDays = opts.churnDays ?? 90
    const churnCutoff = new Date(
      Date.now() - churnDays * 24 * 60 * 60 * 1000,
    ).toISOString()

    const [allRows, totalCount, activeCount] = await Promise.all([
      // Sums client-side (Supabase nao tem SUM via PostgREST)
      this.supabase
        .from('patients')
        .select('total_revenue, total_procedures, last_procedure_at, status')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null),
      this.count(clinicId),
      this.count(clinicId, { status: 'active' }),
    ])

    let revenueTotal = 0
    let proceduresTotal = 0
    let churn = 0
    for (const row of (allRows.data ?? []) as Array<{
      total_revenue?: number | string
      total_procedures?: number | string
      last_procedure_at?: string | null
      status?: string
    }>) {
      revenueTotal += Number(row.total_revenue ?? 0)
      proceduresTotal += Number(row.total_procedures ?? 0)
      // Churn: ativo + (sem procedure OR ultimo procedure < cutoff)
      if (row.status === 'active') {
        const lastAt = row.last_procedure_at
        if (!lastAt || lastAt < churnCutoff) churn++
      }
    }

    const ticketAvg = proceduresTotal > 0 ? revenueTotal / proceduresTotal : 0
    const churnPct = activeCount > 0 ? (churn / activeCount) * 100 : 0

    return {
      total: totalCount,
      active: activeCount,
      churn,
      churnPct,
      revenueTotal,
      proceduresTotal,
      ticketAvg,
    }
  }

  /**
   * Lista pra Export CSV · sem paginacao. Limite hard 5000 (5x mais que UI
   * pagina) · clinica acima disso usa export por mes/segmento. Otimizacao
   * futura: streaming/paginated download.
   */
  async listAllForExport(
    clinicId: string,
    opts: { status?: PatientStatus } = {},
  ): Promise<PatientDTO[]> {
    let q = this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(5000)

    if (opts.status) q = q.eq('status', opts.status)

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapPatientRow)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Atualiza campos editaveis. NAO inclui agregados financeiros
   * (total_procedures/total_revenue/first_procedure_at/last_procedure_at) ·
   * esses sao denormalizados, atualizados por `appointment_finalize` ou
   * `recomputeAggregates` quando preciso.
   *
   * Retorna DTO atualizado ou null se nao bateu.
   */
  async update(id: string, input: UpdatePatientInput): Promise<PatientDTO | null> {
    const row: Record<string, unknown> = {}
    if (input.name !== undefined) row.name = input.name
    if (input.phone !== undefined) row.phone = input.phone
    if (input.email !== undefined) row.email = input.email
    if (input.cpf !== undefined) row.cpf = input.cpf
    if (input.rg !== undefined) row.rg = input.rg
    if (input.birthDate !== undefined) row.birth_date = input.birthDate
    if (input.sex !== undefined) row.sex = input.sex
    if (input.addressJson !== undefined) row.address_json = input.addressJson
    if (input.status !== undefined) row.status = input.status
    if (input.assignedTo !== undefined) row.assigned_to = input.assignedTo
    if (input.notes !== undefined) row.notes = input.notes

    if (Object.keys(row).length === 0) return this.getById(id)

    const { data, error } = await this.supabase
      .from('patients')
      .update(row)
      .eq('id', id)
      .select(PATIENT_COLUMNS)
      .single()
    if (error || !data) return null
    return mapPatientRow(data)
  }

  /**
   * Soft-delete · seta deleted_at=now(). Hard-delete so via admin (RLS DELETE
   * policy bloqueia · service_role bypassa).
   *
   * NOTA: appointments com patient_id = id ficam com FK ON DELETE SET NULL
   * (mig 62) · viram orfaos (lead_id e patient_id nulls). UI deve avisar
   * caller antes de soft-deletar paciente com appts ativos.
   */
  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('patients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }

  /**
   * Atualiza agregados financeiros (total_revenue + last_procedure_at)
   * incrementalmente apos appointment_finalize sem outcome=paciente.
   * `lead_to_paciente()` ja seta na promocao inicial · esse helper cobre
   * appointments subsequentes (paciente recorrente).
   */
  async addRevenueAfterAppointment(
    id: string,
    amount: number,
    when: string,
  ): Promise<boolean> {
    if (!Number.isFinite(amount) || amount < 0) return false

    // Busca atual + soma client-side (1 ida + 1 volta · ok pra fluxo low-rate)
    const { data: row } = await this.supabase
      .from('patients')
      .select('total_revenue, total_procedures, first_procedure_at, last_procedure_at')
      .eq('id', id)
      .maybeSingle()

    if (!row) return false

    const r = row as {
      total_revenue?: number | string
      total_procedures?: number | string
      first_procedure_at?: string | null
      last_procedure_at?: string | null
    }

    const newRevenue = Number(r.total_revenue ?? 0) + amount
    const newCount = Number(r.total_procedures ?? 0) + 1
    const firstAt = r.first_procedure_at ?? when
    const lastAt =
      !r.last_procedure_at || when > r.last_procedure_at ? when : r.last_procedure_at

    const { error } = await this.supabase
      .from('patients')
      .update({
        total_revenue: newRevenue,
        total_procedures: newCount,
        first_procedure_at: firstAt,
        last_procedure_at: lastAt,
      })
      .eq('id', id)
    return !error
  }
}
