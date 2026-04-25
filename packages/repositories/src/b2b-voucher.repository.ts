/**
 * B2BVoucherRepository · acesso a b2b_vouchers (clinic-dashboard mig 0281, 27 cols).
 *
 * issue() wraps RPC `b2b_voucher_issue(payload)` · token gerado server-side
 * (8 chars base36 + retry em colisao). Retorna { ok, id, token, valid_until }.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface B2BVoucherDTO {
  id: string
  clinicId: string
  partnershipId: string
  combo: string
  recipientName: string | null
  recipientPhone: string | null
  recipientCpf: string | null
  token: string
  validUntil: string
  status: 'issued' | 'delivered' | 'opened' | 'redeemed' | 'expired' | 'cancelled'
  issuedAt: string
  deliveredAt: string | null
  openedAt: string | null
  redeemedAt: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVoucherRow(row: any): B2BVoucherDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    combo: String(row.combo ?? ''),
    recipientName: row.recipient_name ?? null,
    recipientPhone: row.recipient_phone ?? null,
    recipientCpf: row.recipient_cpf ?? null,
    token: String(row.token ?? ''),
    validUntil: String(row.valid_until ?? ''),
    status: (row.status ?? 'issued') as B2BVoucherDTO['status'],
    issuedAt: row.issued_at ?? new Date().toISOString(),
    deliveredAt: row.delivered_at ?? null,
    openedAt: row.opened_at ?? null,
    redeemedAt: row.redeemed_at ?? null,
  }
}

export interface IssueVoucherInput {
  partnershipId: string
  combo?: string
  recipientName?: string
  recipientPhone?: string
  recipientCpf?: string
  validityDays?: number
  notes?: string
}

export class B2BVoucherRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Emite voucher novo · RPC b2b_voucher_issue gera token + valida cap mensal.
   * Retorna { ok, id, token, validUntil } ou error.
   */
  async issue(input: IssueVoucherInput): Promise<{
    ok: boolean
    id?: string
    token?: string
    validUntil?: string
    error?: string
  }> {
    const payload: Record<string, unknown> = {
      partnership_id: input.partnershipId,
    }
    if (input.combo) payload.combo = input.combo
    if (input.recipientName) payload.recipient_name = input.recipientName
    if (input.recipientPhone) payload.recipient_phone = input.recipientPhone
    if (input.recipientCpf) payload.recipient_cpf = input.recipientCpf
    if (input.validityDays != null) payload.validity_days = input.validityDays
    if (input.notes) payload.notes = input.notes

    const { data, error } = await this.supabase.rpc('b2b_voucher_issue', { p_payload: payload })
    if (error) return { ok: false, error: error.message }

    const result = data as {
      ok?: boolean
      id?: string
      token?: string
      valid_until?: string
      error?: string
    }
    return {
      ok: result?.ok === true,
      id: result?.id,
      token: result?.token,
      validUntil: result?.valid_until,
      error: result?.error,
    }
  }

  async getById(id: string): Promise<B2BVoucherDTO | null> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return data ? mapVoucherRow(data) : null
  }

  async getByToken(token: string): Promise<B2BVoucherDTO | null> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    return data ? mapVoucherRow(data) : null
  }

  async listByPartnership(partnershipId: string, limit = 50): Promise<B2BVoucherDTO[]> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('issued_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapVoucherRow)
  }

  /**
   * Conta vouchers emitidos no mes corrente · usado pra checar voucher_monthly_cap.
   */
  async countMonthlyByPartnership(partnershipId: string): Promise<number> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { count } = await this.supabase
      .from('b2b_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('partnership_id', partnershipId)
      .gte('issued_at', monthStart.toISOString())
    return count ?? 0
  }

  async updateStatus(id: string, status: B2BVoucherDTO['status']): Promise<void> {
    await this.supabase.from('b2b_vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }
}
