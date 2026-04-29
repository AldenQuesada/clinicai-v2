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
import { loadServerReposContext } from '@/lib/repos'
import { WeekCalendar } from './_components/week-calendar'
import { DayView } from './_components/day-view'
import { MonthView } from './_components/month-view'
import { PeriodNav } from './_components/period-nav'
import { ProfessionalFilter } from './_components/professional-filter'
import { ViewSwitcher } from './_components/view-switcher'

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
          </>
        }
      />

      {/* KPIs · 6 cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total" value={aggregates.total.toString()} />
        <KpiCard
          label="Agendados"
          value={aggregates.agendado.toString()}
          accent="info"
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
          label="Receita pago / total"
          value={`${BRL.format(aggregates.revenuePaid)} / ${BRL.format(aggregates.revenueTotal)}`}
        />
      </div>

      {/* Calendario · view switcher */}
      {view === 'week' && (
        appointments.length === 0 ? (
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
            appointments={appointments}
            startHour={8}
            endHour={20}
          />
        )
      )}

      {view === 'day' && (
        <DayView
          date={dayDate}
          appointments={appointments}
          startHour={8}
          endHour={20}
        />
      )}

      {view === 'month' && (
        <MonthView month={month} appointments={appointments} />
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
