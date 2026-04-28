/**
 * Backwards-compat barrel · re-exporta tipos, mappers e helpers que viviam
 * neste arquivo monolitico antes do refator de Camada 4 (audit 2026-04-28).
 *
 * Estrutura nova:
 *   - types/   · declaracoes de tipo puras (enums, DTOs, inputs, RPC results)
 *   - mappers/ · funcoes snake → camel, uma por tabela
 *   - helpers/ · utilitarios cross-repo (matriz de phase, items shape, RPC result mapper)
 *
 * Callers podem importar do path antigo (`./types`) sem mudancas. Novos
 * consumidores devem preferir paths granulares (`./types/dtos`, `./mappers/lead`)
 * pra reduzir superficie de cada modulo.
 */

export * from './types/enums'
export * from './types/dtos'
export * from './types/inputs'
export * from './types/rpc'

export {
  mapLeadRow,
  mapPatientRow,
  mapAppointmentRow,
  mapOrcamentoRow,
  mapPhaseHistoryRow,
  mapConversationRow,
  mapMessageRow,
  mapTemplateRow,
} from './mappers'

export {
  LEAD_PHASE_TRANSITIONS,
  isPhaseTransitionAllowed,
  orcamentoItemsToDbShape,
  mapRpcResult,
} from './helpers'
