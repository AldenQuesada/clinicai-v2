/**
 * Matriz canonica de transicao de status appointment + helpers + labels.
 *
 * ESPELHO 1:1 da RPC `_appointment_status_transition_allowed` (mig 72).
 * Mantida aqui pra UI poder desabilitar acoes invalidas no calendario /
 * dropdown sem precisar de round-trip ao banco.
 *
 * Espelha clinic-dashboard legacy js/agenda-smart.constants.js
 * (STATE_MACHINE + STATUS_LABELS + STATUS_COLORS).
 *
 * SE A MATRIZ MUDAR NA MIG, atualizar AQUI tambem · caso contrario UI
 * permite acao que o RPC vai rejeitar.
 */

import type { AppointmentStatus } from '../types/enums'

// ── State Machine ──────────────────────────────────────────────────────────

export const APPOINTMENT_STATE_MACHINE: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  agendado: [
    'aguardando_confirmacao',
    'confirmado',
    'remarcado',
    'cancelado',
    'no_show',
    'agendado',
  ],
  aguardando_confirmacao: [
    'confirmado',
    'remarcado',
    'cancelado',
    'no_show',
    'aguardando_confirmacao',
  ],
  confirmado: [
    'aguardando',
    'remarcado',
    'cancelado',
    'no_show',
    'pre_consulta',
    'confirmado',
  ],
  pre_consulta: [
    'aguardando',
    'na_clinica',
    'cancelado',
    'no_show',
    'pre_consulta',
  ],
  aguardando: ['na_clinica', 'no_show', 'cancelado', 'aguardando'],
  na_clinica: ['em_consulta', 'em_atendimento', 'na_clinica'],
  em_consulta: ['em_atendimento', 'finalizado', 'em_consulta'],
  em_atendimento: ['finalizado', 'cancelado', 'na_clinica', 'em_atendimento'],
  finalizado: [], // terminal
  remarcado: ['agendado', 'cancelado', 'remarcado'],
  cancelado: [], // terminal
  no_show: [], // terminal
  bloqueado: ['cancelado', 'bloqueado'], // block time
} as const

/**
 * Verifica se transicao de status eh permitida pela matriz canonica.
 * Espelho da RPC `_appointment_status_transition_allowed` · usar pra
 * pre-validacao client-side. RPC continua sendo gate final.
 */
export function isAppointmentTransitionAllowed(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return APPOINTMENT_STATE_MACHINE[from]?.includes(to) ?? false
}

/**
 * Status terminais · UI desabilita botoes de mudanca de status
 * (so soft-delete admin restaria).
 */
export function isTerminalStatus(status: AppointmentStatus): boolean {
  return status === 'finalizado' || status === 'cancelado' || status === 'no_show'
}

/**
 * Status que SOMENTE valem no dia atual · UI bloqueia escolher esses
 * em criacao/edit pra data futura. Espelha SAME_DAY_ONLY_STATUSES legacy.
 */
export const SAME_DAY_ONLY_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'aguardando',
  'na_clinica',
  'em_consulta',
  'em_atendimento',
])

/**
 * Status que BLOQUEIAM o calendario (overlap check usa estes).
 * Cancelado/no_show/finalizado liberam o slot.
 */
export const BLOCKS_CALENDAR: ReadonlySet<AppointmentStatus> = new Set([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'pre_consulta',
  'aguardando',
  'na_clinica',
  'em_consulta',
  'em_atendimento',
  'remarcado',
  'bloqueado',
])

// ── Labels PT-BR (espelha STATUS_LABELS legacy) ────────────────────────────

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguard. Confirmação',
  confirmado: 'Confirmado',
  pre_consulta: 'Pré-consulta',
  aguardando: 'Aguardando',
  na_clinica: 'Na Clínica',
  em_consulta: 'Em Consulta',
  em_atendimento: 'Em Atendimento',
  finalizado: 'Finalizado',
  remarcado: 'Remarcado',
  cancelado: 'Cancelado',
  no_show: 'Não Compareceu',
  bloqueado: 'Bloqueado',
}

// ── Cores hex (espelha STATUS_COLORS legacy · pra calendario) ──────────────
//
// `bg` usado no fill do slot · `color` no texto/border.
// Tokens nao-Mirian (cores funcionais standard) · UI converte pra HSL var
// se precisar dark theme melhor.

export const APPOINTMENT_STATUS_COLORS: Record<
  AppointmentStatus,
  { color: string; bg: string }
> = {
  agendado: { color: '#3B82F6', bg: '#EFF6FF' },
  aguardando_confirmacao: { color: '#F59E0B', bg: '#FFFBEB' },
  confirmado: { color: '#10B981', bg: '#ECFDF5' },
  pre_consulta: { color: '#F97316', bg: '#FFF7ED' },
  aguardando: { color: '#8B5CF6', bg: '#EDE9FE' },
  na_clinica: { color: '#06B6D4', bg: '#ECFEFF' },
  em_consulta: { color: '#0EA5E9', bg: '#F0F9FF' },
  em_atendimento: { color: '#0284C7', bg: '#E0F2FE' },
  finalizado: { color: '#059669', bg: '#D1FAE5' },
  remarcado: { color: '#A855F7', bg: '#FAF5FF' },
  cancelado: { color: '#DC2626', bg: '#FEF2F2' },
  no_show: { color: '#991B1B', bg: '#FEE2E2' },
  bloqueado: { color: '#6B7280', bg: '#F3F4F6' },
}

// ── Block time reasons (espelha BLOCK_REASONS legacy) ──────────────────────

export const BLOCK_REASONS = [
  { value: 'almoco', label: 'Almoço' },
  { value: 'intervalo', label: 'Intervalo' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'ferias', label: 'Férias' },
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'outro', label: 'Outro' },
] as const

export type BlockReason = (typeof BLOCK_REASONS)[number]['value']

// ── Payment methods (espelha PAYMENT_METHODS legacy) ───────────────────────

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'parcelado', label: 'Parcelado' },
  { value: 'entrada_saldo', label: 'Entrada + Saldo' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'link', label: 'Link Pagamento' },
  { value: 'cortesia', label: 'Cortesia' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

// ── Helpers de tempo (espelha _toMins/_overlap legacy) ─────────────────────

/**
 * Converte HH:MM ou HH:MM:SS pra minutos do dia (0-1440).
 * Pra comparacoes rapidas de overlap.
 */
export function timeToMinutes(time: string): number {
  const parts = time.split(':')
  if (parts.length < 2) return 0
  const h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  return h * 60 + m
}

/**
 * Verifica overlap entre 2 ranges de minutos (s1-e1) vs (s2-e2).
 * Strict overlap · ranges adjacentes (e1=s2) NAO contam como overlap.
 */
export function rangesOverlap(
  s1: number,
  e1: number,
  s2: number,
  e2: number,
): boolean {
  return s1 < e2 && s2 < e1
}

/**
 * Verifica se 2 appointments tem overlap de tempo · same date assumido.
 * Caller filtra antes por mesma data + mesmo prof/sala/paciente.
 */
export function appointmentsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return rangesOverlap(
    timeToMinutes(a.startTime),
    timeToMinutes(a.endTime),
    timeToMinutes(b.startTime),
    timeToMinutes(b.endTime),
  )
}
