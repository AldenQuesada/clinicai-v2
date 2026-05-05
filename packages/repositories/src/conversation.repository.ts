/**
 * ConversationRepository · acesso canonico a `wa_conversations`.
 *
 * Auto-revive (ADR-028 + lara webhook): conversation 'archived' que recebe
 * mensagem volta pra 'active' antes de retornar · evita criar duplicata.
 *
 * Multi-tenant ADR-028 · clinic_id explicito em todas listagens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
  mapConversationRow,
  type ConversationDTO,
  type ConversationStatus,
  type CreateConversationInput,
} from './types'
import { computeSla } from './sla'
export type StatusFilter = 'active' | 'archived' | 'resolved' | 'dra'

export class ConversationRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca conversation em qualquer variante de telefone (status amplo).
   * Auto-revive: se status='archived', flipa pra 'active' antes de retornar.
   *
   * Mig 100/101 · multi-canal:
   *   Se waNumberId fornecido → filtra por canal (cada wa_number tem sua conv
   *   pro mesmo paciente). Caso de admin testando 2 canais ou paciente que
   *   contata clinic via Lara IA + Secretaria humana usa 2 convs separadas.
   *   Se waNumberId NULL/omitido → busca em qualquer canal (legacy compat).
   */
  async findActiveByPhoneVariants(
    clinicId: string,
    variants: string[],
    waNumberId?: string | null,
  ): Promise<ConversationDTO | null> {
    if (!variants.length) return null

    let q = this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .in('status', ['active', 'paused', 'archived'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)

    // Scope por canal · permite 2 convs (1 por wa_number) pro mesmo paciente
    if (waNumberId) {
      q = q.eq('wa_number_id', waNumberId)
    }

    const { data } = await q.maybeSingle()

    if (!data) return null

    if (data.status === 'archived') {
      await this.supabase
        .from('wa_conversations')
        .update({ status: 'active', ai_enabled: true })
        .eq('id', data.id)
      data.status = 'active'
      data.ai_enabled = true
    }

    return mapConversationRow(data)
  }

  async create(
    clinicId: string,
    input: CreateConversationInput,
  ): Promise<ConversationDTO | null> {
    const now = new Date().toISOString()
    const { data, error } = await this.supabase
      .from('wa_conversations')
      .insert({
        id: uuidv4(),
        clinic_id: clinicId,
        phone: input.phone,
        lead_id: input.leadId,
        display_name: input.displayName ?? null,
        status: input.status ?? 'active',
        ai_enabled: input.aiEnabled ?? true,
        // Mig 91 · trigger fn_wa_conversations_inbox_role_sync copia inbox_role
        // do wa_numbers automaticamente quando wa_number_id e setado. Sem
        // wa_number_id, default 'sdr' (legacy/Evolution).
        wa_number_id: input.waNumberId ?? null,
        created_at: now,
        last_message_at: now,
      })
      .select()
      .single()

    if (error || !data) return null
    return mapConversationRow(data)
  }

  async getById(conversationId: string): Promise<ConversationDTO | null> {
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle()
    return data ? mapConversationRow(data) : null
  }

  /**
   * Lista conversas por filtro de status (usado pelo /api/conversations + dashboard).
   * Multi-tenant: clinic_id obrigatorio · escopa por clinica do JWT.
   */
  async listByStatus(
    clinicId: string,
    filter: StatusFilter = 'active',
    opts?: { limit?: number; beforeIso?: string; inboxRole?: 'sdr' | 'secretaria' },
  ): Promise<ConversationDTO[]> {
    let statuses: ConversationStatus[] = ['active', 'paused']
    if (filter === 'archived') statuses = ['archived']
    if (filter === 'resolved') statuses = ['resolved']
    if (filter === 'dra') statuses = ['dra']

    // P-02 (2026-04-29): paginacao cursor-based em last_message_at desc.
    // limit default 50 cobre carga inicial · cliente chama com beforeIso pro
    // proximo lote. Cursor evita pular linhas em concurrent updates (offset
    // shift bug em workloads write-heavy).
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50))

    let q = this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('status', statuses)
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (opts?.beforeIso) {
      q = q.lt('last_message_at', opts.beforeIso)
    }

    // Mig 91 · filter por inbox · /conversas (sdr=Lara) vs /secretaria.
    // Default 'sdr' quando omitido (compat com callers existentes).
    if (opts?.inboxRole) {
      q = q.eq('inbox_role', opts.inboxRole)
    }

    const { data } = await q
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? []
    if (rows.length === 0) return []

    // SLA secretaria · 1 query auxiliar batched pra resolver lastHumanReplyAt
    // por conversa. Single source of truth = computeSla() no mapper.
    const ids = rows.map((r) => String(r.id))
    const humanReplies = await this.getLastHumanReplyByConvs(ids)
    return rows.map((row) => mapConversationRow(row, humanReplies.get(String(row.id)) ?? null))
  }

  /**
   * Resolve a última resposta humana válida por conversation_id em batch.
   * Critério canônico (Alden 2026-05-04 · sla.ts):
   *   direction = 'outbound'
   *   AND sender   = 'humano'
   *   AND deleted_at IS NULL
   *   AND status IS DISTINCT FROM 'note'
   *
   * Retorna Map<conversation_id, ISO sent_at> com a mais recente por conv.
   * Conversas sem resposta humana ficam fora do Map (caller usa null default).
   *
   * Usado por listByStatus + getInsights pra alimentar computeSla(). UI nunca
   * recalcula a regra · só renderiza response_color / minutes_waiting / pulse.
   */
  async getLastHumanReplyByConvs(
    conversationIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (conversationIds.length === 0) return result

    const { data } = await this.supabase
      .from('wa_messages')
      .select('conversation_id, sent_at')
      .in('conversation_id', conversationIds)
      .eq('direction', 'outbound')
      .eq('sender', 'humano')
      .is('deleted_at', null)
      // status IS DISTINCT FROM 'note' · cobre tanto NULL quanto valores ≠ 'note'
      .or('status.is.null,status.neq.note')
      .order('sent_at', { ascending: false })

    // Como ordenamos DESC por sent_at, a primeira ocorrência por conversation_id
    // é a mais recente. Set apenas no primeiro hit · ignora subsequentes.
    for (const row of (data ?? []) as Array<{
      conversation_id: string
      sent_at: string
    }>) {
      const cid = String(row.conversation_id)
      if (!result.has(cid)) result.set(cid, String(row.sent_at))
    }
    return result
  }

  /**
   * Mig 91 · seta wa_number_id em conv existente · trigger
   * fn_wa_conversations_inbox_role_sync sincroniza inbox_role do wa_numbers.
   * Usado pelo backfill de convs legacy criadas pela wa-inbound (que nao
   * preenchia wa_number_id) quando recebe nova mensagem agora.
   */
  async setWaNumber(
    conversationId: string,
    waNumberId: string,
  ): Promise<ConversationDTO | null> {
    const { data, error } = await this.supabase
      .from('wa_conversations')
      .update({ wa_number_id: waNumberId })
      .eq('id', conversationId)
      .select()
      .maybeSingle()

    if (error || !data) return null
    return mapConversationRow(data)
  }

  /**
   * Atualiza last_message_at + last_message_text (snapshot pro inbox).
   * Truncate text em 200 chars (mesma regra do webhook legado).
   */
  async updateLastMessage(
    conversationId: string,
    text: string,
    isInbound: boolean,
    when?: string,
  ): Promise<void> {
    const ts = when ?? new Date().toISOString()
    const patch: Record<string, unknown> = {
      last_message_at: ts,
      last_message_text: text.substring(0, 200),
    }
    if (isInbound) patch.last_lead_msg = ts
    await this.supabase.from('wa_conversations').update(patch).eq('id', conversationId)
  }

  /**
   * Set ai_paused_until + ai_enabled num único update.
   * Quando until=null e enabled=true, libera IA imediatamente.
   */
  async updateAiPause(
    conversationId: string,
    update: {
      pausedUntil: string | null
      aiEnabled: boolean
      pausedBy?: string | null
      status?: ConversationStatus
    },
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      ai_paused_until: update.pausedUntil,
      ai_enabled: update.aiEnabled,
    }
    if (update.pausedBy !== undefined) patch.paused_by = update.pausedBy
    if (update.status) patch.status = update.status
    await this.supabase.from('wa_conversations').update(patch).eq('id', conversationId)
  }

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.supabase
      .from('wa_conversations')
      .update({ status })
      .eq('id', conversationId)
  }

  /**
   * P-12 · atribui conversa a um membro da clinic via RPC atomico
   * (wa_conversation_assign). Retorna estado final · UI reconcilia
   * em race entre 2 atendentes.
   */
  async assignConversation(
    conversationId: string,
    userId: string,
  ): Promise<{
    ok: boolean
    error?: string
    assignedTo?: string
    assignedAt?: string
  }> {
    const { data, error } = await this.supabase.rpc('wa_conversation_assign', {
      p_conversation_id: conversationId,
      p_user_id: userId,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    // RPC retorna jsonb · supabase devolve o objeto direto
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
      assignedTo: result.assigned_to ?? undefined,
      assignedAt: result.assigned_at ?? undefined,
    }
  }

  /**
   * P-12 · libera conversa (assigned_to = NULL).
   */
  async unassignConversation(
    conversationId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_conversation_unassign', {
      p_conversation_id: conversationId,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
    }
  }

  /**
   * Mig 91 · handoff atomico Lara→Secretaria via RPC.
   * Pausa Lara 30d + dispara inbox_notification (kind=handoff_secretaria).
   * Idempotente · retorna already_handed_off=true em re-chamada.
   */
  async handoffSecretaria(
    conversationId: string,
    reason?: string,
  ): Promise<{ ok: boolean; error?: string; alreadyHandedOff?: boolean }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'wa_conversation_handoff_secretaria',
      {
        p_conversation_id: conversationId,
        p_reason: reason ?? null,
      },
    )
    if (error) {
      return { ok: false, error: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
      alreadyHandedOff: result.already_handed_off === true,
    }
  }

  /**
   * P-12 · le assignment atual de uma conversa (sem JOIN com profiles ·
   * o caller resolve o profile via useClinicMembers cache pra evitar N+1).
   */
  async getAssignment(conversationId: string): Promise<{
    assignedTo: string | null
    assignedAt: string | null
  } | null> {
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('assigned_to, assigned_at')
      .eq('id', conversationId)
      .maybeSingle()
    if (!data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    return {
      assignedTo: row.assigned_to ?? null,
      assignedAt: row.assigned_at ?? null,
    }
  }

  /**
   * Conta conversations num filtro · usado pelo dashboard pra cards.
   * Composição estilo: { aiEnabled?, statuses?, lastMessageSince? }.
   */
  async count(
    clinicId: string,
    filter: {
      statuses?: ConversationStatus[]
      aiEnabled?: boolean
      lastMessageSince?: string
    },
  ): Promise<number> {
    let q = this.supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filter.statuses?.length) q = q.in('status', filter.statuses)
    if (filter.aiEnabled !== undefined) q = q.eq('ai_enabled', filter.aiEnabled)
    if (filter.lastMessageSince) q = q.gte('last_message_at', filter.lastMessageSince)

    const { count } = await q
    return count ?? 0
  }

  /**
   * Insights agregados pro top bar do /conversas.
   *
   * Definições canônicas (Alden 2026-05-04/05 · sla.ts é source of truth):
   *
   *  - aguardando:    waitingHumanResponse = true E !assigned_to_doctor.
   *                   Computado por computeSla sobre last_lead_msg vs
   *                   MAX(sent_at) WHERE sender='humano' AND status≠'note'.
   *                   Lara/IA NÃO conta como resposta humana. Conversas
   *                   atribuídas à Dra (assigned_to=doctorUserId) saem da
   *                   fila secretária · contam em `dra`.
   *
   *  - urgentes:      subset de aguardando onde responseColor ∈
   *                   { 'vermelho', 'critico', 'atrasado_fixo', 'antigo_parado' }
   *                   (≥ 7min sem resposta humana · não-Dra).
   *
   *  - dra:           assigned_to = doctorUserId AND status IN ('active','paused')
   *                   (transferidas pra fila Dra · indep. de SLA).
   *
   *  - lara_ativa:    ai_enabled = true E !assigned_to_doctor (Lara só
   *                   conduz convs que ainda estão na fila secretária).
   *
   *  - resolvidos_hoje: status='resolved' AND last_message_at >= todayStartIso.
   *
   *  - novos_leads:   leads.created_at >= todayStartIso (contatos NOVOS hoje ·
   *                   não mensagens novas de leads existentes).
   *
   * Implementação: 3 queries em paralelo via Promise.all + 1 query auxiliar
   * pra resolver lastHumanReplyAt em batch. Counters varridos em TS sobre
   * activeConvs (volume baixo · até alguns milhares de convs por clinic é
   * trivial). Resolvidos_hoje e novos_leads continuam count(*) puro.
   *
   * Param `fiveMinAgoIso` mantido na assinatura por compat (não usado aqui ·
   * thresholds vivem em sla.ts agora).
   *
   * Param `doctorUserId` (opcional · default null): user_id da doutora pra
   * separar fila Dra da fila secretária. Quando null/omitido, fila Dra fica
   * em zero e nada é excluído de aguardando · comportamento idêntico ao
   * pre-doctor. Single-tenant V2 hoje: caller passa
   * apps/lara/src/lib/clinic-profiles.DOCTOR_USER_ID.
   *
   * Multi-tenant: clinic_id via JWT no caller.
   */
  async getInsights(
    clinicId: string,
    opts: { fiveMinAgoIso: string; todayStartIso: string; doctorUserId?: string | null },
  ): Promise<{
    urgentes: number
    aguardando: number
    laraAtiva: number
    resolvidosHoje: number
    novosLeads: number
    dra: number
  }> {
    const activeStatuses: ConversationStatus[] = ['active', 'paused']
    const _unused = opts.fiveMinAgoIso // kept for backward-compat assinatura
    void _unused
    const now = new Date()
    const doctorUserId = opts.doctorUserId ?? null

    const [activeConvsRes, resolvidosQ, novosLeadsQ] = await Promise.all([
      this.supabase
        .from('wa_conversations')
        .select('id, last_lead_msg, ai_enabled, assigned_to')
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses),
      this.supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'resolved')
        .gte('last_message_at', opts.todayStartIso),
      this.supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .gte('created_at', opts.todayStartIso),
    ])

    const activeConvs = (activeConvsRes.data ?? []) as Array<{
      id: string
      last_lead_msg: string | null
      ai_enabled: boolean | null
      assigned_to: string | null
    }>
    const ids = activeConvs.map((c) => String(c.id))
    const humanReplies = await this.getLastHumanReplyByConvs(ids)

    let aguardando = 0
    let urgentes = 0
    let laraAtiva = 0
    let dra = 0
    for (const c of activeConvs) {
      // Conversa atribuída à Dra · vai pra fila Dra, sai das filas
      // secretária/Lara. Decisão Alden 2026-05-05 · "Aguardando é fila da
      // Luciana, Dra é fila da Mirian, Todas é visão geral".
      if (doctorUserId && c.assigned_to === doctorUserId) {
        dra++
        continue
      }
      if (c.ai_enabled !== false) laraAtiva++
      const sla = computeSla({
        lastPatientMsgAt: c.last_lead_msg ?? null,
        lastHumanReplyAt: humanReplies.get(String(c.id)) ?? null,
        now,
      })
      if (!sla.waitingHumanResponse) continue
      aguardando++
      if (
        sla.responseColor === 'vermelho' ||
        sla.responseColor === 'critico' ||
        sla.responseColor === 'atrasado_fixo' ||
        sla.responseColor === 'antigo_parado'
      ) {
        urgentes++
      }
    }

    return {
      urgentes,
      aguardando,
      laraAtiva,
      resolvidosHoje: resolvidosQ.count ?? 0,
      novosLeads: novosLeadsQ.count ?? 0,
      dra,
    }
  }

  /**
   * Sprint B (2026-04-29): Copiloto AI cache.
   * getCopilot le ai_copilot + ai_copilot_at + last_message_at pra decidir
   * se cache esta fresco. Tolerante a coluna ausente (migration pode nao
   * ter sido aplicada ainda) · retorna null sem propagar erro.
   */
  async getCopilot(conversationId: string): Promise<{
    aiCopilot: unknown | null
    aiCopilotAt: string | null
    lastMessageAt: string | null
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('wa_conversations')
        .select('ai_copilot, ai_copilot_at, last_message_at')
        .eq('id', conversationId)
        .maybeSingle()
      if (error || !data) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any
      return {
        aiCopilot: row.ai_copilot ?? null,
        aiCopilotAt: row.ai_copilot_at ?? null,
        lastMessageAt: row.last_message_at ?? null,
      }
    } catch {
      // Coluna ainda nao existe (migration pendente) · degrada silencioso
      return null
    }
  }

  /**
   * Sprint B: Persiste output do copiloto AI no cache. Idempotente · sobrescreve
   * versao anterior. Tolerante a coluna ausente.
   */
  async updateCopilot(conversationId: string, copilot: unknown): Promise<void> {
    try {
      await this.supabase
        .from('wa_conversations')
        .update({
          ai_copilot: copilot,
          ai_copilot_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    } catch {
      // Coluna ausente · ignora silencioso · proxima request re-gera
    }
  }

  async setReactivationSent(conversationId: string, value = true): Promise<void> {
    await this.supabase
      .from('wa_conversations')
      .update({ reactivation_sent: value })
      .eq('id', conversationId)
  }

  /**
   * Busca conversations 'active' candidatas a reativação D1 (cron 23h-26h).
   * Retorna campos mínimos · cron usa só id/phone/lead_id/clinic_id.
   */
  async findReactivationCandidates(window: {
    olderThan: string
    newerThan: string
  }): Promise<Array<{
    id: string
    phone: string
    leadId: string | null
    clinicId: string
    waNumberId: string | null
  }>> {
    // Camada 3.5 (audit 2026-04-28): incluido wa_number_id pra cron
    // reactivate poder resolver credenciais Cloud API per-tenant via
    // createWhatsAppCloudFromWaNumber. Sem isso, fallback env global.
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('id, phone, lead_id, clinic_id, wa_number_id')
      .eq('status', 'active')
      .eq('reactivation_sent', false)
      .lte('last_lead_msg', window.olderThan)
      .gte('last_lead_msg', window.newerThan)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      phone: String(r.phone ?? ''),
      leadId: r.lead_id ?? null,
      clinicId: String(r.clinic_id),
      waNumberId: r.wa_number_id ?? null,
    }))
  }
}
