/**
 * Recovery Radar · labels/tradução de failure_type + helpers de prioridade.
 * UI-only · Prompt 5. Sem lógica de negócio.
 */

export const FAILURE_TYPE_LABELS: Record<string, string> = {
  no_human_reply: 'Paciente sem resposta humana',
  late_reply: 'Resposta atrasada',
  asked_price_no_close: 'Perguntou preço e não houve fechamento',
  asked_availability_no_booking: 'Pediu horário e não foi agendado',
  price_objection_not_handled: 'Objeção de preço sem condução',
  lead_interest_ignored: 'Interesse ignorado',
  no_follow_up: 'Sem follow-up',
  post_consult_no_followup: 'Pós-consulta sem retorno',
  no_show_recovery: 'No-show para recuperar',
  reschedule_not_completed: 'Remarcação não concluída',
  medical_question_unhandled: 'Pergunta clínica pendente',
  campaign_responded_not_closed: 'Respondeu campanha sem fechamento',
  stop_or_optout_do_not_contact: 'Não contatar',
}

export function failureTypeLabel(ft: string): string {
  return FAILURE_TYPE_LABELS[ft] ?? ft
}

export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

/** Badge variant (do @clinicai/ui) por prioridade. */
export const PRIORITY_BADGE: Record<Priority, { variant: 'destructive' | 'warning' | 'info' | 'neutral'; label: string }> = {
  P0: { variant: 'destructive', label: 'P0 · urgente' },
  P1: { variant: 'warning', label: 'P1' },
  P2: { variant: 'info', label: 'P2' },
  P3: { variant: 'neutral', label: 'P3' },
}

/** Mascara telefone para exibição (mantém DDD + últimos 4). */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '•••'
  const last4 = digits.slice(-4)
  const ddd = digits.length >= 10 ? digits.slice(0, 2) : ''
  return ddd ? `(${ddd}) •••••-${last4}` : `•••••-${last4}`
}
