/**
 * /crm/post-acoes · CRM_PARITY_R4 · staff dashboard de pós-ações.
 *
 * Lista a fila interna de `appointment_post_actions` (mig 197) que o
 * FinalizeWizard enfileira no R3. Esta tela é a UI onde a secretaria
 * vê o que precisa ser feito (avaliação Google D+3, follow-up
 * pagamento, retoque, queixa, etc) e marca manualmente como done,
 * dismissed, ou cancelled.
 *
 * Server component · força dynamic · lê searchParams (status, type).
 * MVP read-mostly · mutations via Server Actions (post-action.actions).
 *
 * ZERO disparo externo · ZERO worker · ZERO provider · staff age sob
 * controle manual. Paridade legacy `clinic_op_queue` + `clinic_op_tasks`
 * (localStorage no clinic-dashboard).
 */

import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import type { AppointmentPostActionType, AppointmentPostActionStatus } from '@clinicai/repositories'
import { PostActionsQueue } from './_components/post-actions-queue'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set<AppointmentPostActionStatus | 'all'>([
  'pending',
  'done',
  'dismissed',
  'cancelled',
  'all',
])

const VALID_TYPE = new Set<AppointmentPostActionType>([
  'google_review',
  'vpi_indication',
  'retouch_reminder',
  'complaint_logged',
  'payment_followup',
])

interface PageSearch {
  status?: string
  type?: string
}

function parseStatus(raw: string | undefined): AppointmentPostActionStatus | 'all' {
  if (!raw) return 'pending'
  return VALID_STATUS.has(raw as AppointmentPostActionStatus | 'all')
    ? (raw as AppointmentPostActionStatus | 'all')
    : 'pending'
}

function parseType(raw: string | undefined): AppointmentPostActionType | null {
  if (!raw) return null
  return VALID_TYPE.has(raw as AppointmentPostActionType)
    ? (raw as AppointmentPostActionType)
    : null
}

export default async function PostAcoesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const status = parseStatus(sp.status)
  const actionType = parseType(sp.type)

  const { ctx, repos } = await loadServerReposContext()

  // 1. Lista pós-ações conforme filtro · default pending.
  const postActions =
    status === 'all' || status !== 'pending'
      ? await repos.appointmentPostActions.listByClinic(ctx.clinic_id, {
          status,
          actionType: actionType ?? undefined,
          limit: 200,
        })
      : await repos.appointmentPostActions.listPendingByClinic(ctx.clinic_id, {
          actionType: actionType ?? undefined,
          limit: 200,
        })

  // 2. Enrichment · bulk-fetch appointments by ID (zero N+1).
  const appointmentIds = Array.from(new Set(postActions.map((p) => p.appointmentId)))
  const appointments = await repos.appointments.findByIds(appointmentIds)
  const apptById = new Map(appointments.map((a) => [a.id, a]))

  // 3. KPI breakdown (sempre conta de pending · não muda com filtro de view)
  const allPending = await repos.appointmentPostActions.listPendingByClinic(
    ctx.clinic_id,
    { limit: 500 },
  )
  const kpis = {
    total: allPending.length,
    google_review: allPending.filter((p) => p.actionType === 'google_review').length,
    vpi_indication: allPending.filter((p) => p.actionType === 'vpi_indication').length,
    retouch_reminder: allPending.filter((p) => p.actionType === 'retouch_reminder').length,
    complaint_logged: allPending.filter((p) => p.actionType === 'complaint_logged').length,
    payment_followup: allPending.filter((p) => p.actionType === 'payment_followup').length,
    overdue: allPending.filter(
      (p) => p.scheduleAt && new Date(p.scheduleAt) < new Date(),
    ).length,
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <PageHeader
        title="Pós-ações"
        description="Fila interna de pós-ações do finalize · staff dispatcha manualmente. Zero envio automático."
        breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Pós-ações' }]}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <KpiPill label="Pendentes" value={kpis.total} highlight />
        <KpiPill
          label="Atrasadas"
          value={kpis.overdue}
          highlight={kpis.overdue > 0}
          variant="danger"
        />
        <KpiPill label="Google review" value={kpis.google_review} />
        <KpiPill label="VPI" value={kpis.vpi_indication} />
        <KpiPill label="Retoque" value={kpis.retouch_reminder} />
        <KpiPill label="Queixas" value={kpis.complaint_logged} />
        <KpiPill label="Pagamento" value={kpis.payment_followup} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila ({postActions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PostActionsQueue
            items={postActions}
            apptById={Object.fromEntries(
              Array.from(apptById.entries()).map(([id, a]) => [
                id,
                {
                  id: a.id,
                  subjectName: a.subjectName,
                  scheduledDate: a.scheduledDate,
                  startTime: a.startTime,
                  status: a.status,
                  professionalName: a.professionalName,
                },
              ]),
            )}
            currentStatus={status}
            currentType={actionType}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function KpiPill({
  label,
  value,
  highlight,
  variant = 'default',
}: {
  label: string
  value: number
  highlight?: boolean
  variant?: 'default' | 'danger'
}) {
  const tone =
    variant === 'danger' && highlight
      ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
      : highlight
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
        : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${tone}`}
      aria-label={`${label}: ${value}`}
    >
      <div className="font-semibold uppercase tracking-wide text-[10px] opacity-70">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}
