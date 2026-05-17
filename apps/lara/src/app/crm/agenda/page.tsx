/**
 * /crm/agenda · calendario week/day/month + KPIs do periodo · 8a/8b.
 *
 * RSC · busca appointments via repos.appointments.listByDateRange.
 * URL params:
 *   - ?view=week|day|month (default: week)
 *   - ?week=YYYY-MM-DD (domingo · default = hoje arredondado pra dom)
 *   - ?date=YYYY-MM-DD (default = hoje · usado quando view=day)
 *   - ?month=YYYY-MM (default = mes corrente · usado quando view=month)
 *   - ?prof=<userId> (filtro profissional · default = todos)
 *
 * Funcionalidades cobertas:
 *   - Camada 8a: week view, KPIs, click-to-create, Prev/Today/Next.
 *   - Camada 8b: drag-drop (week/day), filtro multi-prof, day/month views.
 *
 * Diferido pra 8c+: recurrence wizard, block-time UI, smart-pick.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import {
  PageHeader,
  Card,
  Button,
  EmptyState,
} from '@clinicai/ui'
import { Plus } from 'lucide-react'
import type {
  AppointmentDTO,
  AppointmentPaymentStatus,
  AppointmentStatus,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { AgendaFilters } from './_components/agenda-filters'
import { WeekCalendar } from './_components/week-calendar'
import { DayView } from './_components/day-view'
import { MonthView } from './_components/month-view'
import { FinalizarDiaPlaceholder } from './_components/finalizar-dia-placeholder'
import { PeriodNav } from './_components/period-nav'
import { ProfessionalFilter } from './_components/professional-filter'
import { StatusLegend } from './_components/status-legend'
import { ViewSwitcher } from './_components/view-switcher'

const APPOINTMENT_STATUS_ENUM: readonly AppointmentStatus[] = [
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

const PAYMENT_STATUS_ENUM: readonly AppointmentPaymentStatus[] = [
  'pendente',
  'parcial',
  'pago',
  'cortesia',
  'isento',
]

function pickStatus(raw: string | undefined): AppointmentStatus | null {
  return raw && APPOINTMENT_STATUS_ENUM.includes(raw as AppointmentStatus)
    ? (raw as AppointmentStatus)
    : null
}

function pickPaymentStatus(
  raw: string | undefined,
): AppointmentPaymentStatus | null {
  return raw && PAYMENT_STATUS_ENUM.includes(raw as AppointmentPaymentStatus)
    ? (raw as AppointmentPaymentStatus)
    : null
}

export const dynamic = 'force-dynamic'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type View = 'week' | 'day' | 'month'

/**
 * Resolve domingo da semana referente a `dateStr` (default hoje).
 */
function resolveWeekStart(dateStr?: string): string {
  const base = dateStr
    ? new Date(`${dateStr}T00:00:00.000Z`)
    : new Date()
  base.setUTCHours(0, 0, 0, 0)
  base.setUTCDate(base.getUTCDate() - base.getUTCDay())
  return base.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function todayMonthUtc(): string {
  return todayUtc().slice(0, 7)
}

function parseView(v: string | undefined): View {
  if (v === 'day' || v === 'month') return v
  return 'week'
}

/**
 * Resolve [startDate, endDate] do periodo a buscar baseado em view + anchors.
 * Para o month view inclui tambem as bordas (semana antes do dia 1 / depois
 * do ultimo) pra grid de 6 sem ficar consistente com counts.
 */
function resolveRange(
  view: View,
  weekStart: string,
  dayDate: string,
  month: string,
): { startDate: string; endDate: string } {
  if (view === 'day') {
    return { startDate: dayDate, endDate: dayDate }
  }
  if (view === 'month') {
    const [y, m] = month.split('-').map((s) => parseInt(s, 10))
    const first = new Date(Date.UTC(y, m - 1, 1))
    first.setUTCDate(first.getUTCDate() - first.getUTCDay())
    const start = first.toISOString().slice(0, 10)
    const end = addDays(start, 41) // 6 sem × 7d - 1
    return { startDate: start, endDate: end }
  }
  // week
  return { startDate: weekStart, endDate: addDays(weekStart, 6) }
}

interface PageSearch {
  view?: string
  week?: string
  date?: string
  month?: string
  prof?: string
  /** R3_CRM_3B.3 · filter por status (enum canônico) */
  status?: string
  /** R3_CRM_3B.3 · filter por consult_type (string · distinct) */
  ct?: string
  /** R3_CRM_3B.3 · filter por payment_status (enum canônico) */
  ptm?: string
  /** R3_CRM_3B.3 · filter por origem (string · distinct) */
  og?: string
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const view = parseView(sp.view)
  const todayDate = todayUtc()
  const todaySunday = resolveWeekStart()
  const todayMonth = todayMonthUtc()

  const weekStart = resolveWeekStart(sp.week)
  const dayDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayDate
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayMonth
  const profFilter = sp.prof && sp.prof.length > 0 ? sp.prof : null
  const statusFilter = pickStatus(sp.status)
  const paymentStatusFilter = pickPaymentStatus(sp.ptm)
  const consultTypeFilter =
    sp.ct && sp.ct.trim().length > 0 ? sp.ct.trim() : null
  const origemFilter = sp.og && sp.og.trim().length > 0 ? sp.og.trim() : null

  const { startDate, endDate } = resolveRange(view, weekStart, dayDate, month)

  const { ctx, repos } = await loadServerReposContext()

  // Appointments + KPIs + lista de profissionais (paralelo)
  const [appointments, aggregates, staffList] = await Promise.all([
    repos.appointments
      .listByDateRange(ctx.clinic_id, startDate, endDate, {
        professionalId: profFilter,
      })
      .catch(() => []),
    repos.appointments
      .aggregates(ctx.clinic_id, { startDate, endDate })
      .catch(() => ({
        total: 0,
        agendado: 0,
        confirmado: 0,
        finalizado: 0,
        cancelado: 0,
        noShow: 0,
        bloqueado: 0,
        revenueTotal: 0,
        revenuePaid: 0,
      })),
    repos.users.listStaff().catch(() => ({
      ok: false as const,
      data: null,
      error: 'unknown',
    })),
  ])

  // R3_CRM_3B.3 · distinct options pra filtros sem enum (consult_type, origem).
  // Tirados do dataset carregado · sem hit extra ao banco. Strings vazias/null
  // são ignoradas. Ordem alfabética pt-BR.
  const distinctConsultTypes = Array.from(
    new Set(
      appointments
        .map((a: AppointmentDTO) => a.consultType)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const distinctOrigens = Array.from(
    new Set(
      appointments
        .map((a: AppointmentDTO) => a.origem)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // R3_CRM_3B.3 · aplica os 4 filtros novos no array já carregado (server-side).
  // `professionalId` já filtrou no banco · estes 4 filtros são client-side
  // sobre o subconjunto retornado pra evitar redundância de query.
  const filteredAppointments = appointments.filter((a: AppointmentDTO) => {
    if (statusFilter && a.status !== statusFilter) return false
    if (paymentStatusFilter && a.paymentStatus !== paymentStatusFilter)
      return false
    if (consultTypeFilter && a.consultType !== consultTypeFilter) return false
    if (origemFilter && a.origem !== origemFilter) return false
    return true
  })

  // R3_CRM_3B.4 · count "Sem Confirm." · status canônico aguardando_confirmacao.
  // Conta do array filtrado (respeita filtros aplicados) pra consistência visual.
  const awaitingConfirmation = filteredAppointments.filter(
    (a: AppointmentDTO) => a.status === 'aguardando_confirmacao',
  ).length

  const professionals = (
    staffList.ok && staffList.data ? staffList.data : []
  )
    .filter((s) => s.isActive)
    .map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim() || s.email || s.id.slice(0, 8),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  // Anchor + label do periodo dependem do view
  const anchor =
    view === 'week' ? weekStart : view === 'day' ? dayDate : month
  const todayAnchor =
    view === 'week' ? todaySunday : view === 'day' ? todayDate : todayMonth

  const periodLabel =
    view === 'week'
      ? `Semana de ${weekStart}`
      : view === 'day'
        ? `Dia ${dayDate}`
        : `Mês ${month}`

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Agenda"
        description={`${periodLabel} · clínica ${ctx.clinic_id.slice(0, 8)}…`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Agenda' },
        ]}
        actions={
          <>
            <Suspense fallback={null}>
              <ViewSwitcher
                current={view}
                todayDate={todayDate}
                todaySunday={todaySunday}
                todayMonth={todayMonth}
              />
            </Suspense>
            <Suspense fallback={null}>
              <PeriodNav
                view={view}
                anchor={anchor}
                todayAnchor={todayAnchor}
              />
            </Suspense>
            <Suspense fallback={null}>
              <ProfessionalFilter
                professionals={professionals}
                current={profFilter}
              />
            </Suspense>
            <Link href="/crm/agenda/novo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Novo agendamento
              </Button>
            </Link>
            {/* R3_CRM_3B.5 · botão placeholder · audit do legacy abrirFecharDia() */}
            <FinalizarDiaPlaceholder />
          </>
        }
      />

      {/* R3_CRM_3B.2 · hint drag-drop · espelha legacy "Drag & drop para reagendar" */}
      <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
        Drag &amp; drop para reagendar.
      </p>

      {/* R3_CRM_3B.1 · legenda de status (11 chips canônicos) */}
      <StatusLegend />

      {/* R3_CRM_3B.3 · filtros adicionais · Status + Tipo + Financeiro + Origem.
          Avaliação (eval_type) omitida · sem enum canônico claro. */}
      <Suspense fallback={null}>
        <AgendaFilters
          consultTypeOptions={distinctConsultTypes}
          origemOptions={distinctOrigens}
          current={{
            status: statusFilter,
            paymentStatus: paymentStatusFilter,
            consultType: consultTypeFilter,
            origem: origemFilter,
          }}
        />
      </Suspense>

      {/* KPIs · 7 cards · R3_CRM_3B.4 adicionou "Sem Confirm." e refinou
          o card Receita pra "Prev. / Fat." (espelha legacy PREV.|FAT.) */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <KpiCard label="Total" value={aggregates.total.toString()} />
        <KpiCard
          label="Agendados"
          value={aggregates.agendado.toString()}
          accent="info"
        />
        <KpiCard
          label="Sem Confirm."
          value={awaitingConfirmation.toString()}
          accent={awaitingConfirmation > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="Em fluxo"
          value={aggregates.confirmado.toString()}
          accent="primary"
        />
        <KpiCard
          label="Finalizados"
          value={aggregates.finalizado.toString()}
          accent="success"
        />
        <KpiCard
          label="Cancel + No-show"
          value={(aggregates.cancelado + aggregates.noShow).toString()}
          accent={
            aggregates.cancelado + aggregates.noShow > 0 ? 'destructive' : undefined
          }
        />
        <KpiCard
          label="Prev. | Fat."
          value={`${BRL.format(aggregates.revenueTotal)} / ${BRL.format(aggregates.revenuePaid)}`}
        />
      </div>

      {/* Calendario · view switcher · usa filteredAppointments (R3_CRM_3B.3) */}
      {view === 'week' && (
        filteredAppointments.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              variant="generic"
              title="Sem agendamentos esta semana"
              message='Clique num slot vazio do calendário ou em "Novo agendamento" pra criar.'
            />
          </Card>
        ) : (
          <WeekCalendar
            weekStart={weekStart}
            appointments={filteredAppointments}
            startHour={8}
            endHour={20}
          />
        )
      )}

      {view === 'day' && (
        <DayView
          date={dayDate}
          appointments={filteredAppointments}
          startHour={8}
          endHour={20}
        />
      )}

      {view === 'month' && (
        <MonthView month={month} appointments={filteredAppointments} />
      )}

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        Recurrence wizard, block-time UI, smart-pick → Camada 8c+.
      </p>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  accent?: 'info' | 'primary' | 'success' | 'warning' | 'destructive'
}

function KpiCard({ label, value, accent }: KpiCardProps) {
  return (
    <Card className="p-3">
      <div className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={`mt-1 font-display-italic text-xl ${
          accent === 'success'
            ? 'text-emerald-400'
            : accent === 'destructive'
              ? 'text-rose-400'
              : accent === 'warning'
                ? 'text-amber-400'
                : accent === 'info'
                  ? 'text-sky-400'
                  : accent === 'primary'
                    ? 'text-[var(--primary)]'
                    : 'text-[var(--foreground)]'
        }`}
      >
        {value}
      </div>
    </Card>
  )
}
