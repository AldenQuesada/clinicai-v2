/**
 * ProcedureAdminRepository · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN.
 *
 * CRUD admin sobre `public.clinic_procedimentos`. Diferente do
 * `ProcedureRepository` (read-only · price-blind · para IA/Copilot), este
 * repository EXPÕE preço + custo + margem para administração da clínica.
 *
 * Segurança:
 *   - RLS já enforça multi-tenant + role gate (admin/owner) via policies
 *     `procedimentos_insert/update/delete` (clinic_id JWT + app_role check).
 *   - SELECT visível para authenticated da clínica (qualquer role).
 *   - Mutações exigem role admin/owner via RLS · sem necessidade de SECURITY
 *     DEFINER.
 *   - clinic_id é setado automaticamente pelo current JWT no INSERT · não
 *     aceitamos como parâmetro (defense-in-depth).
 *
 * Sem RPC nova · sem migration · RLS policies pré-existentes cobrem.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminProcedureDTO {
  id: string
  clinicId: string
  nome: string
  categoria: string | null
  tipo: string | null
  descricao: string | null
  preco: number
  precoPromo: number | null
  duracaoMin: number | null
  sessoes: number | null
  ativo: boolean
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

export interface ListProceduresFilter {
  search?: string | null
  /** 'active' / 'inactive' / 'all' */
  status?: 'active' | 'inactive' | 'all'
  categoria?: string | null
  limit?: number
  offset?: number
}

export interface ProcedureCountsDTO {
  total: number
  active: number
  inactive: number
  priceUndefined: number
  withPromo: number
}

export interface CreateProcedureInput {
  nome: string
  categoria?: string | null
  tipo?: string | null
  descricao?: string | null
  preco?: number | null
  precoPromo?: number | null
  duracaoMin?: number | null
  sessoes?: number | null
  observacoes?: string | null
  ativo?: boolean
}

export interface UpdateProcedureInput {
  nome?: string
  categoria?: string | null
  tipo?: string | null
  descricao?: string | null
  preco?: number | null
  precoPromo?: number | null
  duracaoMin?: number | null
  sessoes?: number | null
  observacoes?: string | null
  ativo?: boolean
}

type RawRow = {
  id: string
  clinic_id: string
  nome: string
  categoria: string | null
  tipo: string | null
  descricao: string | null
  preco: number | string | null
  preco_promo: number | string | null
  duracao_min: number | null
  sessoes: number | null
  ativo: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
}

function mapRow(r: RawRow): AdminProcedureDTO {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    nome: r.nome,
    categoria: r.categoria,
    tipo: r.tipo,
    descricao: r.descricao,
    preco: r.preco == null ? 0 : Number(r.preco),
    precoPromo: r.preco_promo == null ? null : Number(r.preco_promo),
    duracaoMin: r.duracao_min,
    sessoes: r.sessoes,
    ativo: r.ativo,
    observacoes: r.observacoes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const COLUMNS =
  'id, clinic_id, nome, categoria, tipo, descricao, preco, preco_promo, ' +
  'duracao_min, sessoes, ativo, observacoes, created_at, updated_at'

export class ProcedureAdminRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async list(filter: ListProceduresFilter = {}): Promise<AdminProcedureDTO[]> {
    let q = this.supabase
      .from('clinic_procedimentos')
      .select(COLUMNS)

    if (filter.status === 'active') q = q.eq('ativo', true)
    else if (filter.status === 'inactive') q = q.eq('ativo', false)

    if (filter.categoria && filter.categoria !== 'all') {
      q = q.eq('categoria', filter.categoria)
    }

    if (filter.search) {
      const term = String(filter.search).replace(/[%,]/g, ' ').trim()
      if (term) {
        q = q.ilike('nome', `%${term}%`)
      }
    }

    q = q.order('nome', { ascending: true })

    if (filter.limit) {
      q = q.range(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit - 1)
    }

    const { data, error } = await q
    if (error || !data) return []
    return (data as unknown as RawRow[]).map(mapRow)
  }

  async getById(id: string): Promise<AdminProcedureDTO | null> {
    const { data } = await this.supabase
      .from('clinic_procedimentos')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return mapRow(data as unknown as RawRow)
  }

  async listCategorias(): Promise<string[]> {
    const { data } = await this.supabase
      .from('clinic_procedimentos')
      .select('categoria')
    if (!data) return []
    const set = new Set<string>()
    for (const r of data as Array<{ categoria: string | null }>) {
      if (r.categoria) set.add(r.categoria)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  async getCounts(): Promise<ProcedureCountsDTO> {
    const { data } = await this.supabase
      .from('clinic_procedimentos')
      .select('ativo, preco, preco_promo')

    const counts: ProcedureCountsDTO = {
      total: 0,
      active: 0,
      inactive: 0,
      priceUndefined: 0,
      withPromo: 0,
    }
    if (!data) return counts
    const rows = data as Array<{
      ativo: boolean
      preco: number | string | null
      preco_promo: number | string | null
    }>
    counts.total = rows.length
    for (const r of rows) {
      if (r.ativo) counts.active++
      else counts.inactive++
      const p = r.preco == null ? 0 : Number(r.preco)
      if (!p || p <= 0) counts.priceUndefined++
      if (r.preco_promo != null) counts.withPromo++
    }
    return counts
  }

  /**
   * Cria procedimento. clinic_id é setado pelo current JWT via RLS · não
   * aceitamos como argumento (defense-in-depth).
   */
  async create(
    clinicId: string,
    input: CreateProcedureInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!input.nome || input.nome.trim().length === 0) {
      return { ok: false, error: 'nome_required' }
    }
    const payload = {
      clinic_id: clinicId,
      nome: input.nome.trim(),
      categoria: input.categoria ?? null,
      tipo: input.tipo ?? 'avulso',
      descricao: input.descricao ?? null,
      preco: input.preco == null ? 0 : Number(input.preco),
      preco_promo: input.precoPromo == null ? null : Number(input.precoPromo),
      duracao_min: input.duracaoMin ?? null,
      sessoes: input.sessoes ?? 1,
      observacoes: input.observacoes ?? null,
      ativo: input.ativo ?? true,
    }
    const { data, error } = await this.supabase
      .from('clinic_procedimentos')
      .insert(payload)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
    return { ok: true, id: (data as { id: string }).id }
  }

  async update(
    id: string,
    input: UpdateProcedureInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (Object.keys(input).length === 0) {
      return { ok: false, error: 'empty_update' }
    }
    const payload: Record<string, unknown> = {}
    if (input.nome !== undefined) payload.nome = input.nome.trim()
    if (input.categoria !== undefined) payload.categoria = input.categoria
    if (input.tipo !== undefined) payload.tipo = input.tipo
    if (input.descricao !== undefined) payload.descricao = input.descricao
    if (input.preco !== undefined) {
      payload.preco = input.preco == null ? 0 : Number(input.preco)
    }
    if (input.precoPromo !== undefined) {
      payload.preco_promo = input.precoPromo == null ? null : Number(input.precoPromo)
    }
    if (input.duracaoMin !== undefined) payload.duracao_min = input.duracaoMin
    if (input.sessoes !== undefined) payload.sessoes = input.sessoes
    if (input.observacoes !== undefined) payload.observacoes = input.observacoes
    if (input.ativo !== undefined) payload.ativo = input.ativo
    payload.updated_at = new Date().toISOString()

    const { error } = await this.supabase
      .from('clinic_procedimentos')
      .update(payload)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async setActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
    return this.update(id, { ativo: active })
  }
}
