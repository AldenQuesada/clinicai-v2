/**
 * Handler: confirmacao SIM/NAO/edicao schedule de bulk_voucher_review pendente.
 *
 * Detector e o ProcessoRouter (state preempt no webhook), nao o intent
 * classifier (a confirmacao e simples · "sim"/"nao" ou "manda amanha 9h"
 * pra trocar schedule).
 *
 * Fluxo:
 *   - SIM        → enqueue na voucherQueue (RPC b2b_dispatch_queue_enqueue)
 *                  com batch_id ja gerado no review · clear state
 *   - NAO/cancela→ clear state · "Beleza, cancelado"
 *   - texto com hint de schedule → atualiza scheduled_at no state, mantem TTL
 *   - ambiguo    → pede SIM/NAO de novo
 *
 * Audit log (partner.bulk_voucher_enqueued) via WaProAuditRepository.logQuery.
 */

import {
  STATE_KEY,
  TTL_BULK_VOUCHER_REVIEW_MIN,
  isAffirmative,
  isNegative,
  type BulkVoucherReviewState,
} from '../state-machine'
import { renderTemplate } from '@clinicai/utils'
import type { Handler, HandlerResult } from './types'

const SIM_RX = /\b(sim|s|claro|pode|emite|emitir|ok|aprovo|aprovado|confirma(do)?|confirmo|vai|manda|bora)\b/i
const NAO_RX = /\b(n[aã]o|esquece|esquec[ae]|cancela|cancelar|deixa|para|pare)\b/i

// Schedule edit patterns · sao os mesmos do parser
const SCHEDULE_RX =
  /(amanh[aã]|hoje|domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)(\s+(às|as))?\s+(\d{1,2})(:|h)(\d{2})?/i

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

const PT_MONTHS = [
  'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez',
]

function humanIso(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'agora'
  const now = new Date()
  const diffMin = (d.getTime() - now.getTime()) / 60000
  if (diffMin < 5) return 'agora'
  // Mesma data · "hoje 14:30"
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `hoje ${hh}h${mm !== '00' ? mm : ''}`
  // Senao: "DD/Mes HHhMM"
  return `${d.getDate()}/${PT_MONTHS[d.getMonth()]} ${hh}h${mm !== '00' ? mm : ''}`
}

function parseScheduleEdit(text: string): string | null {
  const m = text.match(SCHEDULE_RX)
  if (!m) return null
  const t = m[0].toLowerCase()
  const timeMatch = t.match(/(\d{1,2})(?::|h)(\d{2})?/)
  const hour = timeMatch ? Number(timeMatch[1]) : 9
  const minute = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0

  const now = new Date()
  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)

  if (/amanh[aã]/.test(t)) {
    target.setDate(target.getDate() + 1)
  } else if (/hoje/.test(t)) {
    if (target.getTime() <= now.getTime()) {
      target.setTime(now.getTime() + 60 * 60 * 1000)
    }
  } else {
    const dayMap: Record<string, number> = {
      domingo: 0, segunda: 1, terca: 2, terça: 2,
      quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
    }
    const dayWord = Object.keys(dayMap).find((d) => t.includes(d))
    if (!dayWord) return null
    const targetDow = dayMap[dayWord]
    const currentDow = now.getDay()
    let diff = (targetDow - currentDow + 7) % 7
    if (diff === 0) diff = 7
    target.setDate(target.getDate() + diff)
  }

  return target.toISOString()
}

export const b2bBulkVoucherConfirmHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, text, pushName } = ctx

  const stateRow = await repos.miraState.get<BulkVoucherReviewState>(
    phone,
    STATE_KEY.BULK_VOUCHER_REVIEW,
  )
  if (!stateRow) {
    return {
      replyText: 'Hm, não tenho lista de vouchers pendente pra confirmar contigo 🤔',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-bulk-voucher-confirm', error: 'no_state' },
    }
  }

  const state = stateRow.value
  const partnership = await repos.b2bPartnerships.getById(state.partnership_id)
  const partnerFirst = firstName(partnership?.contactName ?? pushName)

  // 1. Schedule edit · texto curto que parece schedule (e nao e SIM/NAO)
  const scheduleEdit = parseScheduleEdit(text)
  const isYes = isAffirmative(text) || SIM_RX.test(text)
  const isNo = !isYes && (isNegative(text) || NAO_RX.test(text))

  if (scheduleEdit && !isYes && !isNo) {
    // Atualiza scheduled_at · mantem state com novo TTL
    const updated: BulkVoucherReviewState = {
      ...state,
      scheduled_at: scheduleEdit,
      schedule_hint: text.trim().slice(0, 60),
      expires_at: new Date(Date.now() + TTL_BULK_VOUCHER_REVIEW_MIN * 60 * 1000).toISOString(),
    }
    return {
      replyText:
        `Beleza, ${partnerFirst}! Disparo agendado pra *${humanIso(scheduleEdit)}* ✅\n` +
        `Confirma com *SIM* que eu enfileiro · *NÃO* eu cancelo`,
      actions: [],
      stateTransitions: [
        {
          op: 'set',
          key: STATE_KEY.BULK_VOUCHER_REVIEW,
          value: updated as unknown as Record<string, unknown>,
          ttlMinutes: TTL_BULK_VOUCHER_REVIEW_MIN,
        },
      ],
      meta: {
        handler: 'b2b-bulk-voucher-confirm',
        decision: 'schedule_edit',
        new_scheduled_at: scheduleEdit,
        batch_id: state.batch_id,
      },
    }
  }

  // 2. NAO · cancela
  if (isNo) {
    return {
      replyText:
        `Beleza, ${partnerFirst} · cancelei a lista de *${state.items.length} vouchers* 👍 ` +
        `Quando quiser manda de novo`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.BULK_VOUCHER_REVIEW }],
      meta: {
        handler: 'b2b-bulk-voucher-confirm',
        decision: 'no',
        cancelled_count: state.items.length,
        batch_id: state.batch_id,
      },
    }
  }

  // 3. Ambiguo · pede de novo
  if (!isYes) {
    return {
      replyText:
        `Não consegui entender 😅 manda *SIM* pra disparar os ${state.items.length} vouchers ` +
        `ou *NÃO* pra cancelar`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-bulk-voucher-confirm', error: 'ambiguous', batch_id: state.batch_id },
    }
  }

  // 4. SIM · enqueue
  const enqueueResult = await repos.voucherQueue.enqueue({
    partnershipId: state.partnership_id,
    batchId: state.batch_id,
    scheduledAt: state.scheduled_at,
    submittedBy: `partner_phone:${phone}`,
    items: state.items.map((it) => ({
      name: it.name,
      phone: it.phone,
      combo: it.combo ?? undefined,
    })),
  })

  if (!enqueueResult.ok) {
    // Mantem state · permite retry
    return {
      replyText:
        `Tive um problema pra enfileirar agora · erro: ${enqueueResult.error ?? 'unknown'}. ` +
        `Tenta de novo daqui a pouco mandando *SIM*?`,
      actions: [],
      stateTransitions: [],
      meta: {
        handler: 'b2b-bulk-voucher-confirm',
        decision: 'yes',
        enqueue_failed: true,
        error: enqueueResult.error,
        batch_id: state.batch_id,
      },
    }
  }

  // Audit · enqueued
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: 'partner.bulk_voucher_enqueued',
      intentData: {
        partnership_id: state.partnership_id,
        batch_id: enqueueResult.batchId ?? state.batch_id,
        enqueued_count: enqueueResult.count,
        scheduled_at: state.scheduled_at,
        items_total: state.items.length,
        blocked_count: state.blocked.length,
      },
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: 'partner.bulk_voucher_enqueued',
      rpcCalled: 'b2b_dispatch_queue_enqueue',
      success: true,
      resultSummary: `Bulk batch ${state.batch_id.slice(0, 8)} · ${enqueueResult.count} enfileirados`,
    },
  })

  const scheduleHuman = humanIso(state.scheduled_at)
  const scheduleMsg =
    scheduleHuman === 'agora'
      ? 'agora · você recebe confirmação de cada um conforme rola'
      : `agendados pra *${scheduleHuman}*`

  // Template DB-driven (mig 800-43 · bulk_voucher_enqueued).
  // Vars: parceira_first, count, schedule_msg, painel_parceira.
  // (partnership ja foi fetched no inicio do handler · linha ~113)
  const panelUrl = partnership?.publicToken
    ? `https://mira.miriandpaula.com.br/parceiro/${partnership.publicToken}`
    : ''

  const tpl = await repos.b2bTemplates.getByEventKey(
    clinicId,
    'bulk_voucher_enqueued',
    state.partnership_id,
  )
  const replyText = tpl?.textTemplate
    ? renderTemplate(tpl.textTemplate, {
        parceira_first: partnerFirst,
        count: enqueueResult.count,
        schedule_msg: scheduleMsg,
        painel_parceira: panelUrl,
      })
    : // Fallback defensivo
      `Confirmado, *${partnerFirst}*! 🎁\n\nVou disparar os *${enqueueResult.count} vouchers* ${scheduleMsg}.\n\nObrigada pela confiança 💛`

  return {
    replyText,
    actions: [],
    stateTransitions: [{ op: 'clear', key: STATE_KEY.BULK_VOUCHER_REVIEW }],
    meta: {
      handler: 'b2b-bulk-voucher-confirm',
      decision: 'yes',
      batch_id: enqueueResult.batchId ?? state.batch_id,
      enqueued_count: enqueueResult.count,
      scheduled_at: state.scheduled_at,
    },
  }
}

/**
 * Detecta se a msg deve ser tratada como interacao com bulk_voucher_review
 * pendente · SIM/NAO ou edicao de schedule.
 *
 * Mantemos generoso (qualquer SIM/NAO/cancela/schedule hint) porque o state
 * preempt no webhook ja conferiu que existe state ativo.
 */
export function shouldHandleAsBulkConfirmation(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length > 120) return false
  return (
    SIM_RX.test(trimmed) ||
    NAO_RX.test(trimmed) ||
    SCHEDULE_RX.test(trimmed) ||
    /^(ok|tudo bem|certo|beleza)\b/i.test(trimmed)
  )
}
