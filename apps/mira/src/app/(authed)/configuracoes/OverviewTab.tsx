/**
 * Tab Visão geral · KPIs internos da Mira + Saúde do sistema (aside direita).
 *
 * Layout 2-col (>=1100px):
 *   Main (2fr):
 *     - 4 KPIs (Admins · Hoje · Periodo · Error rate)
 *     - Top intents | Latencia
 *     - Sparkline | Audios
 *   Aside (1fr · sticky topo):
 *     - Saude do sistema (4 cards · Disparos / Insights / Vouchers / Contagens)
 *
 * 2026-04-26: Saude do sistema absorvido como aside (era sub-tab separada
 * em /b2b/config/saude). Insights count agora reage ao TimeRangePicker.
 *
 * Fixos preservados (nao reagem ao picker):
 *   - Admins ativos · estado atual
 *   - Queries hoje · snapshot do dia
 *   - Audios · mes corrente
 *   - Saude (Disparos · Vouchers · Contagens) · status atual
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { TimeRangePicker } from '../b2b/analytics/_shared/TimeRangePicker'
import {
  parseTimeRange,
  timeRangeLabel,
} from '../b2b/analytics/_shared/timeRangeUtils'
import type { SystemHealthSnapshot } from '@clinicai/repositories'

interface OverviewTabProps {
  days?: string
  from?: string
  to?: string
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} d atrás`
  return fmtTime(iso)
}

export async function OverviewTab({ days, from, to }: OverviewTabProps) {
  const { ctx, repos } = await loadMiraServerContext()
  const tr = parseTimeRange({ days, from, to })
  const periodDays =
    tr.days ??
    Math.max(
      1,
      Math.ceil(
        (new Date((tr.toIso ?? '') + 'T23:59:59Z').getTime() -
          new Date((tr.fromIso ?? '') + 'T00:00:00Z').getTime()) /
          86400000,
      ),
    )

  const todayIso = new Date(
    new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
  ).toISOString()
  const periodSinceIso = tr.fromIso
    ? new Date(tr.fromIso + 'T00:00:00.000Z').toISOString()
    : new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
  const monthStart =
    new Date().toISOString().slice(0, 8) + '01T00:00:00.000Z'
  const sparkDays = Math.min(30, Math.max(7, periodDays))

  const [activeAdmins, today, period, daily, voiceCount, sysHealth] =
    await Promise.all([
      repos.waNumbers.countActive(ctx.clinic_id),
      repos.waProAudit.aggregate(ctx.clinic_id, todayIso),
      repos.waProAudit.aggregate(ctx.clinic_id, periodSinceIso),
      repos.waProAudit.dailyCounts(ctx.clinic_id, sparkDays),
      repos.waProAudit.voiceCount(ctx.clinic_id, monthStart).catch(() => 0),
      repos.b2bSystemHealth.snapshot().catch(() => null),
    ])

  const errorRate =
    period.total > 0 ? Math.round((period.failure / period.total) * 100) : 0
  const maxDay = daily.reduce((m, d) => (d.total > m ? d.total : m), 1)
  const rangeLbl = timeRangeLabel(tr)

  return (
    <div className="flex flex-col gap-3">
      {/* Header com TimeRangePicker */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] text-[#9CA3AF]">
            Visão geral · Mira interna
          </div>
          <div className="text-[12px] text-[#6B7280] mt-0.5">
            Janela: {rangeLbl} · alguns KPIs sao snapshot fixo (hoje, mes, estado)
          </div>
        </div>
        <TimeRangePicker />
      </div>

      {/* Layout 2-col · main esquerda + Saude aside direita */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}
        className="cfg-overview-grid"
      >
        {/* MAIN · KPIs + intents + latencia + sparkline + audios */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat label="Admins ativos" value={String(activeAdmins)} subtitle="estado atual" tone="ok" />
            <Stat label="Queries hoje" value={String(today.total)} subtitle={`${today.failure} falhas`} />
            <Stat
              label={`Queries ${rangeLbl}`}
              value={String(period.total)}
              subtitle={`avg ${period.avgResponseMs}ms`}
            />
            <Stat
              label={`Error rate ${rangeLbl}`}
              value={`${errorRate}%`}
              subtitle={`${period.failure}/${period.total}`}
              tone={errorRate >= 10 ? 'warn' : errorRate <= 2 ? 'ok' : 'default'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Section title={`Top intents · ${rangeLbl}`}>
              {period.topIntents.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] py-2">
                  Sem dados no período selecionado.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {period.topIntents.map((it) => {
                    const max = period.topIntents[0]?.count ?? 1
                    const pct = Math.round((it.count / max) * 100)
                    return (
                      <div key={it.intent}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="font-mono text-[#F5F0E8]">{it.intent}</span>
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
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 flex flex-col">
                <Row label="Hoje" value={`${today.avgResponseMs} ms`} />
                <Row label={rangeLbl} value={`${period.avgResponseMs} ms`} last />
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
            <Section title={`Queries por dia · ${sparkDays}d`}>
              {daily.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] py-2">Sem dados.</p>
              ) : (
                <div className="flex items-end gap-1.5 h-[110px] pt-2">
                  {daily.map((d) => {
                    const h = Math.max(6, Math.round((d.total / maxDay) * 80))
                    const dayLabel = new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                    return (
                      <div
                        key={d.day}
                        className="flex flex-col items-center gap-1 flex-1 min-w-0"
                        title={`${dayLabel}: ${d.total} queries`}
                      >
                        <div className="text-[10px] font-bold text-[#F5F0E8] font-mono leading-none">
                          {d.total}
                        </div>
                        <div
                          className="w-full max-w-[28px] rounded-t bg-[#C9A96E]/80 hover:bg-[#C9A96E] transition-colors"
                          style={{ height: `${h}px` }}
                        />
                        <div className="text-[9px] text-[#6B7280] font-mono">{dayLabel}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            <Section title="Áudios este mês">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(139,92,246,0.15)',
                    color: '#A78BFA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  🎤
                </div>
                <div>
                  <div className="text-2xl font-semibold text-[#F5F0E8] font-mono leading-none">
                    {voiceCount}
                  </div>
                  <div className="text-[11px] text-[#9CA3AF] mt-1">
                    transcrições · mês
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* ASIDE direita · Saude do sistema */}
        <SystemHealthAside snap={sysHealth} rangeLbl={rangeLbl} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Saude do sistema · aside (4 mini-cards)
// ═══════════════════════════════════════════════════════════════════════

function SystemHealthAside({
  snap,
  rangeLbl,
}: {
  snap: SystemHealthSnapshot | null
  rangeLbl: string
}) {
  if (!snap) {
    return (
      <Section title="Saúde do sistema">
        <p className="text-xs text-[#9CA3AF] py-2">Sem dados de saúde.</p>
      </Section>
    )
  }
  const d = snap.dispatch || ({} as SystemHealthSnapshot['dispatch'])
  const i = snap.insights || ({} as SystemHealthSnapshot['insights'])
  const v = snap.vouchers || ({} as SystemHealthSnapshot['vouchers'])
  const c = snap.counts || ({} as SystemHealthSnapshot['counts'])

  return (
    <aside
      className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5"
      style={{ position: 'sticky', top: 12 }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
          Saúde do sistema
        </h3>
        <span className="text-[9px] text-[#6B7280] font-mono">
          {fmtTime(snap.computed_at)}
        </span>
      </div>

      <HealthCard
        title="Disparos · WhatsApp"
        healthy={!!d.healthy}
        rows={[
          ['Último envio', relativeTime(d.last_at)],
          ['Status', d.last_status || '—'],
        ]}
      />
      <HealthCard
        title="Insights · Claude"
        healthy={!!i.healthy}
        rows={[
          ['Último insight', relativeTime(i.last_at)],
          [`Gerados (30d)`, String(i.cnt_30d || 0)],
          ['Cron', '08:15 BRT'],
        ]}
      />
      <HealthCard
        title="Vouchers"
        healthy={!!v.healthy}
        rows={[['Último emitido', relativeTime(v.last_issued_at)]]}
      />
      <HealthCard
        title="Contagens globais"
        healthy
        rows={[
          ['Parcerias ativas', String(c.partnerships_active || 0)],
          ['Templates', String(c.active_templates || 0)],
          ['Admins', String(c.active_admins || 0)],
          ['Crons B2B', String(c.crons_active || 0)],
        ]}
      />

      <div className="text-[9px] text-[#6B7280] mt-1 italic">
        Janela: {rangeLbl} · saúde é snapshot atual (não reage ao picker)
      </div>
    </aside>
  )
}

function HealthCard({
  title,
  healthy,
  rows,
}: {
  title: string
  healthy: boolean
  rows: [string, string][]
}) {
  const tone = healthy ? 'text-[#10B981]' : 'text-[#F59E0B]'
  return (
    <div className="bg-black/15 border border-white/5 rounded-md p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <strong className="text-[11px] text-[#F5F0E8]">{title}</strong>
        <span className={`text-[9px] uppercase tracking-[1px] font-bold ${tone}`}>
          {healthy ? '● ok' : '● atenção'}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between text-[10.5px]"
          >
            <span className="text-[#9CA3AF]">{k}</span>
            <span className="text-[#F5F0E8] font-mono">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Components compartilhados
// ═══════════════════════════════════════════════════════════════════════

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
    <div className="bg-white/[0.02] border border-white/10 rounded-lg px-3.5 py-3 hover:border-white/14 transition-colors">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
          {label}
        </span>
        <span className={`text-[9px] uppercase tracking-[1.2px] font-bold px-1.5 py-0.5 rounded ${accentBadge}`}>
          {dotLabel}
        </span>
      </div>
      <div className="text-2xl font-semibold text-[#F5F0E8] font-mono leading-none">{value}</div>
      {subtitle && <div className="text-[11px] text-[#6B7280] mt-1.5">{subtitle}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E] mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-[11.5px] ${last ? '' : 'border-b border-dashed border-white/10'}`}>
      <span className="text-[#9CA3AF]">{label}</span>
      <span className="text-[#F5F0E8] font-mono">{value}</span>
    </div>
  )
}
