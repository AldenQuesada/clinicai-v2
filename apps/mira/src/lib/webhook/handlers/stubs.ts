/**
 * Stubs · handlers ainda nao portados em P0.
 *
 * Cada um retorna mensagem de fallback educada e pinga audit pra Alden ver
 * volume. Implementacao completa entra em sequencia da P0.5 (commits 13-15
 * do plano de fatiamento).
 *
 * IMPORTANTE: nao silenciar · responde algo util pra parceira/admin enquanto
 * a feature e portada.
 */

import type { Handler, HandlerResult } from './types'

const PARTNER_FALLBACK =
  'Recebi sua mensagem 💛 essa funcionalidade tá em finalização — me dá um momento que vou te chamar com a Mirian, ok?'

const ADMIN_FALLBACK =
  'Te ouvi! Esse comando ainda tá em rota P0.5 do deploy clinicai-v2. ' +
  'Por enquanto: emitir/aprovar voucher e indicar lead já funcionam. ' +
  'Resto eu retomo na próxima onda.'

function makeStub(name: string, replyText: string): Handler {
  return async (ctx): Promise<HandlerResult> => ({
    replyText,
    actions: [],
    stateTransitions: [],
    meta: { handler: name, stub: true, intent: ctx.intent },
  })
}

export const b2bFeedbackReceivedHandler = makeStub(
  'b2b-feedback-received',
  'Que ótimo! Adoro ouvir 💛 já anotei pra Mirian saber também.',
)

export const b2bAdminHelpHandler: Handler = async (): Promise<HandlerResult> => ({
  replyText:
    'Oi! Sou a Mira, posso te ajudar com:\n' +
    '• Emitir voucher · _"emite voucher pra <nome> <telefone>"_\n' +
    '• Indicar lead · _"indico fulana"_\n' +
    '• Cadastro parceria (P0.5)\n' +
    '• Aprovar/rejeitar candidatura (P0.5)\n' +
    '• Agenda/financeiro (P0.5)\n\n' +
    'Manda do jeito que vier · texto ou áudio 💛',
  actions: [],
  stateTransitions: [],
  meta: { handler: 'admin-help' },
})

export const b2bOtherHandler: Handler = async (ctx): Promise<HandlerResult> => ({
  replyText:
    ctx.role === 'partner'
      ? PARTNER_FALLBACK
      : ADMIN_FALLBACK,
  actions: [],
  stateTransitions: [],
  meta: { handler: 'b2b-other', role: ctx.role },
})
