/**
 * AgendaDayAlertsStrip · CRM_PARITY_R4.
 *
 * Strip de alertas operacionais exibido acima da agenda. Mostra ao
 * secretariado pós-ações programadas para o dia (payment_followup,
 * retouch_reminder, google_review, etc) que ainda estão `pending`.
 * Pure server-side · zero estado · click leva à fila completa.
 *
 * Origem dos dados: `appointment_post_actions` filtradas por
 * `schedule_at::DATE = dayIso` ou agendadas para datas anteriores (atrasadas).
 *
 * ZERO disparo automático · ZERO provider · apenas informação visual
 * para o staff agir manualmente.
 */

import Link from 'next/link'
import type { AppointmentPostActionDTO } from '@clinicai/repositories'

const TYPE_LABELS: Record<string, string> = {
  google_review: 'Avaliação Google',
  vpi_indication: 'VPI',
  retouch_reminder: 'Retoque',
  complaint_logged: 'Queixa',
  payment_followup: 'Pagamento',
}

function isSameOrBeforeDate(scheduleAt: string | null, dayIso: string): boolean {
  if (!scheduleAt) return false
  return scheduleAt.slice(0, 10) <= dayIso
}

function isOverdue(scheduleAt: string | null, dayIso: string): boolean {
  if (!scheduleAt) return false
  return scheduleAt.slice(0, 10) < dayIso
}

export function AgendaDayAlertsStrip({
  postActions,
  dayIso,
}: {
  postActions: AppointmentPostActionDTO[]
  dayIso: string
}) {
  // Filtra apenas pending agendadas para o dia OU atrasadas (anterior)
  const relevant = postActions.filter(
    (p) => p.status === 'pending' && isSameOrBeforeDate(p.scheduleAt, dayIso),
  )
  if (relevant.length === 0) return null

  const byType = relevant.reduce<Record<string, number>>((acc, p) => {
    acc[p.actionType] = (acc[p.actionType] ?? 0) + 1
    return acc
  }, {})

  const overdue = relevant.filter((p) => isOverdue(p.scheduleAt, dayIso)).length
  const today = relevant.length - overdue

  return (
    <div
      role="region"
      aria-label="Alertas operacionais do dia"
      className="agenda-day-alerts mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs"
    >
      <span className="font-semibold text-[var(--foreground)]">
        Pós-ações hoje:
      </span>
      {overdue > 0 && (
        <Link
          href="/crm/post-acoes?status=pending"
          className="rounded border border-red-400 bg-red-50 px-2 py-0.5 font-medium text-red-900 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-200"
        >
          {overdue} atrasada{overdue === 1 ? '' : 's'}
        </Link>
      )}
      {today > 0 && (
        <Link
          href="/crm/post-acoes?status=pending"
          className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {today} para hoje
        </Link>
      )}
      <span className="text-[var(--muted-foreground)]">·</span>
      {Object.entries(byType).map(([type, count]) => (
        <Link
          key={type}
          href={`/crm/post-acoes?status=pending&type=${type}`}
          className="rounded border border-[var(--border)] bg-white px-2 py-0.5 text-[var(--foreground)] hover:bg-[var(--muted)] dark:bg-zinc-900"
        >
          {TYPE_LABELS[type] ?? type}: <strong>{count}</strong>
        </Link>
      ))}
      <span className="ml-auto text-[10px] italic text-[var(--muted-foreground)]">
        Staff dispatcha manualmente · zero envio automático
      </span>
    </div>
  )
}
