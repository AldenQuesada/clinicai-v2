/**
 * Handler: partner.feedback_received
 *
 * Parceira agradece/confirma evento recente (voucher, indicacao, atendimento) ·
 * mirror logico do clinic-dashboard b2b-mira-router#handleFeedbackReceived,
 * com o upgrade P0.5 de gravar o feedback em b2b_partnership_comments
 * (mig 0300 ja em prod) usando RPC b2b_comment_add.
 *
 * Texto extra (alem do default "obrigada/recebeu/funcionou") vai como body
 * do comentario · gera trail pra Mirian ler depois no painel da parceria.
 *
 * Resposta formal · template DB-first 'feedback_acknowledged' com fallback
 * hard-coded curto · NAO repete menu (Alden 2026-04-24: nao interferir).
 *
 * Trigger b2b_partnership_health_snapshot e cron-driven · NAO disparado aqui
 * (deixa cron fazer · evita race + simplifica handler).
 */

import type { Handler, HandlerResult } from './types'

function firstName(full: string | null | undefined): string {
  if (!full) return ''
  return String(full).trim().split(/\s+/)[0] || ''
}

export const b2bFeedbackReceivedHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text, pushName } = ctx

  if (role !== 'partner') {
    // Admin/unknown nao deveriam chegar aqui · cai em outro handler
    return {
      replyText: '💛',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-feedback-received', error: 'wrong_role', role },
    }
  }

  const partnership = await repos.b2bPartnerships.getByPartnerPhone(clinicId, phone)
  if (!partnership) {
    // Sem parceria ativa · so agradece sem registrar comment
    return {
      replyText: '💜 Obrigada pelo retorno!',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-feedback-received', error: 'partnership_not_found' },
    }
  }

  // Anota feedback em b2b_partnership_comments
  const authorName = partnership.contactName ?? pushName ?? 'parceira'
  const commentBody = `[mira:feedback] ${text}`.slice(0, 1000)
  const commentResult = await repos.b2bPartnerships.addComment(
    partnership.id,
    commentBody,
    authorName,
  )

  // Resposta formal · template DB-first
  const tpl = await repos.b2bTemplates.getByEventKey(
    clinicId,
    'feedback_acknowledged',
    partnership.id,
  )

  const partnerFirst = firstName(partnership.contactName ?? pushName) || 'parceira'
  const fallback =
    `💜 ${partnerFirst}, isso aqui faz a diferença.\n\n` +
    `Sigo de olho. Quando tiver outra pessoa pra cuidar com a gente, é só me chamar — ` +
    `registro e cuido da sequência por aqui.`

  let replyText = fallback
  if (tpl?.textTemplate) {
    replyText = tpl.textTemplate
      .split('{parceira_first}').join(partnerFirst)
      .split('{parceira}').join(partnership.name)
  }

  // Audit (best-effort)
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: 'partner.feedback_received',
      intentData: {
        partnership_id: partnership.id,
        slug: partnership.slug,
        comment_id: commentResult.id ?? null,
        comment_persisted: commentResult.ok,
      },
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: 'partner.feedback_received',
      rpcCalled: 'b2b_comment_add',
      success: commentResult.ok,
      resultSummary: `Feedback de ${partnership.name} registrado · ${text.slice(0, 80)}`,
      errorMessage: commentResult.error ?? null,
    },
  })

  return {
    replyText,
    actions: [],
    stateTransitions: [],
    meta: {
      handler: 'b2b-feedback-received',
      partnership_id: partnership.id,
      comment_id: commentResult.id ?? null,
      template_resolved: !!tpl,
    },
  }
}
