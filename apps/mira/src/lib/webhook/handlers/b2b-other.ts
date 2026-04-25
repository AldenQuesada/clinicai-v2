/**
 * Handler: partner.other / admin.other (catch-all)
 *
 * Quando classifier (Tier1 regex + Tier2 Haiku) nao reconheceu intent ·
 * resposta com menu dinamico baseado em role.
 *
 * Comportamento:
 *   - role='partner' → lista intents disponiveis (emit voucher, refer lead,
 *                       feedback) · texto curto, formal
 *   - role='admin'   → lista intents admin (aprovar, rejeitar, criar parceria,
 *                       agenda, financeiro) · curto + dica de comandos
 *   - role=null      → silent (handler nao deveria ser chamado · route.ts
 *                       bloqueia antes · defense-in-depth)
 *
 * Audit: grava unclassified_text pra Alden poder revisar e adicionar regex
 * no Tier 1 ou exemplo no prompt do Haiku depois.
 */

import type { Handler, HandlerResult } from './types'

const PARTNER_MENU =
  'Recebi sua mensagem 💛\n\n' +
  'Posso te ajudar com:\n' +
  '• *Voucher pra alguém* · _"voucher pra Maria 44 99999-9999"_\n' +
  '• *Indicar lead* · _"indico Maria Silva 44 99999-9999"_\n' +
  '• *Feedback* · me conta como foi um atendimento ou voucher\n\n' +
  'Manda do jeito que vier · texto ou áudio.'

const ADMIN_MENU =
  'Te ouvi! Comandos disponíveis:\n\n' +
  '*B2B (parcerias):*\n' +
  '• _aprova [nome]_ · ativa parceria\n' +
  '• _rejeita [nome]_ · rejeita (vou pedir motivo)\n' +
  '• _criar parceria_ · wizard 7-turno pra cadastrar nova\n' +
  '• _emite voucher pra [nome] [phone]_ · se você está em whitelist\n\n' +
  '*Operacional (agenda/financeiro):*\n' +
  '• _agenda hoje_ · _agenda amanhã_ · _agenda da semana_\n' +
  '• _faturei essa semana?_ · _quanto faturei mês?_\n' +
  '• _quem é [nome]?_ · _saldo da [paciente]?_\n' +
  '• _ajuda_ · esse menu\n\n' +
  'Pode mandar áudio também 💛'

export const b2bOtherHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text } = ctx

  if (role === null) {
    // Defense-in-depth · route.ts ja bloqueia null antes daqui
    return {
      replyText: '',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-other', error: 'silent_no_role' },
    }
  }

  const replyText = role === 'admin' ? ADMIN_MENU : PARTNER_MENU

  // Audit · marca como unclassified pra revisao posterior
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: role === 'admin' ? 'admin.other' : 'partner.other',
      intentData: {
        unclassified_text: text.slice(0, 500),
        role,
      },
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: role === 'admin' ? 'admin.other' : 'partner.other',
      success: true,
      resultSummary: `Menu fallback enviado · role=${role}`,
    },
  })

  return {
    replyText,
    actions: [],
    stateTransitions: [],
    meta: {
      handler: 'b2b-other',
      role,
      unclassified: true,
    },
  }
}
