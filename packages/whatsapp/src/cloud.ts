/**
 * WhatsApp Cloud API service · Meta Graph v21.0.
 *
 * Espelho do `services/whatsapp-cloud.ts` da Lara do Ivan, MAS:
 * - Multi-tenant first (ADR-028) · accessToken e phoneNumberId vêm de wa_numbers
 *   (per-clinic), nao de process.env global.
 * - Logging estruturado (Gap 3) substitui console.log puro.
 * - createWhatsAppCloudFromWaNumber(serviceClient, wa_number_id) factory que
 *   resolve credenciais da DB.
 *
 * Uso comum:
 *   const wa = await createWhatsAppCloudFromWaNumber(svc, wa_number_id)
 *   await wa.sendText('5544991622986', 'Olá!')
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@clinicai/logger'
import type {
  WhatsAppMediaDownload,
  WhatsAppProvider,
  WhatsAppSendResult,
} from './provider'

const GRAPH_API = 'https://graph.facebook.com/v21.0'
const log = createLogger({ app: 'shared' })

export interface WaNumberConfig {
  wa_number_id: string
  clinic_id: string
  phone_number_id: string
  access_token: string
}

// Re-export pra retrocompat · packages/whatsapp/src/index.ts ja exporta da provider.
export type { WhatsAppSendResult, WhatsAppMediaDownload }

export class WhatsAppCloudService implements WhatsAppProvider {
  readonly providerName = 'cloud' as const
  private accessToken: string
  private phoneNumberId: string
  private clinic_id: string
  private wa_number_id: string

  constructor(config: WaNumberConfig) {
    this.accessToken = config.access_token
    this.phoneNumberId = config.phone_number_id
    this.clinic_id = config.clinic_id
    this.wa_number_id = config.wa_number_id
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        log.error(
          { clinic_id: this.clinic_id, wa_number_id: this.wa_number_id, status: res.status, err },
          'sendText falhou',
        )
        return { ok: false, error: err }
      }
      const data = await res.json()
      log.info(
        { clinic_id: this.clinic_id, wa_number_id: this.wa_number_id, chars: text.length },
        'sendText ok',
      )
      return { ok: true, data }
    } catch (err) {
      log.error({ err, clinic_id: this.clinic_id, wa_number_id: this.wa_number_id }, 'sendText exception')
      return { ok: false, error: String(err) }
    }
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<WhatsAppSendResult> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        log.error(
          { clinic_id: this.clinic_id, wa_number_id: this.wa_number_id, status: res.status, err },
          'sendImage falhou',
        )
        return { ok: false, error: err }
      }
      log.info({ clinic_id: this.clinic_id, wa_number_id: this.wa_number_id }, 'sendImage ok')
      return { ok: true, data: await res.json() }
    } catch (err) {
      log.error({ err, clinic_id: this.clinic_id, wa_number_id: this.wa_number_id }, 'sendImage exception')
      return { ok: false, error: String(err) }
    }
  }

  /**
   * sendVoice · Meta Cloud usa media upload + audio message ID. P0 nao tem
   * upload pipeline aqui (Lara nao envia audio outbound) · stub fail-soft pra
   * cumprir contrato WhatsAppProvider sem quebrar caller.
   *
   * Quando precisar de fato, implementar 2-step:
   *   1. POST /{phone_number_id}/media (multipart) → media_id
   *   2. POST /{phone_number_id}/messages com type=audio, audio.id=media_id
   */
  async sendVoice(_to: string, _audioUrl: string): Promise<WhatsAppSendResult> {
    log.warn(
      { wa_number_id: this.wa_number_id },
      'cloud.sendVoice nao implementado · use Evolution provider pra audio',
    )
    return { ok: false, error: 'sendVoice nao suportado em Cloud provider', messageId: null }
  }

  async downloadMedia(idOrKey: string | Record<string, unknown>): Promise<WhatsAppMediaDownload | null> {
    const mediaId = typeof idOrKey === 'string' ? idOrKey : String(idOrKey?.id ?? '')
    try {
      const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
      if (!metaRes.ok) {
        log.warn({ mediaId, status: metaRes.status }, 'downloadMedia · meta lookup falhou')
        return null
      }
      const metaData = await metaRes.json()
      const mediaUrl = metaData.url as string
      const mimeType = (metaData.mime_type as string) || 'application/octet-stream'

      const fileRes = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
      if (!fileRes.ok) {
        log.warn({ mediaId, status: fileRes.status }, 'downloadMedia · binary fetch falhou')
        return null
      }

      const arrayBuffer = await fileRes.arrayBuffer()
      return { buffer: Buffer.from(arrayBuffer), contentType: mimeType }
    } catch (err) {
      log.error({ err, mediaId }, 'downloadMedia exception')
      return null
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      })
    } catch {
      // markAsRead falha silenciosa · não é crítico
    }
  }
}

/**
 * Factory: resolve credenciais de wa_numbers e cria service.
 * Usar em webhook handler / send actions / etc.
 *
 * @param serviceClient Supabase service-role client
 * @param wa_number_id ID da row em wa_numbers
 */
export async function createWhatsAppCloudFromWaNumber(
  serviceClient: SupabaseClient,
  wa_number_id: string,
): Promise<WhatsAppCloudService | null> {
  const { data, error } = await serviceClient.from('wa_numbers')
    .select('id, clinic_id, phone_number_id, access_token')
    .eq('id', wa_number_id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    log.error({ err: error, wa_number_id }, 'createWhatsAppCloudFromWaNumber · wa_number not found')
    return null
  }

  if (!data.phone_number_id || !data.access_token) {
    log.error({ wa_number_id }, 'wa_number sem credentials Cloud API')
    return null
  }

  return new WhatsAppCloudService({
    wa_number_id: data.id as string,
    clinic_id: data.clinic_id as string,
    phone_number_id: data.phone_number_id as string,
    access_token: data.access_token as string,
  })
}
