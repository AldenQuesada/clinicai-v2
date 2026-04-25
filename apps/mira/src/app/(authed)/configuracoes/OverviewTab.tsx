/**
 * Tab Overview · KPIs internos da Mira.
 *
 * - wa_numbers ativos
 * - Queries today/week/month (count wa_pro_audit_log)
 * - Avg response_ms
 * - Error rate
 * - Top 5 intents
 */

import { loadMiraServerContext } from '@/lib/server-context'

export async function OverviewTab() {
  const { ctx, repos } = await loadMiraServerContext()

  const todayIso = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString()
  const sevenIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [activeAdmins, today, week, month] = await Promise.all([
    repos.waNumbers.countActive(ctx.clinic_id),
    repos.waProAudit.aggregate(ctx.clinic_id, todayIso),
    repos.waProAudit.aggregate(ctx.clinic_id, sevenIso),
    repos.waProAudit.aggregate(ctx.clinic_id, thirtyIso),
  ])

  const errorRate = month.total > 0 ? Math.round((month.failure / month.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Admins ativos" value={String(activeAdmins)} />
        <Stat label="Queries hoje" value={String(today.total)} subtitle={`${today.failure} falhas`} />
        <Stat label="Queries 7 dias" value={String(week.total)} subtitle={`avg ${week.avgResponseMs}ms`} />
        <Stat
          label="Error rate 30d"
          value={`${errorRate}%`}
          subtitle={`${month.failure}/${month.total}`}
          tone={errorRate >= 10 ? 'warn' : errorRate <= 2 ? 'success' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Top intents · 30 dias">
          {month.topIntents.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] py-3">
              Sem dados nos últimos 30 dias.
            </p>
          ) : (
            <div className="space-y-3">
              {month.topIntents.map((it) => {
                const max = month.topIntents[0]?.count ?? 1
                const pct = Math.round((it.count / max) * 100)
                return (
                  <div key={it.intent}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono text-[hsl(var(--foreground))]">{it.intent}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">{it.count}</span>
                    </div>
                    <div className="h-2 bg-[hsl(var(--muted))] rounded-pill overflow-hidden">
                      <div
                        className="h-full bg-[hsl(var(--primary))] rounded-pill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Latência média">
          <dl className="text-sm space-y-2">
            <Row label="Hoje" value={`${today.avgResponseMs} ms`} />
            <Row label="7 dias" value={`${week.avgResponseMs} ms`} />
            <Row label="30 dias" value={`${month.avgResponseMs} ms`} />
          </dl>
        </SectionCard>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  label: string
  value: string
  subtitle?: string
  tone?: 'default' | 'warn' | 'success'
}) {
  const cls =
    tone === 'warn'
      ? 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5'
      : tone === 'success'
      ? 'border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5'
      : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]'
  return (
    <div className={`rounded-card border p-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
        {label}
      </div>
      <div className="text-2xl font-bold text-[hsl(var(--foreground))] mt-1">{value}</div>
      {subtitle && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{subtitle}</div>}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
      <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[hsl(var(--chat-border))] last:border-0 py-2">
      <dt className="text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="text-[hsl(var(--foreground))] font-bold">{value}</dd>
    </div>
  )
}
