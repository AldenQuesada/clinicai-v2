/**
 * Normaliza telefone BR para E.164 sem o `+`. Aceita formatos:
 *   "(44) 99999-8888" · "44 99999-8888" · "44999998888" · "5544999998888"
 *
 * Retorna sempre 13 dígitos começando com 55 (ex: "5544999998888"), ou null
 * se não conseguir interpretar.
 */
export function normalizeBrPhone(input: string): string | null {
  const digits = input.replace(/\D+/g, '')
  if (digits.length === 0) return null

  let phone = digits
  // Já tem código do país (55XX...)
  if (phone.length === 13 && phone.startsWith('55')) return phone
  // Sem código do país, com DDD (44999998888 = 11)
  if (phone.length === 11) return `55${phone}`
  // Sem DDD (999998888 = 9) — não dá pra adivinhar DDD, rejeita
  if (phone.length === 10) return `55${phone}` // fixo, mantém

  return null
}

/**
 * Formata pra exibição BR amigável: "(44) 99999-8888"
 */
export function formatBrPhone(e164: string): string {
  const digits = e164.replace(/\D+/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const part1 = digits.slice(4, 9)
    const part2 = digits.slice(9, 13)
    return `(${ddd}) ${part1}-${part2}`
  }
  return e164
}

/**
 * Valida CPF brasileiro (algoritmo dos dígitos verificadores).
 * Aceita formatos com ou sem máscara. Retorna só os dígitos limpos se válido.
 */
export function normalizeCpf(input: string): string | null {
  const digits = input.replace(/\D+/g, '')
  if (digits.length !== 11) return null
  if (/^(\d)\1{10}$/.test(digits)) return null // 111.111.111-11 etc

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i)
  let dv1 = 11 - (sum % 11)
  if (dv1 >= 10) dv1 = 0
  if (dv1 !== parseInt(digits[9], 10)) return null

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i)
  let dv2 = 11 - (sum % 11)
  if (dv2 >= 10) dv2 = 0
  if (dv2 !== parseInt(digits[10], 10)) return null

  return digits
}
