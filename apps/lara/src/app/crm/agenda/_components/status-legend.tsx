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
      className="agenda-status-row"
    >
      {STATUS_ORDER.map((status) => {
        const cfg = APPOINTMENT_STATUS_COLORS[status]
        const label = APPOINTMENT_STATUS_LABELS[status]
        return (
          <span
            key={status}
            role="listitem"
            className="agenda-status-chip"
            style={{
              color: cfg.color,
              background: cfg.bg,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: cfg.color,
                display: 'inline-block',
              }}
            />
            {label}
          </span>
        )
      })}
    </div>
  )
}
