/**
 * renderTemplate · substitui {var} no texto por valores do dict.
 *
 * Convencao usada em b2b_comm_templates: placeholders sao {var} (chaves
 * sem $, sem espacos). Ex: "Olá, {parceira}!" + { parceira: "Dani" }
 *   → "Olá, Dani!".
 *
 * Comportamento:
 * - Vars ausentes ou null → mantem o {placeholder} no texto (visibilidade
 *   imediata pra editor · nao some silenciosamente).
 * - Aceita string · number · boolean · null/undefined.
 * - Escapes nao removidos (deliberado · Markdown WhatsApp continua valido).
 *
 * Pra strict mode (falhar se var ausente), passar { strict: true }.
 */
export type TemplateVars = Record<string, string | number | boolean | null | undefined>

export interface RenderTemplateOptions {
  /** Falhar se algum {var} nao tiver valor. Default false. */
  strict?: boolean
  /** Substituir {var} ausente por string vazia em vez de manter o token. Default false. */
  blankMissing?: boolean
}

export function renderTemplate(
  template: string | null | undefined,
  vars: TemplateVars = {},
  options: RenderTemplateOptions = {},
): string {
  if (!template) return ''
  const { strict = false, blankMissing = false } = options
  const missing: string[] = []

  const out = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const v = vars[key]
    if (v === null || v === undefined) {
      missing.push(key)
      return blankMissing ? '' : `{${key}}`
    }
    return String(v)
  })

  if (strict && missing.length > 0) {
    throw new Error(`renderTemplate · variaveis ausentes: ${missing.join(', ')}`)
  }
  return out
}

/**
 * Extrai todas as vars referenciadas num template · util pra validar
 * que o admin preencheu tudo no editor antes de salvar.
 */
export function extractTemplateVars(template: string | null | undefined): string[] {
  if (!template) return []
  const set = new Set<string>()
  const re = /\{([a-zA-Z0-9_]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template))) set.add(m[1])
  return Array.from(set).sort()
}
