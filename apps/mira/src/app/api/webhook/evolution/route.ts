/**
 * Evolution API webhook · entry point da Mira.
 *
 * Mirror logico do clinic-dashboard b2b-mira-inbound (646 LOC ported),
 * arquitetura ADR-012 (Repository → Service → UI) · webhook usa repos
 * exclusivamente, nunca supabase.from() direto.
 *
 * Fix F4 (mig 800-11) · "fast ack + background worker":
 *   Pre-validacao sincrona (auth + parse + role + dedup) · ~200ms
 *   → enfileira em webhook_processing_queue · ~100ms
 *   → return 202 (cliente Evolution recebe ack < 500ms)
 *   → cron worker /api/cron/webhook-processing-worker drena (cada 1min,
 *     pickPending(5)) e roda audio + Whisper + classify + handler + reply.
 *
 * Feature flag WEBHOOK_ASYNC_ENABLED (default 'true'):
 *   - 'true'  → path async (acima)
 *   - 'false' → path sincrono legado · processWebhookMessage no proprio request
 *               (rollback rapido se algo quebrar em prod).
 *
 * Fluxo (path comum):
 *   1. Validate apikey/X-Evolution-Secret (timing-safe)
 *   2. Parse payload (extractEvolutionMessage)
 *   3. Skip se nao for messages.upsert / fromMe / group / phone invalido
 *   4. Resolve role (admin/partner/null) · null = silent ignore (ALDEN)
 *   5. Dedup wa_message_id (state __processed__:msgId · TTL 2h)
 *   6a. ASYNC  → enqueue + return 202
 *   6b. SYNC   → processWebhookMessage (audio + classify + handler + reply + audit)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { makeMiraRepos } from '@/lib/repos'
import { resolveClinicId } from '@/lib/clinic'
import { extractEvolutionMessage } from '@/lib/webhook/evolution-extract'
import { resolveRole } from '@/lib/webhook/role-resolver'
import { dedupCheckAndMark } from '@/lib/webhook/state-machine'
import { processWebhookMessage } from '@/lib/webhook/process-message'
import { isIncomingMiraChannelAllowed } from '@/lib/mira-channel-evolution'
import { createLoggerWithAlerts } from '@/lib/logger-with-alerts'
import { hashPhone } from '@clinicai/logger'
import { alertCritical } from '@/lib/alerts'

// F6 · logger com alerts integrados · .error() dispara Sentry alem do Pino.
const log = createLoggerWithAlerts({ app: 'mira' })

export const dynamic = 'force-dynamic'

// ── timing-safe compare ──────────────────────────────────────────────────
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

function jsonRes(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

/**
 * Feature flag · default true (async path).
 * Set WEBHOOK_ASYNC_ENABLED=false em env pra rollback ao path sincrono legado.
 */
function isAsyncEnabled(): boolean {
  const v = String(process.env.WEBHOOK_ASYNC_ENABLED ?? 'true').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

// ── POST: webhook entry ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const t0 = Date.now()

  try {
  // 1. Auth
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? ''
  if (!secret) {
    // F6 · misconfig em prod e P0 · alerta humano + Sentry pra rastreio
    void alertCritical(
      'evolution.webhook.missing_secret: EVOLUTION_WEBHOOK_SECRET nao configurado',
      new Error('EVOLUTION_WEBHOOK_SECRET ausente em runtime'),
      { handler: 'evolution-webhook' },
    )
    log.error({}, 'mira.webhook.missing_secret')
    return jsonRes({ ok: false, error: 'server_misconfigured' }, 500)
  }
  const provided = req.headers.get('apikey') ?? req.headers.get('x-evolution-secret') ?? ''
  if (!timingSafeEqual(provided, secret)) {
    return jsonRes({ ok: false, error: 'unauthorized' }, 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonRes({ ok: false, error: 'invalid_json' }, 400)
  }

  // 2. Extract
  const extracted = extractEvolutionMessage(body)
  if (!extracted.ok) {
    return jsonRes({ ok: true, skip: extracted.skip, detail: extracted.detail })
  }
  const msg = extracted.msg

  // 3. Setup
  const supabase = createServerClient()
  const repos = makeMiraRepos(supabase)
  const clinicId = await resolveClinicId(supabase)

  // 4. Role gate (ALDEN: Mira NUNCA responde unknown)
  const role = await resolveRole(repos.waNumbers, repos.b2bSenders, clinicId, msg.phone)
  if (role === null) {
    log.info({ phoneHash: hashPhone(msg.phone) }, 'mira.webhook.unauthorized_phone_silent')
    return jsonRes({ ok: true, skip: 'unauthorized_phone' })
  }

  // 5. Dedup (mantido em ambos os paths · evita reentrada da MESMA wa_message_id
  //    via 2 requests proximos antes do worker pegar a queue).
  const dedup = await dedupCheckAndMark(repos.miraState, msg.phone, msg.messageId)
  if (dedup.alreadyProcessed) {
    return jsonRes({ ok: true, skip: 'already_processed', wa_message_id: msg.messageId })
  }

  // 5.5. Inbound channel gate (C2 ajustado · 2026-05-05) · UI controla ENTRADA tambem.
  //      Se role='partner', so deixa Mira ativar quando incomingInstance == wa_numbers.instance_id
  //      configurado em mira_channels.partner_voucher_req (is_active=true). Se Alden trocar
  //      partner_voucher_req no ChannelsTab pra outro chip, o antigo (ex: 7673) para silencioso
  //      mesmo com Evolution continuando a entregar webhook · log estruturado · 200 OK.
  //      Sem fallback hardcoded · zero "default mira-mirian".
  if (role === 'partner') {
    const incomingInstance = String((body as { instance?: unknown })?.instance ?? '')
    const allowed = await isIncomingMiraChannelAllowed(
      supabase,
      clinicId,
      'partner_voucher_req',
      incomingInstance,
    )
    if (!allowed) {
      return jsonRes({
        ok: true,
        skip: 'unconfigured_channel',
        incoming_instance: incomingInstance,
        wa_message_id: msg.messageId,
      })
    }
  }

  // 6. Branch: async (default) vs sync (legacy)
  const asyncMode = isAsyncEnabled()

  if (asyncMode) {
    // 6a. Enqueue + return 202 · worker drena em background.
    //     UNIQUE (source, wa_message_id) garante idempotency adicional contra
    //     retry do Evolution com mesmo messageId (caso dedup state expire).
    const enq = await repos.webhookQueue.enqueue({
      source: 'evolution',
      phone: msg.phone,
      waMessageId: msg.messageId,
      role,
      payload: body as object,
    })

    if (!enq.ok) {
      // F6 · enqueue fail = Mira nao processa mensagem · 500 retornado pro
      // Evolution que tentara reenviar. Loga + Sentry pra investigacao.
      // Slack via wrapper rate-limited (.error dispara Sentry, nao Slack ·
      // bursts de enqueue fail iam saturar canal humano).
      log.error(
        { phone: msg.phone, wa_message_id: msg.messageId, error: enq.error },
        'mira.webhook.enqueue_failed',
      )
      return jsonRes(
        {
          ok: false,
          error: enq.error ?? 'enqueue_failed',
          wa_message_id: msg.messageId,
        },
        500,
      )
    }

    const responseMs = Date.now() - t0
    log.info(
      {
        queue_id: enq.id,
        enqueued: enq.enqueued,
        wa_message_id: msg.messageId,
        phone: msg.phone,
        role,
        response_ms: responseMs,
      },
      'mira.webhook.enqueued',
    )

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        queue_id: enq.id,
        enqueued: enq.enqueued,
        wa_message_id: msg.messageId,
        response_ms: responseMs,
      },
      { status: 202 },
    )
  }

  // 6b. SYNC legacy path · processa agora (audio + Whisper + classify + handler
  //     + reply + audit). Mantido pra rollback rapido se async quebrar em prod.
  const result = await processWebhookMessage({
    clinicId,
    msg,
    role,
    repos,
    startedAtMs: t0,
  })

  if (!result.ok) {
    // F6 · sync path 500 · alerta critical (Sentry + Slack) pra investigar
    void alertCritical(
      `evolution.webhook.sync_500: ${result.error ?? 'unknown'}`,
      new Error(result.error ?? 'sync_processing_failed'),
      {
        handler: 'evolution-webhook',
        clinic_id: clinicId,
        wa_message_id: msg.messageId,
        role,
      },
    )
    return jsonRes(
      { ok: false, error: result.error, wa_message_id: msg.messageId },
      500,
    )
  }
  if (result.skip) {
    return jsonRes({
      ok: true,
      skip: result.skip,
      phone: msg.phone,
      wa_message_id: msg.messageId,
    })
  }

  return jsonRes({
    ok: true,
    phone: msg.phone,
    wa_message_id: msg.messageId,
    role,
    intent: result.intent,
    transcribed: result.transcribed,
    reply_preview: result.replyPreview,
    actions_count: result.actionsCount,
    response_ms: result.responseMs,
  })
  } catch (err) {
    // F6 · catch externo · qualquer exception nao tratada vira 500 com alert
    // critical (Sentry + Slack). Inclui erros de Supabase, RPC fail, etc.
    const errObj = err instanceof Error ? err : new Error(String(err))
    void alertCritical(
      `evolution.webhook.unhandled_exception: ${errObj.message}`,
      errObj,
      { handler: 'evolution-webhook' },
    )
    log.error(
      { err: errObj.message, stack: errObj.stack },
      'mira.webhook.unhandled_exception',
    )
    return jsonRes({ ok: false, error: 'internal_error' }, 500)
  }
}

// ── GET: health/handshake ────────────────────────────────────────────────
export async function GET() {
  return jsonRes({ ok: true, service: 'mira-evolution-webhook', version: '0.2.0' })
}
