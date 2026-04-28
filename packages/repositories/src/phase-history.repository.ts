/**
 * PhaseHistoryRepository · audit trail imutavel das transicoes de
 * leads.phase (mig 64).
 *
 * Multi-tenant ADR-028. Boundary do ADR-005 · retorna PhaseHistoryDTO em
 * camelCase, nunca row bruto snake.
 *
 * RLS bloqueia UPDATE/DELETE pra `authenticated` (so service_role bypassa) ·
 * esse repository expoe SO leitura. Inserts vem de dentro das RPCs canonicas
 * (lead_create, lead_to_appointment, appointment_attend, etc). UI nao escreve
 * aqui direto · qualquer transicao manual passa por `sdr_change_phase()` que
 * registra historia automaticamente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'
import {
  mapPhaseHistoryRow,
  type PhaseHistoryDTO,
  type PhaseOrigin,
} from './types'

const PH_COLUMNS =
  'id, clinic_id, lead_id, from_phase, from_status, to_phase, to_status, ' +
  'origin, triggered_by, actor_id, reason, created_at'

export class PhaseHistoryRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Timeline de um lead · ordenada cronologicamente (asc) · pra render no
   * detalhe do lead/paciente. lead_id pode estar NULL no DB se lead foi
   * hard-deletado · esse metodo so pega entries com lead_id setado.
   */
  async listByLead(leadId: string, opts: { limit?: number } = {}): Promise<PhaseHistoryDTO[]> {
    const limit = Math.min(opts.limit ?? 100, 500)
    const { data } = await this.supabase
      .from('phase_history')
      .select(PH_COLUMNS)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .limit(limit)
    return ((data ?? []) as unknown[]).map(mapPhaseHistoryRow)
  }

  /**
   * Atividade recente da clinica · feed de admin. Filtros opcionais por
   * origin (manual_override pra ver overrides humanos, rpc pra ver fluxo
   * automatizado).
   */
  async listRecent(
    clinicId: string,
    opts: {
      limit?: number
      origin?: PhaseOrigin
      sinceIso?: string
    } = {},
  ): Promise<PhaseHistoryDTO[]> {
    const limit = Math.min(opts.limit ?? 50, 500)
    let q = this.supabase
      .from('phase_history')
      .select(PH_COLUMNS)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (opts.origin) q = q.eq('origin', opts.origin)
    if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso)

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapPhaseHistoryRow)
  }

  /**
   * Conta transicoes pra uma phase num intervalo · KPI dashboard
   * (ex: "quantos leads viraram paciente este mes?").
   */
  async countTransitionsToPhase(
    clinicId: string,
    toPhase: string,
    sinceIso: string,
  ): Promise<number> {
    const { count } = await this.supabase
      .from('phase_history')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('to_phase', toPhase)
      .gte('created_at', sinceIso)
    return count ?? 0
  }
}
