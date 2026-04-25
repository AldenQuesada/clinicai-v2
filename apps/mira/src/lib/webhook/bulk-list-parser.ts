/**
 * Parser de lista bulk de vouchers · 3 formatos.
 *
 * Formatos suportados (DECISAO ALDEN 2026-04-25 · case Dani Mendes 22 vouchers):
 *
 *   a) Numerada compacta inline:
 *      "emite 3 vouchers: Maria 5544991111111, Ana 5544992222222, Bia 44993333333"
 *
 *   b) Multilinha simples:
 *      voucher pra:
 *      Maria 5544991111111
 *      Ana 44 99222-2222
 *      Bia (44) 99333-3333
 *
 *   c) Multilinha com nome+sobrenome composto:
 *      Maria Luiiza Pavezi Mendes 5544991234567
 *      Gabriela Romangnoli (44) 99876-5432
 *
 * Regras:
 *   - Phone primeiro (regex 10-14 digitos · com ou sem +/(/)/-/space).
 *   - Nome = tudo antes do phone na mesma linha/segmento, removendo verbos.
 *   - Output: array de { name, phone (digits-only) } · phone normalizado em
 *     normalizePhoneBR no caller.
 *   - Minimo 2 items pra ser considerado bulk · senao caller delega pro
 *     handler single existente (b2b-emit-voucher).
 *
 * Schedule parser:
 *   - "manda agora", "agora" → null (default = imediato)
 *   - "amanha 9h", "domingo 14h", "hoje 18h" → ISO date · best-effort
 *
 * Mantemos puro · sem deps externas. Tier 2 (Haiku) NAO e usado aqui · regex
 * + multiline cobre os 3 formatos da Dani Mendes · se algum dia bater Tier 2
 * fallback, marcar em meta { parser_fallback: 'haiku' }.
 */

import { normalizePhoneBR } from '@clinicai/utils'

// 10-14 digitos com formatacao opcional (parens, espacos, hifens, +)
// Match conservador · evita comer "44" puro de uma rua/idade.
// Min 10 digitos = celular sem DDI (DDD + 8 digitos), max 14 = +DDI13.
const PHONE_RX = /(\+?\d{2}\s?\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}|\+?\d{10,14})/

// Verbos/preposicoes/keywords de comando (removidos do nome)
const VERB_RX =
  /\b(emit(e|ir)|gera|gerar|fazer?|manda|mandar|envia|enviar|presentei?a|presentear|cria|criar|um\s+|uma\s+|o\s+|a\s+|voucher(s)?|cupom|cupons|presente(s)?|cortesia(s)?|pra|para|pro|lista\s+de|seguinte(s)?|abaixo)\b/gi

// Numero de itens declarado · "3 vouchers" / "10 vouchers pra"
const COUNT_HINT_RX = /(\d+)\s+vouchers?/i

// Separadores de itens inline (vírgula, ponto-vírgula, "e ")
const INLINE_SEP_RX = /[,;]|\s+e\s+/i

export interface ParsedBulkItem {
  name: string
  phone: string
}

export interface ParseBulkListResult {
  items: ParsedBulkItem[]
  rawCount: number
  declaredCount?: number
  /** Texto cru de schedule encontrado · "amanha 9h", "domingo 14h" */
  scheduleHint?: string
}

/**
 * Limpa nome · remove verbos/conectivos e trim.
 */
function cleanName(raw: string): string {
  return String(raw || '')
    .replace(VERB_RX, ' ')
    .replace(/^[\s\-:.·•]+|[\s\-:.·•]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrai item { name, phone } de um segmento (linha ou fatia).
 * Retorna null se segmento nao tem phone valido.
 */
function extractItemFromSegment(segment: string): ParsedBulkItem | null {
  const seg = String(segment || '').trim()
  if (!seg) return null

  const match = seg.match(PHONE_RX)
  if (!match) return null

  const rawPhone = match[0]
  const phone = normalizePhoneBR(rawPhone)
  if (!phone) return null

  const idx = seg.indexOf(rawPhone)
  const beforePhone = idx >= 0 ? seg.slice(0, idx) : ''
  const name = cleanName(beforePhone) || 'amiga'

  return { name, phone }
}

/**
 * Tenta parser multilinha (formatos b, c).
 * Cada linha que tem phone vira um item.
 */
function parseMultiline(text: string): ParsedBulkItem[] {
  const lines = String(text || '').split(/\r?\n/)
  const items: ParsedBulkItem[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const item = extractItemFromSegment(t)
    if (item) items.push(item)
  }
  return items
}

/**
 * Tenta parser inline numerado/compacto (formato a).
 * Quebra em segmentos por vírgula/ponto-vírgula/" e " e tenta extrair
 * { name, phone } de cada.
 */
function parseInline(text: string): ParsedBulkItem[] {
  // Remove prefixos "emite 3 vouchers:" antes de partir
  const stripped = String(text || '')
    .replace(/^[^:]*:/, '') // tudo ate primeiro ":" (se houver)
    .replace(COUNT_HINT_RX, ' ')
  const segments = stripped.split(INLINE_SEP_RX)
  const items: ParsedBulkItem[] = []
  for (const seg of segments) {
    const item = extractItemFromSegment(seg)
    if (item) items.push(item)
  }
  return items
}

/**
 * Detecta hint de schedule · best-effort · retorna texto cru pra caller
 * decidir parsing concreto. NAO converte pra ISO aqui (timezone-aware
 * decisao depende do contexto · clinic timezone resolve no handler).
 */
function detectScheduleHint(text: string): string | undefined {
  const t = String(text || '').toLowerCase()
  // "agora"/"manda agora" · null = default imediato
  if (/\b(agora|imediato|j[aá])\b/.test(t)) return undefined

  // "amanha 9h", "amanha as 14h", "amanha 14:30"
  const amanha = t.match(
    /amanh[aã](\s+(às|as))?\s+(\d{1,2})(:|h)?(\d{2})?/,
  )
  if (amanha) return amanha[0]

  // "hoje 18h", "hoje as 19:30"
  const hoje = t.match(/hoje(\s+(às|as))?\s+(\d{1,2})(:|h)?(\d{2})?/)
  if (hoje) return hoje[0]

  // dia da semana · "domingo 9h", "segunda 14h", "sabado 10h"
  const diaSemana = t.match(
    /(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)(\s+(às|as))?\s+(\d{1,2})(:|h)?(\d{2})?/,
  )
  if (diaSemana) return diaSemana[0]

  return undefined
}

/**
 * Parser principal · tenta multilinha primeiro (mais comum), fallback
 * inline numerado.
 *
 * Retorna lista deduplicada por phone (mesmo phone digitado 2x = 1 item).
 */
export function parseBulkList(text: string): ParseBulkListResult {
  const t = String(text || '')
  const declaredMatch = t.match(COUNT_HINT_RX)
  const declaredCount = declaredMatch ? Number(declaredMatch[1]) : undefined
  const scheduleHint = detectScheduleHint(t)

  // Estrategia: se tem mais de 1 linha com conteudo, vai multilinha. Se
  // multilinha so retornar 0/1 item, fallback inline.
  const linesWithContent = t.split(/\r?\n/).filter((l) => l.trim().length > 0)
  let items: ParsedBulkItem[] = []
  if (linesWithContent.length >= 2) {
    items = parseMultiline(t)
  }
  if (items.length < 2) {
    const inline = parseInline(t)
    if (inline.length > items.length) items = inline
  }

  // Dedup por phone
  const seen = new Set<string>()
  const unique: ParsedBulkItem[] = []
  for (const it of items) {
    if (seen.has(it.phone)) continue
    seen.add(it.phone)
    unique.push(it)
  }

  return {
    items: unique,
    rawCount: unique.length,
    declaredCount,
    scheduleHint,
  }
}

/**
 * Detector heuristico · texto parece ser um bulk submit?
 *
 * Regras:
 *   - Tem keyword "N vouchers" com N >= 2, OU
 *   - 2+ linhas distintas que casam com phone, OU
 *   - 2+ phones na mesma linha separados por vírgula/"e "
 *
 * Usado pelo intent classifier (Tier 1) pra decidir bulk vs single.
 */
export function looksLikeBulk(text: string): boolean {
  const t = String(text || '')
  const declared = t.match(COUNT_HINT_RX)
  if (declared && Number(declared[1]) >= 2) return true

  // Conta phones (qualquer formato)
  const phones = t.match(/\+?\d{2}\s?\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}|\+?\d{10,14}/g)
  if (!phones) return false
  return phones.length >= 2
}
