/**
 * /admin/health · dashboard de saude do sistema (admin/owner only).
 *
 * Camada 11d-prep · bridge pra Camada 12 (cutover). Fornece visibilidade
 * em prod sobre:
 *   - Counts: leads, patients, appointments (30d), orcamentos (open)
 *   - Cron orcamento followup: ultima execucao, enviados 24h, stuck locks,
 *     elegiveis agora
 *   - Distribuicao de status de appointments (sanity · detecta volume
 *     anormal de no_show / cancelado, appts presos em estados intermediarios)
 *
 * Permissao: isAtLeast(role, 'admin') · receptionist/therapist/viewer
 * recebem 403 (forbidden), redirect pra /dashboard com warning toast
 * (futuro).
 */

import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@clinicai/ui'
import {
  Users,
  UserCircle,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { isAtLeast } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Camada 12c · shape do RPC divergence_report() (mig 85)
interface DivergenceResult {
  table: string
  legacy_total: number | null
  legacy_active: number | null
  current_total: number
  current_active: number
  status: 'ok' | 'divergent'
  severity: 'info' | 'warning' | 'critical'
  message: string | null
}
interface DivergenceReport {
  ran_at: string
  status: 'completed' | 'legacy_dropped'
  message?: string
  results?: DivergenceResult[]
  summary?: { total: number; ok: number; divergent: number; critical: number }
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminHealthPage() {
  const { ctx, repos, supabase } = await loadServerReposContext()

  if (!isAtLeast(ctx.role ?? null, 'admin')) {
    redirect('/dashboard?error=forbidden_admin')
  }

  // Hoje pra range de appointments (ultimos 30 dias)
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // 8 queries em paralelo · todas defensivas
  const [
    leadsCount,
    patientsActive,
    apptsCount30d,
    apptsAggregates30d,
    apptsStatusDist,
    orcamentosSent,
    orcamentosOpen,
    followupStats,
  ] = await Promise.all([
    repos.leads.count(ctx.clinic_id, {}).catch(() => 0),
    repos.patients.count(ctx.clinic_id, { status: 'active' }).catch(() => 0),
    repos.appointments
      .countInRange(ctx.clinic_id, thirtyDaysAgo, todayIso)
      .catch(() => 0),
    repos.appointments
      .aggregates(ctx.clinic_id, { startDate: thirtyDaysAgo, endDate: todayIso })
      .catch(() => null),
    repos.appointments.statusDistribution(ctx.clinic_id).catch(() => ({})),
    repos.orcamentos.countByStatus(ctx.clinic_id, 'sent').catch(() => 0),
    repos.orcamentos
      .list(ctx.clinic_id, { openOnly: true, limit: 1 })
      .then((rows) => rows.length)
      .catch(() => 0),
    repos.orcamentos.getFollowupStats(ctx.clinic_id).catch(() => ({
      sentLast24h: 0,
      stuckLocks: 0,
      eligibleNow: 0,
      lastRunAt: null,
    })),
  ])

  // Camada 12c · soak window divergence (RPC mig 85)
  // Defensivo: RPC pode nao existir se mig 85 ainda nao aplicada · catch silencioso
  const divergenceReport: DivergenceReport | null = await (supabase as unknown as {
    rpc: (
      name: string,
    ) => Promise<{ data: unknown; error: unknown }>
  })
    .rpc('divergence_report')
    .then((r) => (r.error ? null : (r.data as DivergenceReport | null)))
    .catch(() => null)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Saúde do sistema"
        description="Visibilidade operacional · admin/owner only"
        breadcrumb={[{ label: 'Admin', href: '/admin/health' }, { label: 'Saúde' }]}
        actions={
          <form action="/admin/health" method="GET">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-display-uppercase tracking-widest hover:bg-[var(--card)]/40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </form>
        }
      />

      {/* Counts gerais */}
      <h2 className="mb-3 mt-2 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        Contagens
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<UserCircle className="h-4 w-4" />}
          label="Leads"
          value={leadsCount.toString()}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Pacientes ativos"
          value={patientsActive.toString()}
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Agendamentos (30d)"
          value={apptsCount30d.toString()}
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" />}
          label="Orçamentos enviados"
          value={orcamentosSent.toString()}
        />
      </div>

      {/* Cron orcamento */}
      <h2 className="mb-3 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        Cron · orcamento-followup (10h SP diário)
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Última execução"
          value={formatRelative(followupStats.lastRunAt)}
          subValue={formatDateTime(followupStats.lastRunAt)}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Enviados (24h)"
          value={followupStats.sentLast24h.toString()}
          accent="success"
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" />}
          label="Elegíveis agora"
          value={followupStats.eligibleNow.toString()}
          accent="info"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Stuck locks (>5min)"
          value={followupStats.stuckLocks.toString()}
          accent={followupStats.stuckLocks > 0 ? 'destructive' : 'success'}
        />
      </div>

      {/* Distribuição de status de appointments */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Distribuição de status · agendamentos (todos)</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(apptsStatusDist).length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Nenhum agendamento na clínica.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {Object.entries(apptsStatusDist)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <li
                    key={status}
                    className="flex items-baseline justify-between border-b border-[var(--border)]/30 pb-1.5 text-sm last:border-0 last:pb-0"
                  >
                    <span className="text-[var(--foreground)]">{status}</span>
                    <span
                      className={`font-display-italic ${
                        status === 'no_show' || status === 'cancelado'
                          ? 'text-rose-300'
                          : status === 'finalizado'
                            ? 'text-emerald-300'
                            : 'text-[var(--foreground)]'
                      }`}
                    >
                      {count}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Aggregates 30d */}
      {apptsAggregates30d && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Receita · últimos 30 dias</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Total
              </div>
              <div className="font-display-italic text-lg text-[var(--foreground)]">
                {BRL.format(apptsAggregates30d.revenueTotal)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Pago
              </div>
              <div className="font-display-italic text-lg text-emerald-300">
                {BRL.format(apptsAggregates30d.revenuePaid)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Pendente
              </div>
              <div className="font-display-italic text-lg text-amber-300">
                {BRL.format(
                  Math.max(0, apptsAggregates30d.revenueTotal - apptsAggregates30d.revenuePaid),
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camada 12c · Soak window divergence */}
      {divergenceReport && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Soak window · divergência legacy vs v2</CardTitle>
          </CardHeader>
          <CardContent>
            {divergenceReport.status === 'legacy_dropped' ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Schema legacy droppado · soak window encerrado. {divergenceReport.message}
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-[var(--card)]/40 px-2 py-0.5">
                    Total: {divergenceReport.summary?.total ?? 0}
                  </span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                    OK: {divergenceReport.summary?.ok ?? 0}
                  </span>
                  {(divergenceReport.summary?.divergent ?? 0) > 0 && (
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
                      Divergente: {divergenceReport.summary?.divergent}
                    </span>
                  )}
                  {(divergenceReport.summary?.critical ?? 0) > 0 && (
                    <span className="rounded bg-rose-500/15 px-2 py-0.5 text-rose-300">
                      Crítico: {divergenceReport.summary?.critical}
                    </span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead className="border-b border-[var(--border)] text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                    <tr>
                      <th className="py-1 text-left">Tabela</th>
                      <th className="py-1 text-right">Legacy active</th>
                      <th className="py-1 text-right">v2 active</th>
                      <th className="py-1 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(divergenceReport.results ?? []).map((r: DivergenceResult) => (
                      <tr key={r.table} className="border-b border-[var(--border)]/30">
                        <td className="py-1 text-[var(--foreground)]">{r.table}</td>
                        <td className="py-1 text-right text-[var(--muted-foreground)]">
                          {r.legacy_active ?? '—'}
                        </td>
                        <td className="py-1 text-right text-[var(--foreground)]">
                          {r.current_active}
                        </td>
                        <td
                          className={`py-1 text-right ${
                            r.severity === 'critical'
                              ? 'text-rose-300'
                              : r.severity === 'warning'
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {r.status === 'ok' ? '✅ ok' : `⚠️ ${r.message}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[10px] text-[var(--muted-foreground)]/60">
                  Ran at: {new Date(divergenceReport.ran_at).toLocaleString('pt-BR')} ·
                  RPC <code>divergence_report()</code> (mig 85) · cron daily 06h30 SP
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sanity migrations · static info v1 */}
      <Card>
        <CardHeader>
          <CardTitle>Mig sanity (manual)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[var(--muted-foreground)]">
            Migs aplicadas em prod (2026-04-29 / 30):{' '}
            <code className="rounded bg-[var(--card)]/40 px-1">72</code>{' '}
            <code className="rounded bg-[var(--card)]/40 px-1">82</code>{' '}
            <code className="rounded bg-[var(--card)]/40 px-1">83</code>{' '}
            <code className="rounded bg-[var(--card)]/40 px-1">84</code>{' '}
            <code className="rounded bg-[var(--card)]/40 px-1">85</code>
          </p>
        </CardContent>
      </Card>

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        Sentry dashboard nativo cobre erros · config em apps/lara/E2E.md.
      </p>
    </div>
  )
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  accent?: 'info' | 'primary' | 'success' | 'warning' | 'destructive'
}

function KpiCard({ icon, label, value, subValue, accent }: KpiCardProps) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        {icon}
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
      {subValue && (
        <div className="text-[10px] text-[var(--muted-foreground)]/70">{subValue}</div>
      )}
    </Card>
  )
}
