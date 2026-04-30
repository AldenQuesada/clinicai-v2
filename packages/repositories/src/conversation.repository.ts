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
export type StatusFilter = 'active' | 'archived' | 'resolved' | 'dra'

export class ConversationRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca conversation em qualquer variante de telefone (status amplo).
   * Auto-revive: se status='archived', flipa pra 'active' antes de retornar.
   */
  async findActiveByPhoneVariants(
    clinicId: string,
    variants: string[],
  ): Promise<ConversationDTO | null> {
    if (!variants.length) return null

    const { data } = await this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .in('status', ['active', 'paused', 'archived'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

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
    opts?: { limit?: number; beforeIso?: string },
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

    const { data } = await q
    return (data ?? []).map(mapConversationRow)
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
   * Insights agregados pro top bar do /conversas · 5 counts em paralelo.
   *
   * Definicoes (mirror api/conversations/route.ts:isUrgent):
   *  - urgentes: ai_enabled=false AND last_lead_msg < (now - 5min)
   *    (atendente assumiu mas paciente respondeu ha mais de 5min · esfriando)
   *  - aguardando: ai_enabled=false AND (last_lead_msg >= (now - 5min) OR null)
   *    (atendente assumiu, paciente respondeu recente · ainda quente)
   *  - lara_ativa: ai_enabled=true (Lara conduzindo)
   *  - resolvidos_hoje: status=resolved AND last_message_at >= todayStartIso
   *  - novos_leads: leads.created_at >= todayStartIso (contatos NOVOS hoje ·
   *    nao mensagens novas de leads existentes)
   *
   * Multi-tenant: clinic_id via JWT no caller. Promise.all roda em paralelo.
   */
  async getInsights(
    clinicId: string,
    opts: { fiveMinAgoIso: string; todayStartIso: string },
  ): Promise<{
    urgentes: number
    aguardando: number
    laraAtiva: number
    resolvidosHoje: number
    novosLeads: number
  }> {
    const activeStatuses: ConversationStatus[] = ['active', 'paused']
    const [urgentesQ, aguardandoQ, laraAtivaQ, resolvidosQ, novosLeadsQ] = await Promise.all([
      this.supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('ai_enabled', false)
        .lt('last_lead_msg', opts.fiveMinAgoIso),
      this.supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('ai_enabled', false)
        .or(`last_lead_msg.gte.${opts.fiveMinAgoIso},last_lead_msg.is.null`),
      this.supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('ai_enabled', true),
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
    return {
      urgentes: urgentesQ.count ?? 0,
      aguardando: aguardandoQ.count ?? 0,
      laraAtiva: laraAtivaQ.count ?? 0,
      resolvidosHoje: resolvidosQ.count ?? 0,
      novosLeads: novosLeadsQ.count ?? 0,
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
