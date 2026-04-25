/**
 * Tab Visão geral · KPIs internos da Mira (mirror b2b-config Overview).
 *
 * - wa_numbers ativos
 * - Queries today/week/month (count wa_pro_audit_log)
 * - Avg response_ms
 * - Error rate
 * - Top 5 intents
 *
 * Visual: KPI cards 8px com gold accent, top intents bar com mini-bar gold
 * tinted, latency stack mirror .bcfg-about-row pattern.
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
    <div className="flex flex-col gap-3">
      {/* KPI cards · 4 colunas densos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Admins ativos" value={String(activeAdmins)} tone="ok" />
        <Stat label="Queries hoje" value={String(today.total)} subtitle={`${today.failure} falhas`} />
        <Stat label="Queries 7 dias" value={String(week.total)} subtitle={`avg ${week.avgResponseMs}ms`} />
        <Stat
          label="Error rate 30d"
          value={`${errorRate}%`}
          subtitle={`${month.failure}/${month.total}`}
          tone={errorRate >= 10 ? 'warn' : errorRate <= 2 ? 'ok' : 'default'}
        />
      </div>

      {/* Top intents + latencia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="Top intents · 30 dias">
          {month.topIntents.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] py-2">
              Sem dados nos últimos 30 dias.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {month.topIntents.map((it) => {
                const max = month.topIntents[0]?.count ?? 1
                const pct = Math.round((it.count / max) * 100)
                return (
                  <div key={it.intent}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-mono text-[#F5F5F5]">{it.intent}</span>
                      <span className="text-[#C9A96E] font-mono font-bold">{it.count}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded overflow-hidden">
                      <div
                        className="h-full bg-[#C9A96E] rounded"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Latência média">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3.5 py-2 flex flex-col">
            <Row label="Hoje" value={`${today.avgResponseMs} ms`} />
            <Row label="7 dias" value={`${week.avgResponseMs} ms`} />
            <Row label="30 dias" value={`${month.avgResponseMs} ms`} last />
          </div>
        </Section>
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
  tone?: 'default' | 'warn' | 'ok'
}) {
  const accentBadge =
    tone === 'warn'
      ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
      : tone === 'ok'
      ? 'bg-[#10B981]/15 text-[#10B981]'
      : 'bg-[#C9A96E]/18 text-[#C9A96E]'
  const dotLabel = tone === 'warn' ? 'Alerta' : tone === 'ok' ? 'OK' : 'Live'
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-lg px-3.5 py-3 hover:border-white/14 transition-colors">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
          {label}
        </span>
        <span className={`text-[9px] uppercase tracking-[1.2px] font-bold px-1.5 py-0.5 rounded ${accentBadge}`}>
          {dotLabel}
        </span>
      </div>
      <div className="text-2xl font-semibold text-[#F5F5F5] font-mono leading-none">{value}</div>
      {subtitle && <div className="text-[11px] text-[#6B7280] mt-1.5">{subtitle}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-lg p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E] mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-[11.5px] ${last ? '' : 'border-b border-dashed border-white/8'}`}>
      <span className="text-[#9CA3AF]">{label}</span>
      <span className="text-[#F5F5F5] font-mono">{value}</span>
    </div>
  )
}
