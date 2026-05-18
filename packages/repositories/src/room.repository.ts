/**
 * RoomRepository · CRM_PARITY_R1 · acesso read-only a `clinic_rooms`.
 *
 * Tabela `clinic_rooms` foi criada por mig legacy
 * `clinic-dashboard/supabase/migrations/20260537000000_clinic_rooms.sql`.
 * Mora no mesmo schema/projeto Supabase. v2 referencia via RLS multi-tenant
 * (clinic_id = app_clinic_id()).
 *
 * Esta classe expõe apenas leitura (`listActive` + `getById`). CRUD admin
 * continua via RPCs legacy (`upsert_room`, `soft_delete_room`) durante
 * deprecation period. Será portado para v2 em Round 2+ se necessário.
 *
 * O que esta repo NÃO faz:
 *   - Não cria nem deleta salas
 *   - Não toca em `clinic_technologies.sala_id` / `professional_profiles.sala_id`
 *     (cascade ON DELETE SET NULL é responsabilidade do DB)
 *   - Não toca em `appointments.room_idx` legacy
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RoomDTO {
  id: string
  clinicId: string
  nome: string
  descricao: string | null
  ativo: boolean
}

export class RoomRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista salas ATIVAS da clínica. Ordenado por nome para consistência
   * de UI (dropdown ordenado).
   */
  async listActive(clinicId: string): Promise<RoomDTO[]> {
    const { data } = await this.supabase
      .from('clinic_rooms')
      .select('id, clinic_id, nome, descricao, ativo')
      .eq('clinic_id', clinicId)
      .eq('ativo', true)
      .order('nome', { ascending: true })

    return ((data ?? []) as Array<{
      id: string
      clinic_id: string
      nome: string | null
      descricao: string | null
      ativo: boolean
    }>).map((r) => ({
      id: String(r.id),
      clinicId: String(r.clinic_id),
      nome: String(r.nome ?? 'Sem nome'),
      descricao: r.descricao ?? null,
      ativo: r.ativo === true,
    }))
  }

  /**
   * Busca sala por id. Escopo clinic via RLS · não filtra `ativo` (pode
   * retornar sala desativada se chamada com id de appointment legado).
   */
  async getById(id: string): Promise<RoomDTO | null> {
    if (!id) return null
    const { data } = await this.supabase
      .from('clinic_rooms')
      .select('id, clinic_id, nome, descricao, ativo')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const r = data as {
      id: string
      clinic_id: string
      nome: string | null
      descricao: string | null
      ativo: boolean
    }
    return {
      id: String(r.id),
      clinicId: String(r.clinic_id),
      nome: String(r.nome ?? 'Sem nome'),
      descricao: r.descricao ?? null,
      ativo: r.ativo === true,
    }
  }
}
