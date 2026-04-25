/**
 * AppointmentRepository · count helpers usados pelos crons proativos da Mira.
 *
 * ADR-012 · UI/Service nao chama supabase.from('appointments') direto.
 * Esquema canonico do clinic-dashboard. P1 expoe so count helpers; CRUD
 * completo (create/update/cancel) entra no painel CRM, fora do escopo Mira.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export class AppointmentRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Conta appointments num intervalo de tempo (`starts_at` >= start, < end).
   * Usado por crons digest/anomaly-check pra "agenda de amanha", etc.
   */
  async countInRange(
    clinicId: string,
    startIso: string,
    endIso: string,
  ): Promise<number> {
    const { count } = await this.supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('starts_at', startIso)
      .lt('starts_at', endIso)
    return count ?? 0
  }
}
