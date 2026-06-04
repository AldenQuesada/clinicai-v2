/**
 * Evolution payload → ExtractedMessage normalizada.
 *
 * Lida com:
 *  - event=messages.upsert (ignora outros)
 *  - JID @s.whatsapp.net (numero direto) e @lid (privacy mode · usa senderPn)
 *  - texto (conversation, extendedTextMessage, image/video caption)
 *  - audio (audioMessage · download via Evolution.downloadMedia)
 *  - groups (@g.us · skip silencioso)
 *
 * Logic 1:1 do clinic-dashboard b2b-mira-inbound (lines 460-510).
 */

export interface ExtractedMessage {
  /** Phone normalizado (so digitos · ex: 5544998787673) · vazio quando lidUnresolved */
  phone: string
  /** wa_message_id pra dedup */
  messageId: string
  /** Texto extraido (vazio se for audio sem transcribe ainda) */
  content: string
  /** True se vem de audio (caller deve transcribrar) */
  isAudio: boolean
  /** Object key do Evolution pra download de midia (audio) */
  messageKey: Record<string, unknown>
  /** Push name (nome WhatsApp do remetente · pode ser null) */
  pushName: string | null
  /**
   * Mira LID Layer-2 (2026-06-04) · true quando @lid sem senderPn.
   * Caller DEVE resolver phone via wa_contact_identities (jid_lid → phone_e164)
   * ANTES de usar msg.phone. Espelha pattern Lara 2-layer (route.ts:1038+).
   */
  lidUnresolved?: boolean
  /** Mira LID Layer-2 · remoteJid original (ex: 93716287086617@lid) quando lidUnresolved */
  remoteJid?: string
}

export type ExtractResult =
  | { ok: true; msg: ExtractedMessage }
  | { ok: false; skip: string; detail?: string }

export function extractEvolutionMessage(body: unknown): ExtractResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any

  const event = String(b?.event ?? '')
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
    return { ok: false, skip: 'not_message_event' }
  }

  const data = b?.data ?? b
  const key = data?.key ?? {}

  // Outbound (fromMe) · skip · so processa msgs entrantes
  if (key?.fromMe === true) {
    return { ok: false, skip: 'outbound' }
  }

  const remoteJid: string = String(key?.remoteJid ?? '')
  if (!remoteJid) return { ok: false, skip: 'missing_remoteJid' }

  // Group msg · skip silencioso
  if (remoteJid.includes('@g.us')) {
    return { ok: false, skip: 'group' }
  }

  // Phone extract · @s.whatsapp.net direto, @lid via senderPn
  // Mira LID Layer-2 (2026-06-04): @lid sem senderPn NÃO retorna skip aqui ·
  // marca lidUnresolved=true · caller resolve via wa_contact_identities
  // (jid_lid → phone_e164) antes de resolveRole. Mesmo pattern do Lara
  // (route.ts:1038+).
  let phone = ''
  let lidUnresolved = false
  if (remoteJid.endsWith('@lid')) {
    const senderPn: string = String(key?.senderPn ?? data?.senderPn ?? '')
    phone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    if (!phone) {
      lidUnresolved = true
    }
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  }

  if (!lidUnresolved && !/^\d{10,15}$/.test(phone)) {
    return { ok: false, skip: 'bad_phone_format', detail: phone }
  }

  const messageId: string = String(key?.id ?? '')
  if (!messageId) return { ok: false, skip: 'missing_messageId' }

  const msg = data?.message ?? {}
  const messageType: string = String(data?.messageType ?? '')

  // Text-like content
  let content: string = String(
    msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      msg?.videoMessage?.caption ??
      '',
  ).trim()

  // Audio detection · download sera feito pelo caller (precisa do EvolutionService)
  const isAudio =
    !content && (Boolean(msg?.audioMessage) || messageType === 'audioMessage')

  return {
    ok: true,
    msg: {
      phone,
      messageId,
      content,
      isAudio,
      messageKey: { remoteJid, fromMe: false, id: messageId },
      pushName: data?.pushName ? String(data.pushName) : null,
      ...(lidUnresolved ? { lidUnresolved: true, remoteJid } : {}),
    },
  }
}
