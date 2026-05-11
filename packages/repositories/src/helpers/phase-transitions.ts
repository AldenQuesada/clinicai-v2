/**
 * Matriz canonica de transicao de phase + helper de pre-validacao.
 *
 * ESPELHO 1:1 da RPC `_lead_phase_transition_allowed`. Mantida aqui pra UI
 * poder desabilitar fases invalidas no Kanban / dropdown sem precisar de
 * round-trip ao banco. SE A MATRIZ MUDAR NA MIG, atualizar AQUI tambem ·
 * caso contrario UI permite drag que o RPC vai rejeitar.
 *
 * Contrato canonico (Fase 1C · TS↔DB sync · 2026-05-11):
 *   lead      → agendado
 *   agendado  → paciente, orcamento, agendado (no-op = reagendar)
 *   orcamento → paciente, agendado, orcamento (no-op)
 *   paciente  → orcamento, paciente (no-op · retorno gera novo orcamento)
 *
 * Perda (perdido) NAO eh phase nessa matriz · vira `lifecycle_status` via RPC
 * `lead_lost`. Recuperacao (perdido → ativo) tambem nao passa por aqui.
 */

import type { LeadPhase } from '../types/enums'

export const LEAD_PHASE_TRANSITIONS: Record<LeadPhase, readonly LeadPhase[]> = {
  lead: ['agendado'],
  agendado: ['paciente', 'orcamento', 'agendado'],
  orcamento: ['paciente', 'agendado', 'orcamento'],
  paciente: ['orcamento', 'paciente'],
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
