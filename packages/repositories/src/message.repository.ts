/**
 * MessageRepository · acesso canonico a `wa_messages`.
 *
 * Multi-tenant ADR-028 · clinic_id explicito em saves (insert) · listagens
 * por conversation_id ja escopa indiretamente porque conv tem clinic_id.
 *
 * Dedup soft de Meta retry · janela default 60s (mesma regra do webhook legado).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
  mapMessageRow,
  type MessageDTO,
  type SaveInboundMessageInput,
  type SaveOutboundMessageInput,
} from './types'
export interface AIHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export class MessageRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async listByConversation(
    conversationId: string,
    opts: { limit?: number; ascending?: boolean } = {},
  ): Promise<MessageDTO[]> {
    const ascending = opts.ascending ?? true
    let q = this.supabase
      .from('wa_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending })

    if (opts.limit) q = q.limit(opts.limit)
    const { data } = await q
    return (data ?? []).map(mapMessageRow)
  }

  /**
   * Salva mensagem inbound (paciente · sender='user').
   * Caller passa clinic_id resolvido do tenant context (ADR-028).
   */
  async saveInbound(
    clinicId: string,
    input: SaveInboundMessageInput,
  ): Promise<string | null> {
    const id = uuidv4()
    const { error } = await this.supabase.from('wa_messages').insert({
      id,
      clinic_id: clinicId,
      conversation_id: input.conversationId,
      phone: input.phone,
      direction: 'inbound',
      sender: 'user',
      content: input.content,
      content_type: input.contentType ?? 'text',
      media_url: input.mediaUrl ?? null,
      status: 'received',
      sent_at: input.sentAt ?? new Date().toISOString(),
    })
    if (error) {
      // Bug 2026-05-03: erros silenciosos viraram preview com 'Sim' mas
      // wa_messages sem o registro · updateLastMessage rodava mesmo após
      // falha. Log explicito + return null pra caller poder pular
      // updateLastMessage (caller responsavel).
      console.error('[saveInbound] insert failed', {
        clinicId,
        conversationId: input.conversationId,
        contentType: input.contentType,
        contentPreview: input.content?.slice(0, 80),
        code: error.code,
        message: error.message,
        details: error.details,
      })
      return null
    }
    return id
  }

  async saveOutbound(
    clinicId: string,
    input: SaveOutboundMessageInput,
  ): Promise<string | null> {
    const id = input.id ?? uuidv4()
    const { error } = await this.supabase.from('wa_messages').insert({
      id,
      clinic_id: clinicId,
      conversation_id: input.conversationId,
      direction: 'outbound',
      sender: input.sender,
      content: input.content,
      content_type: input.contentType ?? 'text',
      media_url: input.mediaUrl ?? null,
      status: input.status ?? 'pending',
      sent_at: input.sentAt ?? new Date().toISOString(),
    })
    if (error) return null
    return id
  }

  async updateStatus(messageId: string, status: string): Promise<void> {
    await this.supabase.from('wa_messages').update({ status }).eq('id', messageId)
  }

  /**
   * Sprint C · SC-03 (W-11): Salva nota interna · NAO envia ao paciente.
   * Usa direction='outbound' + sender='atendente' + internal_note=true.
   * UI filtra internal_note=true pra renderizar amarelo · webhook ignora.
   */
  async saveInternalNote(
    clinicId: string,
    input: {
      conversationId: string
      content: string
      sender?: string
      sentAt?: string
    },
  ): Promise<string | null> {
    const id = uuidv4()
    try {
      const { error } = await this.supabase.from('wa_messages').insert({
        id,
        clinic_id: clinicId,
        conversation_id: input.conversationId,
        direction: 'outbound',
        sender: input.sender ?? 'humano',
        content: input.content,
        content_type: 'text',
        status: 'note',
        internal_note: true,
        sent_at: input.sentAt ?? new Date().toISOString(),
      })
      if (error) return null
      return id
    } catch {
      return null
    }
  }

  /**
   * Sprint C · SC-01 (W-06): Atualiza delivery_status pelo webhook do
   * WhatsApp Cloud API. Match por wamid (Meta provider message id) que
   * persistimos no campo `id` quando enviamos via cloud.
   */
  async updateDeliveryStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
  ): Promise<void> {
    try {
      await this.supabase
        .from('wa_messages')
        .update({ delivery_status: status })
        .eq('id', messageId)
    } catch {
      // Coluna nao existe (mig 86 pendente) · degrada silencioso
    }
  }

  /**
   * Detecta retry da Meta · mesmo content na mesma conv nos últimos N segundos.
   * Returns true se duplicata · caller deve abortar.
   */
  async findRecentDuplicate(
    conversationId: string,
    content: string,
    windowSeconds = 60,
  ): Promise<boolean> {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
    const { data } = await this.supabase
      .from('wa_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('content', content)
      .gte('sent_at', since)
      .maybeSingle()

    return !!data
  }

  /**
   * Bug 2026-05-03 (Evolution duplicate): paciente manda audio · Evolution
   * envia 2 webhooks (audioMessage + textMessage com transcrição própria).
   * App salvou as 2 · UI mostra "transcrição separada do áudio".
   *
   * Dedup contextual: ao salvar audio com transcrição, procura text recente
   * (≤90s) na mesma conv com conteúdo similar e remove (audio vence · tem
   * mediaUrl + transcrição).
   *
   * Match: primeiros 30 chars normalizados (lower · sem pontuação · sem
   * espaços extras). Suficiente pra detectar transcrição vs texto·sem
   * falsos positivos.
   */
  async deleteTextDuplicateOfAudio(
    conversationId: string,
    audioContent: string,
    windowSeconds = 90,
  ): Promise<number> {
    const norm = (s: string): string =>
      s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
    const audioNorm = norm(audioContent)
    if (audioNorm.length < 8) return 0 // muito curto · risco falso positivo
    // Prefix 15 chars · pega "para"/"pra" e diferenças similares na transcrição
    const audioPrefix = audioNorm.slice(0, 15)

    const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
    const { data } = await this.supabase
      .from('wa_messages')
      .select('id, content')
      .eq('conversation_id', conversationId)
      .eq('content_type', 'text')
      .eq('direction', 'inbound')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(5)
    if (!data || !data.length) return 0

    const candidates = data.filter((m) => {
      const k = norm((m as { content?: string }).content ?? '')
      if (k.length < 8) return false
      const textPrefix = k.slice(0, 15)
      return textPrefix === audioPrefix
    })
    if (!candidates.length) return 0

    const ids = candidates.map((c) => (c as { id: string }).id)
    await this.supabase.from('wa_messages').delete().in('id', ids)
    return ids.length
  }

  /**
   * Verifica se chegou nova mensagem inbound apos `sentAt` · usado pelo
   * debounce de 5s (agrupa fotos/áudios disparados juntos).
   */
  async hasInboundAfter(conversationId: string, sentAt: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('wa_messages')
      .select('sent_at')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()

    if (!data) return false
    // 10ms grace pra clock skew
    return new Date(data.sent_at).getTime() > new Date(sentAt).getTime() + 10
  }

  /**
   * Conta inbound numa conv · usado pelo selector de fixed responses
   * (ai.service.getFixedResponse depende de message_count).
   */
  async countInbound(conversationId: string): Promise<number> {
    const { count } = await this.supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
    return count ?? 0
  }

  /**
   * Conta outbound da Lara nas últimas N horas · usado pelo guard daily limit.
   */
  async countLaraOutboundSince(
    conversationId: string,
    sinceIso: string,
  ): Promise<number> {
    const { count } = await this.supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .eq('sender', 'lara')
      .gte('sent_at', sinceIso)
    return count ?? 0
  }

  /**
   * Histórico ultimas N mensagens em formato Anthropic (role=user/assistant).
   * Inbound vira 'user', outbound vira 'assistant'.
   */
  async getHistoryForAI(
    conversationId: string,
    limit = 30,
  ): Promise<AIHistoryMessage[]> {
    // BUG FIX 2026-04-28: ASC + LIMIT pegava as N PRIMEIRAS (mais antigas).
    // Conversation com 70+ msgs · Lara via templates antigos e ignorava
    // contexto recente. DESC + LIMIT + reverse() pega as N MAIS RECENTES
    // em ordem cronológica (oldest → newest) que é o que Claude espera.
    const { data } = await this.supabase
      .from('wa_messages')
      .select('direction, content')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit)

    return (data ?? [])
      .slice()
      .reverse()
      .map((h: any) => ({
        role: (h.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: String(h.content ?? ''),
      }))
  }

  /**
   * Counts in/out por janela temporal (dashboard cards).
   * Returns { inbound, outbound } pra evitar 2 queries no caller.
   */
  async countByDirection(
    clinicId: string,
    sinceIso: string,
  ): Promise<{ inbound: number; outbound: number }> {
    const [inbound, outbound] = await Promise.all([
      this.supabase
        .from('wa_messages')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('direction', 'inbound')
        .gte('sent_at', sinceIso),
      this.supabase
        .from('wa_messages')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('direction', 'outbound')
        .gte('sent_at', sinceIso),
    ])

    return {
      inbound: inbound.count ?? 0,
      outbound: outbound.count ?? 0,
    }
  }
}
