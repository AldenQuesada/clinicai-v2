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
 * Provider canonico. Implementadores: WhatsAppCloudService, EvolutionService.
 * Cada metodo deve nunca throw · retorna WhatsAppSendResult com ok=false em erro.
 */
export interface WhatsAppProvider {
  readonly providerName: 'cloud' | 'evolution'

  /** Envia mensagem texto puro */
  sendText(phone: string, text: string): Promise<WhatsAppSendResult>

  /** Envia imagem por URL · caption opcional */
  sendImage(phone: string, imageUrl: string, caption?: string): Promise<WhatsAppSendResult>

  /** Envia audio (PTT) · audioUrl deve ser publica ou data: URL · base64 aceitavel em Evolution */
  sendVoice(phone: string, audioUrl: string): Promise<WhatsAppSendResult>

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
