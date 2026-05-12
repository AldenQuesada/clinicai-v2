/**
 * /crm/dashboard · CRM_PHASE_LEGACY.PORT.DASHBOARDS.
 *
 * Dashboard CRM read-only com:
 *   - Filtros: período (preset + custom) · profissional · origem
 *   - KPI cards: leads, agendamentos, comparecimento, finalizações,
 *     pacientes, orçamentos, recuperação, no-show, cancelamento
 *   - Funil: lead → agendado → compareceu → paciente/orcamento → recuperado
 *   - Por profissional: tabela com agendamentos/finalizados/no-show/cancel
 *   - Listas operacionais: próximos appts, leads sem appt, recovery overdue,
 *     orçamentos recentes
 *
 * Port LEGACY (sdr.js + financeiro-reports.js) → recriado:
 *   - sem localStorage como fonte (filtros via searchParams)
 *   - sem status zumbi (em_consulta/pre_consulta/compareceu/reagendado · descartados)
 *   - sem provider externo
 *   - sem WhatsApp / wa_outbox
 *   - usa appointments + leads + perdidos + orcamentos canônicos
 *
 * Zero envio · zero side-effect · 4 paralelas no SSR.
 */

import Link from 'next/link'
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { Suspense } from 'react'
import { loadServerReposContext } from '@/lib/repos'
import { DashboardFilters } from './_filters'
import { ByProfessionalTable } from './_by-professional'
import { FunnelCard } from './_funnel'
import { OperationalLists } from './_operational-lists'

export const dynamic = 'force-dynamic'

interface PageSearch {
  range?: 'today' | '7d' | '30d' | 'mtd' | 'custom'
  from?: string
  to?: string
  professionalId?: string
  origem?: string
}

function resolveRange(sp: PageSearch): { startDate: string; endDate: string; label: string } {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const range = sp.range ?? '30d'

  if (range === 'custom' && sp.from && sp.to) {
    return { startDate: sp.from, endDate: sp.to, label: `${sp.from} → ${sp.to}` }
  }
  if (range === 'today') {
    return { startDate: todayIso, endDate: todayIso, label: 'Hoje' }
  }
  if (range === 'mtd') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    return { startDate: first.toISOString().slice(0, 10), endDate: todayIso, label: 'Mês atual' }
  }
  if (range === '7d') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return { startDate: start.toISOString().slice(0, 10), endDate: todayIso, label: 'Últimos 7 dias' }
  }
  // default: 30d
  const start = new Date(today)
  start.setDate(start.getDate() - 29)
  return { startDate: start.toISOString().slice(0, 10), endDate: todayIso, label: 'Últimos 30 dias' }
}

export default async function CrmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()
  const range = resolveRange(sp)

  const filters = {
    startDate: range.startDate,
    endDate: range.endDate,
    professionalId: sp.professionalId ?? null,
    origem: sp.origem ?? null,
  }

  const [summary, funnel, byProfessional, lists, professionals] = await Promise.all([
    repos.crmDashboard.getSummary(ctx.clinic_id, filters),
    repos.crmDashboard.getFunnel(ctx.clinic_id),
    repos.crmDashboard.getByProfessional(ctx.clinic_id, {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    repos.crmDashboard.getOperationalLists(ctx.clinic_id, {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    repos.professionalProfiles.listActiveForAgenda(ctx.clinic_id).catch(() => []),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard CRM"
        description={`Funil comercial, agenda e recuperação · ${range.label}`}
        breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Dashboard' }]}
      />

      <DashboardFilters
        currentRange={sp.range ?? '30d'}
        customFrom={sp.from ?? null}
        customTo={sp.to ?? null}
        currentProfessionalId={sp.professionalId ?? null}
        currentOrigem={sp.origem ?? null}
        professionals={professionals.map((p) => ({ id: p.id, displayName: p.displayName }))}
      />

      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
        💡 Dashboard read-only · zero ações de envio · canal Meta segue em aprovação.
      </p>

      {/* KPI Cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Leads ativos" value={summary.leads.ativo} hint={`${summary.leads.total} total`} />
        <KpiCard label="Agendados" value={summary.appointments.agendado} />
        <KpiCard
          label="Compareceram"
          value={
            summary.appointments.naClinica + summary.appointments.emAtendimento + summary.appointments.finalizado
          }
        />
        <KpiCard label="Finalizados" value={summary.appointments.finalizado} tone="ok" />
        <KpiCard label="Pacientes" value={summary.patients} />
        <KpiCard
          label="Orçamentos ativos"
          value={summary.orcamentos.draft + summary.orcamentos.aprovado}
          hint={`${summary.orcamentos.total} total`}
        />
        <KpiCard label="Perdidos" value={summary.leads.perdido + summary.recovery.perdidosTotal} tone="alert" />
        <KpiCard
          label="Recuperação aberta"
          value={summary.recovery.workflowOpen}
          hint={summary.recovery.workflowOverdue > 0 ? `${summary.recovery.workflowOverdue} atrasados` : undefined}
          tone={summary.recovery.workflowOverdue > 0 ? 'alert' : undefined}
        />
      </div>

      {/* Rates */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <RateCard label="Taxa de agendamento" value={summary.rates.pctAgendamento} hint="appts agendados / leads ativos" />
        <RateCard label="Comparecimento" value={summary.rates.pctComparecimento} hint="compareceu / (agendado+compareceu+no-show+cancel)" />
        <RateCard label="Finalização" value={summary.rates.pctFinalizacao} hint="finalizado / compareceu" />
        <RateCard label="No-show" value={summary.rates.pctNoShow} hint="no-show / total appts" inverted />
        <RateCard label="Cancelamento" value={summary.rates.pctCancelamento} hint="cancelado / total appts" inverted />
      </div>

      {/* Funnel + Status detalhado */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <FunnelCard funnel={funnel} />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribuição de appointments ({range.label})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <StatusPill label="Agendado" value={summary.appointments.agendado} />
              <StatusPill label="Confirmado" value={summary.appointments.confirmado} />
              <StatusPill label="Na clínica" value={summary.appointments.naClinica} />
              <StatusPill label="Em atendimento" value={summary.appointments.emAtendimento} />
              <StatusPill label="Finalizado" value={summary.appointments.finalizado} tone="ok" />
              <StatusPill label="Remarcado" value={summary.appointments.remarcado} />
              <StatusPill label="Cancelado" value={summary.appointments.cancelado} tone="alert" />
              <StatusPill label="No-show" value={summary.appointments.noShow} tone="alert" />
              <StatusPill label="Bloqueado" value={summary.appointments.bloqueado} tone="muted" />
              <StatusPill label="Total" value={summary.appointments.total} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By professional */}
      <div className="mt-4">
        <ByProfessionalTable rows={byProfessional} />
      </div>

      {/* Operational lists */}
      <div className="mt-4">
        <Suspense fallback={<p className="text-xs">Carregando listas…</p>}>
          <OperationalLists lists={lists} />
        </Suspense>
      </div>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <Link href="/crm/agenda" className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40">
          → Ir para Agenda
        </Link>
        <Link href="/crm/recuperacao" className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40">
          → Recuperação
        </Link>
        <Link href="/crm/leads" className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40">
          → Leads
        </Link>
        <Link href="/crm/orcamentos" className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40">
          → Orçamentos
        </Link>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint?: string
  tone?: 'ok' | 'alert' | 'muted'
}) {
  const color =
    tone === 'alert'
      ? 'text-[var(--destructive)]'
      : tone === 'ok'
        ? 'text-[var(--primary)]'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className={`text-2xl font-semibold ${color}`}>{value}</span>
        {hint && <span className="text-[10px] text-[var(--muted-foreground)]">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function RateCard({
  label,
  value,
  hint,
  inverted,
}: {
  label: string
  value: number
  hint?: string
  inverted?: boolean
}) {
  let tone: 'ok' | 'alert' | 'muted' = 'muted'
  if (inverted) {
    if (value <= 5) tone = 'ok'
    else if (value >= 15) tone = 'alert'
  } else {
    if (value >= 60) tone = 'ok'
    else if (value < 30) tone = 'alert'
  }
  const color =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'alert'
        ? 'text-[var(--destructive)]'
        : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className={`text-2xl font-semibold ${color}`}>{value}%</span>
        {hint && <span className="text-[9px] text-[var(--muted-foreground)]">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'alert' | 'muted'
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'alert'
        ? 'text-[var(--destructive)]'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border)] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
