/**
 * Heurísticas pra qualidade de nome humano · usado pelo webhook WhatsApp
 * pra decidir se aceita o `pushName` (perfil do paciente) como `lead.name`
 * ou `wa_conversations.display_name`.
 *
 * Premissas:
 *   - pushName vem do WhatsApp e pode ser literalmente qualquer coisa
 *     (nome real, "WhatsApp User", número, emoji puro, vazio, etc).
 *   - lead.name e display_name são frequentemente preenchidos com phone
 *     na criação inicial (caso a 1a inbound não traga pushName).
 *   - Quando uma inbound posterior traz pushName válido, queremos atualizar
 *     SEM sobrescrever um nome humano que já estava bom.
 */

/** Genéricos rejeitados (case-insensitive · trim aplicado) */
const GENERIC_BAD_NAMES = new Set([
  'unknown',
  'null',
  'undefined',
  'cliente',
  'paciente',
  'lead',
  'contato',
  'whatsapp user',
  'usuario',
  'usuário',
])

/** Pelo menos UMA letra (Unicode · cobre acentos) */
const LETTER_RE = /\p{L}/u

/** Detecta string que é só dígitos/separadores telefônicos */
const PHONE_LIKE_RE = /^[\d\s+\-().]+$/

/**
 * Retorna true se `value` parece um nome humano usável.
 *
 * Regras:
 *   - não vazio (após trim)
 *   - >= 2 caracteres "úteis" (não-espaço/punctuação)
 *   - contém pelo menos 1 letra (Unicode)
 *   - não é puramente numérico/telefone
 *   - não é genérico ruim conhecido
 */
export function isGoodHumanName(value: string | null | undefined): boolean {
  if (value == null) return false
  const trimmed = String(value).trim()
  if (trimmed.length === 0) return false

  // genérico ruim conhecido (case-insensitive · normaliza espaço múltiplo)
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ')
  if (GENERIC_BAD_NAMES.has(normalized)) return false

  // precisa ter pelo menos 1 letra (rejeita "🙂🙂", "123-456", etc)
  if (!LETTER_RE.test(trimmed)) return false

  // só dígitos/separadores telefônicos · rejeita "+55 (44) 9 9162-2986"
  if (PHONE_LIKE_RE.test(trimmed)) return false

  // pelo menos 2 caracteres "úteis" (não-espaço/punctuação)
  // (matchAll Unicode letter + número · ignora espaço, acento standalone, etc)
  const usefulChars = trimmed.match(/[\p{L}\p{N}]/gu)
  if (!usefulChars || usefulChars.length < 2) return false

  return true
}

/**
 * Decide se `currentName` deve ser substituído por `incomingPushName`.
 *
 * Retorna true APENAS se:
 *   1. `incomingPushName` é um nome humano bom (passa em isGoodHumanName); E
 *   2. `currentName` está vazio/null OU é numérico/telefone OU é genérico ruim.
 *
 * Retorna false se `currentName` já parece nome humano bom · proteção
 * principal contra sobrescrever cadastro manual feito pela secretária com
 * pushName posterior (que pode ser apelido, "Mãe", emoji etc).
 */
export function shouldUpdateName(
  currentName: string | null | undefined,
  incomingPushName: string | null | undefined,
): boolean {
  // se o novo não presta, nem cogita atualizar
  if (!isGoodHumanName(incomingPushName)) return false

  // current vazio/null → atualiza
  if (currentName == null) return true
  const currentTrimmed = String(currentName).trim()
  if (currentTrimmed.length === 0) return true

  // current é "ruim" (numérico/telefone/genérico) → atualiza
  if (!isGoodHumanName(currentTrimmed)) return true

  // current é nome humano bom · NÃO sobrescreve
  return false
}
