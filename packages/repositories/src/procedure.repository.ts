/**
 * ProcedureRepository · acesso a `public.clinic_procedimentos` +
 * `public.clinic_procedimentos_comercial` (P7.1 B.1 · 2026-05-10).
 *
 * Source canonica de procedimentos disponiveis na clinica · usado pelo Copilot
 * pra explicar "como funciona X" sem alucinar. NUNCA expoe campos comerciais
 * sensiveis (preco/custo/margem) mas EXPOE campos de comunicacao curados
 * (pitch, objecoes, promessas permitida/proibida, niveis de risco).
 *
 * SEGURANCA · GUARDRAIL DE PRECO (commit 87a5610):
 *   - NUNCA selecionar nem mapear: preco, preco_promo, custo_estimado,
 *     combo_valor_final, combo_desconto_pct, margem, tecnologia_custo,
 *     partner_pricing_json. Esses campos NAO viram DTO · IA nunca vai ler.
 *   - Auditoria: 2026-05-07 · clinic_procedimentos tem 44 ativos pra
 *     Mirian de Paula (Capilar, Emagrecimento, injetavel, integrativo,
 *     manual, tecnologia, Tratamentos Faciais).
 *   - P7.1 A.0 (2026-05-10) · clinic_procedimentos_comercial tem 44/44
 *     com 100% cobertura em pitch_curto, pitch_premium, promessa_permitida,
 *     promessa_proibida, objecoes, quando_indicar, quando_nao_indicar,
 *     nivel_risco_comunicacao.
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
 * Item de objeção curado em `clinic_procedimentos_comercial.objecoes` (jsonb).
 * Shape canonico: `[{ "objection": string, "answer": string }, ...]`.
 * Parsing defensivo aceita variantes (chaves trocadas, items vazios, etc).
 */
export interface CommercialObjection {
  objection: string
  answer: string
}

/**
 * P7.1 B.1 · Conteudo curado pra alimentar Copilot/cards comerciais.
 * Vem da RPC `public.get_procedimentos_comercial(p_only_revisado boolean)`
 * que retorna jsonb com array de procs. SECURITY DEFINER · service_role
 * controla acesso. NAO expoe preco em nenhum dos campos.
 */
export interface CommercialProcedureDTO {
  id: string
  nome: string
  categoria: string | null
  /** "avulso" | "combo" | etc · do clinic_procedimentos.tipo */
  tipo: string | null
  ativo: boolean
  /** TLDR ≤120 chars · pra usar em smart_replies */
  pitch_curto: string | null
  /** Pitch ampliado (≤320 chars) · usar quando paciente perguntar "como funciona" */
  pitch_premium: string | null
  /** O que pode ser comunicado livremente */
  promessa_permitida: string | null
  /** O que NUNCA pode ser dito (regulatorio + clinico) · prioridade absoluta */
  promessa_proibida: string | null
  /** Lista curada de objecoes + respostas seguras */
  objecoes: CommercialObjection[]
  /** Perfil indicado · narrativa */
  quando_indicar: string | null
  /** Perfil contraindicado · narrativa · respeitar como gate */
  quando_nao_indicar: string | null
  /** baixo | medio | alto · `alto` exige tom mais conservador */
  nivel_risco_comunicacao: 'baixo' | 'medio' | 'alto' | string
  /** Flag interno da RPC · true se o item tem conteudo comercial real */
  comercial_disponivel: boolean
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

/**
 * Parsing defensivo de `objecoes` (jsonb · pode vir array, obj ou null).
 * Aceita shape canonico {objection, answer} + variantes (chaves trocadas,
 * items truncados, strings vazias). Sempre retorna array · nunca lanca.
 */
function normalizeObjecoes(raw: unknown): CommercialObjection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): CommercialObjection | null => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const objection =
        (typeof obj.objection === 'string' && obj.objection.trim()) ||
        (typeof obj.q === 'string' && obj.q.trim()) ||
        (typeof obj.question === 'string' && obj.question.trim()) ||
        ''
      const answer =
        (typeof obj.answer === 'string' && obj.answer.trim()) ||
        (typeof obj.a === 'string' && obj.a.trim()) ||
        (typeof obj.resposta === 'string' && obj.resposta.trim()) ||
        ''
      if (!objection || !answer) return null
      return { objection, answer }
    })
    .filter((x): x is CommercialObjection => x !== null)
}

/**
 * Mapeia row da RPC `get_procedimentos_comercial` · defensivo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommercialRow(row: any): CommercialProcedureDTO {
  return {
    id: String(row?.id ?? ''),
    nome: String(row?.nome ?? ''),
    categoria: typeof row?.categoria === 'string' ? row.categoria : null,
    tipo: typeof row?.tipo === 'string' ? row.tipo : null,
    ativo: row?.ativo === true,
    pitch_curto: typeof row?.pitch_curto === 'string' ? row.pitch_curto : null,
    pitch_premium:
      typeof row?.pitch_premium === 'string' ? row.pitch_premium : null,
    promessa_permitida:
      typeof row?.promessa_permitida === 'string'
        ? row.promessa_permitida
        : null,
    promessa_proibida:
      typeof row?.promessa_proibida === 'string'
        ? row.promessa_proibida
        : null,
    objecoes: normalizeObjecoes(row?.objecoes),
    quando_indicar:
      typeof row?.quando_indicar === 'string' ? row.quando_indicar : null,
    quando_nao_indicar:
      typeof row?.quando_nao_indicar === 'string'
        ? row.quando_nao_indicar
        : null,
    nivel_risco_comunicacao:
      typeof row?.nivel_risco_comunicacao === 'string'
        ? row.nivel_risco_comunicacao
        : 'medio',
    comercial_disponivel: row?.comercial_disponivel === true,
  }
}

export interface GetCommercialContentOptions {
  /** Default true · filtra somente procs revisados (com `revisado_em` setado). */
  onlyRevisado?: boolean
  /** Hard cap no array retornado · default sem cap. */
  limit?: number
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

  /**
   * P7.1 B.1 · Le conteudo comercial curado via RPC pública SECURITY DEFINER.
   *
   * NOTA · clinicId NAO eh parametro da RPC · ela usa app_clinic_id() do JWT.
   *        Mantemos no signature pra consistencia com getActiveByClinic e
   *        deixar explicito que e' lookup multi-tenant.
   *
   * Defensivo · NUNCA lanca · retorna [] em qualquer falha (RPC ausente,
   * RLS negada, shape inesperado, network). Caller deve fallback pra
   * getActiveByClinic se [] retornado e quiser conteudo basico.
   */
  async getCommercialContent(
    _clinicId: string,
    options: GetCommercialContentOptions = {},
  ): Promise<CommercialProcedureDTO[]> {
    const onlyRevisado = options.onlyRevisado ?? true
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (this.supabase as any).rpc(
        'get_procedimentos_comercial',
        { p_only_revisado: onlyRevisado },
      )
      if (error) return []
      // RPC returns jsonb array · supabase-js pode entregar como array direto
      // OU envelopado dependendo de typing. Defensivo cobre ambos.
      const rows: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { get_procedimentos_comercial?: unknown[] })?.get_procedimentos_comercial)
        ? (data as { get_procedimentos_comercial: unknown[] }).get_procedimentos_comercial
        : []
      const mapped = rows.map(mapCommercialRow).filter((p) => p.id && p.nome)
      if (typeof options.limit === 'number' && options.limit > 0) {
        return mapped.slice(0, options.limit)
      }
      return mapped
    } catch {
      return []
    }
  }
}
