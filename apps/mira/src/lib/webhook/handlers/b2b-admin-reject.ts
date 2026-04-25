/**
 * Handler: admin.reject
 *
 * Admin rejeitando candidatura · multi-turno:
 *   1. "rejeita Sílvia" (sem motivo) → resolve candidata + state
 *      admin_reject_reason (TTL 5min) · pede "Por que tá rejeitando?"
 *   2. Proximo turno (state ativo) → captura motivo · chama reject() ·
 *      status='closed' com reason='rejected:<motivo>|by:<phone>'
 *
 * Multi-match:
 *   - 0 matches → erro educado
 *   - 1 match  → state admin_reject_reason (com partnership_id pinned)
 *   - 2+       → state admin_reject_select (TTL 5min) · admin escolhe
 *                → proximo turno: numero → state admin_reject_reason
 *
 * Gate: somente role='admin'.
 *
 * Schema canonico nao tem 'rejected' separado · usa 'closed' + reason.
 * Convencao operacional alinhada com clinic-dashboard.
 */

import {
  STATE_KEY,
  TTL_ADMIN_SELECT_MIN,
} from '../state-machine'
import type { Handler, HandlerResult } from './types'

interface RejectSelectState {
  candidates: Array<{ id: string; name: string; slug: string }>
  flow: 'reject'
}

interface RejectReasonState {
  partnership_id: string
  partnership_name: string
  partnership_slug: string
}

const TTL_REJECT_REASON_MIN = 5

function extractIdentifier(text: string): string {
  let t = String(text || '').trim()
  t = t.replace(
    /^.*?\b(rejeit(?:o|ar|a|ada|ado)|recus(?:o|ar|a|ada|ado)|neg(?:o|ar|a|ada|ado))\b\s*/i,
    '',
  )
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

export const b2bAdminRejectHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text } = ctx

  if (role !== 'admin') {
    return {
      replyText: 'Esse comando é só pra admin.',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-admin-reject', error: 'not_admin' },
    }
  }

  // Turno 2: state admin_reject_reason ativo · texto e o motivo
  const reasonState = await repos.miraState.get<RejectReasonState>(
    phone,
    STATE_KEY.ADMIN_REJECT_REASON,
  )
  if (reasonState && reasonState.value?.partnership_id) {
    const reason = String(text || '').trim()
    if (!reason || reason.length < 3) {
      return {
        replyText:
          `Me manda o motivo da rejeição (uma frase curta serve · vou anotar pra Mirian).`,
        actions: [],
        stateTransitions: [],
        meta: { handler: 'b2b-admin-reject', error: 'reason_too_short' },
      }
    }

    const result = await repos.b2bPartnerships.reject(
      reasonState.value.partnership_id,
      reason,
      phone,
    )
    if (!result.ok) {
      return {
        replyText: `Tive um problema pra rejeitar (${result.error ?? 'unknown'}). Tenta de novo?`,
        actions: [],
        stateTransitions: [{ op: 'clear', key: STATE_KEY.ADMIN_REJECT_REASON }],
        meta: {
          handler: 'b2b-admin-reject',
          error: 'set_status_failed',
          partnership_id: reasonState.value.partnership_id,
          rpc_error: result.error,
        },
      }
    }

    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'admin.reject',
        intentData: {
          partnership_id: reasonState.value.partnership_id,
          slug: reasonState.value.partnership_slug,
          reason,
        },
        status: 'sent',
      },
      audit: {
        clinicId,
        phone,
        query: text,
        intent: 'admin.reject',
        rpcCalled: 'b2b_partnership_set_status:closed',
        success: true,
        resultSummary: `Rejeitada ${reasonState.value.partnership_name} · motivo: ${reason.slice(0, 100)}`,
      },
    })

    return {
      replyText:
        `Rejeitada ⛔️\n*${reasonState.value.partnership_name}* virou *closed*.\n\n` +
        `Motivo registrado: _${reason}_\n\n` +
        `Mirian fica notificada via painel.`,
      actions: [],
      stateTransitions: [{ op: 'clear', key: STATE_KEY.ADMIN_REJECT_REASON }],
      meta: {
        handler: 'b2b-admin-reject',
        partnership_id: reasonState.value.partnership_id,
        reason,
      },
    }
  }

  // Turno multi-match: state admin_reject_select ativo · texto e numero
  const selectState = await repos.miraState.get<RejectSelectState>(
    phone,
    STATE_KEY.ADMIN_REJECT_SELECT,
  )
  let candidates: Array<{ id: string; name: string; slug: string }> | null = null
  let identifier = ''

  if (selectState && selectState.value?.candidates?.length > 0) {
    const choice = isNumericChoice(text)
    if (choice && choice <= selectState.value.candidates.length) {
      const picked = selectState.value.candidates[choice - 1]
      candidates = [picked]
    } else {
      identifier = extractIdentifier(text) || text.trim()
    }
  } else {
    identifier = extractIdentifier(text)
  }

  // Resolve candidatas
  if (!candidates) {
    if (!identifier) {
      return {
        replyText:
          'Qual parceria rejeitar? Me manda o nome ou slug.\n' +
          'Ex.: _rejeita Clínica da Sílvia_',
        actions: [],
        stateTransitions: [
          { op: 'clear', key: STATE_KEY.ADMIN_REJECT_SELECT },
        ],
        meta: { handler: 'b2b-admin-reject', missing: 'identifier' },
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
        stateTransitions: [{ op: 'clear', key: STATE_KEY.ADMIN_REJECT_SELECT }],
        meta: { handler: 'b2b-admin-reject', error: 'no_match', identifier },
      }
    }

    if (matches.length > 1) {
      const top = matches.slice(0, 9)
      const lines = top
        .map((m, i) => `${i + 1}. *${m.name}* (${m.status} · ${m.pillar})`)
        .join('\n')
      return {
        replyText:
          `Achei ${matches.length} candidatas com "${identifier}":\n\n` +
          `${lines}\n\n` +
          `Manda o número da que quer rejeitar (1-${top.length}).`,
        actions: [],
        stateTransitions: [
          {
            op: 'set',
            key: STATE_KEY.ADMIN_REJECT_SELECT,
            value: {
              flow: 'reject',
              candidates: top.map((m) => ({ id: m.id, name: m.name, slug: m.slug })),
            },
            ttlMinutes: TTL_ADMIN_SELECT_MIN,
          },
        ],
        meta: {
          handler: 'b2b-admin-reject',
          ambiguous: true,
          count: matches.length,
        },
      }
    }

    candidates = matches.map((m) => ({ id: m.id, name: m.name, slug: m.slug }))
  }

  // 1 candidata resolvida · pede motivo
  const target = candidates[0]
  const reasonStateValue: RejectReasonState = {
    partnership_id: target.id,
    partnership_name: target.name,
    partnership_slug: target.slug,
  }

  return {
    replyText:
      `Pra rejeitar *${target.name}* preciso do motivo.\n` +
      `Me manda uma frase curta (vou registrar e a Mirian vê depois).`,
    actions: [],
    stateTransitions: [
      { op: 'clear', key: STATE_KEY.ADMIN_REJECT_SELECT },
      {
        op: 'set',
        key: STATE_KEY.ADMIN_REJECT_REASON,
        value: reasonStateValue as unknown as Record<string, unknown>,
        ttlMinutes: TTL_REJECT_REASON_MIN,
      },
    ],
    meta: {
      handler: 'b2b-admin-reject',
      stage: 'await_reason',
      partnership_id: target.id,
    },
  }
}
