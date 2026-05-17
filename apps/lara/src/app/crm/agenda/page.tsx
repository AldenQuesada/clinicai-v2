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
import { Button } from '@clinicai/ui'
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
    <div>
      {/* R3_CRM_LIGHT_3 · page-title-row legacy · KPIs na mesma linha do título.
          Espelha clinic-dashboard/css/style.css `.page-title-row` literal. */}
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle">Drag &amp; drop para reagendar</p>
        </div>
      </div>

      {/* KPIs · row horizontal LITERAL · api.js L466-499 (não confundir com
          .kpi-card vertical do dashboard). Pills inline · 22x22 icon · 18px value */}
      <div className="agenda-kpi-row">
        <KpiPill
          label="Agendados"
          value={aggregates.agendado.toString()}
          sub={`${aggregates.confirmado} conf.`}
          accent="blue"
          subTone="emerald"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          }
        />
        <KpiPill
          label="Sem Confirm."
          value={awaitingConfirmation.toString()}
          accent="warning"
          pillTone={awaitingConfirmation > 0 ? 'warning' : 'default'}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          }
        />
        <KpiPill
          label="No-show"
          value={aggregates.noShow.toString()}
          sub={
            aggregates.total > 0
              ? `${Math.round((aggregates.noShow / aggregates.total) * 100)}%`
              : '0%'
          }
          accent="danger"
          pillTone={aggregates.noShow > 0 ? 'danger' : 'default'}
          subTone="danger"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          }
        />
        <KpiPill
          label="Prev. | Fat."
          value={BRL.format(aggregates.revenueTotal)}
          sub={BRL.format(aggregates.revenuePaid)}
          accent="emerald"
          subTone="emerald"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          }
        />
      </div>

      {/* Toolbar legacy · ‹ período › + Horários + Finalizar Dia + Mês/Semana/Hoje + Novo */}
      <div className="agenda-toolbar">
        <Suspense fallback={null}>
          <PeriodNav view={view} anchor={anchor} todayAnchor={todayAnchor} />
        </Suspense>
        <div style={{ flex: 1 }} />
        <Suspense fallback={null}>
          <ProfessionalFilter professionals={professionals} current={profFilter} />
        </Suspense>
        <button
          type="button"
          disabled
          title="Horários · em validação"
          className="btn-outline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Horários
        </button>
        <button
          type="button"
          disabled
          title="Finalização do dia será ativada após validação do fluxo operacional."
          className="btn-outline btn-emerald"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Finalizar Dia
        </button>
        <Suspense fallback={null}>
          <ViewSwitcher
            current={view}
            todayDate={todayDate}
            todaySunday={todaySunday}
            todayMonth={todayMonth}
          />
        </Suspense>
        <Link href="/crm/agenda/novo">
          <button type="button" className="btn-new">
            <Plus className="h-4 w-4" />
            Novo
          </button>
        </Link>
      </div>

      {/* Filtros (status, tipo, financeiro, origem) */}
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

      {/* Legenda · 11 chips coloridos · LITERAL api.js L431-435 */}
      <StatusLegend />

      {/* Calendario · sempre visível (legacy mostra grid mesmo vazio · slots
          vazios viram clickable pra criar appointment) */}
      {view === 'week' && (
        <WeekCalendar
          weekStart={weekStart}
          appointments={filteredAppointments}
          startHour={8}
          endHour={20}
        />
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

type KpiAccent = 'blue' | 'warning' | 'danger' | 'emerald'

interface KpiPillProps {
  label: string
  value: string
  /** Sub renderizado após separador · ex: "0 conf." ou "0%" */
  sub?: string
  /** Cor de borda do pill (warning/danger pisca quando há ocorrências) */
  pillTone?: 'default' | 'warning' | 'danger'
  /** Cor do ícone+valor */
  accent: KpiAccent
  /** Cor do sub (default = mesma do accent) */
  subTone?: 'emerald' | 'danger' | 'muted'
  icon: React.ReactNode
}

/**
 * KpiPill · LITERAL · clinic-dashboard/js/api.js L466-499.
 * Layout HORIZONTAL inline · NÃO usa `.kpi-card` (dashboard).
 *
 *   pill > icon-box | label | value | sep | sub
 */
function KpiPill({
  label,
  value,
  sub,
  pillTone = 'default',
  accent,
  subTone,
  icon,
}: KpiPillProps) {
  const pillClass =
    pillTone === 'warning'
      ? 'agenda-kpi-pill agenda-kpi-pill-warning'
      : pillTone === 'danger'
        ? 'agenda-kpi-pill agenda-kpi-pill-danger'
        : 'agenda-kpi-pill'

  return (
    <div className={pillClass}>
      <div className={`agenda-kpi-icon agenda-kpi-icon-${accent}`}>{icon}</div>
      <span className="agenda-kpi-label">{label}</span>
      <span className={`agenda-kpi-value agenda-kpi-value-${accent}`}>
        {value}
      </span>
      {sub && (
        <>
          <span className="agenda-kpi-sep" aria-hidden />
          <span className={`agenda-kpi-sub agenda-kpi-sub-${subTone ?? 'muted'}`}>
            {sub}
          </span>
        </>
      )}
    </div>
  )
}
