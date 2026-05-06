/**
 * Normalizador de chat retornado por Evolution `/chat/findChats/{instance}`.
 *
 * Shape REAL confirmado em probe 2026-05-06 (Mih · 1066 chats):
 *   {
 *     id: null,                                 ← top-level é null em Evolution v2
 *     lastMessage: {
 *       id: "cmou..." (CUID2 do Evolution),
 *       key: { id, fromMe, remoteJid, participant?, senderPn? },
 *       pushName: "Você" se fromMe=true · nome real se fromMe=false,
 *       messageType: "conversation" | "extendedTextMessage" | ...
 *       message: { conversation?, extendedTextMessage?, imageMessage?, ... },
 *       messageTimestamp: number (unix seconds Baileys),
 *     },
 *     unreadCount: number,
 *     isSaved: boolean,
 *   }
 *
 * Identidade do chat = lastMessage.key.remoteJid (NÃO o top-level id).
 * Ordem real = lastMessage.messageTimestamp (NÃO ULID).
 */

export type RemoteKind = 'private' | 'group' | 'lid' | 'unknown'

export interface NormalizedChat {
  remote_jid: string
  remote_kind: RemoteKind
  phone_e164: string | null
  group_id: string | null
  lid_id: string | null
  push_name: string | null
  group_subject: string | null
  display_name: string | null
  unread_count: number
  last_message_id: string | null
  last_message_type: string | null
  last_message_text: string | null
  last_message_from_me: boolean | null
  last_message_participant_jid: string | null
  last_message_sender_pn: string | null
  last_message_timestamp: number
  last_message_at: string
  raw_chat: Record<string, unknown>
}

/**
 * Tenta extrair remote_jid de múltiplos campos · Evolution shape varia.
 * Retorna '' se nada bater (caller faz skip).
 */
function pickRemoteJid(item: Record<string, unknown>): string {
  const lm = (item.lastMessage as Record<string, unknown> | undefined) ?? {}
  const lmKey = (lm.key as Record<string, unknown> | undefined) ?? {}
  return (
    (item.id as string | null | undefined) ||
    (item.remoteJid as string | null | undefined) ||
    (item.jid as string | null | undefined) ||
    (lmKey.remoteJid as string | null | undefined) ||
    ''
  )
}

function classifyKind(remoteJid: string): RemoteKind {
  if (remoteJid.endsWith('@s.whatsapp.net')) return 'private'
  if (remoteJid.endsWith('@g.us')) return 'group'
  if (remoteJid.endsWith('@lid')) return 'lid'
  return 'unknown'
}

function extractPhoneE164(remoteJid: string, kind: RemoteKind): string | null {
  if (kind !== 'private') return null
  const digits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function extractGroupId(remoteJid: string, kind: RemoteKind): string | null {
  if (kind !== 'group') return null
  return remoteJid.replace('@g.us', '') || null
}

function extractLidId(remoteJid: string, kind: RemoteKind): string | null {
  if (kind !== 'lid') return null
  return remoteJid.replace('@lid', '') || null
}

/**
 * Aceita number/string/protobuf low. Baileys emite unix seconds tipicamente.
 * Detecta heuristicamente se é segundos vs ms (cutoff: < 10^10 → segundos).
 * Retorna null se não conseguir extrair.
 */
function parseTimestamp(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null
  }
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
    const parsed = Date.parse(raw)
    if (!isNaN(parsed)) return Math.floor(parsed / 1000)
    return null
  }
  // Protobuf low/high (Baileys raw às vezes vira { low, high, unsigned })
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    if (typeof obj.low === 'number') return obj.low
  }
  return null
}

/**
 * Detecta segundos vs ms · Baileys padrão é segundos.
 * Retorna { seconds, ms, iso }.
 */
function timestampToBoth(ts: number): { seconds: number; ms: number; iso: string } {
  // Cutoff: anything < 10^11 é segundos (datas até ano 5138)
  // Anything >= 10^11 é ms
  const isSeconds = ts < 1e11
  const ms = isSeconds ? ts * 1000 : ts
  const seconds = isSeconds ? ts : Math.floor(ts / 1000)
  return { seconds, ms, iso: new Date(ms).toISOString() }
}

/**
 * Extrai preview de texto da última mensagem.
 * Cobre tipos comuns do Baileys · fallback: '[<keys joined>]'.
 */
function extractLastMessageText(message: Record<string, unknown> | null | undefined): string | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>

  if (typeof m.conversation === 'string' && m.conversation) return m.conversation

  const ext = m.extendedTextMessage as Record<string, unknown> | undefined
  if (ext && typeof ext.text === 'string' && ext.text) return ext.text

  const img = m.imageMessage as Record<string, unknown> | undefined
  if (img) return (typeof img.caption === 'string' && img.caption) || '[imageMessage]'

  if (m.audioMessage) return '[audioMessage]'

  const vid = m.videoMessage as Record<string, unknown> | undefined
  if (vid) return (typeof vid.caption === 'string' && vid.caption) || '[videoMessage]'

  const doc = m.documentMessage as Record<string, unknown> | undefined
  if (doc) {
    return (
      (typeof doc.caption === 'string' && doc.caption) ||
      (typeof doc.fileName === 'string' && doc.fileName) ||
      '[documentMessage]'
    )
  }

  if (m.reactionMessage) return '[reactionMessage]'
  if (m.stickerMessage) return '[stickerMessage]'

  const contact = m.contactMessage as Record<string, unknown> | undefined
  if (contact) return (typeof contact.displayName === 'string' && contact.displayName) || '[contactMessage]'

  if (m.locationMessage) return '[locationMessage]'

  // Fallback: join das keys (filtrando messageContextInfo que é metadata)
  const keys = Object.keys(m).filter((k) => k !== 'messageContextInfo')
  return keys.length > 0 ? `[${keys.join(',')}]` : null
}

/**
 * Resolve display_name · prioridade: group_subject → pushName (se != "Você") → null.
 * pushName "Você" só aparece quando fromMe=true · não é nome do contato.
 */
function resolveDisplayName(opts: {
  groupSubject: string | null
  pushName: string | null
}): string | null {
  if (opts.groupSubject) return opts.groupSubject
  if (opts.pushName && opts.pushName !== 'Você') return opts.pushName
  return null
}

/**
 * Normaliza um item bruto da Evolution `/chat/findChats`.
 * Retorna null se remote_jid não pôde ser extraído OU timestamp ausente.
 */
export function normalizeEvolutionChat(item: unknown): NormalizedChat | null {
  if (!item || typeof item !== 'object') return null
  const c = item as Record<string, unknown>

  const remoteJid = pickRemoteJid(c)
  if (!remoteJid) return null

  const kind = classifyKind(remoteJid)
  const phoneE164 = extractPhoneE164(remoteJid, kind)
  const groupId = extractGroupId(remoteJid, kind)
  const lidId = extractLidId(remoteJid, kind)

  const lm = (c.lastMessage as Record<string, unknown> | undefined) ?? {}
  const lmKey = (lm.key as Record<string, unknown> | undefined) ?? {}
  const lmMsg = (lm.message as Record<string, unknown> | undefined) ?? {}

  const tsRaw = lm.messageTimestamp ?? lm.t ?? c.conversationTimestamp ?? c.t
  const ts = parseTimestamp(tsRaw)
  if (ts == null) return null
  const { seconds, ms, iso } = timestampToBoth(ts)

  const pushName = (typeof lm.pushName === 'string' ? lm.pushName : null) || null
  const groupSubject = (typeof c.subject === 'string' ? c.subject : null) || null

  const lmKeyId = (typeof lmKey.id === 'string' ? lmKey.id : null) || null
  const lmKeyParticipant =
    (typeof lmKey.participant === 'string' ? lmKey.participant : null) || null
  const lmKeySenderPn = (typeof lmKey.senderPn === 'string' ? lmKey.senderPn : null) || null
  const lmFromMe = typeof lmKey.fromMe === 'boolean' ? lmKey.fromMe : null
  const lmType = (typeof lm.messageType === 'string' ? lm.messageType : null) || null

  const unread = typeof c.unreadCount === 'number' ? c.unreadCount : 0

  return {
    remote_jid: remoteJid,
    remote_kind: kind,
    phone_e164: phoneE164,
    group_id: groupId,
    lid_id: lidId,
    push_name: pushName,
    group_subject: groupSubject,
    display_name: resolveDisplayName({ groupSubject, pushName }),
    unread_count: unread,
    last_message_id: lmKeyId,
    last_message_type: lmType,
    last_message_text: extractLastMessageText(lmMsg),
    last_message_from_me: lmFromMe,
    last_message_participant_jid: lmKeyParticipant,
    last_message_sender_pn: lmKeySenderPn,
    last_message_timestamp: seconds,
    last_message_at: iso,
    raw_chat: c,
  }
}
