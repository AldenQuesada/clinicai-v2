/**
 * sanitize-webhook-log · redação de segredos antes de persistir em
 * `wa_webhook_log` (Fase 4A · 2026-05-05).
 *
 * Audit phase4_whatsapp_log_secret_exposure_audit (snapshot prod):
 *   total_scanned_rows  = 4461
 *   problem_rows        = 4263
 *   rows_with_apikey    = 4257  ← Evolution incluindo apikey no body
 *   rows_with_secret_word = 2460
 *
 * Causa: webhook Evolution gravava `request.text()` cru (até 8000 chars) ·
 * em algumas configs Evolution v2, `apikey`/`token` chegam DENTRO do JSON
 * body do webhook (não só nos headers) · vão pro DB sem filtro.
 *
 * Estratégia · 2 passes defensivos:
 *   1. JSON parse + recursive redact (preserva estrutura · forensics OK)
 *   2. Regex pass sobre o output (cobre valores secret-shaped em outros
 *      campos, ex: error message que contém "Bearer xyz")
 *
 * Quando JSON parse falha (body não-JSON, base64 puro, malformado):
 * fallback direto pro regex pass.
 *
 * Preserva pra forensics:
 *   - event, instance, data.key.id, data.key.remoteJid, data.key.fromMe
 *   - data.messageType, data.pushName, notifyName, contacts/profile.name
 *   - tudo que NÃO casar com chave/regex de segredo
 */

const REDACTED = '[REDACTED]'

/**
 * Chaves consideradas segredo · normalizadas (lowercase + sem hífen/underscore)
 * pra match flexível contra variações de casing/separator (apikey, apiKey,
 * api_key, API-KEY · todas batem).
 */
const SECRET_KEY_PATTERNS = [
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'secret',
  'x-inbound-secret',
  'x_inbound_secret',
  'webhook_secret',
  'password',
  'credential',
  'credentials',
  'private_key',
  'client_secret',
] as const

const SECRET_KEY_SET = new Set(
  SECRET_KEY_PATTERNS.map((k) => k.toLowerCase().replace(/[-_]/g, '')),
)

/**
 * True se a chave de um objeto representa um segredo (case-insensitive ·
 * tolerante a hífen/underscore).
 */
function isSecretKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[-_]/g, '')
  return SECRET_KEY_SET.has(norm)
}

/**
 * Redaction recursiva sobre objeto/array. Strings, números, booleans, null
 * passam intactos. Substitui valor de qualquer chave secreta por '[REDACTED]'.
 *
 * Exposto pra uso direto em tests + casos onde caller já tem objeto parsed.
 */
export function redactSecretsDeep(value: unknown): unknown {
  if (value == null) return value
  if (Array.isArray(value)) return value.map((v) => redactSecretsDeep(v))
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) {
      out[k] = REDACTED
    } else {
      out[k] = redactSecretsDeep(v)
    }
  }
  return out
}

/**
 * Regex defensivo pra strings JSON/text · cobre 3 padrões em ordem específica:
 *   1. Bearer <token>            (primeiro · evita Pattern 3 capturar "Bearer"
 *                                  como value de Authorization no Pattern 2)
 *   2. "key":"value" JSON literal (preserva chave · só substitui value)
 *   3. key=value / key: value     (URL-encoded / headers cru / log line)
 *                                  · NOTE: 'authorization' NÃO está aqui
 *                                  porque Pattern 1 já cobriu o caso "Bearer …"
 *
 * Aplicado depois do redactSecretsDeep pra catch valores embutidos em
 * outros campos (ex: error string que contém "apikey":"xxx" interpolado).
 */
export function sanitizeWebhookLogText(input: string | null | undefined): string {
  if (!input) return ''
  let out = input

  // Padrão 1: Bearer <token> · roda PRIMEIRO pra preservar "Authorization: Bearer "
  // (senão Padrão 3 mataria com "authorization=[REDACTED]" perdendo "Bearer").
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-+/=]+/gi, `Bearer ${REDACTED}`)

  // Padrão 2: JSON literal "key":"value" (preserva chave · redacta value)
  out = out.replace(
    /"(apikey|api_key|authorization|bearer|token|access_token|refresh_token|id_token|secret|x-inbound-secret|x_inbound_secret|webhook_secret|password|credential|credentials|private_key|client_secret)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    (_m, key) => `"${key}":"${REDACTED}"`,
  )

  // Padrão 3: key=value / key: value (não-JSON · URL-encoded · log line)
  // 'authorization' fora desta lista · Pattern 1 já cobriu pra preservar
  // "Authorization: Bearer X" como "Authorization: Bearer [REDACTED]".
  out = out.replace(
    /\b(apikey|api_key|access_token|refresh_token|x-inbound-secret|x_inbound_secret|webhook_secret|client_secret)\s*[:=]\s*[A-Za-z0-9._\-+/=]+/gi,
    (_m, key) => `${key}=${REDACTED}`,
  )

  return out
}

/**
 * Sanitiza body cru de webhook (string) antes de persistir em
 * `wa_webhook_log.raw_body`. Tenta JSON parse + redact recursivo · cai
 * em regex pass se body não for JSON válido. Sempre aplica regex pass
 * final pra defesa em camadas.
 *
 * Caller é responsável por aplicar `.slice(N)` depois (truncation pra
 * tamanho máximo da coluna).
 */
export function sanitizeWebhookLogBody(input: string | null | undefined): string {
  if (!input) return ''

  // Pass 1: tentar JSON · preserva estrutura
  let intermediate: string
  try {
    const parsed = JSON.parse(input) as unknown
    const redacted = redactSecretsDeep(parsed)
    intermediate = JSON.stringify(redacted)
  } catch {
    // Body não é JSON · pula direto pro regex pass
    intermediate = input
  }

  // Pass 2: regex defensivo sobre o output (catch valores secret-shaped
  // dentro de outros campos · ex: error msg que vaza Bearer)
  return sanitizeWebhookLogText(intermediate)
}
