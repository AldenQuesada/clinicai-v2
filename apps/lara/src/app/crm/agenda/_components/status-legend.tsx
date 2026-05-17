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
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2"
    >
      <span className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        Status:
      </span>
      {STATUS_ORDER.map((status) => {
        const color = APPOINTMENT_STATUS_COLORS[status].color
        const label = APPOINTMENT_STATUS_LABELS[status]
        return (
          <span
            key={status}
            role="listitem"
            className="inline-flex items-center gap-1.5 text-[10px] text-[var(--foreground)]"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: color }}
            />
            {label}
          </span>
        )
      })}
    </div>
  )
}
