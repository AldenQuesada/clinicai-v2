/**
 * Barrel dos helpers cross-repository (puros, sem acesso a DB).
 */

export { LEAD_PHASE_TRANSITIONS, isPhaseTransitionAllowed } from './phase-transitions'
export { orcamentoItemsToDbShape } from './orcamento-items'
export { mapRpcResult } from './rpc-result'
export {
  APPOINTMENT_STATE_MACHINE,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  SAME_DAY_ONLY_STATUSES,
  BLOCKS_CALENDAR,
  BLOCK_REASONS,
  PAYMENT_METHODS,
  isAppointmentTransitionAllowed,
  isTerminalStatus,
  timeToMinutes,
  rangesOverlap,
  appointmentsOverlap,
  type BlockReason,
  type PaymentMethod,
} from './appointment-state'
