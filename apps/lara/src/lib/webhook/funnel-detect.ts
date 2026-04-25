/**
 * Funnel auto-detection · keyword matching simples sobre texto.
 *
 * Usado tanto na entrada (texto inbound) quanto após transcrição de áudio.
 * Antes vivia duplicado em 2 blocos no webhook · agora 1 fonte da verdade.
 *
 * Retorna 'olheiras' | 'fullface' | null. Caller decide se aplica (só atualiza
 * lead.funnel quando atual é genérico/nulo · não sobrescreve diagnóstico humano).
 */

const OLHEIRAS_KEYWORDS = [
  'olheira', 'olho', 'palpebra', 'pálpebra',
  'cansada', 'escuro', 'escurec',
] as const

const FULLFACE_KEYWORDS = [
  'ruga', 'flacidez', 'rosto', 'contorno',
  'bigode', 'chinês', 'sulco', 'derretendo',
  'papada', 'lifting', 'fio', 'bochecha',
  'cai', 'caido', 'mancha',
] as const

const GENERIC_FUNNELS = new Set([
  null,
  '',
  'procedimentos',
  'geral',
  'Geral',
  'Procedimentos Gerais',
])

export type DetectedFunnel = 'olheiras' | 'fullface' | null

/**
 * Detecta funil baseado em palavras-chave no texto.
 * Retorna null se texto ambíguo · caller cai pro padrão.
 */
export function detectFunnel(text: string): DetectedFunnel {
  if (!text || text.length <= 5 || text.startsWith('[')) return null
  const txt = text.toLowerCase()
  if (OLHEIRAS_KEYWORDS.some((k) => txt.includes(k))) return 'olheiras'
  if (FULLFACE_KEYWORDS.some((k) => txt.includes(k))) return 'fullface'
  return null
}

/**
 * True se o funnel atual deve ser sobrescrito pela detecção automática.
 * (Só sobrescreve genéricos · respeita olheiras/fullface já atribuídos.)
 */
export function shouldOverrideFunnel(currentFunnel: string | null | undefined): boolean {
  return GENERIC_FUNNELS.has((currentFunnel ?? null) as never)
}
