/**
 * ProcedureRepository · acesso a `public.clinic_procedimentos`.
 *
 * Source canonica de procedimentos disponiveis na clinica · usado pelo Copilot
 * pra explicar "como funciona X" sem alucinar. NUNCA expoe campos comerciais
 * sensiveis.
 *
 * SEGURANCA · GUARDRAIL DE PRECO (commit 87a5610):
 *   - NUNCA selecionar nem mapear: preco, preco_promo, custo_estimado,
 *     combo_valor_final, combo_desconto_pct, margem, tecnologia_custo,
 *     partner_pricing_json. Esses campos NAO viram DTO · IA nunca vai ler.
 *   - Auditoria: 2026-05-07 · clinic_procedimentos tem 44 ativos pra
 *     Mirian de Paula (Capilar, Emagrecimento, injetavel, integrativo,
 *     manual, tecnologia, Tratamentos Faciais).
 *
 * Schema lido (read-only):
 *   id uuid · clinic_id uuid · nome text · categoria text · descricao text
 *   duracao_min int · sessoes int · cuidados_pre jsonb · cuidados_pos jsonb
 *   contraindicacoes jsonb · observacoes text · ativo bool
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProcedureDTO {
  id: string
  /** Procedimento (ex: "Lifting 5D", "Fotona SmoothEye — Pálpebras") */
  nome: string
  /** Agrupamento (ex: "injetavel", "tecnologia", "manual") · nullable */
  categoria: string | null
  /** Texto rico explicando o que o procedimento faz · pode ter ate ~500 chars */
  descricao: string | null
  /** Duracao estimada em minutos · null se variavel */
  duracaoMin: number | null
  /** Quantas sessoes recomendadas · null se sob avaliacao */
  sessoes: number | null
  /** Cuidados pre-procedimento · array de strings (jsonb pode vir array OU obj) */
  cuidadosPre: string[]
  /** Cuidados pos-procedimento · array de strings */
  cuidadosPos: string[]
  /** Contraindicacoes · array de strings */
  contraindicacoes: string[]
  /** Observacoes livres da clinica */
  observacoes: string | null
}

/**
 * jsonb pode vir como array ['item1', 'item2'] · objeto {pre: [...]} ·
 * string ou null. Normaliza pra string[] defensivo.
 */
function normalizeJsonbList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if (typeof obj.text === 'string') return obj.text.trim()
          if (typeof obj.label === 'string') return obj.label.trim()
        }
        return ''
      })
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ProcedureDTO {
  return {
    id: String(row.id),
    nome: String(row.nome ?? ''),
    categoria: row.categoria ?? null,
    descricao: row.descricao ?? null,
    duracaoMin: row.duracao_min ?? null,
    sessoes: row.sessoes ?? null,
    cuidadosPre: normalizeJsonbList(row.cuidados_pre),
    cuidadosPos: normalizeJsonbList(row.cuidados_pos),
    contraindicacoes: normalizeJsonbList(row.contraindicacoes),
    observacoes: row.observacoes ?? null,
  }
}

export class ProcedureRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista procedimentos ATIVOS da clinica · ordenados por categoria, nome.
   * NUNCA seleciona campos comerciais (preco, custo, margem, partner_pricing_json).
   */
  async getActiveByClinic(clinicId: string): Promise<ProcedureDTO[]> {
    const { data, error } = await this.supabase
      .from('clinic_procedimentos')
      .select(
        // SELECT explicito · campos seguros · NUNCA preco/custo/margem
        'id, clinic_id, nome, categoria, descricao, duracao_min, sessoes, ' +
          'cuidados_pre, cuidados_pos, contraindicacoes, observacoes, ativo',
      )
      .eq('clinic_id', clinicId)
      .eq('ativo', true)
      .order('categoria', { ascending: true, nullsFirst: false })
      .order('nome', { ascending: true })

    if (error || !data) return []
    return data.map(mapRow)
  }
}
