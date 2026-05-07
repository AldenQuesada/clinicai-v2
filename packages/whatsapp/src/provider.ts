/**
 * WhatsAppProvider · interface canonica pra qualquer provider WhatsApp.
 *
 * Lara usa Cloud (Meta Graph v21). Mira usa Evolution API (self-hosted Baileys).
 * As 2 implementacoes (cloud.ts e evolution.ts) seguem essa interface, entao
 * services downstream podem trocar provider sem refactor.
 *
 * Boundary contratual: nada de Meta-specific ou Evolution-specific aqui ·
 * payload domain (phone, text, audio url) so.
 */

export interface WhatsAppSendResult {
  ok: boolean
  /** Provider-specific raw response (ex: Meta `data.messages[0].id` ou Evolution `key.id`) */
  data?: unknown
  /** wa_message_id retornado · null se falhou */
  messageId?: string | null
  error?: string
}

export interface WhatsAppMediaDownload {
  buffer: Buffer
  contentType: string
  /** Base64 do conteudo · presente quando provider retorna direto (Evolution) */
  base64?: string
}

/**
 * Quoted reply (Baileys / Evolution).
 *
 * Construir externamente · provider só serializa pro body. `remoteJid` deve
 * vir do caller (wa_conversations.remote_jid OU `${phone}@s.whatsapp.net`
 * como fallback). `fromMe` é derivado de direction (outbound→true, inbound→false).
 * `text` opcional · usado pra preencher o snippet do quote no Baileys.
 */
export interface QuotedRefBaileys {
  remoteJid: string
  fromMe: boolean
  id: string
  text?: string | null
}

/**
 * Opções pra sendText. Mig 143 (2026-05-07) · suporta quoted reply real.
 *
 * Cobertura cross-provider:
 *   - Cloud: passa `quotedProviderMsgId` (wamid.*) → vira `context.message_id`
 *   - Evolution/Baileys: passa `quotedBaileys` completo → vira `quoted` no body
 *
 * Caller decide qual campo populate baseado no transport detectado · zero
 * impedance no provider. Ambos opcionais · sem opts == comportamento legacy.
 */
export interface SendTextOptions {
  /** Provider id da mensagem alvo · Cloud wamid · Evolution/Baileys key.id */
  quotedProviderMsgId?: string | null
  /** Contexto Baileys completo · Evolution-only */
  quotedBaileys?: QuotedRefBaileys | null
}

/**
 * Forward C (2026-05-07) · contato pra envio nativo cross-provider.
 *
 * Shape mínimo · NUNCA contém vCard cru, email, endereço ou org. Caller
 * (POST /messages) extrai do payload normalizado (mig 144 · whitelist
 * já validada upstream). Cloud usa `wa_id` (e164 puro) como id na rede ·
 * Evolution/Baileys usa `wuid` (mesmo formato).
 *
 * Campos:
 *   - name: nome humano · vai pra `formatted_name`/`fullName` no provider
 *   - phone: e164 puro (digits-only · ex "5544999991234") · canônico
 *   - displayPhone: formatação humana opcional ("+55 44 99999-1234")
 *   - waId: id WhatsApp · pode coincidir com phone se o contato é WA
 */
export interface WhatsAppContactToSend {
  name: string
  phone: string
  displayPhone?: string | null
  waId?: string | null
}

/**
 * React A (2026-05-07) · alvo de reação cross-provider.
 *
 * Cloud (Meta): só `providerMsgId` (wamid) é necessário · `recipient` é o
 *   `phone` do balão.
 * Evolution (Baileys): exige `key` completo · `remoteJid` (vem de
 *   wa_conversations.remote_jid OU `${phone}@s.whatsapp.net` fallback) +
 *   `fromMe` (derivado de direction · outbound→true, inbound→false) +
 *   `id` (= providerMsgId).
 */
export interface WhatsAppReactionTarget {
  providerMsgId: string
  remoteJid?: string | null
  fromMe?: boolean | null
}

/**
 * Provider canonico. Implementadores: WhatsAppCloudService, EvolutionService.
 * Cada metodo deve nunca throw · retorna WhatsAppSendResult com ok=false em erro.
 */
export interface WhatsAppProvider {
  readonly providerName: 'cloud' | 'evolution'

  /** Envia mensagem texto puro · `opts.quoted*` ativa quoted reply quando presente */
  sendText(phone: string, text: string, opts?: SendTextOptions): Promise<WhatsAppSendResult>

  /** Envia imagem por URL · caption opcional */
  sendImage(phone: string, imageUrl: string, caption?: string): Promise<WhatsAppSendResult>

  /** Envia audio (PTT) · audioUrl deve ser publica ou data: URL · base64 aceitavel em Evolution */
  sendVoice(phone: string, audioUrl: string): Promise<WhatsAppSendResult>

  /**
   * Forward C · envio nativo de contato (Cloud `type:contacts` · Evolution
   * `/message/sendContact`). Opcional na interface · callers devem fazer
   * `if (typeof wa.sendContact === 'function')` ou tentar e cair em fallback
   * `sendText` quando ausente/falhar.
   */
  sendContact?(
    phone: string,
    contact: WhatsAppContactToSend,
  ): Promise<WhatsAppSendResult>

  /**
   * React A (2026-05-07) · envia reação emoji em mensagem alvo.
   * Cloud: `type:'reaction'` · Evolution: `/message/sendReaction`.
   * `emoji` null/'' remove reação existente (provider envia empty string).
   */
  sendReaction?(
    phone: string,
    target: WhatsAppReactionTarget,
    emoji: string | null,
  ): Promise<WhatsAppSendResult>

  /** Marca msg como lida · falha silenciosa (nao critico) */
  markAsRead(messageId: string): Promise<void>

  /**
   * Download de midia recebida.
   * - Cloud: precisa do mediaId (Graph API)
   * - Evolution: precisa do messageKey { remoteJid, fromMe, id }
   *
   * Retorna null se falhar. Caller decide se aborta.
   */
  downloadMedia(idOrKey: string | Record<string, unknown>): Promise<WhatsAppMediaDownload | null>
}
