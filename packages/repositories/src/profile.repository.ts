/**
 * ProfileRepository · acesso a `profiles` (RLS auto-escopa pelo user_id no JWT).
 *
 * Profiles tem `clinic_id` direto (consolidado · sem clinic_user_memberships).
 * Cada profile = 1:1 com auth.users(id). Schema: id, clinic_id, role,
 * first_name, last_name, avatar_url, is_active.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface ProfileDTO {
  id: string
  firstName: string | null
  role: string | null
}

/**
 * Membro completo da clinic · usado pelo P-12 (assignment + presence)
 * pra montar dropdowns e exibir avatar/nome em multi-atendente.
 */
export interface ClinicMemberDTO {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string
  role: string | null
  avatarUrl: string | null
  isActive: boolean
}

export class ProfileRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getById(userId: string): Promise<ProfileDTO | null> {
    const { data } = await this.supabase
      .from('profiles')
      .select('id, first_name, role')
      .eq('id', userId)
      .maybeSingle()

    if (!data) return null
    return {
      id: String(data.id),
      firstName: data.first_name ?? null,
      role: data.role ?? null,
    }
  }

  /**
   * P-12 · lista membros ATIVOS da clinic pra dropdown de assignment +
   * presenca. RLS sobre profiles ja exige clinic_id = app_clinic_id() AND
   * is_active · este filtro explicito e defensivo · order por nome.
   */
  async listByClinic(clinicId: string): Promise<ClinicMemberDTO[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.supabase as any)
      .from('profiles')
      .select('id, first_name, last_name, role, avatar_url, is_active')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('first_name', { ascending: true })

    if (!data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      const first = (row.first_name ?? '').trim()
      const last = (row.last_name ?? '').trim()
      const fullName = [first, last].filter(Boolean).join(' ') || 'Sem nome'
      return {
        id: String(row.id),
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        fullName,
        role: row.role ?? null,
        avatarUrl: row.avatar_url ?? null,
        isActive: row.is_active === true,
      }
    })
  }
}
