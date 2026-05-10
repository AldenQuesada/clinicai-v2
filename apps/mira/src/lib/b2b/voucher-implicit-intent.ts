/**
 * parseImplicitVoucherRequest · 2026-05-10 · partner-voucher-implicit-v1
 *
 * Detector de intenção implícita de voucher · complementa `hasVoucherIntent`
 * (keyword-based) com phone-detection. Parceiras frequentemente mandam só
 * nome+telefone sem keyword ("Maria 44999887766", "Cliente Juliana 4499...").
 * Hoje o gate C1.1 bloqueia isso silenciosamente → fricção operacional.
 *
 * Filosofia: "parceira cadastrada + telefone BR válido = intenção de voucher".
 * NÃO emite voucher diretamente · cria pending confirmation via fluxo
 * b2b-emit-voucher existente (SIM/NAO da parceira antes da emissão real).
 *
 * Reusa exatamente a mesma regex + validação do handler b2b-emit-voucher
 * (canonicalPhoneBR + isLikelyValidLocalPhone) · mantém consistência total.
 *
 * Guards de segurança:
 *   - phone === senderPhone (parceira mandou próprio número) → reject
 *   - phone em blockPhones (canais oficiais Mih/Lara/Mira) → reject
 *   - phone leading-0 com 11 dígitos → reject (CPF/operador legacy)
 *   - phone com 5º char fora '2-9' → reject (CPF disfarçado)
 */

import { canonicalPhoneBR } from '@clinicai/utils'

/**
 * Regex tolerante a pontuação (mesma do b2b-emit-voucher · linha 31).
 * Cobre: 4499780779 · 449978-0779 · 44 9978-0779 · (44) 9978-0779 ·
 *        44999780779 · +55 44 99978-0779 · 044 9978-0779.
 */
const PHONE_RX = /(?:\+?55[\s.\-]*)?\(?\s*\d{2}\s*\)?[\s.\-]*\d{4,5}[\s.\-]?\d{4}/g

const VOUCHER_TYPO_RX_SOURCE = 'v[oa]u?[cs]?h?er[s]?'

/**
 * Última-N dígitos pra match resiliente com/sem nono dígito BR · cobre:
 *   5544991622986 ↔ 554491622986 ↔ 44991622986 ↔ 4491622986 ↔ 91622986
 */
function phoneVariantsForBlock(canonical: string): Set<string> {
  const digits = canonical.replace(/\D/g, '')
  return new Set([
    digits,
    digits.slice(-13),
    digits.slice(-12),
    digits.slice(-11),
    digits.slice(-10),
    digits.slice(-9),
    digits.slice(-8),
  ])
}

function isLikelyValidLocalPhone(canonical: string): boolean {
  if (canonical.length < 12 || canonical.length > 13) return false
  const localFirst = canonical.charAt(4)
  return '23456789'.includes(localFirst)
}

export interface ImplicitVoucherParseResult {
  hasPhone: boolean
  phoneRaw: string | null
  phoneE164: string | null
  candidateName: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface ImplicitVoucherParseOpts {
  /** Phone do remetente · evita criar voucher pra própria parceira */
  senderPhone?: string | null
  /** Phones de canais oficiais (Mih, Lara SDR, etc) · evita voucher cross-channel */
  blockPhones?: Array<string | null | undefined>
}

const EMPTY_RESULT: ImplicitVoucherParseResult = {
  hasPhone: false,
  phoneRaw: null,
  phoneE164: null,
  candidateName: null,
  confidence: 'low',
  reason: 'no_phone_match',
}

/**
 * Extrai phone + nome de mensagem solta de parceira.
 *
 * Retorna `hasPhone=true` apenas se:
 *   - regex pegou candidato de phone
 *   - canonicalPhoneBR validou (10-13 dígitos BR)
 *   - 5º char é 2-9 (filtra CPF)
 *   - phone não é o senderPhone
 *   - phone não está em blockPhones
 */
export function parseImplicitVoucherRequest(
  text: string | null | undefined,
  opts: ImplicitVoucherParseOpts = {},
): ImplicitVoucherParseResult {
  if (!text || typeof text !== 'string') return EMPTY_RESULT

  const matches = text.match(PHONE_RX)
  if (!matches || matches.length === 0) {
    return EMPTY_RESULT
  }

  // Block list · sender + canais oficiais (variantes BR last-N digits)
  const blockSet = new Set<string>()
  const addToBlock = (raw: string | null | undefined) => {
    if (!raw) return
    const canon = canonicalPhoneBR(raw)
    if (canon) {
      for (const v of phoneVariantsForBlock(canon)) blockSet.add(v)
    } else {
      // raw inválido pra canonicalPhoneBR · ainda assim adicionar variantes raw
      const digits = String(raw).replace(/\D/g, '')
      if (digits.length >= 8) {
        for (const v of phoneVariantsForBlock(digits)) blockSet.add(v)
      }
    }
  }
  addToBlock(opts.senderPhone)
  for (const b of opts.blockPhones ?? []) addToBlock(b)

  // Itera candidatos · pega o primeiro válido que não esteja no block
  let chosenPhone: string | null = null
  let chosenRaw: string | null = null
  let blockedByPolicy = false
  for (const candidate of matches) {
    const digitsOnly = candidate.replace(/\D/g, '')
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) continue // CPF
    const canon = canonicalPhoneBR(candidate)
    if (!canon || !isLikelyValidLocalPhone(canon)) continue

    // Block check via variants
    const variants = phoneVariantsForBlock(canon)
    let blocked = false
    for (const v of variants) {
      if (blockSet.has(v)) {
        blocked = true
        blockedByPolicy = true
        break
      }
    }
    if (blocked) continue

    chosenPhone = canon
    chosenRaw = candidate
    break
  }

  if (!chosenPhone || !chosenRaw) {
    return {
      ...EMPTY_RESULT,
      reason: blockedByPolicy ? 'phone_blocked_by_policy' : 'no_valid_phone',
    }
  }

  // Extração de nome · mesmo pipeline do handler b2b-emit-voucher
  const beforePhone = text.split(chosenRaw)[0] || ''
  const stripCommands = new RegExp(
    `\\b(emit(e|ir)|gera(r)?|fazer?|manda(r)?|envia(r)?|presentei?a(r)?|cria(r)?|quero|queria|preciso|posso|gostaria|um\\s+|uma\\s+|o\\s+|a\\s+|${VOUCHER_TYPO_RX_SOURCE}|cupom|cupons|presente[s]?|cortesia[s]?|pra|para|whatsapp|zap|cliente|paciente|contato|tel|telefone|n[uú]mero|segue|oi|ola|ol[aá]|mira)\\b`,
    'gi',
  )
  const cleaned = beforePhone
    .replace(/\bp\//gi, ' ')
    .replace(/[:;,!?.()]+/g, ' ')
    .replace(stripCommands, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Pega 1-3 palavras (nome comum BR) · cap em 60 chars
  const nameTokens = cleaned ? cleaned.split(/\s+/).filter(Boolean) : []
  const candidateName = nameTokens.length > 0
    ? nameTokens.slice(0, 3).join(' ').slice(0, 60)
    : null

  // Confidence:
  //   high   · nome extraído + 1 phone único
  //   medium · sem nome mas phone válido (parceira mandou só número)
  //   low    · múltiplos phones (pode ser bulk · handler separado)
  let confidence: 'high' | 'medium' | 'low'
  if (matches.length > 1) {
    confidence = 'low'
  } else if (candidateName && candidateName.length >= 2) {
    confidence = 'high'
  } else {
    confidence = 'medium'
  }

  return {
    hasPhone: true,
    phoneRaw: chosenRaw,
    phoneE164: chosenPhone,
    candidateName,
    confidence,
    reason: 'phone_extracted',
  }
}

/**
 * Wrapper boolean · útil pra gates.
 */
export function hasImplicitVoucherIntent(
  text: string | null | undefined,
  opts: ImplicitVoucherParseOpts = {},
): boolean {
  return parseImplicitVoucherRequest(text, opts).hasPhone
}

// Test exports
export const __testables = {
  isLikelyValidLocalPhone,
  phoneVariantsForBlock,
  PHONE_RX,
}
