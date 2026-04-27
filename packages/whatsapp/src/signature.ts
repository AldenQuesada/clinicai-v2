/**
 * Validação de assinatura HMAC do webhook Meta WhatsApp Cloud API.
 *
 * Meta assina cada POST com `X-Hub-Signature-256` derivado do `app_secret`
 * (Meta Business Manager → App Settings → Basic). Sem essa validação,
 * qualquer ator que descobrir a URL pode injetar mensagens forjadas.
 *
 * Política fail-CLOSED em produção:
 *  - Se NODE_ENV='production' e META_APP_SECRET não setado → THROW (fail-fast)
 *  - Se NODE_ENV != 'production' e secret faltando → warn + bypass (dev/test)
 *  - Se secret setado e header inválido → return false (rejeitar)
 *
 * Diferente da impl da Lara do Ivan (clinicai-lara) que era fail-OPEN
 * silencioso em prod sem secret. Aqui produção sem secret é erro deploy.
 */

import crypto from 'crypto'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'shared' })

export interface SignatureValidationResult {
  valid: boolean
  reason?: string
  bypass?: boolean
}

/**
 * Valida X-Hub-Signature-256 contra HMAC-SHA256(app_secret, raw_body).
 *
 * @param rawBody Corpo bruto da request (LER request.text() ANTES de JSON.parse)
 * @param signatureHeader Valor do header `x-hub-signature-256` (formato: 'sha256=<hex>')
 * @param appSecret Meta app_secret (default: process.env.META_APP_SECRET)
 * @returns { valid, reason?, bypass? } onde bypass=true significa "dev sem secret, segue"
 */
export function validateMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string,
): SignatureValidationResult {
  const secret = appSecret ?? process.env.META_APP_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (!secret) {
    if (isProd) {
      // Fail-CLOSED em prod · NUNCA aceitar webhook sem validar assinatura.
      log.error({}, 'META_APP_SECRET ausente em producao · rejeitando webhook')
      return { valid: false, reason: 'app_secret_missing_in_production' }
    }
    // Dev/test: warn + bypass
    log.warn({ env: process.env.NODE_ENV }, 'META_APP_SECRET ausente · validacao HMAC desabilitada (dev/test)')
    return { valid: true, bypass: true }
  }

  if (!signatureHeader) {
    log.warn({}, 'webhook.signature.missing_header')
    return { valid: false, reason: 'missing_signature_header' }
  }

  // Formato esperado: 'sha256=<hex>'
  if (!signatureHeader.startsWith('sha256=')) {
    log.warn({ prefix: signatureHeader.slice(0, 10) }, 'webhook.signature.bad_format')
    return { valid: false, reason: 'bad_signature_format' }
  }

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const expected = `sha256=${expectedHex}`

  // timingSafeEqual exige buffers de mesmo tamanho · checa antes pra evitar throw
  const sigBuf = Buffer.from(signatureHeader, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')

  if (sigBuf.length !== expBuf.length) {
    log.warn({}, 'webhook.signature.length_mismatch')
    return { valid: false, reason: 'length_mismatch' }
  }

  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    log.warn({}, 'webhook.signature.invalid')
    return { valid: false, reason: 'signature_mismatch' }
  }

  return { valid: true }
}
