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
  UpdateLeadInput,
  ListLeadsFilter,
} from './types/inputs'
import type { DedupHit, LeadDTO } from './types/dtos'
import type { LeadPhase, LeadTemperature } from './types/enums'
import type {
  LeadCreateResult,
  LeadLostResult,
  LeadRecoverResult,
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
   * Atualiza apenas `leads.name` · usado pelo webhook quando pushName válido
   * aparece numa inbound posterior à criação (lead começou com phone como
   * nome ou ficou vazio). Caller é responsável por aplicar `isGoodHumanName`
   * + `shouldUpdateName` ANTES de chamar (evita sobrescrever nome humano bom).
   *
   * Retorna `true` se o UPDATE foi confirmado pelo Supabase, `false` caso
   * contrário. Não toca `updated_at` manualmente · Postgres já tem
   * `updated_at = now()` via trigger/default na tabela.
   */
  async updateName(leadId: string, name: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('leads')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    return !error
  }

  /**
   * @deprecated leads.tags does not exist in production. The column was
   * removed during REFACTOR_LEAD_MODEL but this method still references it.
   * Calls fail silently · merged set never reaches DB. Do not use until
   * persistent tag architecture is restored (either ADD COLUMN leads.tags
   * back or introduce conversation_tags table). Pills/filas operacionais
   * governed by wa_conversations_operational_view since 2026-05-05.
   *
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

  /**
   * Adiciona queixas faciais ao lead (set-union · evita duplicatas).
   * Usado pelo webhook ao detectar [QUEIXA:olheiras] na resposta da Lara.
   * Retorna array completo apos merge · [] se nada mudou ou falhou.
   */
  async addQueixas(leadId: string, newQueixas: string[]): Promise<string[]> {
    if (!newQueixas.length) return []

    const { data: row } = await this.supabase
      .from('leads')
      .select('queixas_faciais')
      .eq('id', leadId)
      .single()

    const existing: string[] = Array.isArray(row?.queixas_faciais) ? row.queixas_faciais : []
    const merged = Array.from(new Set([...existing, ...newQueixas]))

    if (merged.length === existing.length) return existing

    await this.supabase
      .from('leads')
      .update({ queixas_faciais: merged })
      .eq('id', leadId)
    return merged
  }

  /**
   * @deprecated Use `changePhase()` direto · setPhase hoje delega para a
   * RPC `sdr_change_phase` (Fase 1D · 2026-05-11), mas a assinatura
   * antiga foi preservada apenas por compatibilidade. NÃO faz UPDATE
   * direto mais · respeita matriz canônica + grava `phase_history`.
   *
   * Erros da RPC sao silenciados (compat com contrato `void` antigo) ·
   * callers novos devem usar `changePhase()` para receber o result tipado.
   */
  async setPhase(leadId: string, phase: LeadPhase): Promise<void> {
    await this.changePhase(leadId, phase, 'repository_set_phase')
  }

  /**
   * Atualiza temperatura direto · campo livre pra IA/UI.
   */
  async setTemperature(leadId: string, temperature: LeadTemperature): Promise<void> {
    await this.supabase.from('leads').update({ temperature }).eq('id', leadId)
  }

  /**
   * Update parcial · so campos do payload sao tocados (snake-case no DB).
   * Tabela `leads` tem varios NOT NULL com default · null explicito viola
   * constraint, entao filtramos undefined pra omitir.
   */
  async update(leadId: string, fields: UpdateLeadInput): Promise<LeadDTO | null> {
    const row: Record<string, unknown> = {}
    if (fields.name !== undefined) row.name = fields.name
    if (fields.phone !== undefined) row.phone = fields.phone
    if (fields.email !== undefined) row.email = fields.email
    if (fields.cpf !== undefined) row.cpf = fields.cpf
    if (fields.rg !== undefined) row.rg = fields.rg
    if (fields.birthDate !== undefined) row.birth_date = fields.birthDate
    if (fields.idade !== undefined) row.idade = fields.idade
    if (fields.funnel !== undefined) row.funnel = fields.funnel
    if (fields.temperature !== undefined) row.temperature = fields.temperature
    if (fields.priority !== undefined) row.priority = fields.priority
    if (fields.aiPersona !== undefined) row.ai_persona = fields.aiPersona
    if (fields.assignedTo !== undefined) row.assigned_to = fields.assignedTo
    if (fields.queixasFaciais !== undefined) row.queixas_faciais = fields.queixasFaciais
    if (fields.tags !== undefined) row.tags = fields.tags
    if (fields.metadata !== undefined) row.metadata = fields.metadata
    if (fields.waOptIn !== undefined) row.wa_opt_in = fields.waOptIn

    if (Object.keys(row).length === 0) return this.getById(leadId)

    row.updated_at = new Date().toISOString()
    const { data, error } = await this.supabase
      .from('leads')
      .update(row)
      .eq('id', leadId)
      .select()
      .maybeSingle()

    if (error || !data) return null
    return mapLeadRow(data)
  }

  /**
   * Soft-delete · seta deleted_at.
   */
  async softDelete(leadId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', leadId)
    return !error
  }

  /**
   * Reativa lead soft-deleted (deleted_at = null).
   */
  async restore(leadId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('leads')
      .update({ deleted_at: null })
      .eq('id', leadId)
    return !error
  }

  /**
   * Toggle de tag · remove se ja tem, adiciona se nao tem. Retorna set final.
   */
  async toggleTag(leadId: string, tag: string): Promise<string[]> {
    const existing = await this.getTags(leadId)
    const has = existing.includes(tag)
    const next = has ? existing.filter((t) => t !== tag) : [...existing, tag]
    await this.supabase.from('leads').update({ tags: next }).eq('id', leadId)
    return next
  }

  /**
   * @deprecated leads.tags does not exist in production · ver `addTags` pra
   * contexto. Não usar até arquitetura de tags persistentes ser restaurada.
   *
   * Remove tags especificas · op-set inverso de addTags.
   */
  async removeTags(leadId: string, tagsToRemove: string[]): Promise<string[]> {
    if (!tagsToRemove.length) return []
    const existing = await this.getTags(leadId)
    const next = existing.filter((t) => !tagsToRemove.includes(t))
    if (next.length === existing.length) return existing
    await this.supabase.from('leads').update({ tags: next }).eq('id', leadId)
    return next
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
   * Lista leads paginada com filtros multidimensionais · usado pela
   * pagina /leads (Lara). Ordena por `updated_at` desc por default.
   * Retorna `{ rows, total }` com count exato.
   */
  async list(
    clinicId: string,
    filter: ListLeadsFilter = {},
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ rows: LeadDTO[]; total: number }> {
    const limit = Math.min(pagination.limit ?? 50, 200)
    const offset = pagination.offset ?? 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (q: any): any => {
      let out = q.eq('clinic_id', clinicId).is('deleted_at', null)
      if (filter.funnel) out = out.eq('funnel', filter.funnel)
      if (filter.funnels?.length) out = out.in('funnel', filter.funnels)
      if (filter.phase) out = out.eq('phase', filter.phase)
      if (filter.phases?.length) out = out.in('phase', filter.phases)
      if (filter.excludePhases?.length) {
        out = out.not('phase', 'in', `(${filter.excludePhases.join(',')})`)
      }
      if (filter.lifecycleStatus) {
        out = out.eq('lifecycle_status', filter.lifecycleStatus)
      }
      if (filter.lifecycleStatuses?.length) {
        out = out.in('lifecycle_status', filter.lifecycleStatuses)
      }
      if (filter.excludeLifecycleStatuses?.length) {
        out = out.not(
          'lifecycle_status',
          'in',
          `(${filter.excludeLifecycleStatuses.join(',')})`,
        )
      }
      if (filter.temperature) out = out.eq('temperature', filter.temperature)
      if (filter.sourceType) out = out.eq('source_type', filter.sourceType)
      if (filter.tags?.length) out = out.contains('tags', filter.tags)
      if (filter.createdSince) out = out.gte('created_at', filter.createdSince)
      if (filter.createdUntil) out = out.lte('created_at', filter.createdUntil)
      if (filter.noResponseSinceIso) {
        out = out.or(
          `last_response_at.lt.${filter.noResponseSinceIso},last_response_at.is.null`,
        )
      }
      if (filter.search) {
        const term = String(filter.search).replace(/[%,]/g, ' ').trim()
        if (term) {
          out = out.or(
            `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
          )
        }
      }
      return out
    }

    const headQ = this.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
    const { count } = await applyFilters(headQ)

    const rowsQ = this.supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
    const { data } = await applyFilters(rowsQ)
    const rows = ((data ?? []) as unknown[]).map(mapLeadRow)

    return { rows, total: count ?? 0 }
  }

  /**
   * Conta leads sem resposta desde sinceIso · KPI da lista.
   * `last_response_at < sinceIso` OU NULL.
   */
  async countNoResponseSince(clinicId: string, sinceIso: string): Promise<number> {
    const [{ count: a }, { count: b }] = await Promise.all([
      this.supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .lt('last_response_at', sinceIso),
      this.supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .is('last_response_at', null),
    ])
    return (a ?? 0) + (b ?? 0)
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
   * CRM_PHASE_2RC · Wrapper de `lead_recover(p_lead_id, p_to_phase, p_reason)`.
   * Reativa lead perdido (wraps `perdido_to_lead`). p_to_phase ∈
   * {lead, agendado, orcamento}. Atualiza perdidos.recovered_at +
   * recovered_to_phase. Role gate: owner/admin/receptionist.
   *
   * NUNCA envia WhatsApp · ação puramente DB.
   */
  async recover(
    leadId: string,
    toPhase: 'lead' | 'agendado' | 'orcamento',
    reason: string,
  ): Promise<LeadRecoverResult> {
    const { data, error } = await this.supabase.rpc('lead_recover', {
      p_lead_id: leadId,
      p_to_phase: toPhase,
      p_reason: reason,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message } as LeadRecoverResult
    }
    return mapRpcResult<LeadRecoverResult>(data)
  }

  /**
   * Wrapper de `b2b_refer_lead_safe()` RPC (Camada 10b · mig 800-84).
   * Race-safe dedup + creation atomico para fluxo Mira partner.refer_lead.
   *
   * Retorna shape canonico:
   *   { ok: true,  leadId, action: 'created' | 'reused' | 'reactivated' }
   *   { ok: false, error: 'invalid_phone' | 'partnership_not_found' | ... }
   *
   * Action semantica:
   *   - 'created'     · lead novo inserido
   *   - 'reused'      · lead ativo ja existia (mesmo phone+clinic_id)
   *   - 'reactivated' · lead estava soft-deleted, voltou ativo
   *
   * Se a RPC retornar payload inesperado (defensivo), retorna unexpected_response.
   */
  async referFromPartner(input: {
    partnershipId: string
    clinicId: string
    phone: string
    name?: string | null
    email?: string | null
    partnerSlug?: string | null
    metadata?: Record<string, unknown>
  }): Promise<{
    ok: boolean
    leadId?: string
    action?: 'created' | 'reused' | 'reactivated'
    error?: string
  }> {
    const { data, error } = await this.supabase.rpc('b2b_refer_lead_safe', {
      p_partnership_id: input.partnershipId,
      p_clinic_id: input.clinicId,
      p_phone: input.phone,
      p_name: input.name ?? null,
      p_email: input.email ?? null,
      p_partner_slug: input.partnerSlug ?? null,
      p_metadata: input.metadata ?? {},
    })
    if (error) return { ok: false, error: error.message }
    if (data && typeof data === 'object' && 'ok' in data) {
      const d = data as {
        ok: boolean
        lead_id?: string
        action?: 'created' | 'reused' | 'reactivated'
        error?: string
      }
      if (!d.ok) return { ok: false, error: d.error ?? 'unknown_error' }
      return { ok: true, leadId: d.lead_id, action: d.action }
    }
    return { ok: false, error: 'unexpected_response' }
  }

  /**
   * Wrapper da RPC `sdr_change_phase` · gate canônico de mudança de phase.
   * Respeita matriz `_lead_phase_transition_allowed` + grava
   * `phase_history` (audit trail). Reason é livre · default null.
   *
   * Contrato canônico (Fase 1C · 2026-05-11): 4 phases (lead, agendado,
   * paciente, orcamento). Perda (perdido) usa `lead_lost` RPC dedicada ·
   * NÃO passa por aqui.
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

  // ── BLOCO 3.1 · Kanban Leads · paridade V1 ─────────────────────────────────
  //
  // RPC `sdr_get_kanban_evolution` retorna 3 stages do pipeline `evolution`
  // (novo · em_conversa · em_negociacao) cada um com seu array de leads,
  // ordenado por priority DESC, created_at ASC. Pipeline + stages vivem nas
  // tabelas `pipelines` + `pipeline_stages` · leads tem posição em
  // `lead_pipeline_positions` (lead_id, pipeline_id) UNIQUE.
  //
  // RPC `sdr_move_lead` faz UPSERT na posição · ON CONFLICT(lead_id,
  // pipeline_id) DO UPDATE · invocada no drop pra persistir movimento.
  //
  // Estado atual do banco (Bloco 3 audit): `lead_pipeline_positions=0` ·
  // colunas vão render vazias até primeira movimentação acontecer.

  /**
   * Carrega kanban do pipeline `evolution` (3 stages canônicos) + fallback
   * (BLOCO 3.1A) pra leads ativos sem posição.
   *
   * Fluxo:
   *  1. Chama RPC `sdr_get_kanban_evolution(p_phase)` · retorna leads que JÁ
   *     têm posição em `lead_pipeline_positions`.
   *  2. **Fallback (BLOCO 3.1A):** SELECT em `public.leads` por leads ativos
   *     (lifecycle_status='ativo' · phase='lead' · deleted_at IS NULL) que NÃO
   *     têm registro em `lead_pipeline_positions`. Marca cada um com
   *     `isUnpositioned: true` e mescla na stage "novo" no início (priority
   *     DESC, created_at ASC pra coerência com ordenação da RPC).
   *  3. Dedup defensivo: se mesmo lead aparecer em ambos (race condition),
   *     mantém o da RPC (já tem posição salva).
   *  4. Filtro `phaseFilter` aplica em ambos os caminhos · se não for 'lead',
   *     o fallback retorna 0 leads (semântica preservada).
   *
   * `clinicId` é obrigatório pra escopar o SELECT do fallback (ADR-028
   * multi-tenant). RPC interna já resolve clinic via `_sdr_clinic_id()` JWT;
   * caller passa clinic_id pro fallback ser explícito.
   *
   * Posição só é persistida quando user faz drag-drop · RPC `sdr_move_lead`
   * UPSERT. Esta função NÃO escreve em `lead_pipeline_positions`.
   */
  async getKanbanEvolution(
    clinicId: string,
    phaseFilter?: string | null,
  ): Promise<KanbanEvolutionResult> {
    const { data, error } = await this.supabase.rpc('sdr_get_kanban_evolution', {
      p_phase: phaseFilter ?? undefined,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message }
    }
    const parsed = data as { ok?: boolean; error?: string; data?: { stages?: KanbanStageRpc[] } } | null
    if (!parsed?.ok) {
      return { ok: false, error: parsed?.error ?? 'unknown_error' }
    }

    const stages = parsed.data?.stages ?? []

    // ── BLOCO 3.1A · fallback pra leads ativos sem posição ─────────────────
    // Só faz sentido injetar fallback na stage 'novo' quando phaseFilter é
    // null OU 'lead' (semântica: leads sem posição = leads novos no funil).
    const fallbackApplies =
      phaseFilter == null || phaseFilter === 'lead'
    if (!fallbackApplies) {
      return { ok: true, stages }
    }

    // IDs que já vieram da RPC (qualquer stage · dedup defensivo)
    const positionedIds = new Set<string>()
    for (const s of stages) {
      for (const l of s.leads ?? []) {
        positionedIds.add(l.id)
      }
    }

    // SELECT leads ativos sem posição · scope clinic_id + RLS
    const { data: unpositionedRows, error: selErr } = await this.supabase
      .from('leads')
      .select(
        'id, name, phone, status, phase, temperature, priority, assigned_to, created_at',
      )
      .eq('clinic_id', clinicId)
      .eq('lifecycle_status', 'ativo')
      .eq('phase', 'lead')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (selErr) {
      // Fallback falha · log mas não bloqueia · retorna só stages da RPC
      return {
        ok: true,
        stages,
        fallbackWarning: `fallback_query_failed: ${selErr.message}`,
      }
    }

    const fallbackLeads: KanbanLeadCard[] = (unpositionedRows ?? [])
      .filter((row) => !positionedIds.has(row.id as string))
      .map((row) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? '',
        phone: (row.phone as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        phase: (row.phase as string | null) ?? null,
        temperature: (row.temperature as string | null) ?? null,
        priority: (row.priority as string | null) ?? null,
        assigned_to: (row.assigned_to as string | null) ?? null,
        created_at: row.created_at as string,
        isUnpositioned: true,
      }))

    if (fallbackLeads.length === 0) {
      return { ok: true, stages }
    }

    // Localiza stage 'novo' e prepende fallback · sort_order menor = novo
    const stagesOut: KanbanStageRpc[] = stages.map((s) => {
      if (s.slug !== 'novo') return s
      return {
        ...s,
        leads: [...fallbackLeads, ...(s.leads ?? [])],
      }
    })

    // Caso pipeline 'evolution' não tenha seed (sem stages), criar virtual
    if (stagesOut.length === 0) {
      stagesOut.push({
        slug: 'novo',
        label: 'Novo',
        color: null,
        sort_order: 1,
        leads: fallbackLeads,
      })
    }

    return { ok: true, stages: stagesOut }
  }

  /**
   * Move lead pra outro stage no pipeline `evolution`.
   * Origin default 'drag' · pode ser 'manual' se invocado por outro fluxo.
   * UPSERT em lead_pipeline_positions · ON CONFLICT DO UPDATE.
   */
  async moveKanbanStage(
    leadId: string,
    stageSlug: string,
    origin: 'drag' | 'manual' = 'drag',
  ): Promise<{ ok: true; data: { leadId: string; pipeline: string; stage: string } } | { ok: false; error: string; detail?: string }> {
    const { data, error } = await this.supabase.rpc('sdr_move_lead', {
      p_lead_id: leadId,
      p_pipeline_slug: 'evolution',
      p_stage_slug: stageSlug,
      p_origin: origin,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message }
    }
    const parsed = data as { ok?: boolean; error?: string; data?: { lead_id: string; pipeline: string; stage: string } } | null
    if (!parsed?.ok) {
      return { ok: false, error: parsed?.error ?? 'move_failed' }
    }
    return {
      ok: true,
      data: {
        leadId: parsed.data?.lead_id ?? leadId,
        pipeline: parsed.data?.pipeline ?? 'evolution',
        stage: parsed.data?.stage ?? stageSlug,
      },
    }
  }

  // ── BLOCO 3.5B · Kanban 7 Dias (read-only · pipeline seven_days) ───────────
  //
  // Espelha `getKanbanEvolution` com 2 diferenças:
  //   1. RPC `sdr_get_kanban_7dias` (mig V1 20260509)
  //   2. 8 stages canônicos (mig V1 20260513 seed):
  //      sem_data · dia_1 · dia_2 · dia_3 · dia_4 · dia_5 · dia_6 · dia_7_plus
  //
  // Pipeline é READ-ONLY (paridade V1): leads avançam pelo cron
  // `sdr_advance_day_buckets()` diariamente às 00:00. Não há `moveSevenDays` ·
  // não chamamos `sdr_move_lead` com pipeline_slug='seven_days' pra evitar
  // bypass do cron.
  //
  // Estado atual do banco: `lead_pipeline_positions=0` (BLOCO 3.1A audit
  // ainda válido). Fallback obrigatório: distribuir leads ativos por idade
  // (`now() - created_at`) replicando lógica do cron.
  //
  // **Fallback NÃO persiste posições** · ZERO INSERT em
  // `lead_pipeline_positions` · ZERO UPDATE em `leads.day_bucket` · zero
  // chamada a `sdr_init_lead_pipelines`. UI mostra distribuição calculada,
  // o cron sincroniza quando rodar.
  async getKanban7Dias(
    clinicId: string,
    phaseFilter?: string | null,
  ): Promise<KanbanEvolutionResult> {
    const { data, error } = await this.supabase.rpc('sdr_get_kanban_7dias', {
      p_phase: phaseFilter ?? undefined,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message }
    }
    const parsed = data as
      | { ok?: boolean; error?: string; data?: { stages?: KanbanStageRpc[] } }
      | null
    if (!parsed?.ok) {
      return { ok: false, error: parsed?.error ?? 'unknown_error' }
    }

    // Garantia: sempre 8 stages presentes (mesmo vazios) pra UI render estável.
    const rpcStages = parsed.data?.stages ?? []
    const stages: KanbanStageRpc[] = SEVEN_DAYS_STAGE_SEED.map((seed) => {
      const found = rpcStages.find((s) => s.slug === seed.slug)
      return {
        slug: seed.slug,
        label: seed.label,
        color: seed.color,
        sort_order: seed.sortOrder,
        leads: found?.leads ?? [],
      }
    })

    // IDs já posicionados via RPC (defensivo · dedup do fallback)
    const positionedIds = new Set<string>()
    for (const s of stages) {
      for (const l of s.leads ?? []) {
        positionedIds.add(l.id)
      }
    }

    // SELECT leads ativos sem position · scope clinic_id + lifecycle
    let selQuery = this.supabase
      .from('leads')
      .select(
        'id, name, phone, status, phase, temperature, priority, assigned_to, created_at',
      )
      .eq('clinic_id', clinicId)
      .eq('lifecycle_status', 'ativo')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (phaseFilter) {
      selQuery = selQuery.eq('phase', phaseFilter)
    }

    const { data: activeRows, error: selErr } = await selQuery

    if (selErr) {
      return {
        ok: true,
        stages,
        fallbackWarning: `fallback_query_failed: ${selErr.message}`,
      }
    }

    const unpositioned = (activeRows ?? []).filter(
      (row) => !positionedIds.has(row.id as string),
    )

    if (unpositioned.length === 0) {
      return { ok: true, stages }
    }

    // Distribui por idade · mesmo corte do cron sdr_advance_day_buckets:
    //   created_at < 1h         → sem_data
    //   1h-1d                   → dia_1
    //   1-2d / 2-3d / ... / 5-6d → dia_2..dia_6
    //   6d+                     → dia_7_plus
    const now = Date.now()
    const HOUR_MS = 60 * 60 * 1000
    const DAY_MS = 24 * HOUR_MS

    const bucketBySlug: Record<string, KanbanLeadCard[]> = {}
    for (const seed of SEVEN_DAYS_STAGE_SEED) bucketBySlug[seed.slug] = []

    for (const row of unpositioned) {
      const created = row.created_at ? new Date(row.created_at as string).getTime() : now
      const ageMs = now - created
      let slug: string
      if (ageMs < HOUR_MS) slug = 'sem_data'
      else if (ageMs < DAY_MS) slug = 'dia_1'
      else if (ageMs < 2 * DAY_MS) slug = 'dia_2'
      else if (ageMs < 3 * DAY_MS) slug = 'dia_3'
      else if (ageMs < 4 * DAY_MS) slug = 'dia_4'
      else if (ageMs < 5 * DAY_MS) slug = 'dia_5'
      else if (ageMs < 6 * DAY_MS) slug = 'dia_6'
      else slug = 'dia_7_plus'

      bucketBySlug[slug]!.push({
        id: row.id as string,
        name: (row.name as string | null) ?? '',
        phone: (row.phone as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        phase: (row.phase as string | null) ?? null,
        temperature: (row.temperature as string | null) ?? null,
        priority: (row.priority as string | null) ?? null,
        assigned_to: (row.assigned_to as string | null) ?? null,
        created_at: row.created_at as string,
        isUnpositioned: true,
      })
    }

    const stagesOut = stages.map((s) => ({
      ...s,
      leads: [...(s.leads ?? []), ...(bucketBySlug[s.slug] ?? [])],
    }))

    return {
      ok: true,
      stages: stagesOut,
      fallbackWarning:
        'positions_empty: leads distribuídos por created_at (paridade cron sdr_advance_day_buckets · não persiste)',
    }
  }

  // ── BLOCO 3.4B · bulk actions /leads ────────────────────────────────────────
  //
  // Wrappers read-only-safe sobre RPC já existente + SELECT direto pra export.
  // Zero migration · zero RPC nova · zero alteração de schema.

  /**
   * Wrapper da RPC `leads_bulk_change_phase(p_ids text[], p_phase text)`.
   *
   * RPC é ATÔMICA por design (transação plpgsql única) · registra
   * `phase_history` automaticamente · respeita `_lead_phase_transition_allowed`
   * por lead (leads em transições inválidas são pulados pela RPC e contam
   * como falha agregada no retorno · não há partial commit).
   *
   * Retorno jsonb da RPC pode variar entre versões. Mapeio defensivamente:
   *   - { ok: true, updated: N } → usar updated
   *   - { ok: true, count: N }   → usar count
   *   - { ok: true } sem contagem → assumir ids.length
   *   - { ok: false, error }     → propagar
   *
   * NÃO chamar pra perdido/recuperação · phase 'perdido' não existe (virou
   * lifecycle_status · usar `markLost` em loop).
   */
  async bulkChangePhase(
    ids: string[],
    phase: LeadPhase,
  ): Promise<BulkChangePhaseResult> {
    if (ids.length === 0) return { ok: true, updated: 0, total: 0 }
    const { data, error } = await this.supabase.rpc('leads_bulk_change_phase', {
      p_ids: ids,
      p_phase: phase,
    })
    if (error) {
      return { ok: false, error: 'rpc_error', detail: error.message }
    }
    const parsed = data as
      | { ok?: boolean; error?: string; updated?: number; count?: number }
      | null
    if (!parsed?.ok) {
      return { ok: false, error: parsed?.error ?? 'unknown_error' }
    }
    const updated =
      typeof parsed.updated === 'number'
        ? parsed.updated
        : typeof parsed.count === 'number'
          ? parsed.count
          : ids.length
    return { ok: true, updated, total: ids.length }
  }

  /**
   * SELECT direto pra export CSV · escopo clinic_id + deleted_at NULL.
   *
   * Modos:
   *   - `ids` definido: exporta apenas esses leads (intersect com clinic_id).
   *   - `filter` definido (sem ids): aplica subset dos filtros da página.
   *   - nenhum: exporta até `limit` leads ativos.
   *
   * Cap hard de 5000 linhas pra evitar payload gigante (UI client downloads
   * blob de uma vez). Caller que precisar mais paginar manualmente.
   *
   * Campos projetados: somente o que a UI da lista de leads já mostra +
   * timestamps de auditoria. Nada sensível além disso.
   */
  async listForExport(
    clinicId: string,
    options: {
      filter?: ListLeadsFilter
      ids?: string[]
      limit?: number
    } = {},
  ): Promise<LeadExportRow[]> {
    const cap = Math.max(1, Math.min(options.limit ?? 5000, 5000))
    let q = this.supabase
      .from('leads')
      .select(
        'id, name, phone, email, phase, lifecycle_status, lost_from_phase, ' +
          'temperature, source, source_type, funnel, lead_score, ' +
          'queixas_faciais, created_at, updated_at, last_response_at',
      )
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(cap)

    if (options.ids && options.ids.length > 0) {
      q = q.in('id', options.ids)
    } else if (options.filter) {
      const f = options.filter
      if (f.phase) q = q.eq('phase', f.phase)
      if (f.temperature) q = q.eq('temperature', f.temperature)
      if (f.funnel) q = q.eq('funnel', f.funnel)
      if (f.sourceType) q = q.eq('source_type', f.sourceType)
      if (f.lifecycleStatus) q = q.eq('lifecycle_status', f.lifecycleStatus)
      if (f.search) {
        const term = f.search.replace(/%/g, '').replace(/,/g, ' ')
        q = q.or(
          `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
        )
      }
    }

    const { data } = await q
    // supabase-js infere `GenericStringError[]` quando o select é multi-line
    // string · cast via unknown pra projetar pro shape declarado em
    // `LeadExportRow` (colunas garantidas pelo schema · vide types.ts:8181).
    return ((data ?? []) as unknown) as LeadExportRow[]
  }
}

// ── BLOCO 3.1 · tipos exportados pro kanban ──────────────────────────────────

export interface KanbanLeadCard {
  id: string
  name: string
  phone: string | null
  status: string | null
  phase: string | null
  temperature: string | null
  priority: string | null
  assigned_to: string | null
  created_at: string
  /**
   * BLOCO 3.1A · true quando o lead vem do fallback (sem registro em
   * `lead_pipeline_positions`). UI mostra badge "Sem posição" e copy
   * explicando que primeira movimentação via drag-drop cria a posição.
   * Default false (lead já tem posição persistida via RPC).
   */
  isUnpositioned?: boolean
}

export interface KanbanStageRpc {
  slug: string
  label: string
  color: string | null
  sort_order: number
  leads: KanbanLeadCard[]
}

export type KanbanEvolutionResult =
  | {
      ok: true
      stages: KanbanStageRpc[]
      /**
       * BLOCO 3.1A · presente apenas quando fallback SELECT falhou
       * (`leads` query) · stages contém só os leads posicionados via RPC.
       * UI pode exibir alerta discreto.
       */
      fallbackWarning?: string
    }
  | { ok: false; error: string; detail?: string }

// ── BLOCO 3.5B · seed dos stages canônicos do pipeline `seven_days` ─────────
// Espelho da mig V1 20260513_sdr_seed_pipelines.sql · cores adaptadas pro tema
// dark do CRM V2 (intensidade crescente: neutro→info→warning→danger). Mantém
// `slug` idêntico ao banco pra garantir round-trip RPC.

export interface SevenDaysStageSeed {
  slug: string
  label: string
  /** Texto curto pra header da coluna · "Recém-criado", "Há 1 dia", etc. */
  hint: string
  /** Cor primária (string CSS) · usar em borda/badge. */
  color: string
  /** Tom de severidade · neutro/info/warning/danger. */
  tone: 'neutral' | 'info' | 'warning' | 'danger'
  sortOrder: number
  dayNumber: number | null
}

export const SEVEN_DAYS_STAGE_SEED: readonly SevenDaysStageSeed[] = [
  { slug: 'sem_data', label: 'Dia 0', hint: 'Recém-criado (< 1h)', color: '#94a3b8', tone: 'neutral', sortOrder: 0, dayNumber: 0 },
  { slug: 'dia_1', label: 'Dia 1', hint: '1h–1d', color: '#60a5fa', tone: 'info', sortOrder: 10, dayNumber: 1 },
  { slug: 'dia_2', label: 'Dia 2', hint: '1–2 dias', color: '#3b82f6', tone: 'info', sortOrder: 20, dayNumber: 2 },
  { slug: 'dia_3', label: 'Dia 3', hint: '2–3 dias', color: '#6366f1', tone: 'info', sortOrder: 30, dayNumber: 3 },
  { slug: 'dia_4', label: 'Dia 4', hint: '3–4 dias', color: '#f59e0b', tone: 'warning', sortOrder: 40, dayNumber: 4 },
  { slug: 'dia_5', label: 'Dia 5', hint: '4–5 dias', color: '#f97316', tone: 'warning', sortOrder: 50, dayNumber: 5 },
  { slug: 'dia_6', label: 'Dia 6', hint: '5–6 dias', color: '#ef4444', tone: 'danger', sortOrder: 60, dayNumber: 6 },
  { slug: 'dia_7_plus', label: 'Dia 7+', hint: '6+ dias', color: '#dc2626', tone: 'danger', sortOrder: 70, dayNumber: null },
] as const

// ── BLOCO 3.4B · tipos exportados pra bulk + export ─────────────────────────

export type BulkChangePhaseResult =
  | { ok: true; updated: number; total: number }
  | { ok: false; error: string; detail?: string }

export interface LeadExportRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  phase: string | null
  lifecycle_status: string | null
  lost_from_phase: string | null
  temperature: string | null
  source: string | null
  source_type: string | null
  funnel: string | null
  lead_score: number | null
  queixas_faciais: unknown
  created_at: string
  updated_at: string | null
  last_response_at: string | null
}
