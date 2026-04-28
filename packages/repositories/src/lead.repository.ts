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
import { phoneVariants } from '@clinicai/utils'
import {
  mapLeadRow,
  mapRpcResult,
  type CreateLeadInput,
  type DedupHit,
  type LeadDTO,
  type LeadCreateRpcInput,
  type LeadCreateResult,
  type LeadToAppointmentRpcInput,
  type LeadToAppointmentResult,
  type LeadToOrcamentoRpcInput,
  type LeadToOrcamentoResult,
  type LeadToPacienteResult,
  type LeadLostResult,
  type SdrChangePhaseResult,
  type LeadPhase,
} from './types'
export class LeadRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca lead em qualquer variante de telefone (com/sem 9 inicial).
   * Caller passa `phoneVariants(phone)` ja calculado · package utils.
   */
  /**
   * Dedup global pre-emit voucher · varredura cross-tabela em paralelo.
   *
   * Retorna o "hit mais forte" (patient > lead > voucher_recipient > partner_referral).
   * Se nada bate, retorna null e o caller (b2b-emit-voucher) prossegue normal.
   *
   * Tabelas consultadas:
   *   - leads (separado em phase='patient' vs resto)
   *   - b2b_vouchers (recipient_phone)
   *   - b2b_attributions (via lead_id · join leads)
   *
   * Schema canonico vive no clinic-dashboard · clinicai-v2 nao tem tabela
   * `patients` separada (ADR REFACTOR_LEAD_MODEL: leads.phase='patient' e a
   * fonte de verdade). Quando a v2 ganhar tabela patients propria, expandir
   * aqui sem mudar contrato.
   *
   * `name` recebido apenas como sanity (nao bloqueia · phone que decide).
   *
   * @param clinicId  Multi-tenant ADR-028 · obrigatorio
   * @param phone     Telefone do recipient (qualquer formato · normaliza interno)
   * @param _name     Nome do recipient · reservado pra logging futuro
   */
  async findInAnySystem(
    clinicId: string,
    phone: string,
    _name?: string | null,
  ): Promise<DedupHit | null> {
    const variants = phoneVariants(phone)
    if (!variants.length) return null

    // 4 queries paralelas · todas filtradas por clinic_id (ADR-028)
    const [leadRes, voucherRes, attribRes] = await Promise.all([
      // Leads (qualquer phase) · pega created_at mais antigo
      this.supabase
        .from('leads')
        .select('id, name, phone, phase, created_at')
        .eq('clinic_id', clinicId)
        .in('phone', variants)
        .order('created_at', { ascending: true })
        .limit(5),
      // Vouchers · recipient_phone variants (qualquer status · evita re-emit)
      this.supabase
        .from('b2b_vouchers')
        .select('id, recipient_name, recipient_phone, partnership_id, issued_at')
        .eq('clinic_id', clinicId)
        .in('recipient_phone', variants)
        .order('issued_at', { ascending: true })
        .limit(5),
      // Attributions · join via lead_id (b2b_attributions nao tem phone direto)
      // Buscar leads.id por phone variants e checar attribution
      this.supabase
        .from('leads')
        .select('id, name, created_at, b2b_attributions(id, partnership_id, created_at)')
        .eq('clinic_id', clinicId)
        .in('phone', variants)
        .limit(5),
    ])

    // Hit candidato por kind · escolhe o mais forte
    const leadRows = (leadRes.data ?? []) as Array<{
      id: string
      name: string | null
      phone: string
      phase: string | null
      created_at: string
    }>

    // 1. patient (phase='patient' · prioridade maxima)
    const patientRow = leadRows.find((r) => r.phase === 'patient')
    if (patientRow) {
      return {
        kind: 'patient',
        id: String(patientRow.id),
        name: patientRow.name ?? null,
        phone: String(patientRow.phone ?? ''),
        since: patientRow.created_at ?? new Date().toISOString(),
      }
    }

    // 2. lead (qualquer phase != patient · pega o mais antigo)
    if (leadRows.length > 0) {
      const r = leadRows[0]
      return {
        kind: 'lead',
        id: String(r.id),
        name: r.name ?? null,
        phone: String(r.phone ?? ''),
        since: r.created_at ?? new Date().toISOString(),
      }
    }

    // 3. voucher_recipient · indicada antes (status irrelevante)
    const voucherRows = (voucherRes.data ?? []) as Array<{
      id: string
      recipient_name: string | null
      recipient_phone: string | null
      partnership_id: string | null
      issued_at: string
    }>
    if (voucherRows.length > 0) {
      // Mais antigo · oldest first ja ordenado
      const v = voucherRows[0]
      // Resolve partnership name best-effort · 1 query simples
      let partnershipName: string | null = null
      if (v.partnership_id) {
        const { data: p } = await this.supabase
          .from('b2b_partnerships')
          .select('name')
          .eq('id', v.partnership_id)
          .maybeSingle()
        partnershipName = (p as { name?: string } | null)?.name ?? null
      }
      return {
        kind: 'voucher_recipient',
        id: String(v.id),
        name: v.recipient_name ?? null,
        phone: String(v.recipient_phone ?? ''),
        since: v.issued_at ?? new Date().toISOString(),
        partnershipName,
      }
    }

    // 4. partner_referral · attribution via lead.id que nao caiu em (1)/(2)
    //    Esse caminho cobre o edge: lead foi removido fisicamente mas
    //    attribution sobrou (raro · soft delete). Em pratica, se chegou aqui
    //    e nao tinha lead, attribution tambem nao existe. Mantemos o ramo
    //    consistente com o contrato.
    const attribRows = (attribRes.data ?? []) as Array<{
      id: string
      name: string | null
      created_at: string
      b2b_attributions: Array<{
        id: string
        partnership_id: string | null
        created_at: string
      }> | null
    }>
    for (const r of attribRows) {
      const attribs = Array.isArray(r.b2b_attributions) ? r.b2b_attributions : []
      if (attribs.length > 0) {
        const a = attribs[0]
        let partnershipName: string | null = null
        if (a.partnership_id) {
          const { data: p } = await this.supabase
            .from('b2b_partnerships')
            .select('name')
            .eq('id', a.partnership_id)
            .maybeSingle()
          partnershipName = (p as { name?: string } | null)?.name ?? null
        }
        return {
          kind: 'partner_referral',
          id: String(r.id),
          name: r.name ?? null,
          phone: variants[0],
          since: a.created_at ?? r.created_at ?? new Date().toISOString(),
          partnershipName,
        }
      }
    }

    return null
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

    const { data } = await this.supabase
      .from('leads')
      .select('id, name, phone, phase, temperature, funnel, queixas_faciais, ai_persona, lead_score, tags, clinic_id, idade, day_bucket, last_response_at, created_at')
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
    const itemsForDb = input.items.map((it) => ({
      name: it.name,
      qty: it.qty,
      unit_price: it.unitPrice,
      subtotal: it.subtotal,
      ...(it.procedureCode ? { procedure_code: it.procedureCode } : {}),
    }))
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
