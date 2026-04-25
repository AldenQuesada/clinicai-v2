/**
 * Handler: partner.refer_lead
 *
 * Comportamento (mirror logico do clinic-dashboard b2b-mira-router#handleReferLead
 * + decisao P0.5 Alden · grava lead com source=b2b_partnership_referral em vez
 * de cair em vpi_indication direto):
 *
 *   1. Resolve parceira via getByPartnerPhone (mesmo gate do emit_voucher)
 *   2. Extrai recipient_name + recipient_phone do texto
 *   3. Se faltar dado, pede em retry com state-less (1 turno · admin reformula)
 *   4. Se tem tudo: cria lead com:
 *        - source: 'b2b_partnership_referral'
 *        - tags:   ['b2b_referral', '<slug>']
 *        - phase:  'lead'
 *        - temperature: 'warm'
 *      e b2b_attribution apontando lead -> parceria.
 *   5. Resposta formal usando template 'referral_acknowledged' (DB-first).
 *      Fallback hard-coded curto e formal se template ausente.
 *
 * Side-effects intencionalmente sincronos · respeitar funcionalidade existente
 * (Alden): nao silencia erros · admin recebe feedback se algo falhou.
 */

import type { Handler, HandlerResult } from './types'

const PHONE_RX = /(\+?\d{10,14})/g

function firstName(full: string | null | undefined): string {
  if (!full) return 'parceira'
  return String(full).trim().split(/\s+/)[0] || 'parceira'
}

function extractRecipient(text: string): { name: string; phone: string } | null {
  const phoneMatch = text.match(PHONE_RX)
  if (!phoneMatch || phoneMatch.length === 0) return null
  const phone = phoneMatch[0].replace(/\D/g, '')

  const beforePhone = text.split(phone)[0] || ''
  const cleaned = beforePhone
    .replace(/\b(indico|indicar|indica[cç][aã]o|recomendo|encaminho|tenho\s+(uma\s+)?(amiga|cliente|lead)|conhe[cç]o|pra|para|do|da|um(a)?\b)/gi, ' ')
    .replace(/\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const name = cleaned || 'amiga'
  return { name, phone }
}

export const b2bReferLeadHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, text, pushName } = ctx

  // 1. Resolve parceria (parceira ativa precisa estar na whitelist · gate)
  const partnership = await repos.b2bPartnerships.getByPartnerPhone(clinicId, phone)
  if (!partnership) {
    return {
      replyText:
        'Hmm, não achei sua parceria ativa aqui 🤔 confere com a Mirian se está tudo certo?',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-refer-lead', error: 'partnership_not_found' },
    }
  }

  // 2. Extrai recipient
  const recipient = extractRecipient(text)
  if (!recipient || !recipient.phone || recipient.phone.length < 10) {
    return {
      replyText:
        `${firstName(partnership.contactName ?? pushName)}, ` +
        `me manda numa msg só: o *nome completo* + *WhatsApp* (com DDD) ` +
        `da pessoa que você quer indicar 💛`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-refer-lead', missing: 'recipient' },
    }
  }

  // 3. Cria lead novo com discriminator B2B
  // Boundary multi-tenant ADR-028 · clinicId vem do contexto.
  const lead = await repos.leads.create(clinicId, {
    phone: recipient.phone,
    name: recipient.name,
    phase: 'lead',
    temperature: 'warm',
    source: 'b2b_partnership_referral',
    tags: ['b2b_referral', partnership.slug].filter(Boolean) as string[],
  })

  if (!lead) {
    return {
      replyText:
        `Tive um problema pra registrar a indicação agora · pode me mandar de novo daqui a pouco? ` +
        `(Avisei a Mirian.)`,
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-refer-lead', error: 'lead_create_failed' },
    }
  }

  // 4. Cria attribution lead -> parceria (sem voucher)
  await repos.b2bAttributions.create({
    clinicId,
    partnershipId: partnership.id,
    leadId: lead.id,
    attributionType: 'referral',
    weight: 1,
    meta: {
      source: 'mira_refer_lead',
      requested_by_phone: phone,
      partner_slug: partnership.slug,
    },
  })

  // 5. Resposta · template DB-first, fallback hard-coded
  const tpl = await repos.b2bTemplates.getByEventKey(
    clinicId,
    'referral_acknowledged',
    partnership.id,
  )

  const partnerFirst = firstName(partnership.contactName ?? pushName)
  const recipientFirst = firstName(recipient.name)
  const fallback =
    `Recebi sua indicação, ${partnerFirst} 💜\n\n` +
    `Já registrei *${recipient.name}* aqui — em breve a Lara entra em contato com ` +
    `o cuidado da clínica.\n\n` +
    `Te aviso assim que ${recipientFirst} agendar.\n` +
    `— *Mira*, da Clínica Mirian de Paula`

  let replyText = fallback
  if (tpl?.textTemplate) {
    replyText = tpl.textTemplate
      .split('{parceira_first}').join(partnerFirst)
      .split('{parceira}').join(partnership.name)
      .split('{recipient_name}').join(recipient.name)
      .split('{recipient_first}').join(recipientFirst)
  }

  // 6. Audit · grava query no wa_pro_audit_log (best-effort)
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: 'partner.refer_lead',
      intentData: {
        partnership_id: partnership.id,
        partnership_slug: partnership.slug,
        lead_id: lead.id,
        recipient_phone: recipient.phone,
      },
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: 'partner.refer_lead',
      rpcCalled: 'leads.insert+b2b_attributions.insert',
      success: true,
      resultSummary: `Lead ${lead.id.slice(0, 8)} criado · attribution → ${partnership.slug}`,
    },
  })

  return {
    replyText,
    actions: [],
    stateTransitions: [],
    meta: {
      handler: 'b2b-refer-lead',
      partnership_id: partnership.id,
      lead_id: lead.id,
      recipient,
      template_resolved: !!tpl,
    },
  }
}
