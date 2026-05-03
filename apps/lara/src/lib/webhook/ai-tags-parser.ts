/**
 * Parser das smart tags emitidas pela IA na resposta.
 *
 * Tags suportadas (extraídas do output e aplicadas em side-effects):
 *   [SCORE:N]                    → atualiza lead.lead_score
 *   [ADD_TAG:nome]               → adiciona tag em lead.tags (array)
 *   [QUEIXA:nome]                → adiciona queixa em lead.queixas_faciais
 *   [SET_FUNNEL:olheiras|fullface|procedimentos] → reclassifica funnel
 *   [ACIONAR_HUMANO]             → handoff (tratado fora · pausa IA + notifica)
 *
 * Cada parser retorna { textCleaned, applied } pra caller orquestrar persist.
 * Side-effects (DB writes) são responsabilidade do caller · este módulo
 * é puro de parse pra facilitar teste unitário.
 */

export interface ParsedScore {
  textCleaned: string
  newScore: number | null
}

export interface ParsedTags {
  textCleaned: string
  tags: string[]
}

export interface ParsedQueixas {
  textCleaned: string
  queixas: string[]
}

/** Whitelist de queixas faciais reconhecidas · espelha KNOWN_PHOTO_TAGS */
const KNOWN_QUEIXAS = [
  'olheiras', 'sulcos', 'flacidez', 'contorno', 'papada',
  'textura', 'rugas', 'firmeza', 'manchas', 'mandibula',
  'perfil', 'bigode_chines', 'rejuvenescimento',
]

export interface ParsedFunnel {
  textCleaned: string
  newFunnel: 'olheiras' | 'fullface' | 'procedimentos' | null
}

export function parseScore(text: string): ParsedScore {
  const match = text.match(/\[SCORE:(\d+)\]/)
  if (!match) return { textCleaned: text, newScore: null }
  return {
    textCleaned: text.replace(match[0], '').trim(),
    newScore: parseInt(match[1], 10),
  }
}

export function parseTags(text: string): ParsedTags {
  const matches = text.match(/\[ADD_TAG:([^\]]+)\]/g)
  if (!matches?.length) return { textCleaned: text, tags: [] }

  let cleaned = text
  const tags: string[] = []
  for (const m of matches) {
    const name = m.replace('[ADD_TAG:', '').replace(']', '').trim()
    if (name) tags.push(name)
    cleaned = cleaned.replace(m, '').trim()
  }
  return { textCleaned: cleaned, tags }
}

/**
 * Parser de queixas faciais detectadas pela Lara durante o chat.
 * Lara emite [QUEIXA:olheiras] · [QUEIXA:sulcos] etc quando paciente
 * menciona o que incomoda. Filtra contra whitelist (KNOWN_QUEIXAS) e
 * normaliza pra lowercase + underscore.
 */
export function parseQueixas(text: string): ParsedQueixas {
  const matches = text.match(/\[QUEIXA:([^\]]+)\]/gi)
  if (!matches?.length) return { textCleaned: text, queixas: [] }

  let cleaned = text
  const queixas: string[] = []
  for (const m of matches) {
    const raw = m.replace(/\[QUEIXA:/i, '').replace(']', '').trim().toLowerCase().replace(/\s+/g, '_')
    if (KNOWN_QUEIXAS.includes(raw) && !queixas.includes(raw)) {
      queixas.push(raw)
    }
    cleaned = cleaned.replace(m, '').trim()
  }
  return { textCleaned: cleaned, queixas }
}

export function parseFunnel(text: string): ParsedFunnel {
  const match = text.match(/\[SET_FUNNEL:(olheiras|fullface|procedimentos)\]/i)
  if (!match) return { textCleaned: text, newFunnel: null }
  return {
    textCleaned: text.replace(match[0], '').trim(),
    newFunnel: match[1].toLowerCase() as ParsedFunnel['newFunnel'],
  }
}

export function hasHandoffTag(text: string): boolean {
  return text.includes('[ACIONAR_HUMANO]')
}

export function stripHandoffTag(text: string): string {
  return text.replace(/\[ACIONAR_HUMANO\]/g, '').trim()
}
