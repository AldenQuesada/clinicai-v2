/**
 * Masks · port 1:1 do clinic-dashboard/js/clinic-settings.js (linhas 1-70)
 *
 * Cada funcao recebe `value` e retorna a versao mascarada · pra uso em
 * onChange dos inputs controlados. Mantida assinatura puramente funcional
 * (sem mexer em DOM como no legacy) pra encaixar no React.
 */

export function maskCPF(raw: string): string {
  let v = raw.replace(/\D/g, '').substring(0, 11)
  if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4')
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3')
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})/, '$1.$2')
  return v
}

export function maskCNPJ(raw: string): string {
  let v = raw.replace(/\D/g, '').substring(0, 14)
  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4')
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, '$1.$2')
  return v
}

export function maskPhone(raw: string): string {
  let v = raw.replace(/\D/g, '').substring(0, 11)
  if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2')
  else if (v.length > 0) v = v.replace(/^(\d{0,2})/, '($1')
  return v
}

export function maskCEP(raw: string): string {
  let v = raw.replace(/\D/g, '').substring(0, 8)
  if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3})/, '$1-$2')
  return v
}

export function maskRG(raw: string): string {
  let v = raw.replace(/[^0-9xX]/gi, '').substring(0, 9).toUpperCase()
  if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\w)/, '$1.$2.$3-$4')
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\w+)/, '$1.$2.$3')
  else if (v.length > 2) v = v.replace(/^(\d{2})(\w+)/, '$1.$2')
  return v
}

/** Hex color regex — 6 digits com prefixo # · port da validacao linha 368 */
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
