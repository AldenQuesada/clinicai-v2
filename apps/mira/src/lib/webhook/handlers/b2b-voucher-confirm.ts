/**
 * Handler: confirmacao SIM/NAO de voucher_confirm pendente.
 *
 * Detector e o ProcessoRouter, nao o intent classifier (a confirmacao nao tem
 * verbo claro · so "sim"/"nao"/"ok"/"pode emitir"/"esquece"). Quando ha state
 * voucher_confirm ativo, esse handler pega o turn antes do intent classifier.
 */

import { STATE_KEY } from '../state-machine'
import { formatDedupReply } from './b2b-dedup-reply'
import { renderTemplate } from '@clinicai/utils'
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

  // SIM · emite voucher com dedup transactional (Fix F5 · mig 800-12).
  // issueWithDedup faz dedup + create numa unica transacao serializable
  // com FOR UPDATE em leads/b2b_vouchers/b2b_attributions. Elimina a race
  // que existia entre o pre-check (b2b-emit-voucher) e o create. Caso 2
  // parceiras simultaneas mandem voucher pra mesmo phone:
  //   - vencedora: emite voucher OK
  //   - perdedora: pega dedup_hit (voucher_recipient · acabou de criar)
  //                ou serialization_failure (retry interno). Caller responde
  //                mensagem dedup ao inves de "voucher emitido".
  // Refs: DECISAO ALDEN 2026-04-25 (case Dani Mendes 26 vouchers).
  const result = await repos.b2bVouchers.issueWithDedup({
    partnershipId: stateRow.value.partnership_id,
    combo: stateRow.value.combo,
    recipientName: stateRow.value.recipient_name,
    recipientPhone: stateRow.value.recipient_phone,
  })

  // Dedup hit · pode ser pre-existente OU race vencida pela outra parceira.
  // Usa novo intent partner.voucher_dedup_late_block pra audit (raro mas
  // possivel · indica que o gap entre emit e confirm foi suficiente pra
  // recipient virar paciente / outra parceira indicar).
  if (result.dedupHit) {
    const dupHit = result.dedupHit
    const partnership = await repos.b2bPartnerships.getById(stateRow.value.partnership_id)
    const partnerFirst = firstName(partnership?.contactName ?? null)
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'partner.voucher_dedup_late_block',
        intentData: {
          partnership_id: stateRow.value.partnership_id,
          recipient_phone: stateRow.value.recipient_phone,
          recipient_name: stateRow.value.recipient_name,
          hit_kind: dupHit.kind,
          hit_id: dupHit.id,
          hit_since: dupHit.since,
          stage: 'voucher_confirm_transactional',
          retries: result.retries,
        },
        status: 'sent',
      },
      audit: {
        clinicId,
        phone,
        query: text,
        intent: 'partner.voucher_dedup_late_block',
        rpcCalled: 'b2b_voucher_issue_with_dedup',
        success: true,
        resultSummary: `Late dedup ${dupHit.kind} · ${dupHit.id.slice(0, 8)} · since ${dupHit.since}`,
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
        stage: 'transactional',
        retries: result.retries,
      },
    }
  }

  if (!result.ok) {
    return {
      replyText: `Tive um problema pra emitir agora · erro: ${result.error ?? 'unknown'}. Tenta de novo daqui a pouco?`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.VOUCHER_CONFIRM }],
      meta: {
        handler: 'b2b-voucher-confirm',
        decision: 'yes',
        issue_failed: true,
        error: result.error,
        retries: result.retries,
      },
    }
  }

  const partnership = await repos.b2bPartnerships.getById(stateRow.value.partnership_id)
  const partnerName = partnership?.contactName ?? 'sua parceira'
  const voucherUrl = `https://painel.miriandpaula.com.br/voucher/${result.token}`
  const partnerPanelUrl = partnership?.publicToken
    ? `https://mira.miriandpaula.com.br/parceiro/${partnership.publicToken}`
    : ''
  const partnerFirst = firstName(partnership?.contactName ?? null)

  // Templates DB-driven (mig 800-42) · zero hardcode.
  // Beneficiary template: voucher_issued_beneficiary (text · canonical)
  // Partner reply template: voucher_issued_partner (port literal legacy)
  const [beneficiaryTpl, partnerTpl] = await Promise.all([
    repos.b2bTemplates.getByEventKey(clinicId, 'voucher_issued_beneficiary', stateRow.value.partnership_id),
    repos.b2bTemplates.getByEventKey(clinicId, 'voucher_issued_partner', stateRow.value.partnership_id),
  ])

  const sharedVars = {
    parceira: partnerName,
    parceira_first: partnerFirst,
    convidada: stateRow.value.recipient_name,
    convidada_first: stateRow.value.recipient_first_name,
    combo: stateRow.value.combo,
    link: voucherUrl,
    token: result.token ?? '',
    expira_em: String(partnership?.voucherValidityDays ?? 30),
    painel_parceira: partnerPanelUrl,
  }

  const recipientGreeting = beneficiaryTpl?.textTemplate
    ? renderTemplate(beneficiaryTpl.textTemplate, sharedVars)
    : // Fallback defensivo · template apagado por engano
      `Oi ${stateRow.value.recipient_first_name}! Voucher da ${partnerName} aqui: ${voucherUrl}`

  const replyText = partnerTpl?.textTemplate
    ? renderTemplate(partnerTpl.textTemplate, sharedVars)
    : // Fallback defensivo
      `Voucher emitido para ${stateRow.value.recipient_name}.\nPainel: ${partnerPanelUrl}`

  return {
    replyText,
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
