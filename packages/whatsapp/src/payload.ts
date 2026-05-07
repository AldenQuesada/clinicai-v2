/**
 * payload.ts · Helper canônico de normalização de payloads inbound ricos.
 *
 * Mig 144 (2026-05-07) · `wa_messages.payload jsonb` armazena shape mínimo
 * NORMALIZADO · NUNCA payload bruto do provider. Webhooks Cloud e Evolution
 * chamam `mapInboundToPayload(provider, message)` antes de saveInbound, e o
 * resultado vai pra coluna `payload` (quando aplicável · null pra texto/mídia
 * simples que continuam usando content + media_url legacy).
 *
 * Shape canônico hoje cobre apenas `kind:'contact'` (módulo de contato
 * compartilhado). Discriminator `kind` permite extensão futura · location,
 * reaction, sticker metadata, forward, poll, edited/deleted sem nova
 * migration.
 *
 * Disciplina LGPD:
 *   · NUNCA copiar arrays inteiros do provider.
 *   · NUNCA copiar email/endereço/org do contato (não são exibidos no MVP
 *     e violariam minimização de dados sem ganho funcional).
 *   · vCard original opcionalmente preservado (apenas Evolution · Baileys
 *     já entrega · útil pra forward fidedigno futuro). NÃO parseado/exposto
 *     além de FN/TEL/waid.
 *   · Tokens/api keys jamais entram aqui · helpers só leem campos públicos
 *     do envelope da mensagem.
 *
 * Defensivo: aceita `unknown`/payload imprevisto sem crash · retorna null
 * quando shape não bate.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────

/**
 * Payload normalizado de mensagem rica · discriminado por `kind`.
 * Persistido em `wa_messages.payload jsonb` (mig 144).
 */
export type WhatsAppMessagePayload = WhatsAppContactPayload

/**
 * Contato compartilhado · MVP do módulo "WhatsApp Web no dash".
 * `phone` é o canônico pra dedup/lookup · só dígitos, sem '+'.
 * `display_phone` preserva formatação humana (com '+', espaços) pra UI.
 * `wa_id` é o e164-puro do WhatsApp · pode coincidir com phone ou diferir
 * se o contato compartilhado tem número não-WA.
 * `vcard` opcional (só Evolution entrega) · usado pra forward futuro.
 */
export interface WhatsAppContactPayload {
  kind: 'contact'
  name: string | null
  phone: string | null
  display_phone?: string | null
  wa_id?: string | null
  vcard?: string | null
  source?: 'cloud' | 'evolution'
}

// ─── Helpers de normalização ─────────────────────────────────────────────

/**
 * Remove tudo que não for dígito · útil pra normalizar phone/wa_id.
 * Não inventa DDI · '+55 44 99999-1234' → '5544999991234'.
 * Retorna null pra entrada vazia, undefined, não-string ou só espaços.
 */
export function normalizePhoneDigits(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/\D+/g, '')
  return digits.length > 0 ? digits : null
}

/**
 * Parser simples de campo vCard (FN ou TEL) · não substitui parser completo.
 * Aceita variantes:
 *   FN:João Silva
 *   TEL;type=CELL;waid=5544999991234:+55 44 99999-1234
 * Retorna o valor após o último ':' da primeira linha que começa com o campo.
 * Retorna null pra entrada vazia ou linha ausente.
 */
export function extractVcardField(
  vcard: string | null | undefined,
  field: 'FN' | 'TEL',
): string | null {
  if (typeof vcard !== 'string' || vcard.length === 0) return null
  // \r\n ou \n · linhas vCard podem usar qualquer um
  const lines = vcard.split(/\r?\n/)
  for (const line of lines) {
    // FN: começa estrito · TEL pode ter parâmetros (TEL;type=CELL;waid=...)
    const matches =
      field === 'FN'
        ? /^FN(?:;[^:]*)?:(.*)$/.exec(line)
        : /^TEL(?:;[^:]*)?:(.*)$/.exec(line)
    if (matches && matches[1]) {
      const value = matches[1].trim()
      if (value.length > 0) return value
    }
  }
  return null
}

/**
 * Extrai `waid=...` de qualquer linha do vCard · retorna apenas dígitos.
 * Baileys/Evolution incluem `waid=5544999991234` no parâmetro TEL quando o
 * contato é número WhatsApp · fonte canônica pro id da rede.
 */
export function extractWaidFromVcard(
  vcard: string | null | undefined,
): string | null {
  if (typeof vcard !== 'string' || vcard.length === 0) return null
  const match = /waid=(\d+)/i.exec(vcard)
  if (!match || !match[1]) return null
  return normalizePhoneDigits(match[1])
}

// ─── Mappers por provider ────────────────────────────────────────────────

/**
 * Mapeia 1 contato do payload Cloud (Meta WhatsApp Business API) pro shape
 * normalizado. Caller passa o item de `message.contacts[0]` (não o array
 * inteiro · MVP cobre 1 contato por mensagem).
 *
 * Estrutura Meta:
 *   {
 *     name: { formatted_name, first_name, last_name?, ... },
 *     phones: [{ phone, wa_id?, type? }, ...]
 *   }
 *
 * `wa_id` é a fonte canônica de phone (e164 sem '+') · `phone` preserva
 * formatação humana com '+'.
 */
export function mapCloudContactPayload(
  message: unknown,
): WhatsAppContactPayload | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>

  const nameObj = m.name as Record<string, unknown> | undefined
  const nameRaw =
    typeof nameObj?.formatted_name === 'string' && nameObj.formatted_name.trim().length > 0
      ? nameObj.formatted_name.trim()
      : null
  const firstName =
    typeof nameObj?.first_name === 'string' ? nameObj.first_name.trim() : ''
  const lastName =
    typeof nameObj?.last_name === 'string' ? nameObj.last_name.trim() : ''
  const composedName = [firstName, lastName].filter((p) => p.length > 0).join(' ')
  const name = nameRaw ?? (composedName.length > 0 ? composedName : null)

  const phonesArr = Array.isArray(m.phones) ? m.phones : []
  const firstPhone =
    phonesArr.length > 0 && typeof phonesArr[0] === 'object' && phonesArr[0]
      ? (phonesArr[0] as Record<string, unknown>)
      : null
  const rawWaId = typeof firstPhone?.wa_id === 'string' ? firstPhone.wa_id : null
  const rawPhone = typeof firstPhone?.phone === 'string' ? firstPhone.phone : null
  const wa_id = normalizePhoneDigits(rawWaId)
  const phone = wa_id ?? normalizePhoneDigits(rawPhone)
  const display_phone = rawPhone

  // Mensagem precisa pelo menos um identificador (name OU phone) pra ser útil.
  if (!name && !phone) return null

  return {
    kind: 'contact',
    name,
    phone,
    display_phone,
    wa_id,
    vcard: null,
    source: 'cloud',
  }
}

/**
 * Mapeia contato do payload Evolution/Baileys pro shape normalizado.
 * Caller passa `message.message` (objeto com contactMessage/contactsArrayMessage).
 *
 * Estrutura Baileys:
 *   contactMessage: { displayName, vcard }
 *   contactsArrayMessage: { contacts: [{ displayName, vcard }, ...] }
 *
 * Pega o primeiro contato (MVP). vCard é a fonte primária de phone/wa_id ·
 * displayName é fallback de name. Preserva vCard original (opcional) pra
 * forward fidedigno futuro · NÃO parseamos email/endereço/org.
 */
export function mapEvolutionContactPayload(
  msgRec: unknown,
): WhatsAppContactPayload | null {
  if (!msgRec || typeof msgRec !== 'object') return null
  const m = msgRec as Record<string, unknown>

  // Resolve fonte: contactMessage direto OU primeiro do contactsArrayMessage
  let contactObj: Record<string, unknown> | null = null
  if (m.contactMessage && typeof m.contactMessage === 'object') {
    contactObj = m.contactMessage as Record<string, unknown>
  } else if (m.contactsArrayMessage && typeof m.contactsArrayMessage === 'object') {
    const arr = (m.contactsArrayMessage as Record<string, unknown>).contacts
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0]) {
      contactObj = arr[0] as Record<string, unknown>
    }
  }
  if (!contactObj) return null

  const vcard =
    typeof contactObj.vcard === 'string' && contactObj.vcard.length > 0
      ? contactObj.vcard
      : null
  const displayName =
    typeof contactObj.displayName === 'string' && contactObj.displayName.trim().length > 0
      ? contactObj.displayName.trim()
      : null

  const fnFromVcard = extractVcardField(vcard, 'FN')
  const telFromVcard = extractVcardField(vcard, 'TEL')
  const waidFromVcard = extractWaidFromVcard(vcard)

  const name = displayName ?? fnFromVcard
  const wa_id = waidFromVcard
  const phone = wa_id ?? normalizePhoneDigits(telFromVcard)
  const display_phone = telFromVcard

  if (!name && !phone) return null

  return {
    kind: 'contact',
    name,
    phone,
    display_phone,
    wa_id,
    vcard,
    source: 'evolution',
  }
}

/**
 * Dispatcher · roteia pro mapper do provider correto.
 * Em etapas futuras, este helper crescerá com `kind: 'location'`,
 * `kind: 'reaction'`, etc · cada provider terá seu mapper específico.
 *
 * Cloud: caller passa `message.contacts[0]` (item do array).
 * Evolution: caller passa `message.message` (objeto com contactMessage).
 *
 * Retorna null quando shape não corresponde a contato · saveInbound deve
 * persistir `payload: null` nesse caso (mensagem segue legacy via content).
 */
export function mapInboundToPayload(
  provider: 'cloud' | 'evolution',
  input: unknown,
): WhatsAppMessagePayload | null {
  if (provider === 'cloud') return mapCloudContactPayload(input)
  if (provider === 'evolution') return mapEvolutionContactPayload(input)
  return null
}
