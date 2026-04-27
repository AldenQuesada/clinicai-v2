/**
 * Handler: partner.bulk_emit_voucher
 *
 * Fluxo (DECISAO ALDEN 2026-04-25 · case Dani Mendes 22 vouchers):
 *   1. Parceira manda lista (3 formatos · ver bulk-list-parser.ts)
 *   2. Mira parseia · resolve parceria · valida cap mensal
 *   3. Pra cada item: dedup global em paralelo (findInAnySystem)
 *   4. Separa eligible vs blocked
 *   5. Cria state bulk_voucher_review (TTL 30min) com batch_id pre-gerado
 *   6. Responde preview formatado (eligible + blocked + schedule + SIM/NAO)
 *
 * Confirmacao SIM cai em handler separado (b2b-bulk-voucher-confirm) · esse
 * handler so prepara o terreno · NAO emite voucher direto.
 *
 * Mantem b2b-emit-voucher (single) intocado · classifier decide single vs
 * bulk via looksLikeBulk (>=2 phones).
 */

import { v4 as uuidv4 } from 'uuid'
import {
  STATE_KEY,
  TTL_BULK_VOUCHER_REVIEW_MIN,
  type BulkVoucherReviewState,
} from '../state-machine'
import { parseBulkList } from '../bulk-list-parser'
import { formatDedupReply } from './b2b-dedup-reply'
import type { Handler, HandlerResult } from './types'
import type { DedupHit } from '@clinicai/repositories'

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

const PT_MONTHS = [
  'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez',
]

function shortSinceMonth(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'antes'
  return `${PT_MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`
}

function dedupShortMsg(hit: DedupHit): string {
  const since = shortSinceMonth(hit.since)
  switch (hit.kind) {
    case 'patient':
      return `paciente desde ${since}`
    case 'lead':
      return `lead aberto desde ${since}`
    case 'voucher_recipient':
      return hit.partnershipName
        ? `voucher via ${hit.partnershipName} em ${since}`
        : `voucher emitido em ${since}`
    case 'partner_referral':
      return hit.partnershipName
        ? `indicada via ${hit.partnershipName} em ${since}`
        : `indicada em ${since}`
    default:
      return `cadastro existente desde ${since}`
  }
}

/**
 * Converte schedule hint cru em ISO. Best-effort · timezone America/Sao_Paulo
 * implicito (clinic-dashboard mesmo TZ). Sem hint → agora.
 *
 * Suportado:
 *   "amanha 9h"       → tomorrow 09:00
 *   "amanha as 14h30" → tomorrow 14:30
 *   "hoje 18h"        → today 18:00
 *   "domingo 14h"     → proximo domingo 14:00
 */
function scheduleHintToIso(hint: string | undefined): {
  iso: string
  human: string
} {
  const now = new Date()
  if (!hint) {
    return { iso: now.toISOString(), human: 'agora' }
  }

  const t = hint.toLowerCase().trim()
  const timeMatch = t.match(/(\d{1,2})(?::|h)(\d{2})?/)
  const hour = timeMatch ? Number(timeMatch[1]) : 9
  const minute = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0

  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)

  if (/amanh[aã]/.test(t)) {
    target.setDate(target.getDate() + 1)
  } else if (/hoje/.test(t)) {
    if (target.getTime() <= now.getTime()) {
      // hora ja passou · joga pra +1h pra nao confundir worker
      return { iso: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), human: 'em 1h' }
    }
  } else {
    // dia da semana · acha proximo
    const days = [
      'domingo','segunda','terca','terça','quarta','quinta','sexta','sabado','sábado',
    ]
    const dayMap: Record<string, number> = {
      domingo: 0, segunda: 1, terca: 2, terça: 2,
      quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
    }
    const dayWord = days.find((d) => t.includes(d))
    if (dayWord) {
      const targetDow = dayMap[dayWord]
      const currentDow = now.getDay()
      let diff = (targetDow - currentDow + 7) % 7
      if (diff === 0) diff = 7 // proximo, nao hoje
      target.setDate(target.getDate() + diff)
    } else {
      // hint nao bateu · default agora
      return { iso: now.toISOString(), human: 'agora' }
    }
  }

  return { iso: target.toISOString(), human: hint }
}

export const b2bBulkEmitVoucherHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, text, pushName } = ctx

  // 1. Resolve parceria
  const partnership = await repos.b2bPartnerships.getByPartnerPhone(clinicId, phone)
  if (!partnership) {
    return {
      replyText: 'Hmm, não achei sua parceria ativa aqui 🤔 confere com a Mirian se está tudo certo?',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-bulk-emit-voucher', error: 'partnership_not_found' },
    }
  }

  const partnerFirst = firstName(partnership.contactName ?? pushName)

  // 2. Parse lista
  const parsed = parseBulkList(text)
  if (parsed.items.length < 2) {
    return {
      replyText:
        `${partnerFirst}, tô com dúvida na lista 🤔 manda no formato:\n\n` +
        `*Maria 5544991111111*\n*Ana 5544992222222*\n*Bia 5544993333333*\n\n` +
        `(uma por linha · nome + WhatsApp com DDD)`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-bulk-emit-voucher', missing: 'list_items', parsed_count: parsed.items.length },
    }
  }

  // 3. Cap mensal · DECISAO Alden 2026-04-27: NAO bloquear, so alertar.
  // Cap e guia · se atingir/passar, emite normalmente mas avisa parceira.
  let capWarning: string | null = null
  if (partnership.voucherMonthlyCap != null) {
    const used = await repos.b2bVouchers.countMonthlyByPartnership(partnership.id)
    const wouldBe = used + parsed.items.length
    if (used >= partnership.voucherMonthlyCap) {
      capWarning =
        `⚠️ Você ja esta em ${used}/${partnership.voucherMonthlyCap} vouchers este mes. ` +
        `Vou enfileirar mais ${parsed.items.length} · so pra Mirian saber.`
    } else if (wouldBe > partnership.voucherMonthlyCap) {
      capWarning =
        `⚠️ Esse lote (${parsed.items.length}) vai te deixar em ${wouldBe}/${partnership.voucherMonthlyCap} ` +
        `· acima do cap mensal. Vou enfileirar mesmo assim · te aviso ao final.`
    }
  }

  // 4. Dedup global em paralelo
  const dedupResults = await Promise.all(
    parsed.items.map(async (item) => {
      const hit = await repos.leads.findInAnySystem(clinicId, item.phone, item.name)
      return { item, hit }
    }),
  )

  const eligible: Array<{ name: string; phone: string }> = []
  const blocked: BulkVoucherReviewState['blocked'] = []
  for (const r of dedupResults) {
    if (r.hit) {
      blocked.push({
        name: r.item.name,
        phone: r.item.phone,
        dedup_hit_kind: r.hit.kind,
        dedup_hit_msg: dedupShortMsg(r.hit),
      })
    } else {
      eligible.push({ name: r.item.name, phone: r.item.phone })
    }
  }

  // Audit blocked items (best-effort · um log resumindo)
  if (blocked.length > 0) {
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'partner.bulk_dedup_blocked',
        intentData: {
          partnership_id: partnership.id,
          blocked_count: blocked.length,
          eligible_count: eligible.length,
          blocked_phones: blocked.map((b) => b.phone),
        },
        status: 'sent',
      },
      audit: {
        clinicId,
        phone,
        query: text,
        intent: 'partner.bulk_dedup_blocked',
        rpcCalled: 'leads.findInAnySystem',
        success: true,
        resultSummary: `Bulk dedup ${blocked.length}/${parsed.items.length} blocked`,
      },
    })
  }

  // Caso extremo: tudo bloqueado · aborta sem state
  if (eligible.length === 0) {
    let detail = blocked
      .map((b, i) => ` ${i + 1}. ${b.name} · ${b.dedup_hit_msg}`)
      .join('\n')
    if (detail.length > 600) detail = detail.slice(0, 580) + '\n …'
    return {
      replyText:
        `${partnerFirst}, todas as ${blocked.length} dessa lista já estão na nossa base 💛\n\n` +
        detail +
        `\n\nQuer me passar outras indicações?`,
      actions: [],
      stateTransitions: [],
      meta: {
        handler: 'b2b-bulk-emit-voucher',
        all_blocked: true,
        total: parsed.items.length,
      },
    }
  }

  // 5. State bulk_voucher_review · TTL 30min · batch_id pre-gerado
  const batchId = uuidv4()
  const schedule = scheduleHintToIso(parsed.scheduleHint)
  const expiresAt = new Date(Date.now() + TTL_BULK_VOUCHER_REVIEW_MIN * 60 * 1000)

  const state: BulkVoucherReviewState = {
    partnership_id: partnership.id,
    batch_id: batchId,
    items: eligible.map((e) => ({
      name: e.name,
      phone: e.phone,
      combo: partnership.voucherCombo ?? null,
    })),
    blocked,
    scheduled_at: schedule.iso,
    expires_at: expiresAt.toISOString(),
    schedule_hint: parsed.scheduleHint,
  }

  // 6. Reply preview
  const eligibleList = eligible
    .map((e, i) => ` ${i + 1}. ${e.name}`)
    .slice(0, 30) // truncate display · state mantem todos
    .join('\n')
  const eligibleMore =
    eligible.length > 30 ? `\n …e mais ${eligible.length - 30}` : ''

  const blockedList =
    blocked.length > 0
      ? `\n\n⚠️ *${blocked.length} já estão na nossa base · vou pular:*\n` +
        blocked
          .map((b, i) => ` ${i + 1}. ${b.name} (${b.dedup_hit_msg})`)
          .slice(0, 15)
          .join('\n') +
        (blocked.length > 15 ? `\n …e mais ${blocked.length - 15}` : '')
      : ''

  const scheduleMsg =
    schedule.human === 'agora'
      ? `⏰ Disparo: *agora* (assim que você confirmar)\n   ou se preferir agendado: me fala "manda domingo 9h"`
      : `⏰ Disparo agendado pra: *${schedule.human}*\n   pode mudar mandando outro horário`

  const reply =
    `Beleza, ${partnerFirst}! Tô preparando *${eligible.length} voucher${eligible.length === 1 ? '' : 's'}*:\n\n` +
    `✅ *${eligible.length} pronta${eligible.length === 1 ? '' : 's'} pra disparar:*\n` +
    eligibleList +
    eligibleMore +
    blockedList +
    (capWarning ? `\n\n${capWarning}` : '') +
    `\n\n${scheduleMsg}\n\n` +
    `Posso emitir? *SIM* / *NÃO*`

  return {
    replyText: reply,
    actions: [],
    stateTransitions: [
      {
        op: 'set',
        key: STATE_KEY.BULK_VOUCHER_REVIEW,
        value: state as unknown as Record<string, unknown>,
        ttlMinutes: TTL_BULK_VOUCHER_REVIEW_MIN,
      },
    ],
    meta: {
      handler: 'b2b-bulk-emit-voucher',
      partnership_id: partnership.id,
      batch_id: batchId,
      eligible_count: eligible.length,
      blocked_count: blocked.length,
      scheduled_at: schedule.iso,
    },
  }
}
