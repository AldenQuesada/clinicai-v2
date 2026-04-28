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
import type { Database } from '@clinicai/supabase'

export type StatusFilter = 'active' | 'archived' | 'resolved' | 'dra'

export class ConversationRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

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
  ): Promise<ConversationDTO[]> {
    let statuses: ConversationStatus[] = ['active', 'paused']
    if (filter === 'archived') statuses = ['archived']
    if (filter === 'resolved') statuses = ['resolved']
    if (filter === 'dra') statuses = ['dra']

    const { data } = await this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('status', statuses)
      .order('last_message_at', { ascending: false })

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
  }): Promise<Array<{ id: string; phone: string; leadId: string | null; clinicId: string }>> {
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('id, phone, lead_id, clinic_id')
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
    }))
  }
}
