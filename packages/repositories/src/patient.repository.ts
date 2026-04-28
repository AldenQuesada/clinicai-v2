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
import type { Database } from '@clinicai/supabase'
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
  constructor(private supabase: SupabaseClient<Database>) {}

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
   * Lista pacientes da clinica · paginada, ordenada por updated_at desc.
   * Filtros opcionais: status, assignedTo. Pra busca por texto livre,
   * caller usa supabase-js .ilike na coluna que precisar (futuro: full-text).
   */
  async list(
    clinicId: string,
    opts: {
      limit?: number
      offset?: number
      status?: PatientStatus
      assignedTo?: string | null
    } = {},
  ): Promise<PatientDTO[]> {
    const limit = Math.min(opts.limit ?? 50, 500)
    const offset = opts.offset ?? 0
    let q = this.supabase
      .from('patients')
      .select(PATIENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (opts.status) q = q.eq('status', opts.status)
    if (opts.assignedTo !== undefined && opts.assignedTo !== null) {
      q = q.eq('assigned_to', opts.assignedTo)
    }

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapPatientRow)
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
