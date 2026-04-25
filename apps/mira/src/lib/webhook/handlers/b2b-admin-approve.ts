/**
 * Handler: admin.approve
 *
 * Admin aprovando candidatura · mirror do clinic-dashboard
 * b2b-mira-router#handleAdminApprove + decisao P0.5 Alden:
 *   - resolve parceria via b2b_partnerships (status pendente) · NAO usa
 *     b2b_applications (esse fluxo entra em fase posterior)
 *   - approve() chama b2b_partnership_set_status='active'
 *   - trigger trg_b2b_on_partnership_active (mig 800-03) auto-whitelista
 *     contact_phone em b2b_partnership_wa_senders se for E.164
 *   - dispara welcome via Mira Evolution (mira-mirian instance) lendo
 *     template 'partnership_welcome_text' com fallback formal hard-coded
 *   - audio TTS welcome fica pra P1b (decisao trancada)
 *
 * Multi-turn:
 *   - 0 matches → "Nao achei. Manda 'lista pendentes' pra ver os nomes."
 *   - 1 match  → aprova direto
 *   - 2+ matches → state admin_approve_select (TTL 5min) · admin escolhe 1-N
 *
 * Gate: somente role='admin'. Se chegar com role='partner', cai em handleOther.
 */

import {
  STATE_KEY,
  TTL_ADMIN_SELECT_MIN,
} from '../state-machine'
import type { Handler, HandlerResult } from './types'
import type { B2BPartnershipDTO } from '@clinicai/repositories'

interface ApproveSelectState {
  candidates: Array<{ id: string; name: string; slug: string }>
  flow: 'approve'
}

const APPROVE_RX = /\baprov(o|ar|a|ada|ado|aco|acao|ação)\b/i

function extractIdentifier(text: string): string {
  // Remove o verbo + filler comum, fica com identifier candidato
  let t = String(text || '').trim()
  t = t.replace(/^.*?\baprov(?:o|ar|a|ada|ado|aco|acao|ação)\b\s*/i, '')
  t = t.replace(/\b(a|o|as|os|candidat[oa]s?|parceir[oa]s?|essa|esse|aquela|aquele)\b/gi, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function isNumericChoice(text: string): number | null {
  const m = String(text || '').trim().match(/^(\d{1,2})\b/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 1 || n > 99) return null
  return n
}

function buildWelcomeText(
  partnership: B2BPartnershipDTO,
  template: string | null | undefined,
): string {
  const partnerFirst = String(partnership.contactName ?? partnership.name ?? '')
    .trim()
    .split(/\s+/)[0] || 'parceira'

  const fallback =
    `Oi *${partnerFirst}*! 💜 Aqui é da Clínica Mirian de Paula.\n\n` +
    `Sua parceria foi aprovada pela Mirian — bem-vinda ao *Círculo de Parceiras*.\n\n` +
    `Em breve volto com o passo a passo de como funciona, seu primeiro voucher pra ` +
    `experimentar e o link do seu painel.\n\n` +
    `Muito prazer! — *Mira*, assistente virtual da clínica`

  if (!template) return fallback

  return template
    .split('{parceira_first}').join(partnerFirst)
    .split('{parceira}').join(partnership.name)
    .split('{pillar}').join(partnership.pillar ?? '')
}

export const b2bAdminApproveHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text } = ctx

  if (role !== 'admin') {
    return {
      replyText: 'Esse comando é só pra admin.',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-admin-approve', error: 'not_admin' },
    }
  }

  // Verifica se existe state de selecao pendente
  const selectState = await repos.miraState.get<ApproveSelectState>(
    phone,
    STATE_KEY.ADMIN_APPROVE_SELECT,
  )
  let candidates: Array<{ id: string; name: string; slug: string }> | null = null
  let identifier = ''

  if (selectState && selectState.value?.candidates?.length > 0) {
    // Admin esta no meio da escolha · texto deveria ser numero
    const choice = isNumericChoice(text)
    if (choice && choice <= selectState.value.candidates.length) {
      const picked = selectState.value.candidates[choice - 1]
      candidates = [picked]
    } else {
      // Texto novo · trata como nova consulta · clear state e segue
      identifier = extractIdentifier(text) || text.trim()
    }
  } else {
    identifier = extractIdentifier(text)
  }

  // Resolve candidatas (se ainda nao escolhido)
  if (!candidates) {
    if (!identifier) {
      return {
        replyText:
          'Qual parceria aprovar? Me manda o nome ou slug.\n' +
          'Ex.: _aprova Clínica da Sílvia_',
        actions: [],
        stateTransitions: [
          { op: 'clear', key: STATE_KEY.ADMIN_APPROVE_SELECT },
        ],
        meta: { handler: 'b2b-admin-approve', missing: 'identifier' },
      }
    }

    const matches = await repos.b2bPartnerships.findPendingByIdentifier(
      clinicId,
      identifier,
    )

    if (matches.length === 0) {
      return {
        replyText:
          `Não achei candidatura pendente com "${identifier}".\n` +
          `Manda _lista pendentes_ pra ver os nomes exatos.`,
        actions: [],
        stateTransitions: [
          { op: 'clear', key: STATE_KEY.ADMIN_APPROVE_SELECT },
        ],
        meta: { handler: 'b2b-admin-approve', error: 'no_match', identifier },
      }
    }

    if (matches.length > 1) {
      // Pede escolha · TTL 5min
      const top = matches.slice(0, 9)
      const lines = top
        .map((m, i) => `${i + 1}. *${m.name}* (${m.status} · ${m.pillar})`)
        .join('\n')
      return {
        replyText:
          `Achei ${matches.length} candidatas com "${identifier}":\n\n` +
          `${lines}\n\n` +
          `Manda o número da que quer aprovar (1-${top.length}).`,
        actions: [],
        stateTransitions: [
          {
            op: 'set',
            key: STATE_KEY.ADMIN_APPROVE_SELECT,
            value: {
              flow: 'approve',
              candidates: top.map((m) => ({ id: m.id, name: m.name, slug: m.slug })),
            },
            ttlMinutes: TTL_ADMIN_SELECT_MIN,
          },
        ],
        meta: {
          handler: 'b2b-admin-approve',
          ambiguous: true,
          count: matches.length,
        },
      }
    }

    candidates = matches.map((m) => ({ id: m.id, name: m.name, slug: m.slug }))
  }

  // Confirma 1 candidata
  const target = candidates[0]
  const result = await repos.b2bPartnerships.approve(target.id, phone)
  if (!result.ok) {
    return {
      replyText: `Tive um problema pra aprovar (${result.error ?? 'unknown'}). Tenta de novo?`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.ADMIN_APPROVE_SELECT }],
      meta: {
        handler: 'b2b-admin-approve',
        error: 'set_status_failed',
        partnership_id: target.id,
        rpc_error: result.error,
      },
    }
  }

  // Pega DTO atualizado pra welcome
  const updated = await repos.b2bPartnerships.getById(target.id)
  const welcomePartnership = updated ?? ({
    id: target.id,
    clinicId,
    name: target.name,
    slug: target.slug,
    type: 'institutional',
    pillar: 'outros',
    category: null,
    tier: null,
    status: 'active',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactInstagram: null,
    voucherCombo: null,
    voucherValidityDays: 30,
    voucherMonthlyCap: null,
    healthColor: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as B2BPartnershipDTO)

  // Welcome text via template (DB-first)
  const tpl = await repos.b2bTemplates.getByEventKey(
    clinicId,
    'partnership_welcome_text',
    target.id,
  )
  const welcomeText = buildWelcomeText(welcomePartnership, tpl?.textTemplate ?? null)

  // Audit
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: 'admin.approve',
      intentData: { partnership_id: target.id, slug: target.slug },
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: 'admin.approve',
      rpcCalled: 'b2b_partnership_set_status:active',
      success: true,
      resultSummary: `Aprovada ${target.name} (${target.slug})`,
    },
  })

  // Action: welcome pra parceira (se contact_phone E.164)
  const contactPhone = welcomePartnership.contactPhone?.replace(/\D/g, '') ?? ''
  const actions = []
  if (contactPhone && contactPhone.length >= 10) {
    actions.push({
      kind: 'send_wa' as const,
      to: contactPhone,
      via: 'mira' as const,
      content: welcomeText,
      eventKey: 'partnership_welcome_text',
      recipientRole: 'partner' as const,
    })
  }

  const replyParts = [
    `Aprovada ✅\n*${welcomePartnership.name}* virou *active*.`,
  ]
  if (contactPhone && contactPhone.length >= 10) {
    replyParts.push(`Mandei o welcome pra ${welcomePartnership.contactName ?? 'parceira'}.`)
  } else {
    replyParts.push(`Sem contact_phone E.164 · welcome nao disparado · admin precisa avisar manualmente.`)
  }
  replyParts.push(`Painel: https://painel.miriandpaula.com.br/b2b-partners.html`)

  return {
    replyText: replyParts.join('\n\n'),
    actions,
    stateTransitions: [{ op: 'clear', key: STATE_KEY.ADMIN_APPROVE_SELECT }],
    meta: {
      handler: 'b2b-admin-approve',
      partnership_id: target.id,
      welcome_dispatched: contactPhone.length >= 10,
      template_resolved: !!tpl,
    },
  }
}
