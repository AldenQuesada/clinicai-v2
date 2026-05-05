/**
 * sanitize-webhook-log · redação de segredos antes de persistir em
 * `wa_webhook_log` (Fase 4A · 2026-05-05 · 4A.2 · 2026-05-05).
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
 * Fase 4A.2 (2026-05-05): vamos ligar `webhookBase64=true` na Evolution Mih
 * pra resolver entrega de áudio LID. Isso vai inflar o body com base64 de
 * mídia · sanitizer ampliado pra redactar payloads de mídia sem perder
 * dados forenses (mimetype/fileLength/duration/keys.id/etc continuam).
 *
 * Estratégia · 2 passes defensivos com 2 placeholders:
 *   1. JSON parse + recursive redact:
 *      - chaves de segredo  → "[REDACTED]"
 *      - chaves de mídia    → "[REDACTED_MEDIA]"
 *      - strings > 2000 chars que parecem base64/data-url → "[REDACTED_MEDIA]"
 *   2. Regex pass sobre o output:
 *      - Bearer <token>          → "Bearer [REDACTED]"
 *      - "secretKey":"value"     → "[REDACTED]"
 *      - secretKey=value         → "[REDACTED]"
 *      - data:<mime>;base64,...  → "[REDACTED_MEDIA]"
 *
 * Quando JSON parse falha (body não-JSON, base64 puro, malformado):
 * fallback direto pro regex pass.
 *
 * Preserva pra forensics:
 *   - event, instance, data.key.id, data.key.remoteJid, data.key.fromMe
 *   - data.messageType, data.pushName, notifyName, contacts/profile.name
 *   - mídia metadata: mimetype, fileLength, fileSize, seconds, duration, ptt
 *   - tudo que NÃO casar com chave/regex de segredo OU mídia
 */

const REDACTED = '[REDACTED]'
const REDACTED_MEDIA = '[REDACTED_MEDIA]'

/** Threshold em chars · strings maiores são tratadas como provável payload mídia */
const MEDIA_SIZE_THRESHOLD = 2000

/** Detecta data: URL (data:image/png;base64,...) */
const DATA_URL_PREFIX_RE = /^data:[\w./+-]+;base64,/i

/** Detecta string puramente base64-like (apenas chars válidos · espaço/quebra de linha tolerados) */
const BASE64_LIKE_RE = /^[A-Za-z0-9+/=\s]+$/

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
 * Chaves que carregam payload de mídia/base64 · redactadas com placeholder
 * SEPARADO ([REDACTED_MEDIA]) pra distinguir de segredos em audit. Útil
 * pra decidir se o log perdeu info por questão de privacidade (mídia)
 * vs questão de credencial (segredo).
 *
 * Inclui:
 *   - base64 / mediaBase64 / fileBase64 (base64 cru)
 *   - dataUrl / data_url (data: URL)
 *   - jpegThumbnail / thumbnail (preview embarcado)
 *   - mediaKey / media_key (chave de descrypt Baileys)
 *   - directPath (URL Meta com auth params · sensível)
 *
 * NÃO inclui (preservados pra forensics):
 *   - mimetype, fileLength, fileSize, seconds, duration, ptt
 *   - messageType, key.id, remoteJid, fromMe, pushName
 *   - url genérica (callers diferentes podem passar URLs públicas legítimas;
 *     se for muito grande, big-string heuristic captura)
 */
const MEDIA_KEY_PATTERNS = [
  'base64',
  'mediabase64',
  'filebase64',
  'dataurl',
  'data_url',
  'jpegthumbnail',
  'thumbnail',
  'mediakey',
  'media_key',
  'directpath',
] as const

const MEDIA_KEY_SET = new Set(
  MEDIA_KEY_PATTERNS.map((k) => k.toLowerCase().replace(/[-_]/g, '')),
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
 * True se a chave de um objeto representa payload/metadata de mídia que
 * deve ser redactada (case-insensitive · tolerante a hífen/underscore).
 */
function isMediaKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[-_]/g, '')
  return MEDIA_KEY_SET.has(norm)
}

/**
 * Heurística big-string · captura base64 cru ou data: URL embedded em
 * QUALQUER campo (não só nos com nome conhecido). Threshold 2000 chars
 * cobre confortavelmente:
 *   - jpegThumbnail (~5-30KB base64)
 *   - audioMessage payload base64 (~50KB-5MB)
 *   - imageMessage payload base64 (~100KB-5MB)
 *
 * E NÃO afeta:
 *   - JID strings (~20-40 chars)
 *   - mensagens de texto (~tipicamente < 500 chars)
 *   - nomes (~< 100 chars)
 *   - timestamps, IDs, hashes (< 100 chars)
 */
function isLikelyMediaPayload(s: string): boolean {
  if (s.length <= MEDIA_SIZE_THRESHOLD) return false
  if (DATA_URL_PREFIX_RE.test(s)) return true
  // base64 puro · trim espaços/newlines e checa charset estrito
  const stripped = s.replace(/\s+/g, '')
  if (stripped.length > MEDIA_SIZE_THRESHOLD && BASE64_LIKE_RE.test(stripped)) return true
  return false
}

/**
 * Redaction recursiva sobre objeto/array.
 *   - Chave secreta → '[REDACTED]'
 *   - Chave de mídia → '[REDACTED_MEDIA]'
 *   - String > 2000 chars que parece base64/data-url → '[REDACTED_MEDIA]'
 *   - Demais primitivos passam intactos.
 *
 * Exposto pra uso direto em tests + casos onde caller já tem objeto parsed.
 */
export function redactSecretsDeep(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return isLikelyMediaPayload(value) ? REDACTED_MEDIA : value
  }
  if (Array.isArray(value)) return value.map((v) => redactSecretsDeep(v))
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) {
      out[k] = REDACTED
    } else if (isMediaKey(k)) {
      out[k] = REDACTED_MEDIA
    } else {
      out[k] = redactSecretsDeep(v)
    }
  }
  return out
}

/**
 * Regex defensivo pra strings JSON/text · cobre 5 padrões em ordem específica:
 *   1. Bearer <token>             (primeiro · evita Pattern 4 capturar "Bearer")
 *   2. data:<mime>;base64,...     (data: URLs de mídia em qualquer campo)
 *   3. "secretKey":"value" JSON   (preserva chave · só substitui value)
 *   4. "mediaKey":"value" JSON    (idem · placeholder MEDIA)
 *   5. key=value / key: value     (URL-encoded / headers cru / log line)
 *                                  · NOTE: 'authorization' NÃO está aqui
 *                                  porque Pattern 1 já cobriu
 *
 * Aplicado depois do redactSecretsDeep pra catch valores embutidos em
 * outros campos (ex: error string que contém "apikey":"xxx" interpolado).
 */
export function sanitizeWebhookLogText(input: string | null | undefined): string {
  if (!input) return ''
  let out = input

  // Padrão 1: Bearer <token> · roda PRIMEIRO pra preservar "Authorization: Bearer "
  // (senão Padrão 5 mataria com "authorization=[REDACTED]" perdendo "Bearer").
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-+/=]+/gi, `Bearer ${REDACTED}`)

  // Padrão 2: data:<mime>;base64,<payload> · catch data URL embutida em
  // qualquer campo (mesmo se field name não está em MEDIA_KEY_PATTERNS).
  // Greedy chars de base64 + opcional padding =.
  out = out.replace(/data:[\w./+-]+;base64,[A-Za-z0-9+/=]+/gi, REDACTED_MEDIA)

  // Padrão 3: JSON literal "secretKey":"value" (preserva chave · redacta value)
  out = out.replace(
    /"(apikey|api_key|authorization|bearer|token|access_token|refresh_token|id_token|secret|x-inbound-secret|x_inbound_secret|webhook_secret|password|credential|credentials|private_key|client_secret)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    (_m, key) => `"${key}":"${REDACTED}"`,
  )

  // Padrão 4: JSON literal "mediaKey":"value" (preserva chave · redacta value)
  // Cobre payloads onde redactSecretsDeep não passou (ex: regex-only fallback
  // quando body não-JSON contém JSON-shaped fragment com mídia).
  out = out.replace(
    /"(base64|mediaBase64|fileBase64|dataUrl|data_url|jpegThumbnail|thumbnail|mediaKey|media_key|directPath)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    (_m, key) => `"${key}":"${REDACTED_MEDIA}"`,
  )

  // Padrão 5: key=value / key: value (não-JSON · URL-encoded · log line)
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
