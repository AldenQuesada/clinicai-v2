/**
 * ProfileRepository · acesso a `profiles` (RLS auto-escopa pelo user_id no JWT).
 *
 * Profiles e dimensao do user (role + first_name) · nao tem clinic_id direto
 * (multi-tenant via clinic_user_memberships). Repository so expoe getter por id.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProfileDTO {
  id: string
  firstName: string | null
  role: string | null
}

export class ProfileRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

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
}
