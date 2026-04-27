/**
 * Handler: partner.emit_voucher
 *
 * Fluxo (DECISAO ALDEN):
 *   1. Parceira manda "emite voucher pra Maria 5544991111111"
 *   2. Mira extrai recipient_name + recipient_phone
 *   3. Cria state voucher_confirm (TTL 30min)
 *   4. Responde "Confirma · voucher pra Maria · SIM/NAO"
 *   5. Reminder cron dispara mensagem engracada 5min antes do expiry
 *   6. Quando parceira responde SIM/NAO (proximo turno · handler diferente),
 *      voucher e emitido via b2b_voucher_issue + dispatch pra recipient via Mih.
 *
 * Esse handler so cobre passo 1-4. Confirmacao SIM/NAO entra em handler
 * separado (b2b-voucher-confirm · checa state_value e despacha).
 */

import { TTL_VOUCHER_CONFIRM_MIN, setVoucherConfirmState } from '../state-machine'
import { formatDedupReply } from './b2b-dedup-reply'
import type { Handler, HandlerResult } from './types'

const PHONE_RX = /(\+?\d{10,14})/g

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

function extractRecipient(text: string): { name: string; phone: string } | null {
  // Procura phone primeiro (10-14 digitos com + opcional)
  const phoneMatch = text.match(PHONE_RX)
  if (!phoneMatch || phoneMatch.length === 0) return null
  const phone = phoneMatch[0].replace(/\D/g, '')

  // Nome = palavras antes do phone, removendo verbos comuns
  const beforePhone = text.split(phone)[0] || ''
  const cleaned = beforePhone
    .replace(/\b(emit(e|ir)|gera|fazer?|manda|mandar|envia|enviar|presentei?a|presentear|cria|criar|um\s+|o\s+|voucher|cupom|presente|cortesia|pra|para)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const name = cleaned || 'amiga'
  return { name, phone }
}

export const b2bEmitVoucherHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, text, pushName } = ctx

  // Resolve parceria pelo phone do remetente
  const partnership = await repos.b2bPartnerships.getByPartnerPhone(clinicId, phone)
  if (!partnership) {
    return {
      replyText: 'Hmm, não achei sua parceria ativa aqui 🤔 confere com a Mirian se está tudo certo?',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-emit-voucher', error: 'partnership_not_found' },
    }
  }

  // Verifica cap mensal · DECISAO Alden 2026-04-27: NAO bloquear, so alertar.
  // Cap e guia, nao limite rigido. Se atingiu, emite normalmente mas adiciona
  // aviso na mensagem de confirmacao + audit pra Mirian saber.
  let capWarning: string | null = null
  if (partnership.voucherMonthlyCap != null) {
    const used = await repos.b2bVouchers.countMonthlyByPartnership(partnership.id)
    if (used >= partnership.voucherMonthlyCap) {
      capWarning = `⚠️ Você já está em ${used}/${partnership.voucherMonthlyCap} vouchers este mês. Vou emitir mais um · só pra ficar registrado.`
    }
  }

  // Extrai recipient
  const recipient = extractRecipient(text)
  if (!recipient) {
    return {
      replyText: `Quase lá, ${firstName(partnership.contactName ?? pushName)}! Me manda o *nome* + *WhatsApp* (com DDD) da sua amiga e eu confirmo antes de emitir 🎁`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-emit-voucher', missing: 'recipient' },
    }
  }

  // Dedup global pre-emit (DECISAO ALDEN 2026-04-25 · case Dani Mendes)
  // Se phone do recipient ja existe em qualquer sistema nosso, NAO cria
  // state · responde com mensagem alertando + audit log via meta.
  const partnerFirst = firstName(partnership.contactName ?? pushName)
  const dupHit = await repos.leads.findInAnySystem(clinicId, recipient.phone, recipient.name)
  if (dupHit) {
    // Audit · grava bloqueio em wa_pro_audit_log (best-effort)
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'partner.dedup_blocked',
        intentData: {
          partnership_id: partnership.id,
          recipient_phone: recipient.phone,
          recipient_name: recipient.name,
          hit_kind: dupHit.kind,
          hit_id: dupHit.id,
          hit_since: dupHit.since,
        },
        status: 'sent',
      },
      audit: {
        clinicId,
        phone,
        query: text,
        intent: 'partner.dedup_blocked',
        rpcCalled: 'leads.findInAnySystem',
        success: true,
        resultSummary: `Dedup hit ${dupHit.kind} · ${dupHit.id.slice(0, 8)} · since ${dupHit.since}`,
      },
    })
    return {
      replyText: formatDedupReply(dupHit, partnerFirst, recipient.name),
      actions: [],
      stateTransitions: [],
      meta: {
        handler: 'b2b-emit-voucher',
        dedup_blocked: true,
        hit_kind: dupHit.kind,
        hit_id: dupHit.id,
        hit_since: dupHit.since,
      },
    }
  }

  // Cria state voucher_confirm (30min) · reminder cron pega antes do expiry
  const expires = new Date(Date.now() + TTL_VOUCHER_CONFIRM_MIN * 60 * 1000)
  await setVoucherConfirmState(repos.miraState, phone, {
    partnership_id: partnership.id,
    combo: partnership.voucherCombo ?? 'voucher_default',
    recipient_name: recipient.name,
    recipient_phone: recipient.phone,
    recipient_first_name: firstName(recipient.name),
  })

  const reply =
    `Confere comigo, ${partnerFirst}:\n\n` +
    `🎁 Voucher pra *${recipient.name}* (${recipient.phone})\n` +
    `📦 Combo: ${partnership.voucherCombo ?? 'cortesia'}\n` +
    `⏰ Validade: ${partnership.voucherValidityDays} dias\n\n` +
    (capWarning ? `${capWarning}\n\n` : '') +
    `Manda *SIM* que eu emito agora · *NÃO* eu cancelo. ` +
    `Tem 30min pra confirmar (depois eu te lembro 😉)`

  return {
    replyText: reply,
    actions: [],
    stateTransitions: [],
    meta: {
      handler: 'b2b-emit-voucher',
      partnership_id: partnership.id,
      recipient,
      voucher_confirm_expires: expires.toISOString(),
      cap_warning: capWarning != null,
    },
  }
}
