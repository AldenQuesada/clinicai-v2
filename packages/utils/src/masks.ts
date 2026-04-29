/**
 * Masks de formulario · espelham clinic-dashboard legacy js/patients.js.
 *
 * Pure functions · idempotentes · uso em onChange handlers (client) e
 * antes de salvar (server validation).
 *
 * Pattern: receba string raw, devolva string com mask aplicada (caractere
 * por caractere). Caller decide quando chamar (onInput vs onBlur).
 */

// ── CPF · 000.000.000-00 (max 14 chars com mask) ────────────────────────────

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/** Remove mask · retorna 11 digitos (ou string vazia se invalido) */
export function unmaskCpf(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 ? digits : ''
}

/** CHECK constraint v2: cpf tem que ser 11 digitos numericos */
export function isValidCpfFormat(value: string | null | undefined): boolean {
  if (!value) return true // opcional
  return /^[0-9]{11}$/.test(value)
}

// ── RG · 00.000.000-0 (max 12 chars · aceita X final) ────────────────────────

export function maskRg(value: string): string {
  // RG aceita X no final (digito verificador) · slice 9 chars uteis
  const clean = value.replace(/[^0-9xX]/gi, '').slice(0, 9)
  if (clean.length <= 2) return clean
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`
  if (clean.length <= 8)
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}-${clean.slice(8).toUpperCase()}`
}

export function unmaskRg(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/[^0-9xX]/gi, '').toLowerCase()
}

// ── Telefone display · (11) 99999-9999 (max 15) ─────────────────────────────
//
// Pra E.164 (55 + DDD + 9digits) use normalizePhoneBR de phone.ts.
// maskPhoneDisplay eh so pra UX no input · normalize antes de salvar.

export function maskPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ── CEP · 00000-000 (max 9) ─────────────────────────────────────────────────

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function unmaskCep(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

// ── Email · format basico (Zod faz validacao real) ──────────────────────────

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return true // opcional
  // Regex pragmatica · Zod email() eh mais rigorosa server-side
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
