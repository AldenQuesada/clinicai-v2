/**
 * Matriz canonica de transicao de phase + helper de pre-validacao.
 *
 * ESPELHO 1:1 da RPC `_lead_phase_transition_allowed` (mig 65). Mantida aqui
 * pra UI poder desabilitar fases invalidas no Kanban / dropdown sem precisar
 * de round-trip ao banco. SE A MATRIZ MUDAR NA MIG, atualizar AQUI tambem ·
 * caso contrario UI permite drag que o RPC vai rejeitar.
 *
 * Verbatim do CASE no SQL:
 *   lead       → agendado, perdido
 *   agendado   → reagendado, compareceu, perdido, agendado (no-op)
 *   reagendado → agendado, compareceu, perdido, reagendado
 *   compareceu → paciente, orcamento, perdido, compareceu
 *   orcamento  → paciente, agendado, perdido, orcamento
 *   paciente   → perdido, paciente
 *   perdido    → lead, agendado, reagendado, perdido (recovery)
 */

import type { LeadPhase } from '../types/enums'

export const LEAD_PHASE_TRANSITIONS: Record<LeadPhase, readonly LeadPhase[]> = {
  lead: ['agendado', 'perdido'],
  agendado: ['reagendado', 'compareceu', 'perdido', 'agendado'],
  reagendado: ['agendado', 'compareceu', 'perdido', 'reagendado'],
  compareceu: ['paciente', 'orcamento', 'perdido', 'compareceu'],
  orcamento: ['paciente', 'agendado', 'perdido', 'orcamento'],
  paciente: ['perdido', 'paciente'],
  perdido: ['lead', 'agendado', 'reagendado', 'perdido'],
} as const

/**
 * Verifica se uma transicao de phase eh permitida pela matriz canonica.
 * Espelho da RPC `_lead_phase_transition_allowed` · usar aqui pra
 * pre-validacao client-side (Kanban drag, dropdown desabilitado).
 *
 * RPC sempre eh chamada como gate final · esse helper eh otimizacao UX.
 */
export function isPhaseTransitionAllowed(from: LeadPhase, to: LeadPhase): boolean {
  return LEAD_PHASE_TRANSITIONS[from]?.includes(to) ?? false
}
