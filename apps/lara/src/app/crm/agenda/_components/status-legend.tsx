/**
 * StatusLegend · barra horizontal de chips coloridos com os 11 status
 * canônicos de appointment.
 *
 * R3_CRM_3B.1 (2026-05-17) · gap reportado em audit: legacy mostra legenda
 * de status visível acima do calendário (Agendado, Aguard. Confirmação,
 * Confirmado, Aguardando, Na Clínica, Em Atendimento, Finalizado, Remarcado,
 * Cancelado, Não Compareceu, Bloqueado).
 *
 * Server Component · zero JS · cores e labels vem da fonte canônica
 * `APPOINTMENT_STATUS_COLORS` + `APPOINTMENT_STATUS_LABELS` do
 * `@clinicai/repositories`.
 *
 * Visual: chips com bullet colorido + label. Wrap em telas pequenas.
 */

import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from '@clinicai/repositories'

const STATUS_ORDER: readonly AppointmentStatus[] = [
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
  'na_clinica',
  'em_atendimento',
  'finalizado',
  'remarcado',
  'cancelado',
  'no_show',
  'bloqueado',
]

export function StatusLegend() {
  return (
    <div
      role="list"
      aria-label="Legenda de status da agenda"
      className="crm-status-row"
    >
      {STATUS_ORDER.map((status) => {
        const color = APPOINTMENT_STATUS_COLORS[status].color
        const label = APPOINTMENT_STATUS_LABELS[status]
        return (
          <span key={status} role="listitem" className="crm-status-chip">
            <span
              aria-hidden
              className="crm-status-dot"
              style={{ background: color }}
            />
            {label}
          </span>
        )
      })}
    </div>
  )
}
