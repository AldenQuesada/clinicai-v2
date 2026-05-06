/**
 * hasVoucherIntent · trava simples por keywords pra impedir Mira de
 * responder mensagem pessoal/genérica do parceiro.
 *
 * Audit C1.1 (2026-05-05): mesmo com partner whitelist + canal correto,
 * Mira respondia QUALQUER mensagem do parceiro (incluindo "oi", "bom dia",
 * "preciso falar com você") porque `partner.other` cai em handler que sempre
 * gera replyText. Esse helper adiciona gate ANTES do classifier · só
 * permite fluxo Mira quando texto menciona voucher/convite/presente/etc.
 *
 * Estratégia · regex case-insensitive sobre texto normalizado (lowercase +
 * strip acentos). Cobre PT-BR + erros comuns (voucher/vaucher/voucer).
 *
 * NÃO é semântico · false-positive raro mas possível ("não vou enviar voucher
 * agora" bate). Aceitável: a Mira aí responde · pior caso · e sempre podemos
 * apertar a regra depois com classifier ou Haiku.
 *
 * Caller deve combinar com state preemption: se já há voucher_pending
 * state (fluxo em andamento), bypassa essa trava (caller responsabilidade).
 */

/** Normaliza texto: lowercase + strip acentos (combining marks U+0300-U+036F) + colapsa espaços. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // Combining diacritical marks block
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Patterns de intenção de voucher · ordem não importa · qualquer match basta.
 * Lista evolui conforme aprendemos novos casos · vide audit dispatch logs.
 */
const VOUCHER_INTENT_PATTERNS: RegExp[] = [
  // Palavras-chave nucleares · "voucher" + variantes/typos comuns.
  // Audit 2026-05-06: regex fuzzy unificada cobre voucher/voucer/vocher/
  // vouher/vauher/vaucher/vouchers — antes `vouch?er` falhava em 'vouher'
  // (c missing) · `vaucher[s]?` ainda redundante mas mantido pra clareza.
  /\bv[oa]u?[cs]?h?er[s]?\b/,

  // Sinônimos diretos
  /\bcortesia[s]?\b/,
  /\bcupom\b/,
  /\bcupons\b/,
  /\bconvi[dt]e[s]?\b/,
  /\bconvi[dt]ad[ao][s]?\b/,
  /\bbeneficiari[ao][s]?\b/,

  // Verbos de ação relacionados a presente
  /\bpresent(e|es|ear|eando|earia|eou)\b/,
  /\bindic(o|ar|aria|ando) (uma|um|o|a)/,

  // Verbos de envio + alvo (paciente/cliente/amig)
  /\b(envia|envie|enviar|enviou|envio|manda|mande|mandar|mandou)\s+(pra|para|p\/)\s+(paciente|cliente|amig|convidad)/,

  // Variantes encadeadas com verbo + nome do voucher
  /\b(envia|envie|enviar|manda|mande|mandar|emite|emitir|gera|gerar|emit[ae])\s+(o\s+|um\s+|uma\s+|a\s+)?(voucher|cortesia|cupom|convite|presente)/,

  // "agendar pelo voucher", "agendamento com voucher"
  /\bagend(ar|amento|a)\s+(pelo|pela|com|usando)\s+(voucher|cortesia|cupom|presente)/,

  // "queria/preciso de voucher"
  /\b(quero|queria|gostaria|preciso|necessito)\s+(de\s+)?(um|uns|mais|outro|outra|outros|outras)?\s*(voucher|cortesia|cupom|convite|presente)/,
]

/**
 * Retorna true se o texto contém intenção de voucher/convite/presente.
 * Usa regex sobre texto normalizado · sem acento + lowercase.
 *
 * Casos null/undefined/'' retornam false.
 */
export function hasVoucherIntent(text: string | null | undefined): boolean {
  if (!text) return false
  const norm = normalize(text)
  if (norm.length < 2) return false
  return VOUCHER_INTENT_PATTERNS.some((rx) => rx.test(norm))
}
