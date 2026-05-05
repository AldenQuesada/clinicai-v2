/**
 * SLA Dra · tempo desde que a conversa foi atribuída à Mirian.
 *
 * Diferente do SLA da secretária (`computeSla` em @clinicai/repositories), que
 * compara última msg do paciente vs última resposta humana. O SLA Dra é mais
 * simples: conta minutos desde `assigned_at`. O timer roda até alguém clicar
 * "Devolver para Secretária" ou "Resolver" — Dra responder NÃO para o relógio
 * (a conv permanece na fila Dra até decisão explícita).
 *
 * Reaproveita a escala de cor + pulso já cravada (3/7/15/60/1440 min).
 *
 * Regra (Alden 2026-05-05):
 *   doctorMinutesWaiting = (now - assigned_at) / 60s · floor
 *   < 3min   → verde         · sem pulso
 *   < 7min   → amarelo       · pulso suave
 *   < 15min  → vermelho      · pulso forte
 *   < 60min  → critico       · pulso forte
 *   < 1440m  → atrasado_fixo · sem pulso
 *   ≥ 1440m  → antigo_parado · sem pulso
 */

import { computeSla } from '@clinicai/repositories'

export type DoctorResponseColor =
  | 'respondido'
  | 'verde'
  | 'amarelo'
  | 'vermelho'
  | 'critico'
  | 'atrasado_fixo'
  | 'antigo_parado'

export type DoctorPulseBehavior = 'none' | 'suave' | 'forte'

export interface DoctorSlaInput {
  /** ISO de wa_conversations.assigned_at quando assigned_to=DOCTOR_USER_ID */
  assignedAt: string | null | undefined
  now?: Date
}

export interface DoctorSlaFields {
  /** True se conv está atribuída à Dra com timer rodando */
  waitingDoctorResponse: boolean
  /** Minutos desde assigned_at · null se !waiting */
  doctorMinutesWaiting: number | null
  doctorResponseColor: DoctorResponseColor
  doctorShouldPulse: boolean
  doctorPulseBehavior: DoctorPulseBehavior
}

const RESPONDIDO: DoctorSlaFields = {
  waitingDoctorResponse: false,
  doctorMinutesWaiting: null,
  doctorResponseColor: 'respondido',
  doctorShouldPulse: false,
  doctorPulseBehavior: 'none',
}

/**
 * Computa SLA Dra. Reaproveita `computeSla` tratando assignedAt como o
 * "momento-zero" do relógio (mesmo papel que `lastPatientMsgAt` no SLA
 * secretaria) e null como "ninguém respondeu ainda" (lastHumanReplyAt = null).
 * Resultado tem mesma escala de cor/pulso, apenas com nome dos campos
 * prefixado com `doctor*` pra não colidir com o SLA secretaria no DTO.
 */
export function computeDoctorSla(input: DoctorSlaInput): DoctorSlaFields {
  if (!input.assignedAt) return RESPONDIDO

  const sla = computeSla({
    lastPatientMsgAt: input.assignedAt,
    lastHumanReplyAt: null,
    now: input.now,
  })

  return {
    waitingDoctorResponse: sla.waitingHumanResponse,
    doctorMinutesWaiting: sla.minutesWaiting,
    doctorResponseColor: sla.responseColor as DoctorResponseColor,
    doctorShouldPulse: sla.shouldPulse,
    doctorPulseBehavior: sla.pulseBehavior as DoctorPulseBehavior,
  }
}
