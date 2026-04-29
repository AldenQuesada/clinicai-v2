/**
 * /crm/agenda · calendario semanal + KPIs do periodo.
 *
 * RSC · busca appointments da semana via repos.appointments.listByDateRange.
 * URL: ?week=YYYY-MM-DD (domingo · default = hoje arredondado pra dom).
 *
 * Funcionalidades cobertas (Camada 8a):
 *   - Week view (7 dias x slots de 30min)
 *   - 6 KPIs do periodo (status counts + revenue)
 *   - Click em slot vazio → /crm/agenda/novo?date=&time=
 *   - Click em appointment → /crm/agenda/[id]
 *   - Navegacao Prev/Today/Next semana
 *
 * Diferido pra 8b: drag-drop, filtro multi-profissional, day/month views.
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
import { WeekNav } from './_components/week-nav'

export const dynamic = 'force-dynamic'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

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

interface PageSearch {
  week?: string
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const weekStart = resolveWeekStart(sp.week)
  const weekEnd = addDays(weekStart, 6)

  const { ctx, repos } = await loadServerReposContext()

  // Appts da semana + KPIs em paralelo
  const [appointments, aggregates] = await Promise.all([
    repos.appointments
      .listByDateRange(ctx.clinic_id, weekStart, weekEnd, {})
      .catch(() => []),
    repos.appointments
      .aggregates(ctx.clinic_id, { startDate: weekStart, endDate: weekEnd })
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
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Agenda"
        description={`Semana de ${weekStart} · clínica ${ctx.clinic_id.slice(0, 8)}…`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Agenda' },
        ]}
        actions={
          <>
            <Suspense fallback={null}>
              <WeekNav weekStart={weekStart} />
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

      {/* Calendario week */}
      {appointments.length === 0 ? (
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
      )}

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        Drag-drop, filtro multi-profissional e views day/month → Camada 8b.
        Smart-pick de slot, multi-procedimento, automations → 8.5+.
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
