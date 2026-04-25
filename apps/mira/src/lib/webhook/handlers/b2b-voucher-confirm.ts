/**
 * Handler: confirmacao SIM/NAO de voucher_confirm pendente.
 *
 * Detector e o ProcessoRouter, nao o intent classifier (a confirmacao nao tem
 * verbo claro · so "sim"/"nao"/"ok"/"pode emitir"/"esquece"). Quando ha state
 * voucher_confirm ativo, esse handler pega o turn antes do intent classifier.
 */

import { STATE_KEY } from '../state-machine'
import { formatDedupReply } from './b2b-dedup-reply'
import type { Handler, HandlerResult } from './types'
import type { VoucherConfirmState } from '../state-machine'

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

const SIM_RX = /\b(sim|s|claro|pode|emite|emitir|ok|aprovo|aprovado|confirma(do)?|confirmo|vai|manda)\b/i
const NAO_RX = /\b(nao|n[aã]o|esquece|esquec[ae]|cancela|cancelar|deixa|para)\b/i

export const b2bVoucherConfirmHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, text } = ctx

  const stateRow = await repos.miraState.get<VoucherConfirmState>(phone, STATE_KEY.VOUCHER_CONFIRM)
  if (!stateRow) {
    // Sem state · nao deveriamos estar aqui
    return {
      replyText: 'Hm, não tenho voucher pendente pra confirmar contigo 🤔',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-voucher-confirm', error: 'no_state' },
    }
  }

  const isYes = SIM_RX.test(text)
  const isNo = !isYes && NAO_RX.test(text)

  if (!isYes && !isNo) {
    // Resposta ambigua · pede de novo
    return {
      replyText: `Não consegui entender 😅 manda *SIM* pra emitir ou *NÃO* pra cancelar o voucher pra ${stateRow.value.recipient_name}`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-voucher-confirm', error: 'ambiguous' },
    }
  }

  if (isNo) {
    return {
      replyText: `Ok, voucher pra ${stateRow.value.recipient_name} cancelado 👍`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.VOUCHER_CONFIRM }],
      meta: { handler: 'b2b-voucher-confirm', decision: 'no' },
    }
  }

  // SIM · double-check dedup global ANTES do RPC (sanity recheck).
  // Edge case: state criado ha 30min, recipient virou paciente nesse meio tempo
  // (ou outra parceira indicou) · evita race condition de double-emit.
  // Refs: DECISAO ALDEN 2026-04-25 (case Dani Mendes 26 vouchers).
  const dupHit = await repos.leads.findInAnySystem(
    clinicId,
    stateRow.value.recipient_phone,
    stateRow.value.recipient_name,
  )
  if (dupHit) {
    const partnership = await repos.b2bPartnerships.getById(stateRow.value.partnership_id)
    const partnerFirst = firstName(partnership?.contactName ?? null)
    // Audit log · bloqueio detectado no recheck (mais critico que pre-emit)
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'partner.dedup_blocked',
        intentData: {
          partnership_id: stateRow.value.partnership_id,
          recipient_phone: stateRow.value.recipient_phone,
          recipient_name: stateRow.value.recipient_name,
          hit_kind: dupHit.kind,
          hit_id: dupHit.id,
          hit_since: dupHit.since,
          stage: 'voucher_confirm_recheck',
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
        resultSummary: `Recheck dedup hit ${dupHit.kind} · ${dupHit.id.slice(0, 8)} · since ${dupHit.since}`,
      },
    })
    return {
      replyText: formatDedupReply(dupHit, partnerFirst, stateRow.value.recipient_name),
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.VOUCHER_CONFIRM }],
      meta: {
        handler: 'b2b-voucher-confirm',
        decision: 'yes',
        dedup_blocked: true,
        hit_kind: dupHit.kind,
        hit_id: dupHit.id,
        stage: 'recheck',
      },
    }
  }

  // SIM · emite voucher
  const result = await repos.b2bVouchers.issue({
    partnershipId: stateRow.value.partnership_id,
    combo: stateRow.value.combo,
    recipientName: stateRow.value.recipient_name,
    recipientPhone: stateRow.value.recipient_phone,
  })

  if (!result.ok) {
    return {
      replyText: `Tive um problema pra emitir agora · erro: ${result.error ?? 'unknown'}. Tenta de novo daqui a pouco?`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.VOUCHER_CONFIRM }],
      meta: { handler: 'b2b-voucher-confirm', decision: 'yes', issue_failed: true, error: result.error },
    }
  }

  const partnership = await repos.b2bPartnerships.getById(stateRow.value.partnership_id)
  const partnerName = partnership?.contactName ?? 'sua parceira'
  const voucherUrl = `https://painel.miriandpaula.com.br/voucher/${result.token}`

  // Action: dispara voucher pra recipient via Mih (Lara/recipient_voucher channel)
  const recipientGreeting =
    `Oi ${stateRow.value.recipient_first_name}! Aqui é da Clínica Mirian de Paula 💛\n\n` +
    `${partnerName} acabou de te presentear com um *voucher cortesia* — ${stateRow.value.combo}.\n\n` +
    `Dá uma olhada: ${voucherUrl}\n\n` +
    `Quando quiser marcar é só me chamar por aqui!`

  return {
    replyText:
      `Voucher emitido! 🎁\n` +
      `Token: \`${result.token}\`\n` +
      `Mandei pra ${stateRow.value.recipient_name} agora mesmo 💛\n` +
      `Acompanha em: ${voucherUrl}`,
    actions: [
      {
        kind: 'send_wa',
        to: stateRow.value.recipient_phone,
        via: 'mih',
        content: recipientGreeting,
        eventKey: 'voucher_issued_beneficiary',
        recipientRole: 'beneficiary',
      },
    ],
    stateTransitions: [{ op: 'clear', key: STATE_KEY.VOUCHER_CONFIRM }],
    meta: {
      handler: 'b2b-voucher-confirm',
      decision: 'yes',
      voucher_id: result.id,
      voucher_token: result.token,
    },
  }
}

/**
 * Detecta se a msg atual deve ser tratada como confirmacao em vez de nova intent.
 * Verifica: existe state voucher_confirm ativo + texto curto (<= 50 chars) +
 * bate em SIM_RX/NAO_RX/mistura.
 */
export function shouldHandleAsConfirmation(text: string): boolean {
  if (!text || text.length > 80) return false
  return SIM_RX.test(text) || NAO_RX.test(text) || /^(ok|tudo bem|certo)\b/i.test(text)
}
