/**
 * SLA · performance da secretaria · single source of truth.
 *
 * Regra operacional canônica (Alden 2026-05-04):
 *
 *   Uma conversa está "aguardando resposta da secretária" quando:
 *     última mensagem do paciente > última resposta humana da clínica
 *
 *   Resposta humana válida = wa_messages onde:
 *     direction = 'outbound'
 *     AND sender   = 'humano'
 *     AND deleted_at IS NULL
 *     AND status IS DISTINCT FROM 'note'
 *
 *   Lara/IA, auto-greeting, system, automações, notas internas NÃO contam
 *   como resposta humana.
 *
 * Escala de cor + pulso:
 *
 *   respondido    → !waiting              · sem pulso
 *   verde         → < 3min                · sem pulso
 *   amarelo       → 3-7min                · pulso suave
 *   vermelho      → 7-15min               · pulso forte
 *   critico       → 15-60min              · pulso forte
 *   atrasado_fixo → 60min-24h             · sem pulso
 *   antigo_parado → ≥ 24h                 · sem pulso
 *
 * Esta função é chamada pelo repository (listByStatus + getInsights), pode
 * ser usada por API routes ou serviços, e os componentes React só renderizam
 * cor/pulso/texto a partir do retorno. UI **nunca** recalcula a regra.
 */

import type { ResponseColor, PulseBehavior } from './types/enums'

export interface SlaInput {
  /** ISO da última mensagem do paciente (= wa_conversations.last_lead_msg) */
  lastPatientMsgAt: string | null
  /** ISO da última resposta humana válida · null = nenhuma humana até agora */
  lastHumanReplyAt: string | null
  /** Override de "now" pra testes determinísticos · default new Date() */
  now?: Date
}

export interface SlaFields {
  waitingHumanResponse: boolean
  /** null se !waitingHumanResponse · senão minutos (>=0) desde lastPatientMsgAt */
  minutesWaiting: number | null
  responseColor: ResponseColor
  shouldPulse: boolean
  pulseBehavior: PulseBehavior
}

const RESPONDIDO: SlaFields = {
  waitingHumanResponse: false,
  minutesWaiting: null,
  responseColor: 'respondido',
  shouldPulse: false,
  pulseBehavior: 'none',
}

export function computeSla(input: SlaInput): SlaFields {
  const { lastPatientMsgAt, lastHumanReplyAt, now = new Date() } = input

  if (!lastPatientMsgAt) return RESPONDIDO

  const patientTs = new Date(lastPatientMsgAt).getTime()
  if (!Number.isFinite(patientTs)) return RESPONDIDO

  const humanTs = lastHumanReplyAt ? new Date(lastHumanReplyAt).getTime() : Number.NEGATIVE_INFINITY
  // Humano respondeu DEPOIS (ou exatamente em cima) da última msg do paciente
  // ↳ conversa não está aguardando · respondida.
  if (Number.isFinite(humanTs) && humanTs >= patientTs) return RESPONDIDO

  const minutesWaiting = Math.max(0, Math.floor((now.getTime() - patientTs) / 60_000))

  if (minutesWaiting < 3) {
    return {
      waitingHumanResponse: true,
      minutesWaiting,
      responseColor: 'verde',
      shouldPulse: false,
      pulseBehavior: 'none',
    }
  }
  if (minutesWaiting < 7) {
    return {
      waitingHumanResponse: true,
      minutesWaiting,
      responseColor: 'amarelo',
      shouldPulse: true,
      pulseBehavior: 'suave',
    }
  }
  if (minutesWaiting < 15) {
    return {
      waitingHumanResponse: true,
      minutesWaiting,
      responseColor: 'vermelho',
      shouldPulse: true,
      pulseBehavior: 'forte',
    }
  }
  if (minutesWaiting < 60) {
    return {
      waitingHumanResponse: true,
      minutesWaiting,
      responseColor: 'critico',
      shouldPulse: true,
      pulseBehavior: 'forte',
    }
  }
  if (minutesWaiting < 60 * 24) {
    return {
      waitingHumanResponse: true,
      minutesWaiting,
      responseColor: 'atrasado_fixo',
      shouldPulse: false,
      pulseBehavior: 'none',
    }
  }
  return {
    waitingHumanResponse: true,
    minutesWaiting,
    responseColor: 'antigo_parado',
    shouldPulse: false,
    pulseBehavior: 'none',
  }
}
