/**
 * ClinicAI — WhatsApp Cloud Meta Canary Send (CRM_PHASE_2L.2)
 *
 * Preflight/foundation para canary controlado via Cloud Meta API.
 *
 * Esta fase: SEM ENVIO REAL.
 *   - dry_run=true é default
 *   - dry_run=false bloqueado por env WA_CANARY_REAL_SEND_ENABLED=true
 *   - allowlist obrigatória (recipient must be in WA_CANARY_ALLOWED_RECIPIENTS)
 *   - template deve ter meta_approval_status='approved' no DB
 *   - canal deve ser Lara Cloud Meta (phone_number_id + access_token)
 *   - Mih/Evolution proibido neste fluxo
 *   - audit registrado via wa_cloud_meta_canary_log RPC (sha256 hash + last4)
 *   - tokens/números nunca logados
 *
 * Auth: Header X-Internal-Secret === env WA_CANARY_INTERNAL_SECRET
 *
 * Endpoint: POST /functions/v1/wa-canary-send
 *
 * Input body:
 *   {
 *     "template_id"?: "uuid",
 *     "template_name"?: "string",        // alternative se sem id
 *     "recipient_e164": "5544999999999", // E.164 sem +
 *     "dry_run"?: boolean,               // default true
 *     "force_send"?: boolean,            // default false · requer env flag
 *     "canary_reason": "string",         // obrigatório (audit)
 *     "wa_number_label_hint"?: "string"  // default "Lara"
 *   }
 *
 * Response:
 *   { ok: boolean, status, dry_run, ... }
 *
 * NÃO usa wa_outbox. NÃO toca job 71.
 */

// @ts-expect-error · Deno-only import (edge runtime · não tem types instalados no monorepo)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

// ────────────────────────────────────────────────────────────────────────────
// Env (NUNCA logar valores)
// ────────────────────────────────────────────────────────────────────────────
const SB_URL = (globalThis as any).Deno?.env?.get('SUPABASE_URL') || ''
const SB_KEY = (globalThis as any).Deno?.env?.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const INTERNAL_SECRET = (globalThis as any).Deno?.env?.get('WA_CANARY_INTERNAL_SECRET') || ''
const REAL_SEND_FLAG = (globalThis as any).Deno?.env?.get('WA_CANARY_REAL_SEND_ENABLED') === 'true'
const ALLOWED_RECIPIENTS_RAW =
  (globalThis as any).Deno?.env?.get('WA_CANARY_ALLOWED_RECIPIENTS') || ''

const ALLOWED_RECIPIENTS = ALLOWED_RECIPIENTS_RAW
  .split(',')
  .map((s: string) => s.trim())
  .filter((s: string) => s.length > 0)

const GRAPH_API = 'https://graph.facebook.com/v21.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...(extra || {}) }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await (globalThis as any).crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeE164(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

function last4(phone: string): string {
  const norm = normalizeE164(phone)
  return norm.length >= 4 ? norm.slice(-4) : ''
}

// Mascara payload para audit · NUNCA registrar token nem número completo
function maskPayloadForAudit(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string') {
      const kLower = k.toLowerCase()
      if (kLower.includes('token') || kLower.includes('secret') || kLower.includes('key')) {
        out[k] = '<redacted>'
      } else if (kLower.includes('phone') || kLower === 'to' || kLower.includes('recipient')) {
        out[k] = 'masked:****'
      } else {
        out[k] = v.length > 200 ? v.slice(0, 200) + '…' : v
      }
    } else {
      out[k] = v
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Audit helper
// ────────────────────────────────────────────────────────────────────────────
async function logAttempt(
  sb: any,
  args: {
    clinicId: string | null
    waNumberId: string | null
    templateId: string | null
    templateName: string | null
    templateLanguage: string | null
    recipientHash: string
    recipientLast4: string | null
    dryRun: boolean
    status: 'dry_run' | 'blocked' | 'sent' | 'delivered' | 'failed' | 'timeout'
    blockReason: string | null
    providerMessageId: string | null
    requestPayloadMasked: Record<string, unknown>
    responsePayloadMasked: Record<string, unknown>
    errorMessage: string | null
  },
): Promise<string | null> {
  try {
    const { data, error } = await sb.rpc('wa_cloud_meta_canary_log', {
      p_clinic_id: args.clinicId,
      p_wa_number_id: args.waNumberId,
      p_template_id: args.templateId,
      p_template_name: args.templateName,
      p_template_language: args.templateLanguage,
      p_recipient_hash: args.recipientHash,
      p_recipient_last4: args.recipientLast4,
      p_dry_run: args.dryRun,
      p_status: args.status,
      p_block_reason: args.blockReason,
      p_provider_message_id: args.providerMessageId,
      p_request_payload_masked: args.requestPayloadMasked,
      p_response_payload_masked: args.responsePayloadMasked,
      p_error_message: args.errorMessage,
      p_created_by: null,
    })
    if (error) {
      console.warn('canary_log RPC error', error.message)
      return null
    }
    return data as string
  } catch (e) {
    console.warn('canary_log RPC exception', (e as Error).message)
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────────
;(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // 1. Auth · internal secret obrigatório
  if (!INTERNAL_SECRET) return err('internal_secret_not_configured', 500)
  const provided = req.headers.get('x-internal-secret') || ''
  if (!timingSafeEqual(provided, INTERNAL_SECRET)) return err('unauthorized', 401)

  if (!SB_URL || !SB_KEY) return err('supabase_env_missing', 500)
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })

  // 2. Parse body
  let body: any
  try {
    body = await req.json()
  } catch {
    return err('invalid_json', 400)
  }

  const dryRun = body.dry_run !== false // default true
  const forceSend = body.force_send === true
  const realSendRequested = !dryRun || forceSend
  const recipientE164 = normalizeE164(body.recipient_e164 || '')
  const canaryReason = String(body.canary_reason || '').trim()
  const templateId = body.template_id ? String(body.template_id) : null
  const templateNameInput = body.template_name ? String(body.template_name) : null
  const waNumberLabelHint = String(body.wa_number_label_hint || 'Lara')

  // 3. Validações básicas
  if (!recipientE164 || recipientE164.length < 10) {
    return err('recipient_e164_invalid', 400)
  }
  if (!canaryReason || canaryReason.length < 5) {
    return err('canary_reason_required_min_5', 400)
  }
  if (!templateId && !templateNameInput) {
    return err('template_id_or_name_required', 400)
  }

  const recipientHash = await sha256Hex(recipientE164)
  const recipientLast4 = last4(recipientE164)

  // 4. Hard gate · real send disabled na 2L.2
  if (realSendRequested && !REAL_SEND_FLAG) {
    await logAttempt(sb, {
      clinicId: null,
      waNumberId: null,
      templateId,
      templateName: templateNameInput,
      templateLanguage: null,
      recipientHash,
      recipientLast4,
      dryRun: false,
      status: 'blocked',
      blockReason: 'real_send_disabled',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ canary_reason: canaryReason }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('real_send_disabled', 403, {
      hint: 'Configure WA_CANARY_REAL_SEND_ENABLED=true explicitly (CRM_PHASE_2L.3 gate)',
    })
  }

  // 5. Recipient allowlist
  if (ALLOWED_RECIPIENTS.length === 0) {
    await logAttempt(sb, {
      clinicId: null,
      waNumberId: null,
      templateId,
      templateName: templateNameInput,
      templateLanguage: null,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'allowlist_empty',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ canary_reason: canaryReason }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('allowlist_empty', 403, {
      hint: 'Configure WA_CANARY_ALLOWED_RECIPIENTS (comma-separated E.164 list)',
    })
  }

  const normalizedAllowlist = ALLOWED_RECIPIENTS.map((s) => normalizeE164(s))
  if (!normalizedAllowlist.includes(recipientE164)) {
    await logAttempt(sb, {
      clinicId: null,
      waNumberId: null,
      templateId,
      templateName: templateNameInput,
      templateLanguage: null,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'recipient_not_in_allowlist',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ canary_reason: canaryReason }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('recipient_not_in_allowlist', 403)
  }

  // 6. Resolver canal Lara Cloud Meta
  const { data: waNum, error: waErr } = await sb
    .from('wa_numbers')
    .select(
      'id, clinic_id, label, phone_number_id, access_token, business_account_id, instance_id, api_url, is_active',
    )
    .ilike('label', `%${waNumberLabelHint}%`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (waErr || !waNum) {
    return err('wa_number_not_found', 404)
  }

  // Bloquear Evolution-only · canary é Cloud Meta only
  if (waNum.instance_id && (!waNum.phone_number_id || !waNum.access_token)) {
    await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId,
      templateName: templateNameInput,
      templateLanguage: null,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'channel_not_cloud_meta',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ wa_number: waNumberLabelHint }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('channel_not_cloud_meta', 403)
  }

  if (!waNum.phone_number_id || !waNum.access_token) {
    return err('wa_number_missing_cloud_meta_config', 500)
  }

  // 7. Resolver template
  const tplQuery = templateId
    ? sb.from('wa_message_templates').select('*').eq('id', templateId).maybeSingle()
    : sb
        .from('wa_message_templates')
        .select('*')
        .eq('meta_template_name', templateNameInput)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
  const { data: tpl, error: tplErr } = await tplQuery
  if (tplErr || !tpl) return err('template_not_found', 404)

  if (!tpl.active) {
    await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'template_inactive',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ canary_reason: canaryReason }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('template_inactive', 403)
  }

  if (tpl.meta_approval_status !== 'approved') {
    await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'template_not_approved',
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({
        meta_approval_status: tpl.meta_approval_status,
      }),
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('template_not_approved', 403, {
      meta_approval_status: tpl.meta_approval_status,
    })
  }

  if (!tpl.meta_template_name || !tpl.meta_language) {
    return err('template_meta_fields_missing', 400)
  }

  // 8. Rate limit · 1 canary por template+recipient em janela 5 min
  const { count } = await sb
    .from('wa_cloud_meta_canary_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', tpl.id)
    .eq('recipient_hash', recipientHash)
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  if ((count ?? 0) >= 1) {
    await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun,
      status: 'blocked',
      blockReason: 'rate_limited_5min',
      providerMessageId: null,
      requestPayloadMasked: {},
      responsePayloadMasked: {},
      errorMessage: null,
    })
    return err('rate_limited_5min', 429)
  }

  // 9. Montar payload Cloud Meta (mas NÃO enviar em dry_run)
  const cloudPayload = {
    messaging_product: 'whatsapp',
    to: recipientE164,
    type: 'template',
    template: {
      name: tpl.meta_template_name,
      language: { code: tpl.meta_language },
      // variables seriam preenchidos via body.variables se houver
    },
  }

  // ====================================================================
  // DRY RUN · NÃO chama Meta Graph API · só registra audit
  // ====================================================================
  if (dryRun) {
    const auditId = await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun: true,
      status: 'dry_run',
      blockReason: null,
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({
        ...cloudPayload,
        to: 'masked:****',
        canary_reason: canaryReason,
      }),
      responsePayloadMasked: { dry_run: true, would_call: `${GRAPH_API}/${waNum.phone_number_id}/messages` },
      errorMessage: null,
    })

    return ok({
      ok: true,
      status: 'dry_run',
      audit_id: auditId,
      template: { name: tpl.meta_template_name, language: tpl.meta_language },
      wa_number_label: waNum.label,
      recipient_last4: recipientLast4,
      hint:
        'Real send blocked · CRM_PHASE_2L.2 dry-run only · ative WA_CANARY_REAL_SEND_ENABLED=true em 2L.3 para envio real',
    })
  }

  // ====================================================================
  // REAL SEND · só chega aqui se WA_CANARY_REAL_SEND_ENABLED=true
  // (gate 2L.3 · esta fase 2L.2 NÃO executa este caminho)
  // ====================================================================
  // CRM_PHASE_2L.2: este branch existe mas não deve executar em produção
  // até 2L.3. Mesmo com flag, mantém auditoria completa.

  try {
    const res = await fetch(
      `${GRAPH_API}/${waNum.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waNum.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cloudPayload),
      },
    )

    const responseText = await res.text()
    let responseJson: any = null
    try {
      responseJson = JSON.parse(responseText)
    } catch {
      responseJson = { raw: responseText.slice(0, 500) }
    }

    if (!res.ok) {
      await logAttempt(sb, {
        clinicId: waNum.clinic_id,
        waNumberId: waNum.id,
        templateId: tpl.id,
        templateName: tpl.meta_template_name,
        templateLanguage: tpl.meta_language,
        recipientHash,
        recipientLast4,
        dryRun: false,
        status: 'failed',
        blockReason: null,
        providerMessageId: null,
        requestPayloadMasked: maskPayloadForAudit({ ...cloudPayload, to: 'masked:****' }),
        responsePayloadMasked: maskPayloadForAudit(responseJson || {}),
        errorMessage: `http_${res.status}`,
      })
      return err('cloud_meta_send_failed', 502, { status: res.status })
    }

    const providerMsgId =
      responseJson?.messages?.[0]?.id || responseJson?.message_id || null

    const auditId = await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun: false,
      status: 'sent',
      blockReason: null,
      providerMessageId: providerMsgId,
      requestPayloadMasked: maskPayloadForAudit({ ...cloudPayload, to: 'masked:****' }),
      responsePayloadMasked: maskPayloadForAudit(responseJson || {}),
      errorMessage: null,
    })

    return ok({
      ok: true,
      status: 'sent',
      audit_id: auditId,
      provider_message_id: providerMsgId,
      template: { name: tpl.meta_template_name, language: tpl.meta_language },
    })
  } catch (e) {
    await logAttempt(sb, {
      clinicId: waNum.clinic_id,
      waNumberId: waNum.id,
      templateId: tpl.id,
      templateName: tpl.meta_template_name,
      templateLanguage: tpl.meta_language,
      recipientHash,
      recipientLast4,
      dryRun: false,
      status: 'failed',
      blockReason: null,
      providerMessageId: null,
      requestPayloadMasked: maskPayloadForAudit({ ...cloudPayload, to: 'masked:****' }),
      responsePayloadMasked: {},
      errorMessage: (e as Error).message?.slice(0, 200) || 'unknown',
    })
    return err('cloud_meta_send_exception', 500)
  }
})
