/**
 * LeadRepository · acesso canonico a tabela `leads`.
 *
 * Multi-tenant ADR-028 · clinic_id e arg explicito em qualquer método que toca
 * varias linhas. Métodos por id (UUID unico) dispensam clinic_id porque a chave
 * primaria já cobre · mas o caller pode passar pra reforçar quando aplicavel.
 *
 * Boundary do ADR-005 · retorna LeadDTO em camelCase, nunca row bruto snake.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { mapLeadRow } from './mappers/lead'
import { mapRpcResult } from './helpers/rpc-result'
import { orcamentoItemsToDbShape } from './helpers/orcamento-items'
import { findLeadInAnySystem } from './lead-dedup'
import type {
  CreateLeadInput,
  LeadCreateRpcInput,
  LeadToAppointmentRpcInput,
  LeadToOrcamentoRpcInput,
} from './types/inputs'
import type { DedupHit, LeadDTO } from './types/dtos'
import type { LeadPhase } from './types/enums'
import type {
  LeadCreateResult,
  LeadLostResult,
  LeadToAppointmentResult,
  LeadToOrcamentoResult,
  LeadToPacienteResult,
  SdrChangePhaseResult,
} from './types/rpc'

export class LeadRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Wrapper backwards-compat pro dedup global cross-tabela usado pelo
   * fluxo b2b-emit-voucher. Logica vive em `./lead-dedup` (3 tabelas com
   * regra de prioridade especifica) · ficou separado pra reduzir blast
   * radius do LeadRepository.
   */
  async findInAnySystem(
    clinicId: string,
    phone: string,
    name?: string | null,
  ): Promise<DedupHit | null> {
    return findLeadInAnySystem(this.supabase, clinicId, phone, name)
  }

  async findByPhoneVariants(clinicId: string, variants: string[]): Promise<LeadDTO | null> {
    if (!variants.length) return null
    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data ? mapLeadRow(data) : null
  }

  /**
   * Cria lead novo · retorna DTO ou null se insert falhou.
   * Phase default 'lead', persona 'onboarder' (alinhado com webhook legacy).
   *
   * `source` e `tags` opcionais · usados pela Mira B2B pra discriminar origem
   * (b2b_partnership_referral, b2b_admin_registered · ver mig 800-01) e marcar
   * indicacoes com slug da parceria.
   */
  async create(clinicId: string, input: CreateLeadInput): Promise<LeadDTO | null> {
    // BUG FIX 2026-04-28: tabela leads tem várias colunas NOT NULL com default
    // (funnel='procedimentos', name='', source='manual', etc). Passar null
    // explícito viola NOT NULL · omitimos pra DB usar default.
    const row: Record<string, unknown> = {
      id: uuidv4(),
      clinic_id: clinicId,
      phone: input.phone,
      phase: input.phase ?? 'lead',
      temperature: input.temperature ?? 'warm',
      ai_persona: input.aiPersona ?? 'onboarder',
      created_at: new Date().toISOString(),
    }
    if (input.name) row.name = input.name
    if (input.funnel) row.funnel = input.funnel
    if (input.source) row.source = input.source
    if (Array.isArray(input.tags) && input.tags.length > 0) row.tags = input.tags

    const { data, error } = await this.supabase
      .from('leads')
      .insert(row)
      .select()
      .single()

    if (error || !data) return null
    return mapLeadRow(data)
  }

  async updateScore(leadId: string, score: number): Promise<void> {
    await this.supabase.from('leads').update({ lead_score: score }).eq('id', leadId)
  }

  /**
   * Append-only · soma novas tags as existentes (dedup) e devolve set final.
   * Retorna [] se algo falhar · caller decide se trata como erro.
   */
  async addTags(leadId: string, newTags: string[]): Promise<string[]> {
    if (!newTags.length) return []

    const { data: row } = await this.supabase
      .from('leads')
      .select('tags')
      .eq('id', leadId)
      .single()

    const existing: string[] = Array.isArray(row?.tags) ? row.tags : []
    const merged = Array.from(new Set([...existing, ...newTags]))

    if (merged.length === existing.length) return existing

    await this.supabase.from('leads').update({ tags: merged }).eq('id', leadId)
    return merged
  }

  async setFunnel(
    leadId: string,
    funnel: 'olheiras' | 'fullface' | 'procedimentos',
  ): Promise<void> {
    await this.supabase.from('leads').update({ funnel }).eq('id', leadId)
  }

  async getTags(leadId: string): Promise<string[]> {
    const { data } = await this.supabase
      .from('leads')
      .select('tags')
      .eq('id', leadId)
      .single()
    return Array.isArray(data?.tags) ? (data.tags as string[]) : []
  }

  async updateLastResponseAt(leadId: string, when?: string): Promise<void> {
    await this.supabase
      .from('leads')
      .update({ last_response_at: when ?? new Date().toISOString() })
      .eq('id', leadId)
  }

  /**
   * Conta leads · suporta filtro opcional por funnel ou createdSince (dashboard).
   */
  async count(
    clinicId: string,
    filter: { funnel?: string; createdSince?: string } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filter.funnel) q = q.eq('funnel', filter.funnel)
    if (filter.createdSince) q = q.gte('created_at', filter.createdSince)

    const { count } = await q
    return count ?? 0
  }

  /**
   * Breakdown por funnel · 1 query por funil (head:true · barato).
   * Returns Record<funnel, count>.
   */
  async countByFunnels(
    clinicId: string,
    funnels: string[],
  ): Promise<Record<string, number>> {
    const entries = await Promise.all(
      funnels.map(async (f) => [f, await this.count(clinicId, { funnel: f })] as const),
    )
    return Object.fromEntries(entries)
  }

  /**
   * Busca leads por lista de telefones · usado pelo /api/conversations join.
   * Retorna lookup map (phone -> DTO) pra evitar N+1 no caller.
   */
  async findByPhones(clinicId: string, phones: string[]): Promise<Map<string, LeadDTO>> {
    const map = new Map<string, LeadDTO>()
    if (!phones.length) return map

    // Audit Camada 4 (2026-04-28): troca select de lista parcial por '*'
    // depois que LeadDTO expandiu pra 30 campos. Caller ja limita por
    // phones[] · custo extra por linha eh ~marginal.
    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', phones)

    for (const row of (data ?? [])) {
      const dto = mapLeadRow(row)
      map.set(dto.phone, dto)
    }
    return map
  }

  /**
   * Conta leads sem update ha mais de N dias · cron mira-inactivity-radar.
   */
  async countInactiveSince(clinicId: string, sinceIso: string): Promise<number> {
    const { count } = await this.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .lt('updated_at', sinceIso)
    return count ?? 0
  }

  /**
   * Lista leads aniversariantes do dia (mes/dia matching). Usado pelo cron
   * mira-birthday-alerts. Schema permissivo · birthday pode ser texto/jsonb/date.
   */
  async listBirthdaysOfDay(
    clinicId: string,
    monthDd: string,
    limit = 20,
  ): Promise<Array<{ name: string | null; phone: string; birthday: string | null }>> {
    const { data } = await this.supabase
      .from('leads')
      .select('name, phone, birthday')
      .eq('clinic_id', clinicId)
      .like('birthday', `%-${monthDd}`)
      .limit(limit)
    return ((data ?? []) as Array<{ name?: string; phone?: string; birthday?: string }>).map((r) => ({
      name: r.name ?? null,
      phone: String(r.phone ?? ''),
      birthday: r.birthday ?? null,
    }))
  }

  // ── CRM core reads (Camada 4) ──────────────────────────────────────────────

  /**
   * Busca lead por id (soft-delete-aware). Quando `includeDeleted=true`,
   * pega ate registros promovidos (paciente/orcamento) · util pra timeline.
   */
  async getById(leadId: string, opts: { includeDeleted?: boolean } = {}): Promise<LeadDTO | null> {
    let q = this.supabase.from('leads').select('*').eq('id', leadId).limit(1)
    if (!opts.includeDeleted) q = q.is('deleted_at', null)
    const { data } = await q.maybeSingle()
    return data ? mapLeadRow(data) : null
  }

  /**
   * Lista leads ativos da clinica filtrados por phase + paginados.
   * Usado pelo Kanban (1 chamada por coluna) e pela Lista (filter dropdown).
   */
  async listByPhase(
    clinicId: string,
    phase: LeadPhase,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<LeadDTO[]> {
    const limit = Math.min(opts.limit ?? 100, 500)
    const offset = opts.offset ?? 0
    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('phase', phase)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
    return ((data ?? []) as unknown[]).map(mapLeadRow)
  }

  /**
   * Snapshot pro Kanban · uma query por phase em paralelo. Limite por
   * coluna (cards visiveis); UI faz "carregar mais" se precisar de mais.
   */
  async kanbanSnapshot(
    clinicId: string,
    phases: LeadPhase[],
    perColumn = 50,
  ): Promise<Record<string, LeadDTO[]>> {
    const entries = await Promise.all(
      phases.map(
        async (p) => [p, await this.listByPhase(clinicId, p, { limit: perColumn })] as const,
      ),
    )
    return Object.fromEntries(entries)
  }

  // ── CRM core RPC wrappers (Camada 4) ───────────────────────────────────────
  //
  // Convencao: cada wrapper aceita input camelCase, traduz pra parametros
  // p_<nome> snake_case esperados pelo PG, chama supabase.rpc<>(), e retorna
  // o discriminated union (`{ ok, ... }`) ja com chaves camelCase via
  // mapRpcResult. Erros de transporte viram `{ ok:false, error:'rpc_error' }`.

  /**
   * Wrapper de `lead_create()` RPC · idempotente por (clinic_id, phone).
   * Usado por: UI manual, Webhook Lara, B2B voucher emitido, VPI referral,
   * quiz/landing submit. Falha explicita se phone bate com lead soft-deleted
   * (modelo excludente ADR-001).
   */
  async createViaRpc(input: LeadCreateRpcInput): Promise<LeadCreateResult> {
    const { data, error } = await this.supabase.rpc('lead_create', {
      p_phone: input.phone,
      p_name: input.name ?? null,
      p_source: input.source ?? 'manual',
      p_source_type: input.sourceType ?? 'manual',
      p_funnel: input.funnel ?? 'procedimentos',
      p_email: input.email ?? null,
      p_metadata: input.metadata ?? {},
      p_assigned_to: input.assignedTo ?? null,
      p_temperature: input.temperature ?? 'warm',
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadCreateResult
    }
    return mapRpcResult<LeadCreateResult>(data)
  }

  /**
   * Wrapper de `lead_to_appointment()` · cria appointment + atualiza
   * leads.phase=agendado em transacao atomica. Valida matriz canonica.
   */
  async toAppointment(input: LeadToAppointmentRpcInput): Promise<LeadToAppointmentResult> {
    const { data, error } = await this.supabase.rpc('lead_to_appointment', {
      p_lead_id: input.leadId,
      p_scheduled_date: input.scheduledDate,
      p_start_time: input.startTime,
      p_end_time: input.endTime,
      p_professional_id: input.professionalId ?? null,
      p_professional_name: input.professionalName ?? '',
      p_procedure_name: input.procedureName ?? '',
      p_consult_type: input.consultType ?? null,
      p_eval_type: input.evalType ?? null,
      p_value: input.value ?? 0,
      p_origem: input.origem ?? 'manual',
      p_obs: input.obs ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadToAppointmentResult
    }
    return mapRpcResult<LeadToAppointmentResult>(data)
  }

  /**
   * Wrapper de `lead_to_paciente()` · promove lead pra patients (UUID
   * compartilhado · soft-delete em leads · re-mapeia appointments/orcamentos).
   * Idempotente. Exige phase=compareceu (pre-condicao validada na RPC).
   */
  async toPaciente(
    leadId: string,
    opts: {
      totalRevenue?: number | null
      firstAt?: string | null
      lastAt?: string | null
      notes?: string | null
    } = {},
  ): Promise<LeadToPacienteResult> {
    const { data, error } = await this.supabase.rpc('lead_to_paciente', {
      p_lead_id: leadId,
      p_total_revenue: opts.totalRevenue ?? null,
      p_first_at: opts.firstAt ?? null,
      p_last_at: opts.lastAt ?? null,
      p_notes: opts.notes ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadToPacienteResult
    }
    return mapRpcResult<LeadToPacienteResult>(data)
  }

  /**
   * Wrapper de `lead_to_orcamento()` · cria orcamento + soft-delete em leads
   * + phase=orcamento. Exige phase=compareceu. Items convertidos pra shape
   * snake_case esperado pela RPC.
   */
  async toOrcamento(input: LeadToOrcamentoRpcInput): Promise<LeadToOrcamentoResult> {
    const itemsForDb = orcamentoItemsToDbShape(input.items)
    const { data, error } = await this.supabase.rpc('lead_to_orcamento', {
      p_lead_id: input.leadId,
      p_subtotal: input.subtotal,
      p_items: itemsForDb,
      p_discount: input.discount ?? 0,
      p_notes: input.notes ?? null,
      p_title: input.title ?? null,
      p_valid_until: input.validUntil ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadToOrcamentoResult
    }
    return mapRpcResult<LeadToOrcamentoResult>(data)
  }

  /**
   * Wrapper de `lead_lost()` · marca perdido (reason obrigatorio · CHECK
   * constraint chk_leads_lost_consistency). Idempotente.
   */
  async markLost(leadId: string, reason: string): Promise<LeadLostResult> {
    const { data, error } = await this.supabase.rpc('lead_lost', {
      p_lead_id: leadId,
      p_reason: reason,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadLostResult
    }
    return mapRpcResult<LeadLostResult>(data)
  }

  /**
   * Wrapper generico de mudanca de phase · roteia pra RPC especifica quando
   * aplicavel (lead_lost / lead_to_paciente). Para fases simples
   * (lead/agendado/reagendado/compareceu) faz UPDATE direto. orcamento
   * exige RPC especifica (items+subtotal) · retorna erro
   * `use_lead_to_orcamento_directly` se chamado com to_phase='orcamento'.
   */
  async changePhase(
    leadId: string,
    toPhase: LeadPhase,
    reason?: string | null,
  ): Promise<SdrChangePhaseResult> {
    const { data, error } = await this.supabase.rpc('sdr_change_phase', {
      p_lead_id: leadId,
      p_to_phase: toPhase,
      p_reason: reason ?? null,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as SdrChangePhaseResult
    }
    return mapRpcResult<SdrChangePhaseResult>(data)
  }
}
