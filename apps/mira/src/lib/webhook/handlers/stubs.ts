/**
 * Stubs · ja nao tem stubs ativos em P0.5 · todos os handlers foram portados
 * pra full. Esse arquivo segue existindo apenas pra hospedar admin.help, que
 * e um menu estatico (nao tem state nem side-effects).
 *
 * Quando algum handler novo precisar de fallback estilo stub, voltar a usar
 * makeStub aqui (helper removido junto com os ultimos stubs).
 */

import type { Handler, HandlerResult } from './types'

export const b2bAdminHelpHandler: Handler = async (): Promise<HandlerResult> => ({
  replyText:
    'Oi! Sou a Mira, posso te ajudar com:\n\n' +
    '*B2B:*\n' +
    '• _aprova [nome]_ · ativa parceria pendente\n' +
    '• _rejeita [nome]_ · rejeita (vou pedir motivo)\n' +
    '• _criar parceria_ · wizard pra cadastrar nova\n' +
    '• _emite voucher pra [nome] [phone]_\n' +
    '• _indico [nome] [phone]_\n\n' +
    '*Operacional:*\n' +
    '• _agenda hoje_ · _agenda da semana_\n' +
    '• _quanto faturei essa semana?_\n' +
    '• _quem é [nome]?_\n\n' +
    'Manda do jeito que vier · texto ou áudio 💛',
  actions: [],
  stateTransitions: [],
  meta: { handler: 'admin-help' },
})
