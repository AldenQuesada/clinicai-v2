/**
 * Barrel dos mappers snake_case → camelCase.
 *
 * Cada arquivo cobre 1 tabela. Mappers nunca expoem row bruto pra service/UI
 * (ADR-005 boundary).
 */

export { mapLeadRow } from './lead'
export { mapPatientRow } from './patient'
export { mapAppointmentRow } from './appointment'
export { mapOrcamentoRow } from './orcamento'
export { mapPhaseHistoryRow } from './phase-history'
export { mapConversationRow } from './conversation'
export { mapMessageRow } from './message'
export { mapTemplateRow } from './template'
