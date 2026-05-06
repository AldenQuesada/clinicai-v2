/**
 * EvolutionService · WhatsApp via Evolution API self-hosted (Baileys).
 *
 * Usado pela Mira (instancia mira-mirian) e pela Lara legacy quando precisa
 * mandar via Mih (recipient_voucher dispatch).
 *
 * Endpoints cobertos (mapeados do clinic-dashboard b2b-mira-inbound):
 * - POST /message/sendText/{instance}
 * - POST /message/sendMedia/{instance}
 * - POST /message/sendWhatsAppAudio/{instance}
 * - POST /chat/markMessageAsRead/{instance}
 * - POST /chat/getBase64FromMediaMessage/{instance}
 *
 * Auth: header `apikey: <EVOLUTION_API_KEY>`.
 *
 * Multi-instance: 1 service = 1 instance. Caller cria N services pra falar
 * com mira-mirian (Mira), Mih (Lara legacy/recipient), etc.
 */

import { createLogger } from '@clinicai/logger'
import type {
  WhatsAppMediaDownload,
  WhatsAppProvider,
  WhatsAppSendResult,
} from './provider'

const log = createLogger({ app: 'shared' })

export interface EvolutionConfig {
  /** Base URL · ex: https://evolution.aldenquesada.site */
  apiUrl: string
  /** API key global (header `apikey`) */
  apiKey: string
  /** Nome da instance · ex: mira-mirian, Mih */
  instance: string
}

export class EvolutionService implements WhatsAppProvider {
  readonly providerName = 'evolution' as const

  constructor(private cfg: EvolutionConfig) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.cfg.apiKey,
      'Content-Type': 'application/json',
    }
  }

  private url(path: string): string {
    const base = this.cfg.apiUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  async sendText(phone: string, text: string): Promise<WhatsAppSendResult> {
    try {
      const res = await fetch(this.url(`/message/sendText/${this.cfg.instance}`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ number: phone, text }),
      })
      if (!res.ok) {
        const err = await res.text()
        log.error(
          { instance: this.cfg.instance, status: res.status, err: err.slice(0, 300) },
          'evolution.sendText.failed',
        )
        return { ok: false, error: err, messageId: null }
      }
      const data = await res.json().catch(() => null)
      const messageId = data?.key?.id ?? null
      log.info(
        { instance: this.cfg.instance, chars: text.length, messageId },
        'evolution.sendText.ok',
      )
      return { ok: true, data, messageId }
    } catch (err) {
      log.error({ err, instance: this.cfg.instance }, 'evolution.sendText.exception')
      return { ok: false, error: String(err), messageId: null }
    }
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<WhatsAppSendResult> {
    try {
      const body: Record<string, unknown> = {
        number: phone,
        mediatype: 'image',
        media: imageUrl,
      }
      if (caption) body.caption = caption

      const res = await fetch(this.url(`/message/sendMedia/${this.cfg.instance}`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        log.error(
          { instance: this.cfg.instance, status: res.status, err: err.slice(0, 300) },
          'evolution.sendImage.failed',
        )
        return { ok: false, error: err, messageId: null }
      }
      const data = await res.json().catch(() => null)
      return { ok: true, data, messageId: data?.key?.id ?? null }
    } catch (err) {
      log.error({ err, instance: this.cfg.instance }, 'evolution.sendImage.exception')
      return { ok: false, error: String(err), messageId: null }
    }
  }

  async sendVoice(phone: string, audioUrl: string): Promise<WhatsAppSendResult> {
    try {
      const res = await fetch(this.url(`/message/sendWhatsAppAudio/${this.cfg.instance}`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ number: phone, audio: audioUrl }),
      })
      if (!res.ok) {
        const err = await res.text()
        log.error(
          { instance: this.cfg.instance, status: res.status, err: err.slice(0, 300) },
          'evolution.sendVoice.failed',
        )
        return { ok: false, error: err, messageId: null }
      }
      const data = await res.json().catch(() => null)
      return { ok: true, data, messageId: data?.key?.id ?? null }
    } catch (err) {
      log.error({ err, instance: this.cfg.instance }, 'evolution.sendVoice.exception')
      return { ok: false, error: String(err), messageId: null }
    }
  }

  /**
   * Lista chats da instância Baileys (chat list nativo · ordem do WhatsApp).
   *
   * POST /chat/findChats/{instance} body {} retorna array de chats.
   * Cada item Evolution v2 tem shape:
   *   { id: null, lastMessage: { key, message, ... }, unreadCount, isSaved }
   *
   * Identidade real do chat = lastMessage.key.remoteJid (top-level id é null).
   * Timestamp real = lastMessage.messageTimestamp.
   *
   * Retorna raw array · normalizer downstream (ver wa-chat-sync) extrai os
   * campos. Throws se HTTP != 2xx · caller decide.
   */
  async findChats(): Promise<unknown[]> {
    const res = await fetch(this.url(`/chat/findChats/${this.cfg.instance}`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const err = await res.text()
      log.error(
        { instance: this.cfg.instance, status: res.status, err: err.slice(0, 300) },
        'evolution.findChats.failed',
      )
      throw new Error(`evolution.findChats ${res.status}: ${err.slice(0, 200)}`)
    }
    const data = await res.json().catch(() => null)
    if (!Array.isArray(data)) {
      log.warn(
        { instance: this.cfg.instance, dataType: typeof data },
        'evolution.findChats.unexpected_shape',
      )
      return []
    }
    log.info({ instance: this.cfg.instance, total: data.length }, 'evolution.findChats.ok')
    return data
  }

  async markAsRead(messageId: string): Promise<void> {
    // Evolution exige array de readMessages com remoteJid + fromMe + id ·
    // pra simplificar callers, aceita so messageId e infere o resto via
    // ultima conversa. Caller pode passar JSON serializado pra override.
    try {
      // messageId pode vir serializado (JSON) com {remoteJid, fromMe, id}
      let payload: Record<string, unknown>
      if (messageId.startsWith('{')) {
        try {
          const parsed = JSON.parse(messageId)
          payload = { readMessages: [parsed] }
        } catch {
          payload = { readMessages: [{ id: messageId, fromMe: false }] }
        }
      } else {
        payload = { readMessages: [{ id: messageId, fromMe: false }] }
      }
      await fetch(this.url(`/chat/markMessageAsRead/${this.cfg.instance}`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      })
    } catch {
      // markAsRead falha silenciosa · nao critico (Lara/Mira segue resposta)
    }
  }

  /**
   * Download base64 de midia · usado pra audio PTT (Whisper).
   *
   * Aceita:
   * - string: messageId puro (Evolution monta key sozinho via lookup)
   * - object: { remoteJid, fromMe, id } completo (preferivel · pega do webhook)
   */
  async downloadMedia(
    idOrKey: string | Record<string, unknown>,
  ): Promise<WhatsAppMediaDownload | null> {
    try {
      const messageKey =
        typeof idOrKey === 'string' ? { id: idOrKey, fromMe: false } : idOrKey

      const res = await fetch(
        this.url(`/chat/getBase64FromMediaMessage/${this.cfg.instance}`),
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
        },
      )
      if (!res.ok) {
        const err = await res.text()
        log.warn(
          { instance: this.cfg.instance, status: res.status, err: err.slice(0, 200) },
          'evolution.downloadMedia.failed',
        )
        return null
      }
      const data = await res.json().catch(() => null)
      const b64 = data?.base64 || data?.data || ''
      const mime = data?.mimetype || 'application/octet-stream'
      if (!b64) {
        log.warn({ instance: this.cfg.instance }, 'evolution.downloadMedia.empty')
        return null
      }
      const buffer = Buffer.from(b64, 'base64')
      return { buffer, contentType: mime, base64: b64 }
    } catch (err) {
      log.error(
        { err, instance: this.cfg.instance },
        'evolution.downloadMedia.exception',
      )
      return null
    }
  }
}

/**
 * Factory · le 3 envs e cria service. Throws se config faltar (fail-fast).
 *
 * @param instanceEnvVar nome da env var pro instance · ex: 'EVOLUTION_INSTANCE_MIRA'
 * @returns EvolutionService configurado
 */
export function createEvolutionService(
  instanceEnvVar: string = 'EVOLUTION_INSTANCE_MIRA',
): EvolutionService {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env[instanceEnvVar]

  if (!apiUrl || !apiKey || !instance) {
    throw new Error(
      `EvolutionService config incompleta · EVOLUTION_API_URL=${!!apiUrl} EVOLUTION_API_KEY=${!!apiKey} ${instanceEnvVar}=${!!instance}`,
    )
  }

  return new EvolutionService({ apiUrl, apiKey, instance })
}
