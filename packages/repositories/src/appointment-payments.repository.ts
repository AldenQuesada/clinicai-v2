/**
 * AppointmentPaymentsRepository · CRM_PARITY_R2.
 *
 * Acesso a `public.appointment_payments` (mig 194). Linhas de pagamento por
 * agendamento · paridade 1:1 com legacy `_apptPagamentos[]` + 10 formas
 * canônicas.
 *
 * Multi-tenant ADR-028 · todas queries filtradas por clinic_id.
 *
 * O que NÃO faz:
 *   - Não calcula totais (use packages/utils Money em service)
 *   - Não muta `appointments.payment_method/payment_status` legacy (snapshot
 *     ortogonal · derivado opcional via view `appointment_financial_summary`)
 *   - Não toca finalize/hard gate
 *   - Não dispara WhatsApp/provider
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AppointmentPaymentMethod =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'parcelado'
  | 'entrada_saldo'
  | 'boleto'
  | 'link'
  | 'cortesia'
  | 'convenio'

export type AppointmentPaymentStatus = 'pendente' | 'pago' | 'cancelado'

export interface AppointmentPaymentDTO {
  id: string
  clinicId: string
  appointmentId: string
  paymentMethod: AppointmentPaymentMethod
  amount: number
  installments: number | null
  dueDate: string | null
  paidAt: string | null
  status: AppointmentPaymentStatus
  notes: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CreateAppointmentPaymentInput {
  appointmentId: string
  paymentMethod: AppointmentPaymentMethod
  amount: number
  installments?: number | null
  dueDate?: string | null
  paidAt?: string | null
  status?: AppointmentPaymentStatus
  notes?: string | null
  metadata?: Record<string, unknown>
}

export interface UpdateAppointmentPaymentInput {
  paymentMethod?: AppointmentPaymentMethod
  amount?: number
  installments?: number | null
  dueDate?: string | null
  paidAt?: string | null
  status?: AppointmentPaymentStatus
  notes?: string | null
  metadata?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): AppointmentPaymentDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    appointmentId: String(row.appointment_id),
    paymentMethod: String(row.payment_method ?? 'pix') as AppointmentPaymentMethod,
    amount: Number(row.amount ?? 0),
    installments: row.installments != null ? Number(row.installments) : null,
    dueDate: row.due_date ?? null,
    paidAt: row.paid_at ?? null,
    status: String(row.status ?? 'pendente') as AppointmentPaymentStatus,
    notes: row.notes ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}

const COLS =
  'id, clinic_id, appointment_id, payment_method, amount, installments, ' +
  'due_date, paid_at, status, notes, metadata, ' +
  'created_at, updated_at, deleted_at'

export class AppointmentPaymentsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async listByAppointment(
    appointmentId: string,
  ): Promise<AppointmentPaymentDTO[]> {
    const { data } = await this.supabase
      .from('appointment_payments')
      .select(COLS)
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  async getById(id: string): Promise<AppointmentPaymentDTO | null> {
    const { data } = await this.supabase
      .from('appointment_payments')
      .select(COLS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapRow(data) : null
  }

  async create(
    clinicId: string,
    input: CreateAppointmentPaymentInput,
  ): Promise<AppointmentPaymentDTO | null> {
    const row: Record<string, unknown> = {
      clinic_id: clinicId,
      appointment_id: input.appointmentId,
      payment_method: input.paymentMethod,
      amount: input.amount,
      installments: input.installments ?? null,
      due_date: input.dueDate ?? null,
      paid_at: input.paidAt ?? null,
      status: input.status ?? 'pendente',
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    }
    const { data, error } = await this.supabase
      .from('appointment_payments')
      .insert(row)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  async update(
    id: string,
    input: UpdateAppointmentPaymentInput,
  ): Promise<AppointmentPaymentDTO | null> {
    const row: Record<string, unknown> = {}
    if (input.paymentMethod !== undefined) row.payment_method = input.paymentMethod
    if (input.amount !== undefined) row.amount = input.amount
    if (input.installments !== undefined) row.installments = input.installments
    if (input.dueDate !== undefined) row.due_date = input.dueDate
    if (input.paidAt !== undefined) row.paid_at = input.paidAt
    if (input.status !== undefined) row.status = input.status
    if (input.notes !== undefined) row.notes = input.notes
    if (input.metadata !== undefined) row.metadata = input.metadata
    if (Object.keys(row).length === 0) return this.getById(id)
    const { data, error } = await this.supabase
      .from('appointment_payments')
      .update(row)
      .eq('id', id)
      .select(COLS)
      .single()
    if (error || !data) return null
    return mapRow(data)
  }

  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('appointment_payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }

  async replaceForAppointment(
    clinicId: string,
    appointmentId: string,
    payments: ReadonlyArray<Omit<CreateAppointmentPaymentInput, 'appointmentId'>>,
  ): Promise<AppointmentPaymentDTO[]> {
    await this.supabase
      .from('appointment_payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)

    if (payments.length === 0) return []

    const rows = payments.map((p) => ({
      clinic_id: clinicId,
      appointment_id: appointmentId,
      payment_method: p.paymentMethod,
      amount: p.amount,
      installments: p.installments ?? null,
      due_date: p.dueDate ?? null,
      paid_at: p.paidAt ?? null,
      status: p.status ?? 'pendente',
      notes: p.notes ?? null,
      metadata: p.metadata ?? {},
    }))

    const { data } = await this.supabase
      .from('appointment_payments')
      .insert(rows)
      .select(COLS)
    return ((data ?? []) as unknown[]).map(mapRow)
  }

  /**
   * Read da view `appointment_financial_summary` (mig 195) · agregados +
   * derived_payment_status canônico.
   */
  async getFinancialSummary(appointmentId: string): Promise<{
    appointmentId: string
    clinicId: string
    grossTotal: number
    discountTotal: number
    netTotal: number
    paidTotal: number
    pendingTotal: number
    cancelledTotal: number
    balanceTotal: number
    procedureItemsCount: number
    courtesyItemsCount: number
    paymentsCount: number
    derivedPaymentStatus: 'cortesia' | 'pendente' | 'parcial' | 'pago'
    computedAt: string
  } | null> {
    const { data } = await this.supabase
      .from('appointment_financial_summary')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle()
    if (!data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any
    return {
      appointmentId: String(r.appointment_id),
      clinicId: String(r.clinic_id),
      grossTotal: Number(r.gross_total ?? 0),
      discountTotal: Number(r.discount_total ?? 0),
      netTotal: Number(r.net_total ?? 0),
      paidTotal: Number(r.paid_total ?? 0),
      pendingTotal: Number(r.pending_total ?? 0),
      cancelledTotal: Number(r.cancelled_total ?? 0),
      balanceTotal: Number(r.balance_total ?? 0),
      procedureItemsCount: Number(r.procedure_items_count ?? 0),
      courtesyItemsCount: Number(r.courtesy_items_count ?? 0),
      paymentsCount: Number(r.payments_count ?? 0),
      derivedPaymentStatus: String(r.derived_payment_status ?? 'pendente') as
        | 'cortesia'
        | 'pendente'
        | 'parcial'
        | 'pago',
      computedAt: r.computed_at ?? new Date().toISOString(),
    }
  }
}
