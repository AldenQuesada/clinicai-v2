/**
 * ProfessionalProfilesRepository · acesso a `professional_profiles`.
 *
 * Tabela canonica do clinic-dashboard com dados dos profissionais da clinica
 * (medicos/staff). 2 use-cases distintos:
 *
 *   - `listActiveWithPhone()` · profissionais ativos com phone valido
 *     (autorizado a falar com a Mira via WhatsApp).
 *   - `listActiveForAgenda(clinicId)` · profissionais ativos com agenda
 *     habilitada (CRM_PHASE_2AUX.2 · usado no wizard de agendamento como
 *     FK first-class).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface ProfessionalProfileDTO {
  id: string
  displayName: string
  specialty: string | null
  isActive: boolean
  phone: string | null
}

/**
 * CRM_PHASE_2AUX.2 · DTO compacto pra dropdown da agenda.
 *
 * Sem filtro de phone (profissional pode não ter WhatsApp e ainda assim
 * fazer consulta presencial). Inclui `color` pra futuras visualizações
 * de calendário coloridas por profissional.
 */
export interface AgendaProfessionalDTO {
  id: string
  displayName: string
  specialty: string | null
  color: string | null
}

export class ProfessionalProfilesRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

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

  /**
   * CRM_PHASE_2AUX.2 · Lista profissionais ATIVOS com agenda HABILITADA
   * (agenda_enabled=true). Sem filtro de phone · 100% dos profissionais
   * que podem aparecer no Select do wizard de agendamento.
   *
   * Multi-tenant ADR-028 · clinic_id explicito (RLS também filtra).
   */
  async listActiveForAgenda(clinicId: string): Promise<AgendaProfessionalDTO[]> {
    const { data } = await this.supabase
      .from('professional_profiles')
      .select('id, display_name, specialty, color')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .eq('agenda_enabled', true)
      .order('display_name', { ascending: true })

    return ((data ?? []) as Array<{
      id: string
      display_name: string | null
      specialty: string | null
      color: string | null
    }>).map((p) => ({
      id: String(p.id),
      displayName: String(p.display_name ?? 'Sem nome'),
      specialty: p.specialty ?? null,
      color: p.color ?? null,
    }))
  }

  /**
   * CRM_PHASE_2AUX.2 · Busca profissional por id (escopo clinic via RLS).
   * Usado pra resolver display_name + specialty quando o appointment já
   * tem `professional_id` mas o caller precisa de detalhes.
   */
  async getById(id: string): Promise<AgendaProfessionalDTO | null> {
    const { data } = await this.supabase
      .from('professional_profiles')
      .select('id, display_name, specialty, color')
      .eq('id', id)
      .maybeSingle()

    if (!data) return null
    const p = data as { id: string; display_name: string | null; specialty: string | null; color: string | null }
    return {
      id: String(p.id),
      displayName: String(p.display_name ?? 'Sem nome'),
      specialty: p.specialty ?? null,
      color: p.color ?? null,
    }
  }
}
