/**
 * ProfessionalProfilesRepository · acesso a `professional_profiles`.
 *
 * Tabela canonica do clinic-dashboard com dados dos profissionais da clinica
 * (medicos/staff). Usado pela UI Configuracoes > Profissionais como dropdown
 * do modal de cadastro · espelha `listProfessionals()` do mira.repository.js.
 *
 * Filtra apenas ativos com phone valido (10+ digitos) — UI registra phone
 * autorizado a falar com a Mira via WhatsApp.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProfessionalProfileDTO {
  id: string
  displayName: string
  specialty: string | null
  isActive: boolean
  phone: string | null
}

export class ProfessionalProfilesRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista profissionais ativos com phone valido (whatsapp/telefone/phone).
   */
  async listActiveWithPhone(): Promise<ProfessionalProfileDTO[]> {
    const { data } = await this.supabase
      .from('professional_profiles')
      .select('id, display_name, specialty, is_active, phone, telefone, whatsapp')
      .eq('is_active', true)
      .order('display_name', { ascending: true })

    return ((data ?? []) as Array<{
      id: string
      display_name: string
      specialty?: string | null
      is_active: boolean
      phone?: string | null
      telefone?: string | null
      whatsapp?: string | null
    }>)
      .map((p) => {
        const raw = String(p.whatsapp || p.telefone || p.phone || '').trim()
        const digits = raw.replace(/\D/g, '')
        return {
          id: String(p.id),
          displayName: String(p.display_name ?? 'Sem nome'),
          specialty: p.specialty ?? null,
          isActive: p.is_active === true,
          phone: digits.length >= 10 ? digits : null,
        }
      })
      .filter((p) => p.phone !== null)
  }
}
