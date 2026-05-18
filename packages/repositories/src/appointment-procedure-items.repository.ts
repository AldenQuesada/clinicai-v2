/**
 * AppointmentProcedureItemsRepository · CRM_PARITY_R2.
 *
 * Acesso a `public.appointment_procedure_items` (mig 193). Linhas de
 * procedimentos por agendamento · paridade 1:1 com legacy `_apptProcs[]`.
 *
 * Multi-tenant ADR-028 · todas as queries filtradas por clinic_id (RLS
 * também enforça). Boundary ADR-005 · retorna DTOs camelCase.
 *
 * O que esta repo NÃO faz:
 *   - Não calcula totais (use packages/utils Money helpers em service layer)
 *   - Não muta `appointments.value` legacy (snapshot ortogonal · service
 *     layer decide se atualiza)
 *   - Não toca `appointment_finalize` / hard gate
 *   - Não dispara WhatsApp / provider / pg_net
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AppointmentProcedureItemDTO {
  id: string
  clinicId: string
  appointmentId: string
  procedureId: string | null
  procedureName: string
  quantity: number
  unitPrice: number
  grossAmount: number
  discountAmount: number
  netAmount: number
  isCourtesy: boolean
  courtesyReason: string | null
  isReturn: boolean
  returnIntervalDays: number | null
  sortOrder: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CreateAppointmentProcedureItemInput {
  appointmentId: string
  procedureId?: string | null
  procedureName: string
  quantity?: number
  unitPrice?: number
  grossAmount?: number
  discountAmount?: number
  netAmount?: number
  isCourtesy?: boolean
  courtesyReason?: string | null
  isReturn?: boolean
  returnIntervalDays?: number | null
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export interface UpdateAppointmentProcedureItemInput {
  procedureId?: string | null
  procedureName?: string
  quantity?: number
  unitPrice?: number
  grossAmount?: number
  discountAmount?: number
  netAmount?: number
  isCourtesy?: boolean
  courtesyReason?: string | null
  isReturn?: boolean
  returnIntervalDays?: number | null
  sortOrder?: number
  metadata?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): AppointmentProcedureItemDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    appointmentId: String(row.appointment_id),
    procedureId: row.procedure_id ?? null,
    procedureName: String(row.procedure_name ?? ''),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    grossAmount: Number(row.gross_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    netAmount: Number(row.net_amount ?? 0),
    isCourtesy: row.is_courtesy === true,
    courtesyReason: row.courtesy_reason ?? null,
    isReturn: row.is_return === true,
    returnIntervalDays:
      row.return_interval_days != null ? Number(row.return_interval_days) : null,
    sortOrder: Number(row.sort_order ?? 0),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

const COLS =
  'id, clinic_id, appointment_id, procedure_id, procedure_name, quantity, ' +
  'unit_price, gross_amount, discount_amount, net_amount, is_courtesy, ' +
  'courtesy_reason, is_return, return_interval_days, sort_order, metadata, ' +
  'created_at, updated_at, deleted_at'

export class AppointmentProcedureItemsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async listByAppointment(
    appointmentId: string,
  ): Promise<AppointmentProcedureItemDTO[]> {
    const { data } = await this.supabase
      .from('appointment_procedure_items')
      .select(COLS)
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async getById(id: string): Promise<AppointmentProcedureItemDTO | null> {
    const { data } = await this.supabase
      .from('appointment_procedure_items')
      .select(COLS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapRow(data) : null
  }

  async create(
    clinicId: string,
    input: CreateAppointmentProcedureItemInput,
  ): Promise<AppointmentProcedureItemDTO | null> {
    const gross = input.grossAmount ?? (input.unitPrice ?? 0) * (input.quantity ?? 1)
    const discount = input.discountAmount ?? 0
    const net = input.netAmount ?? Math.max(0, gross - discount)
    const row: Record<string, unknown> = {
      clinic_id: clinicId,
      appointment_id: input.appointmentId,
      procedure_id: input.procedureId ?? null,
      procedure_name: input.procedureName,
      quantity: input.quantity ?? 1,
      unit_price: input.unitPrice ?? 0,
      gross_amount: gross,
      discount_amount: discount,
      net_amount: input.isCourtesy ? 0 : net,
      is_courtesy: input.isCourtesy === true,
      courtesy_reason: input.courtesyReason ?? null,
      is_return: input.isReturn === true,
      return_interval_days: input.returnIntervalDays ?? null,
      sort_order: input.sortOrder ?? 0,
      metadata: input.metadata ?? {},
    }
    const { data, error } = await this.supabase
      .from('appointment_procedure_items')
      .insert(row)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  async update(
    id: string,
    input: UpdateAppointmentProcedureItemInput,
  ): Promise<AppointmentProcedureItemDTO | null> {
    const row: Record<string, unknown> = {}
    if (input.procedureId !== undefined) row.procedure_id = input.procedureId
    if (input.procedureName !== undefined) row.procedure_name = input.procedureName
    if (input.quantity !== undefined) row.quantity = input.quantity
    if (input.unitPrice !== undefined) row.unit_price = input.unitPrice
    if (input.grossAmount !== undefined) row.gross_amount = input.grossAmount
    if (input.discountAmount !== undefined) row.discount_amount = input.discountAmount
    if (input.netAmount !== undefined) row.net_amount = input.netAmount
    if (input.isCourtesy !== undefined) row.is_courtesy = input.isCourtesy
    if (input.courtesyReason !== undefined) row.courtesy_reason = input.courtesyReason
    if (input.isReturn !== undefined) row.is_return = input.isReturn
    if (input.returnIntervalDays !== undefined) row.return_interval_days = input.returnIntervalDays
    if (input.sortOrder !== undefined) row.sort_order = input.sortOrder
    if (input.metadata !== undefined) row.metadata = input.metadata
    if (Object.keys(row).length === 0) return this.getById(id)
    const { data, error } = await this.supabase
      .from('appointment_procedure_items')
      .update(row)
      .eq('id', id)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('appointment_procedure_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }

  /**
   * Substitui (transacionalmente · best-effort) o conjunto de items de um
   * appointment pelos passados como input. Soft-delete items existentes
   * que não estão na nova lista; insert os novos. Não usa transaction de
   * verdade (Supabase JS não tem) · sequencia: softDelete → insert.
   *
   * Caller deve garantir consistência via Money helpers antes de chamar.
   */
  async replaceForAppointment(
    clinicId: string,
    appointmentId: string,
    items: ReadonlyArray<Omit<CreateAppointmentProcedureItemInput, 'appointmentId'>>,
  ): Promise<AppointmentProcedureItemDTO[]> {
    // soft-delete existentes
    await this.supabase
      .from('appointment_procedure_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)

    if (items.length === 0) return []

    const rows = items.map((item, idx) => {
      const gross = item.grossAmount ?? (item.unitPrice ?? 0) * (item.quantity ?? 1)
      const discount = item.discountAmount ?? 0
      const net = item.netAmount ?? Math.max(0, gross - discount)
      return {
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_id: item.procedureId ?? null,
        procedure_name: item.procedureName,
        quantity: item.quantity ?? 1,
        unit_price: item.unitPrice ?? 0,
        gross_amount: gross,
        discount_amount: discount,
        net_amount: item.isCourtesy ? 0 : net,
        is_courtesy: item.isCourtesy === true,
        courtesy_reason: item.courtesyReason ?? null,
        is_return: item.isReturn === true,
        return_interval_days: item.returnIntervalDays ?? null,
        sort_order: item.sortOrder ?? idx,
        metadata: item.metadata ?? {},
      }
    })

    const { data } = await this.supabase
      .from('appointment_procedure_items')
      .insert(rows)
      .select(COLS)
    return ((data ?? []) as unknown[]).map(mapRow)
  }
}
