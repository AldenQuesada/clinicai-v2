/**
 * Evolution API webhook · entry point da Mira.
 *
 * Mirror logico do clinic-dashboard b2b-mira-inbound (646 LOC ported),
 * arquitetura ADR-012 (Repository → Service → UI) · webhook usa repos
 * exclusivamente, nunca supabase.from() direto.
 *
 * Fluxo:
 *   1. Validate apikey/X-Evolution-Secret (timing-safe)
 *   2. Parse payload (extractEvolutionMessage)
 *   3. Skip se nao for messages.upsert / fromMe / group / phone invalido
 *   4. Resolve role (admin/partner/null) · null = silent ignore (ALDEN)
 *   5. Dedup wa_message_id (state __processed__:msgId · TTL 2h)
 *   6. Se audio: download base64 + Whisper transcribe pt-BR
 *   7. State preemption: voucher_confirm ativo + texto curto YES/NO
 *      → b2bVoucherConfirmHandler (bypassa classifier)
 *   8. Senao: classifier (Tier1 regex → Tier2 Haiku fallback)
 *   9. Dispatch handler · aplica replyText + actions + stateTransitions
 *  10. Audit via WaProAuditRepository.logQuery + logDispatch
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { makeMiraRepos } from '@/lib/repos'
import { resolveClinicId } from '@/lib/clinic'
import { extractEvolutionMessage } from '@/lib/webhook/evolution-extract'
import { resolveRole } from '@/lib/webhook/role-resolver'
import { classifyIntent } from '@/lib/webhook/intent-classifier'
import { dedupCheckAndMark, isGlobalAdminCommand, STATE_KEY } from '@/lib/webhook/state-machine'
import {
  dispatchHandler,
  b2bVoucherConfirmHandler,
  shouldHandleAsConfirmation,
  type HandlerAction,
} from '@/lib/webhook/handlers'
import { getEvolutionService } from '@/services/evolution.service'
import { transcribeAudio } from '@/services/transcription.service'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'mira' })

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

// ── POST: webhook entry ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const t0 = Date.now()

  // 1. Auth
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? ''
  if (!secret) {
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
  const role = await resolveRole(supabase, repos.b2bSenders, clinicId, msg.phone)
  if (role === null) {
    log.info({ phone: msg.phone }, 'mira.webhook.unauthorized_phone_silent')
    return jsonRes({ ok: true, skip: 'unauthorized_phone' })
  }

  // 5. Dedup
  const dedup = await dedupCheckAndMark(repos.miraState, msg.phone, msg.messageId)
  if (dedup.alreadyProcessed) {
    return jsonRes({ ok: true, skip: 'already_processed', wa_message_id: msg.messageId })
  }

  // 6. Audio → Whisper
  let content = msg.content
  let transcribedFromAudio = false
  if (!content && msg.isAudio) {
    try {
      const wa = getEvolutionService('mira')
      const dl = await wa.downloadMedia(msg.messageKey)
      if (!dl) {
        const wa2 = getEvolutionService('mira')
        await wa2.sendText(
          msg.phone,
          'Não consegui baixar seu áudio · pode mandar em texto, por favor?',
        )
        return jsonRes({ ok: true, error: 'audio_download_failed' })
      }
      const transcribed = await transcribeAudio(dl.buffer, dl.contentType)
      if (!transcribed) {
        await wa.sendText(
          msg.phone,
          'Tive um problema pra transcrever o áudio. Pode escrever em texto?',
        )
        return jsonRes({ ok: true, error: 'whisper_failed' })
      }
      content = transcribed
      transcribedFromAudio = true
    } catch (err) {
      log.error({ err, phone: msg.phone }, 'mira.webhook.audio_processing_exception')
      return jsonRes({ ok: false, error: 'audio_pipeline_exception' }, 500)
    }
  }

  if (!content) {
    return jsonRes({ ok: true, skip: 'empty_message' })
  }

  // 7. State preemption · voucher_confirm pendente bypassa classifier
  const voucherPending = await repos.miraState.get(msg.phone, STATE_KEY.VOUCHER_CONFIRM)
  let result
  let chosenIntent = 'preempt:voucher_confirm'

  if (voucherPending && shouldHandleAsConfirmation(content)) {
    result = await b2bVoucherConfirmHandler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'partner.other', // intent placeholder · handler nao usa
      repos,
      pushName: msg.pushName,
    })
  } else {
    // 7b. Auto-clear comando global do admin · evita state residual interferir
    if (role === 'admin' && isGlobalAdminCommand(content)) {
      await repos.miraState.clear(msg.phone)
    }

    // 8. Classify intent
    const classification = await classifyIntent(content, role)
    chosenIntent = classification.intent

    // 9. Dispatch
    const handler = dispatchHandler(classification.intent)
    result = await handler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: classification.intent,
      repos,
      pushName: msg.pushName,
    })
  }

  // 10. Apply state transitions
  for (const tx of result.stateTransitions) {
    if (tx.op === 'set' && tx.value !== undefined) {
      await repos.miraState.set(msg.phone, tx.key, tx.value, tx.ttlMinutes ?? 15)
    } else if (tx.op === 'clear') {
      await repos.miraState.clear(msg.phone, tx.key)
    }
  }

  // 11. Send replyText pra origem (parceira/admin)
  const wa = getEvolutionService('mira')
  let replyMessageId: string | null = null
  if (result.replyText) {
    const sent = await wa.sendText(msg.phone, result.replyText)
    replyMessageId = sent.messageId ?? null

    // Audit dispatch (event_key derived do handler)
    await repos.waProAudit.logDispatch({
      clinicId,
      eventKey: `mira.${chosenIntent}`,
      channel: 'text',
      recipientRole: role === 'admin' ? 'admin' : 'partner',
      recipientPhone: msg.phone,
      senderInstance: process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian',
      textContent: result.replyText,
      waMessageId: replyMessageId,
      status: sent.ok ? 'sent' : 'failed',
      errorMessage: sent.error ?? null,
    })
  }

  // 12. Apply actions (sendText pra outros phones via mira ou mih)
  for (const action of result.actions as HandlerAction[]) {
    if (action.kind === 'send_wa') {
      try {
        const target = getEvolutionService(action.via)
        const sent = await target.sendText(action.to, action.content)
        await repos.waProAudit.logDispatch({
          clinicId,
          eventKey: action.eventKey ?? 'mira.action.send_wa',
          channel: 'text',
          recipientRole: action.recipientRole ?? 'unknown',
          recipientPhone: action.to,
          senderInstance: action.via === 'mih'
            ? (process.env.EVOLUTION_INSTANCE_MIH ?? 'Mih')
            : (process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'),
          textContent: action.content,
          waMessageId: sent.messageId ?? null,
          status: sent.ok ? 'sent' : 'failed',
          errorMessage: sent.error ?? null,
        })
      } catch (err) {
        log.error({ err, action }, 'mira.webhook.action_failed')
      }
    }
  }

  // 13. Audit query · turn completo
  const responseMs = Date.now() - t0
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone: msg.phone,
      direction: 'inbound',
      content,
      intent: chosenIntent,
      intentData: result.meta ?? null,
      responseMs,
      status: 'sent',
    },
    audit: {
      clinicId,
      phone: msg.phone,
      query: content,
      intent: chosenIntent,
      success: true,
      resultSummary: result.replyText.slice(0, 200),
      responseMs,
    },
  })

  return jsonRes({
    ok: true,
    phone: msg.phone,
    wa_message_id: msg.messageId,
    role,
    intent: chosenIntent,
    transcribed: transcribedFromAudio,
    reply_preview: result.replyText.slice(0, 120),
    actions_count: result.actions.length,
    response_ms: responseMs,
  })
}

// ── GET: health/handshake ────────────────────────────────────────────────
export async function GET() {
  return jsonRes({ ok: true, service: 'mira-evolution-webhook', version: '0.1.0' })
}
