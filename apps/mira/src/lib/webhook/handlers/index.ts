/**
 * Handler dispatcher · mapeia Intent → Handler.
 *
 * Tem prioridade especial pra confirmacoes (state voucher_confirm ativo bypassa
 * o classifier · "sim"/"nao" curto vai pro b2bVoucherConfirmHandler).
 */

import type { Intent } from '../intent-classifier'
import type { Handler } from './types'
import { b2bEmitVoucherHandler } from './b2b-emit-voucher'
import { b2bVoucherConfirmHandler } from './b2b-voucher-confirm'
import { b2bReferLeadHandler } from './b2b-refer-lead'
import { b2bAdminApproveHandler } from './b2b-admin-approve'
import { b2bAdminRejectHandler } from './b2b-admin-reject'
import { b2bAdminQueryHandler } from './b2b-admin-query'
import { b2bCreatePartnershipHandler } from './b2b-create-partnership'
import { b2bFeedbackReceivedHandler } from './b2b-feedback-received'
import { b2bOtherHandler } from './b2b-other'
import {
  b2bAdminHelpHandler,
} from './stubs'

export { b2bVoucherConfirmHandler }
export { shouldHandleAsConfirmation } from './b2b-voucher-confirm'
export type { Handler, HandlerContext, HandlerResult, HandlerAction, StateTransition } from './types'

export function dispatchHandler(intent: Intent): Handler {
  switch (intent) {
    case 'partner.emit_voucher':
      return b2bEmitVoucherHandler
    case 'partner.refer_lead':
      return b2bReferLeadHandler
    case 'partner.feedback_received':
      return b2bFeedbackReceivedHandler
    case 'partner.other':
      return b2bOtherHandler

    case 'admin.approve':
      return b2bAdminApproveHandler
    case 'admin.reject':
      return b2bAdminRejectHandler
    case 'admin.create_partnership':
      return b2bCreatePartnershipHandler
    case 'admin.query':
      return b2bAdminQueryHandler
    case 'admin.help':
      return b2bAdminHelpHandler
    case 'admin.other':
      return b2bOtherHandler

    default:
      return b2bOtherHandler
  }
}
