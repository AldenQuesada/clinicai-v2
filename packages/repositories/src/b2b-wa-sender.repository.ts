/**
 * B2BWASenderRepository · b2b_partnership_wa_senders (clinic-dashboard mig 0370).
 *
 * Whitelist de phones autorizados a falar com a Mira como "parceira". Trigger
 * auto-whitelist (clinicai-v2 mig 800-03) popula essa tabela quando partnership
 * vai pra status='active'. Tambem suporta CRUD manual via admin UI (P1).
 *
 * Match por last8 (BR phone com/sem 9 inicial · evita colisao com last11 quando
 * Evolution entrega LID sem o nono digito).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface B2BWASenderDTO {
  id: string
  clinicId: string
  partnershipId: string
  phone: string
  phoneLast8: string
  role: 'owner' | 'operator'
  active: boolean
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSenderRow(row: any): B2BWASenderDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    phone: String(row.phone ?? ''),
    phoneLast8: String(row.phone_last8 ?? ''),
    role: (row.role ?? 'owner') as B2BWASenderDTO['role'],
    active: row.active !== false,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function last8(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8)
}

export class B2BWASenderRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Gate principal · verifica se o phone esta na whitelist ativa.
   * Match por last8 (cobre BR phone com/sem 9 inicial).
   */
  async findByPhone(clinicId: string, phone: string): Promise<B2BWASenderDTO | null> {
    const phoneLast8 = last8(phone)
    if (!phoneLast8) return null

    const { data } = await this.supabase
      .from('b2b_partnership_wa_senders')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .eq('phone_last8', phoneLast8)
      .limit(1)
      .maybeSingle()

    return data ? mapSenderRow(data) : null
  }

  /**
   * Insere phone na whitelist. ON CONFLICT activates re-existente.
   */
  async addToWhitelist(input: {
    clinicId: string
    partnershipId: string
    phone: string
    role?: 'owner' | 'operator'
  }): Promise<B2BWASenderDTO | null> {
    const phoneClean = String(input.phone).replace(/\D/g, '')
    const { data } = await this.supabase
      .from('b2b_partnership_wa_senders')
      .upsert(
        {
          clinic_id: input.clinicId,
          partnership_id: input.partnershipId,
          phone: phoneClean,
          role: input.role ?? 'owner',
          active: true,
        },
        { onConflict: 'clinic_id,phone_last8,partnership_id' },
      )
      .select()
      .single()
    return data ? mapSenderRow(data) : null
  }

  async removeFromWhitelist(id: string): Promise<void> {
    await this.supabase
      .from('b2b_partnership_wa_senders')
      .update({ active: false })
      .eq('id', id)
  }

  async listByPartnership(partnershipId: string): Promise<B2BWASenderDTO[]> {
    const { data } = await this.supabase
      .from('b2b_partnership_wa_senders')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('created_at', { ascending: false })
    return (data ?? []).map(mapSenderRow)
  }
}
