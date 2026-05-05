/**
 * Helpers de exibição de nome + telefone do paciente no inbox /conversas.
 *
 * Single source of truth pro card (ConversationList) e header (MessageArea).
 * UI nunca duplica regra de fallback · sempre usa estes helpers.
 *
 * Regra cravada (Alden 2026-05-05):
 *   1) prioridade: displayName > senderName > pushName > contactName >
 *      leadName > patientName > name > metadata.{pushName,name}
 *   2) ignora valores que sejam apenas dígitos (são fallback de telefone do
 *      legacy `lead_name = ... || c.phone`)
 *   3) se nada bater, retorna string vazia · UI cai em formatPhoneBR(phone).
 *
 * Telefone formatado em PT-BR:
 *   13 dígitos com 55 → +55 44 99907-1322
 *   12 dígitos com 55 → +55 44 9907-1322
 *   11 dígitos        → 44 99907-1322
 *   10 dígitos        → 44 9907-1322
 *   senão             → string original (sem mexer · não inventa formato)
 */

/**
 * Shape mínima · helper aceita qualquer subset desses campos. Cada campo é
 * checado em ordem de prioridade. Tipos opcionais permitem evolução futura
 * (API/repo expor mais fontes de nome) sem mudar consumidores.
 */
export interface ConversationNameSource {
  displayName?: string | null
  display_name?: string | null
  senderName?: string | null
  sender_name?: string | null
  pushName?: string | null
  push_name?: string | null
  contactName?: string | null
  contact_name?: string | null
  leadName?: string | null
  lead_name?: string | null
  patientName?: string | null
  patient_name?: string | null
  name?: string | null
  metadata?: Record<string, unknown> | null
}

/** Trim + filtro de "fake names" puro-dígitos (fallback de phone). */
function _clean(value: unknown): string {
  if (value == null) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  // "5544988312408" e similares são telefone disfarçado de nome (legacy
  // fallback no API) · não considerar nome real.
  if (/^\+?\d[\d\s\-()]*$/.test(trimmed)) return ''
  return trimmed
}

/**
 * Resolve nome de exibição com prioridade em cascata. Retorna string vazia
 * se nenhum candidato é nome real (UI deve cair em formatPhoneBR).
 */
export function getConversationDisplayName(obj: ConversationNameSource | null | undefined): string {
  if (!obj) return ''
  const candidates: unknown[] = [
    obj.displayName,
    obj.display_name,
    obj.senderName,
    obj.sender_name,
    obj.pushName,
    obj.push_name,
    obj.contactName,
    obj.contact_name,
    obj.leadName,
    obj.lead_name,
    obj.patientName,
    obj.patient_name,
    obj.name,
  ]
  for (const c of candidates) {
    const v = _clean(c)
    if (v) return v
  }
  // metadata fallbacks (caso futuro a API exponha shape rico)
  const meta = obj.metadata
  if (meta && typeof meta === 'object') {
    const metaCandidates: unknown[] = [
      (meta as Record<string, unknown>).pushName,
      (meta as Record<string, unknown>).push_name,
      (meta as Record<string, unknown>).name,
    ]
    for (const c of metaCandidates) {
      const v = _clean(c)
      if (v) return v
    }
  }
  return ''
}

/**
 * Formata telefone BR. Aceita variantes de entrada (com/sem 55, com/sem
 * separadores). Não inventa formato · se input não bate com nenhum dos casos
 * conhecidos, retorna a string original (preserva info pro debug).
 *
 * Exemplos:
 *   '5544999071322' → '+55 44 99907-1322'  (13 dígitos · DDI+DDD+9-cell)
 *   '554499071322'  → '+55 44 9907-1322'   (12 dígitos · DDI+DDD+8-cell legacy)
 *   '44999071322'   → '44 99907-1322'      (11 dígitos · DDD+9-cell)
 *   '4499071322'    → '44 9907-1322'       (10 dígitos · DDD+8-cell)
 *   '17141112222'   → '17141112222'        (formato desconhecido · raw)
 *   ''              → ''
 */
export function formatPhoneBR(phone: string | null | undefined): string {
  if (phone == null) return ''
  const raw = String(phone).trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')

  // 13d com 55 → +55 44 99907-1322
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const a = digits.slice(4, 9)
    const b = digits.slice(9)
    return `+55 ${ddd} ${a}-${b}`
  }
  // 12d com 55 → +55 44 9907-1322
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const a = digits.slice(4, 8)
    const b = digits.slice(8)
    return `+55 ${ddd} ${a}-${b}`
  }
  // 11d → 44 99907-1322
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2)
    const a = digits.slice(2, 7)
    const b = digits.slice(7)
    return `${ddd} ${a}-${b}`
  }
  // 10d → 44 9907-1322
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2)
    const a = digits.slice(2, 6)
    const b = digits.slice(6)
    return `${ddd} ${a}-${b}`
  }
  // Formato não reconhecido · devolve raw (não inventa)
  return raw
}
