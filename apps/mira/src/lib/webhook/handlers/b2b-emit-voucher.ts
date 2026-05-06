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
import { canonicalPhoneBR } from '@clinicai/utils'
import type { Handler, HandlerResult } from './types'

/**
 * Audit 2026-05-06: regex tolerante a pontuação (espaços, hífens, parênteses,
 * pontos) entre dígitos. Cobre formatos BR comuns:
 *   4499780779 · 449978-0779 · 44 9978-0779 · (44) 9978-0779 ·
 *   44999780779 · +55 44 99978-0779 · 044 9978-0779 (operadora 0).
 *
 * Captura o trecho bruto · normalização real fica com canonicalPhoneBR
 * (validação 10-13 dígitos BR + adiciona DDI 55 + adiciona 9 do celular).
 */
const PHONE_RX = /(?:\+?55[\s.\-]*)?\(?\s*\d{2}\s*\)?[\s.\-]*\d{4,5}[\s.\-]?\d{4}/g

/**
 * Audit 2026-05-06 · regex fuzzy pra "voucher" cobrir typos comuns:
 *   voucher · voucers · voucers · voucer · vocher · vouher · vauher · vaucher
 * Usado pra remover palavras-comando do nome extraído.
 */
const VOUCHER_TYPO_RX_SOURCE = 'v[oa]u?[cs]?h?er[s]?'

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

/**
 * Sanity check pós-canonicalPhoneBR: filtra CPF/CEP/etc disfarçados de phone.
 * Telefone BR válido tem 1º dígito local (após DDI+DDD) entre 2-9:
 *   2-5 · fixo · 6-9 · celular (9 sempre celular moderno).
 * '0'/'1' indica não-phone (ex: CPF "11122233344" → norm "5511122233344" ·
 * 5º char = '1' · rejeitado).
 */
function isLikelyValidLocalPhone(canonical: string): boolean {
  if (canonical.length < 12 || canonical.length > 13) return false
  const localFirst = canonical.charAt(4)
  return '23456789'.includes(localFirst)
}

function extractRecipient(text: string): { name: string; phone: string } | null {
  const phoneMatches = text.match(PHONE_RX)
  if (!phoneMatches || phoneMatches.length === 0) return null

  // Itera candidatos · usa o primeiro que normaliza como phone BR válido.
  // Filtros:
  //   1. Leading-0 com 11+ dígitos = CPF/CEP/operadora prefix · skip.
  //   2. canonicalPhoneBR retorna '' pra inválido (10-13 dígitos BR).
  //   3. isLikelyValidLocalPhone bloqueia 5º char '0'/'1' (CPF tipo "11122233344").
  let phone = ''
  let phoneRaw = ''
  for (const candidate of phoneMatches) {
    const digitsOnly = candidate.replace(/\D/g, '')
    // CPF nunca começa com 0 + 10+ dígitos · operator prefix legacy "0XX..."
    // teria 13+ chars · 11 chars com leading 0 = quase certo CPF.
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) continue
    const canonical = canonicalPhoneBR(candidate)
    if (canonical && isLikelyValidLocalPhone(canonical)) {
      phone = canonical
      phoneRaw = candidate
      break
    }
  }
  if (!phone) return null

  // Nome = trecho ANTES do match raw, com palavras-comando removidas.
  // Cobre typos do voucher (vouher/vaucher/voucer/vocher/vauher) + sinônimos
  // (cupom/presente/cortesia) + verbos (emit/manda/envia/gera/cria) +
  // intent-prefix (quero/queria/preciso/posso/gostaria) + separadores
  // (pra/para/p/) + canais (whatsapp/zap).
  const beforePhone = text.split(phoneRaw)[0] || ''
  // Separador "p/" não funciona em `\b...\b` pq '/' é non-word e o char
  // seguinte (espaço) também é non-word → sem boundary. Strip antes.
  const stripCommands = new RegExp(
    `\\b(emit(e|ir)|gera(r)?|fazer?|manda(r)?|envia(r)?|presentei?a(r)?|cria(r)?|quero|queria|preciso|posso|gostaria|um\\s+|uma\\s+|o\\s+|a\\s+|${VOUCHER_TYPO_RX_SOURCE}|cupom|cupons|presente[s]?|cortesia[s]?|pra|para|whatsapp|zap)\\b`,
    'gi',
  )
  const cleaned = beforePhone
    .replace(/\bp\//gi, ' ')
    .replace(stripCommands, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const name = cleaned || 'amiga'
  return { name, phone }
}

// Audit 2026-05-06: extractRecipient exportado pra testes unitários.
export const __testables = { extractRecipient, PHONE_RX, isLikelyValidLocalPhone }

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
