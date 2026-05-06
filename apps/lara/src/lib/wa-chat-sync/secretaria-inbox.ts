/**
 * Listagem da inbox /secretaria via wa_chat_mirror (espelho Evolution Mih).
 *
 * Diferente de /api/conversations branch padrão (lê wa_conversations),
 * aqui o source-of-truth é wa_chat_mirror sincronizada por pg_cron a cada
 * 1 minuto (mig 134). Mostra TUDO que aparece no app WhatsApp Mih · grupos,
 * LIDs, e privados que ainda não têm wa_conversations.
 *
 * Critério de matching mirror → conv (ordem):
 *   1. private (@s.whatsapp.net) · phone_e164 = wa_conversations.phone
 *      AND wa_number_id MATCH
 *   2. lid (@lid) · last_message_sender_pn (digits) = wa_conversations.phone
 *      AND wa_number_id MATCH (resolução LID privacy mode)
 *   3. group (@g.us) · sem match (grupos não têm wa_conversations)
 *
 * Pagina via cursor `beforeIso` em wa_chat_mirror.last_message_at.
 *
 * Escopo Commit 2: hardcode wa_number_id Mih
 *   ('ead8a6f9-6e0e-4a89-8268-155392794f69').
 * Multi-canal: próximo iter parametriza por todos wa_numbers Evolution.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const SECRETARIA_MIH_WA_NUMBER_ID =
  'ead8a6f9-6e0e-4a89-8268-155392794f69'

export type RemoteKind = 'private' | 'group' | 'lid' | 'unknown'

export interface SecretariaInboxItem {
  /** Null para rows mirror-only (chat existe no Mih mas sem wa_conversations) */
  conversation_id: string | null
  has_conversation: boolean

  /** Campos mirror */
  mirror_remote_jid: string
  mirror_remote_kind: RemoteKind
  wa_number_id: string
  is_group: boolean
  is_lid: boolean
  unread_count: number
  last_message_at: string
  last_message_text: string | null
  last_message_type: string | null
  last_message_from_me: boolean | null
  last_message_sender_pn: string | null

  /** Display resolvido (waterfall mirror + conv) */
  display_name: string
  phone: string | null
  phone_e164: string | null
  group_id: string | null
  lid_id: string | null

  /** Conv enrichment (null/default para mirror-only) */
  lead_id: string
  lead_name: string
  status: string
  ai_enabled: boolean
  ai_paused_until: string | null
  context_type: string | null
  inbox_role: 'sdr' | 'secretaria' | 'b2b' | null
}

interface MirrorRow {
  id: string
  clinic_id: string
  wa_number_id: string
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
  last_message_at: string
}

interface ConvRow {
  id: string
  phone: string | null
  lead_id: string | null
  display_name: string | null
  status: string | null
  ai_enabled: boolean | null
  ai_paused_until: string | null
  context_type: string | null
  inbox_role: 'sdr' | 'secretaria' | 'b2b' | null
  wa_number_id: string | null
}

interface LeadRow {
  id: string
  name: string | null
  phone: string | null
}

const PHONE_DIGIT_RE = /\D/g

function digitsOnly(input: string | null | undefined): string {
  return input ? input.replace(PHONE_DIGIT_RE, '') : ''
}

function isPhoneOnly(value: string): boolean {
  return /^\+?\d{6,}$/.test(value.trim())
}

function formatPhoneFallback(phoneE164: string | null): string | null {
  if (!phoneE164) return null
  const d = digitsOnly(phoneE164)
  if (d.length < 10) return phoneE164
  // BR-friendly fallback: +55 (44) 99999-9999
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  }
  return phoneE164
}

function resolveDisplayName(
  mirror: MirrorRow,
  conv: ConvRow | null,
  lead: LeadRow | null,
): string {
  // 1. Lead canonical (mais autoritativo · CRM-curated)
  const leadName = lead?.name?.trim() || null
  if (leadName && !isPhoneOnly(leadName)) return leadName

  // 2. wa_conversations.display_name se for nome real (não phone fallback)
  const convDn = conv?.display_name?.trim() || null
  if (convDn && !isPhoneOnly(convDn)) return convDn

  // 3. group_subject (grupos)
  if (mirror.group_subject) return mirror.group_subject

  // 4. mirror.display_name (já passou pelo waterfall do normalizer)
  if (mirror.display_name && mirror.display_name !== 'Você') return mirror.display_name

  // 5. push_name se for nome real
  if (mirror.push_name && mirror.push_name !== 'Você') return mirror.push_name

  // 6. phone formatado (privados sem nome conhecido)
  const phoneFmt = formatPhoneFallback(mirror.phone_e164)
  if (phoneFmt) return phoneFmt

  // 7. fallback por kind
  if (mirror.remote_kind === 'lid') return 'Contato WhatsApp'
  if (mirror.remote_kind === 'group') return 'Grupo WhatsApp'

  // 8. último recurso · remote_jid bruto
  return mirror.remote_jid
}

interface LoadOpts {
  limit: number
  beforeIso?: string
}

/**
 * Carrega top N items da inbox /secretaria espelhada do Evolution Mih.
 *
 * Pipeline (hotfix 2026-05-06 · loop iterativo):
 *   Loop até atingir userLimit conversations COM has_conversation=true OU
 *   esgotar mirror OU bater limites de segurança.
 *
 *   Por iteração:
 *     a. SELECT wa_chat_mirror ORDER BY last_message_at DESC LIMIT pageSize
 *        WHERE last_message_at < internalCursor (cursor avança a cada iter)
 *     b. Coleta phones (phone_e164 + sender_pn) → batch lookup wa_conversations
 *     c. Coleta lead_ids → batch lookup leads
 *     d. Build items (mirror + conv + lead via resolveDisplayName)
 *     e. Dedup local (LID+private do mesmo contato → 1 row)
 *     f. Filter has_conversation=true && conversation_id !== null
 *     g. Acumula em collected (Map<conversation_id, Item>) · keep latest
 *
 *   Limites de segurança:
 *     userLimit cap 200
 *     internalPageSize = min(500, max(100, userLimit * 5))
 *     maxMirrorRowsScanned = 2000
 *     maxIterations = 10
 *
 *   Final:
 *     sort by last_message_at DESC + slice(userLimit)
 *     cursor = oldest mirror row scanned (NOT last collected) · garante
 *     pagination continua mesmo se toda batch escaneada foi filtrada
 *
 * Por que o loop: top do mirror é dominado por LIDs sem conv resolvida +
 * grupos · single batch fixed-size deixava só 2 items locais · UI ficava
 * vazia. Loop varre múltiplas páginas até preencher userLimit ou esgotar.
 */
export async function loadSecretariaInbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  opts: LoadOpts,
): Promise<{ items: SecretariaInboxItem[]; nextCursor: string | null }> {
  const userLimit = Math.max(1, Math.min(200, opts.limit))
  const internalPageSize = Math.min(500, Math.max(100, userLimit * 5))
  const MAX_MIRROR_ROWS_SCANNED = 2000
  const MAX_ITERATIONS = 10

  const collected = new Map<string, SecretariaInboxItem>()
  let internalCursor: string | undefined = opts.beforeIso
  let totalScanned = 0
  let lastMirrorTimestamp: string | null = null
  let exhausted = false

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (collected.size >= userLimit) break
    if (totalScanned >= MAX_MIRROR_ROWS_SCANNED) break

    const remaining = MAX_MIRROR_ROWS_SCANNED - totalScanned
    const pageSize = Math.min(internalPageSize, remaining)

    let q = supabase
      .from('wa_chat_mirror')
      .select(
        'id, clinic_id, wa_number_id, remote_jid, remote_kind, phone_e164, group_id, lid_id, ' +
          'push_name, group_subject, display_name, unread_count, ' +
          'last_message_id, last_message_type, last_message_text, last_message_from_me, ' +
          'last_message_participant_jid, last_message_sender_pn, last_message_at',
      )
      .eq('clinic_id', clinicId)
      .eq('wa_number_id', SECRETARIA_MIH_WA_NUMBER_ID)
      .order('last_message_at', { ascending: false })
      .limit(pageSize)

    if (internalCursor) {
      q = q.lt('last_message_at', internalCursor)
    }

    const { data: mirrorData } = await q
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mirrorRows: MirrorRow[] = (mirrorData ?? []) as any[]

    if (mirrorRows.length === 0) {
      exhausted = true
      break
    }

    totalScanned += mirrorRows.length
    lastMirrorTimestamp = mirrorRows[mirrorRows.length - 1].last_message_at
    internalCursor = lastMirrorTimestamp

    const pageItems = await enrichMirrorBatch(supabase, clinicId, mirrorRows)
    const pageDeduped = dedupItems(pageItems)

    for (const item of pageDeduped) {
      if (!item.has_conversation || item.conversation_id === null) continue
      const existing = collected.get(item.conversation_id)
      if (!existing || item.last_message_at > existing.last_message_at) {
        collected.set(item.conversation_id, item)
      }
    }

    if (mirrorRows.length < pageSize) {
      exhausted = true
      break
    }
  }

  const sorted = Array.from(collected.values()).sort((a, b) => {
    if (a.last_message_at === b.last_message_at) return 0
    return b.last_message_at > a.last_message_at ? 1 : -1
  })
  const sliced = sorted.slice(0, userLimit)

  const nextCursor = exhausted ? null : lastMirrorTimestamp

  return { items: sliced, nextCursor }
}

// ─── Mirror enrichment helper ──────────────────────────────────────────────
// Extraído pra ser reutilizado no loop iterativo de loadSecretariaInbox.
// Aceita uma página de mirror rows e retorna os items enriquecidos com
// conv + lead. NÃO faz dedup nem filter (callers decidem).

async function enrichMirrorBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  mirrorRows: MirrorRow[],
): Promise<SecretariaInboxItem[]> {
  const phoneCandidates = new Set<string>()
  for (const m of mirrorRows) {
    if (m.phone_e164) phoneCandidates.add(m.phone_e164)
    if (m.last_message_sender_pn) {
      const senderDigits = digitsOnly(m.last_message_sender_pn)
      if (senderDigits.length >= 10) phoneCandidates.add(senderDigits)
    }
  }

  let convsByPhone = new Map<string, ConvRow>()
  if (phoneCandidates.size > 0) {
    const { data: convData } = await supabase
      .from('wa_conversations')
      .select(
        'id, phone, lead_id, display_name, status, ai_enabled, ai_paused_until, context_type, inbox_role, wa_number_id',
      )
      .eq('clinic_id', clinicId)
      .eq('wa_number_id', SECRETARIA_MIH_WA_NUMBER_ID)
      .in('phone', Array.from(phoneCandidates))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convs: ConvRow[] = (convData ?? []) as any[]
    convsByPhone = new Map(convs.map((c) => [c.phone || '', c]))
  }

  const leadIds = Array.from(
    new Set(
      Array.from(convsByPhone.values())
        .map((c) => c.lead_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  )
  let leadsById = new Map<string, LeadRow>()
  if (leadIds.length > 0) {
    const { data: leadData } = await supabase
      .from('leads')
      .select('id, name, phone')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .in('id', leadIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leads: LeadRow[] = (leadData ?? []) as any[]
    leadsById = new Map(leads.map((l) => [l.id, l]))
  }

  return mirrorRows.map((m) => {
    let conv: ConvRow | null = null
    if (m.phone_e164 && convsByPhone.has(m.phone_e164)) {
      conv = convsByPhone.get(m.phone_e164) ?? null
    } else if (m.last_message_sender_pn) {
      const senderDigits = digitsOnly(m.last_message_sender_pn)
      if (senderDigits.length >= 10 && convsByPhone.has(senderDigits)) {
        conv = convsByPhone.get(senderDigits) ?? null
      }
    }

    const lead = conv?.lead_id ? leadsById.get(conv.lead_id) ?? null : null
    const displayName = resolveDisplayName(m, conv, lead)
    const phoneResolved =
      m.phone_e164 ||
      (m.last_message_sender_pn ? digitsOnly(m.last_message_sender_pn) || null : null) ||
      null

    return {
      conversation_id: conv?.id ?? null,
      has_conversation: conv !== null,

      mirror_remote_jid: m.remote_jid,
      mirror_remote_kind: m.remote_kind,
      wa_number_id: m.wa_number_id,
      is_group: m.remote_kind === 'group',
      is_lid: m.remote_kind === 'lid',
      unread_count: m.unread_count ?? 0,
      last_message_at: m.last_message_at,
      last_message_text: m.last_message_text,
      last_message_type: m.last_message_type,
      last_message_from_me: m.last_message_from_me,
      last_message_sender_pn: m.last_message_sender_pn,

      display_name: displayName,
      phone: phoneResolved,
      phone_e164: m.phone_e164,
      group_id: m.group_id,
      lid_id: m.lid_id,

      lead_id: conv?.lead_id ?? '',
      lead_name: displayName,
      status: conv?.status ?? 'active',
      ai_enabled: conv?.ai_enabled ?? false,
      ai_paused_until: conv?.ai_paused_until ?? null,
      context_type: conv?.context_type ?? null,
      inbox_role: conv?.inbox_role ?? null,
    }
  })
}

// ─── Dedup helpers ─────────────────────────────────────────────────────────

function isFallbackName(name: string | null | undefined): boolean {
  if (!name) return true
  const s = name.trim()
  if (!s) return true
  if (s === 'Contato WhatsApp' || s === 'Grupo WhatsApp') return true
  if (s === 'Você') return true
  // raw phone (digits only OR +digits)
  if (/^\+?\d{6,}$/.test(s)) return true
  // raw JID
  if (s.endsWith('@lid') || s.endsWith('@g.us') || s.endsWith('@s.whatsapp.net')) return true
  return false
}

function pickBetterDisplay(keep: SecretariaInboxItem, drop: SecretariaInboxItem): string {
  if (isFallbackName(keep.display_name) && !isFallbackName(drop.display_name)) {
    return drop.display_name
  }
  return keep.display_name
}

function preferenceScore(item: SecretariaInboxItem): number {
  if (item.mirror_remote_kind === 'private') return 2
  if (item.mirror_remote_kind === 'lid') return 1
  return 0
}

function dedupKeyForItem(item: SecretariaInboxItem): string {
  // Grupos: sempre por remote_jid · nunca misturam
  if (item.is_group) return `group:${item.mirror_remote_jid}`

  // Com conv: conversation_id é canônico (LID + private convergem se backend
  // já mapeou ambos pra mesma conv via wa_conversations.phone)
  if (item.has_conversation && item.conversation_id) {
    return `conv:${item.conversation_id}`
  }

  // Mirror-only: tenta phone variants em ordem
  if (item.phone_e164) return `phone:${item.phone_e164}`
  if (item.phone) return `phone:${item.phone}`
  if (item.last_message_sender_pn) {
    const digits = item.last_message_sender_pn.replace(/\D/g, '')
    if (digits.length >= 10) return `phone:${digits}`
  }

  // Sem nada · usa remote_jid (não dedup com nada)
  return `jid:${item.mirror_remote_jid}`
}

function mergePair(keep: SecretariaInboxItem, drop: SecretariaInboxItem): SecretariaInboxItem {
  return {
    ...keep,
    display_name: pickBetterDisplay(keep, drop),
    lead_name: pickBetterDisplay(keep, drop),
    phone: keep.phone ?? drop.phone,
    phone_e164: keep.phone_e164 ?? drop.phone_e164,
    group_id: keep.group_id ?? drop.group_id,
    lid_id: keep.lid_id ?? drop.lid_id,
    unread_count: Math.max(keep.unread_count, drop.unread_count),
    last_message_sender_pn:
      keep.last_message_sender_pn ?? drop.last_message_sender_pn,
    // Conv enrichment: se keep não tem conv mas drop tem, levanta tudo de drop
    ...(!keep.has_conversation && drop.has_conversation
      ? {
          conversation_id: drop.conversation_id,
          has_conversation: true,
          lead_id: drop.lead_id,
          status: drop.status,
          ai_enabled: drop.ai_enabled,
          ai_paused_until: drop.ai_paused_until,
          context_type: drop.context_type,
          inbox_role: drop.inbox_role,
        }
      : {}),
  }
}

function dedupItems(items: SecretariaInboxItem[]): SecretariaInboxItem[] {
  const groups = new Map<string, SecretariaInboxItem[]>()
  for (const item of items) {
    const key = dedupKeyForItem(item)
    const arr = groups.get(key) ?? []
    arr.push(item)
    groups.set(key, arr)
  }

  const merged: SecretariaInboxItem[] = []
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      merged.push(arr[0])
      continue
    }
    // Sort: last_message_at DESC · tiebreak por preference (private > lid > unknown)
    const sorted = [...arr].sort((a, b) => {
      if (a.last_message_at !== b.last_message_at) {
        return b.last_message_at > a.last_message_at ? 1 : -1
      }
      return preferenceScore(b) - preferenceScore(a)
    })
    let result = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      result = mergePair(result, sorted[i])
    }
    merged.push(result)
  }

  return merged
}
