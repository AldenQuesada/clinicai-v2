/**
 * Normalização de telefone BR · espelha lpb-phone-utils.js do clinic-dashboard
 * + lara-dispatch Edge Function. Saída sempre digits-only com DDI 55.
 *
 * Inputs aceitos:
 *   - '44991622986'              (10-11 digits, sem DDI · adiciona 55)
 *   - '+55 (44) 99162-2986'       (formatado · strip + DDI ja presente)
 *   - '5544991622986'             (12-13 digits com DDI · valida)
 *   - 0-prefixed (operadora)      (strip 0 antes)
 *
 * Saída: digits puros 12-13 chars começando com '55', ou string vazia se invalido.
 */
export function normalizePhoneBR(input: string | null | undefined): string {
  if (input == null) return ''
  let d = String(input).replace(/\D/g, '')
  if (!d) return ''
  if (d.charAt(0) === '0') d = d.replace(/^0+/, '')
  if (!d) return ''
  const len = d.length
  if (len === 10 || len === 11) return '55' + d
  if ((len === 12 || len === 13) && d.substring(0, 2) === '55') return d
  return ''
}

/** Valida sem alterar · true se entrada produz output não-vazio */
export function isValidPhoneBR(input: string | null | undefined): boolean {
  return normalizePhoneBR(input) !== ''
}

/** Formata pra display (44 99162-2986). Sem DDI por brevidade. */
export function formatPhoneBR(input: string | null | undefined): string {
  const digits = normalizePhoneBR(input)
  if (!digits) return String(input ?? '')
  // Remove DDI 55
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11) {
    // celular: 44 99162-2986
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    // fixo: 44 9162-2986
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return digits
}
