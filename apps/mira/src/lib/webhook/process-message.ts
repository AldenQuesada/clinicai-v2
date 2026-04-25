/**
 * Logica de processamento de uma msg de webhook ja extraida + role-resolved.
 *
 * Usado por:
 *   - apps/mira/src/app/api/webhook/evolution/route.ts (legacy sync, quando
 *     WEBHOOK_ASYNC_ENABLED=false)
 *   - apps/mira/src/app/api/cron/webhook-processing-worker/route.ts (async,
 *     quando WEBHOOK_ASYNC_ENABLED=true · default)
 *
 * Inclui:
 *   - audio download + Whisper transcribe
 *   - state preemption (voucher_confirm, bulk_voucher_review, admin_*, cp_*)
 *   - classifier Tier1 + Haiku fallback
 *   - handler dispatch
 *   - state transitions apply
 *   - reply via Evolution
 *   - audit logs (logQuery + logDispatch)
 *
 * Boundary: NAO faz auth · NAO faz dedup · NAO faz role resolve. Caller
 * (webhook ou worker) ja pre-validou.
 */

import type { ExtractedMessage } from './evolution-extract'
import type { Role } from './role-resolver'
import type { MiraRepos } from '@/lib/repos'
import { classifyIntent } from './intent-classifier'
import { isGlobalAdminCommand, STATE_KEY } from './state-machine'
import {
  dispatchHandler,
  b2bVoucherConfirmHandler,
  b2bBulkVoucherConfirmHandler,
  shouldHandleAsConfirmation,
  shouldHandleAsBulkConfirmation,
  type HandlerAction,
} from './handlers'
import { getEvolutionService } from '@/services/evolution.service'
import { transcribeAudio } from '@/services/transcription.service'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'mira' })

export interface ProcessMessageInput {
  clinicId: string
  msg: ExtractedMessage
  role: Exclude<Role, null>
  repos: MiraRepos
  /** Tempo inicial pra audit responseMs · default = Date.now() do caller. */
  startedAtMs?: number
}

export interface ProcessMessageResult {
  ok: boolean
  /** 'audio_download_failed' | 'whisper_failed' | 'empty_message' | etc */
  skip?: string
  error?: string
  intent?: string
  replyPreview?: string
  actionsCount?: number
  responseMs?: number
  transcribed?: boolean
}

/**
 * Processa uma msg ja extraida + autorizada. Retorna sucesso/falha + meta.
 * NAO chama dedup state · NAO faz auth · caller ja validou.
 */
export async function processWebhookMessage(
  input: ProcessMessageInput,
): Promise<ProcessMessageResult> {
  const { clinicId, msg, role, repos } = input
  const t0 = input.startedAtMs ?? Date.now()

  // 1. Audio → Whisper (se necessario)
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
        return { ok: true, skip: 'audio_download_failed' }
      }
      const transcribed = await transcribeAudio(dl.buffer, dl.contentType)
      if (!transcribed) {
        await wa.sendText(
          msg.phone,
          'Tive um problema pra transcrever o áudio. Pode escrever em texto?',
        )
        return { ok: true, skip: 'whisper_failed' }
      }
      content = transcribed
      transcribedFromAudio = true
    } catch (err) {
      log.error({ err, phone: msg.phone }, 'mira.process.audio_pipeline_exception')
      return { ok: false, error: 'audio_pipeline_exception' }
    }
  }

  if (!content) {
    return { ok: true, skip: 'empty_message' }
  }

  // 2. State preemption · estados pendentes bypassam classifier
  const voucherPending = await repos.miraState.get(msg.phone, STATE_KEY.VOUCHER_CONFIRM)
  const bulkVoucherPending = await repos.miraState.get(msg.phone, STATE_KEY.BULK_VOUCHER_REVIEW)
  const rejectReasonPending = await repos.miraState.get(msg.phone, STATE_KEY.ADMIN_REJECT_REASON)
  const approveSelectPending = await repos.miraState.get(msg.phone, STATE_KEY.ADMIN_APPROVE_SELECT)
  const rejectSelectPending = await repos.miraState.get(msg.phone, STATE_KEY.ADMIN_REJECT_SELECT)
  const cpStepPending = await repos.miraState.get(msg.phone, STATE_KEY.CP_STEP)

  let result
  let chosenIntent = 'unknown'

  if (voucherPending && shouldHandleAsConfirmation(content)) {
    chosenIntent = 'preempt:voucher_confirm'
    result = await b2bVoucherConfirmHandler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'partner.other',
      repos,
      pushName: msg.pushName,
    })
  } else if (bulkVoucherPending && shouldHandleAsBulkConfirmation(content)) {
    chosenIntent = 'preempt:bulk_voucher_review'
    result = await b2bBulkVoucherConfirmHandler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'partner.other',
      repos,
      pushName: msg.pushName,
    })
  } else if (role === 'admin' && rejectReasonPending) {
    chosenIntent = 'preempt:admin_reject_reason'
    const handler = dispatchHandler('admin.reject')
    result = await handler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'admin.reject',
      repos,
      pushName: msg.pushName,
    })
  } else if (role === 'admin' && approveSelectPending) {
    chosenIntent = 'preempt:admin_approve_select'
    const handler = dispatchHandler('admin.approve')
    result = await handler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'admin.approve',
      repos,
      pushName: msg.pushName,
    })
  } else if (role === 'admin' && rejectSelectPending) {
    chosenIntent = 'preempt:admin_reject_select'
    const handler = dispatchHandler('admin.reject')
    result = await handler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'admin.reject',
      repos,
      pushName: msg.pushName,
    })
  } else if (role === 'admin' && cpStepPending) {
    chosenIntent = 'preempt:cp_step'
    const handler = dispatchHandler('admin.create_partnership')
    result = await handler({
      clinicId,
      phone: msg.phone,
      role,
      text: content,
      intent: 'admin.create_partnership',
      repos,
      pushName: msg.pushName,
    })
  } else {
    if (role === 'admin' && isGlobalAdminCommand(content)) {
      await repos.miraState.clear(msg.phone)
    }
    const classification = await classifyIntent(content, role)
    chosenIntent = classification.intent
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

  // 3. Apply state transitions
  for (const tx of result.stateTransitions) {
    if (tx.op === 'set' && tx.value !== undefined) {
      await repos.miraState.set(msg.phone, tx.key, tx.value, tx.ttlMinutes ?? 15)
    } else if (tx.op === 'clear') {
      await repos.miraState.clear(msg.phone, tx.key)
    }
  }

  // 4. Reply (sendText pra origem)
  const wa = getEvolutionService('mira')
  let replyMessageId: string | null = null
  if (result.replyText) {
    const sent = await wa.sendText(msg.phone, result.replyText)
    replyMessageId = sent.messageId ?? null
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

  // 5. Apply actions (sendText pra outros phones via mira ou mih)
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
          senderInstance:
            action.via === 'mih'
              ? process.env.EVOLUTION_INSTANCE_MIH ?? 'Mih'
              : process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian',
          textContent: action.content,
          waMessageId: sent.messageId ?? null,
          status: sent.ok ? 'sent' : 'failed',
          errorMessage: sent.error ?? null,
        })
      } catch (err) {
        log.error({ err, action }, 'mira.process.action_failed')
      }
    }
  }

  // 6. Audit query · turn completo
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

  return {
    ok: true,
    intent: chosenIntent,
    replyPreview: result.replyText.slice(0, 120),
    actionsCount: result.actions.length,
    responseMs,
    transcribed: transcribedFromAudio,
  }
}
