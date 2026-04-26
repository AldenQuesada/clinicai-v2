/**
 * Dashboard · Mira · admin denso (mirror mira-config antigo).
 *
 * KPIs B2B do dia + 7d + 30d:
 *   - Custo IA (BudgetRepository · compartilhado com Lara)
 *   - Parcerias ativas total
 *   - Vouchers emitidos hoje + 7d
 *   - Conversoes 30d (vouchers redeemed/purchased)
 *   - Top 5 parceiras 30d (rolling attributions)
 *   - Alerts criticos (best-effort via b2b_critical_alerts RPC se existir)
 *
 * Visual: max-w-[960px], gap denso, cards 8px radius, gold tinted accents.
 * Sem cursive italic, sem shadow-luxury, sem rounded-card 20px.
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import { createLogger } from '@clinicai/logger'
import type { Insight } from '@clinicai/repositories'
import { InsightsBanner } from './InsightsBanner'

const log = createLogger({ app: 'mira' })

// Wrapper · sempre retorna fallback se promise rejeitar · loga erro
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    log.warn({ kpi: label, err: (err as Error)?.message }, 'dashboard.kpi.failed')
    return fallback
  }
}

export const dynamic = 'force-dynamic'

interface DashboardStats {
  costTodayUsd: number
  cost7dUsd: number
  partnershipsActive: number
  partnershipsPaused: number
  partnershipsPending: number
  vouchersToday: number
  vouchers7d: number
  conversions30d: number
  vouchers30d: number
  topPerformers: Array<{ name: string; pillar: string; count: number }>
  insights: Insight[]
}

async function loadStats(): Promise<DashboardStats> {
  const { ctx, repos } = await loadMiraServerContext()
  const todayIso = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Cada KPI tolerante a erro · 1 falha nao crasha o dashboard inteiro
  const [
    costToday,
    cost7d,
    partnershipsActive,
    partnershipsPaused,
    partnershipsPending,
    vouchersToday,
    vouchers7d,
    conversions30d,
    vouchers30d,
    topPerformers,
  ] = await Promise.all([
    safe('costToday',         () => repos.budget.getTodayCost(ctx.clinic_id), 0),
    safe('cost7d',            () => repos.budget.getRecentCost(ctx.clinic_id, 7), 0),
    safe('partnershipsActive',() => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'active' }), 0),
    safe('partnershipsPaused',() => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'paused' }), 0),
    safe('partnershipsPending',() => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'dna_check' }), 0),
    safe('vouchersToday',     () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, todayIso), 0),
    safe('vouchers7d',        () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, sevenDaysAgo), 0),
    safe('conversions30d',    () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDaysAgo, { status: ['redeemed', 'opened'] }), 0),
    safe('vouchers30d',       () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDaysAgo), 0),
    safe('topPerformers',     () => repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 5), [] as Awaited<ReturnType<typeof repos.b2bPartnerships.topPerformers30d>>),
  ])

  // Insights cross-partnership · b2b_insights_global (mig 800-19)
  const insightsRes = await safe('insights', () => repos.b2bInsights.global(), null)
  const insights: Insight[] = insightsRes?.insights ?? []

  return {
    costTodayUsd: costToday,
    cost7dUsd: cost7d,
    partnershipsActive,
    partnershipsPaused,
    partnershipsPending,
    vouchersToday,
    vouchers7d,
    conversions30d,
    vouchers30d,
    topPerformers: topPerformers.map((tp) => ({
      name: tp.partnership.name,
      pillar: tp.partnership.pillar,
      count: tp.count,
    })),
    insights,
  }
}

export default async function DashboardPage() {
  const stats = await loadStats()
  const usd = (n: number) => `$${n.toFixed(2)}`
  const conversionRate = stats.vouchers30d > 0
    ? Math.round((stats.conversions30d / stats.vouchers30d) * 100)
    : 0

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div>
            <span className="eyebrow text-[#C9A96E]">Hoje · Caixa do dia</span>
            <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Visão geral</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              Mira admin · saúde B2B · hoje + 7/30 dias
            </p>
          </div>
          <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
            Evolution API · WhatsApp B2B
          </div>
        </div>

        {/* Banner topo · insight critico/warning prioritario */}
        <InsightsBanner insights={stats.insights} />

        {/* KPI cards densos · 4 colunas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <KpiCard
            label="Parcerias ativas"
            value={String(stats.partnershipsActive)}
            subtitle={`${stats.partnershipsPaused} pausadas · ${stats.partnershipsPending} aguardando`}
            tone="ok"
          />
          <KpiCard
            label="Vouchers hoje"
            value={String(stats.vouchersToday)}
            subtitle={`7 dias: ${stats.vouchers7d}`}
          />
          <KpiCard
            label="Conversões 30d"
            value={`${stats.conversions30d}/${stats.vouchers30d}`}
            subtitle={`Taxa: ${conversionRate}%`}
            tone={conversionRate >= 30 ? 'ok' : conversionRate < 10 ? 'warn' : 'default'}
          />
          <KpiCard
            label="Custo IA hoje"
            value={usd(stats.costTodayUsd)}
            subtitle={`7 dias: ${usd(stats.cost7dUsd)}`}
            tone={stats.costTodayUsd >= 4 ? 'warn' : 'default'}
          />
        </div>

        {/* Top performers + alerts · 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-1">
          <Section title="Top 5 parceiras · 30 dias">
            {stats.topPerformers.length === 0 ? (
              <EmptyBlock
                message="Nenhuma atribuição nos últimos 30 dias."
                hint="Vouchers resgatados aparecem aqui após a primeira conversão."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {stats.topPerformers.map((tp, idx) => {
                  const max = stats.topPerformers[0]?.count ?? 1
                  const pct = max > 0 ? Math.round((tp.count / max) * 100) : 0
                  return (
                    <div key={`${tp.name}-${idx}`}>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#C9A96E]/18 text-[#C9A96E] text-[9px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-[#F5F0E8] font-medium truncate">
                            {tp.name}
                          </span>
                          <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280] shrink-0">
                            {tp.pillar}
                          </span>
                        </div>
                        <span className="text-[#C9A96E] font-mono font-bold shrink-0 ml-2 text-[11px]">
                          {tp.count} {tp.count === 1 ? 'lead' : 'leads'}
                        </span>
                      </div>
                      <div className="h-1 bg-white/5 rounded overflow-hidden">
                        <div
                          className="h-full bg-[#C9A96E] rounded transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          <Section
            title="Insights cross-parcerias"
            extra={
              <Link
                href="/insights"
                className="text-[10px] uppercase tracking-[1.2px] text-[#9CA3AF] hover:text-[#C9A96E] transition-colors"
              >
                Ver todos →
              </Link>
            }
          >
            {stats.insights.length === 0 ? (
              <EmptyBlock
                message="Tudo verde · nenhum insight ativo."
                hint="Mira monitora cap, saúde, conversão, NPS e atividade cross-parcerias."
                tone="ok"
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {stats.insights.slice(0, 5).map((a, i) => {
                  const isCritical = a.severity === 'critical'
                  const isWarning = a.severity === 'warning'
                  const isSuccess = a.severity === 'success'
                  const styleBorder = isCritical
                    ? 'border-[#EF4444]/30 bg-[#EF4444]/8'
                    : isWarning
                      ? 'border-[#F59E0B]/30 bg-[#F59E0B]/8'
                      : isSuccess
                        ? 'border-[#10B981]/30 bg-[#10B981]/8'
                        : 'border-[#C9A96E]/30 bg-[#C9A96E]/8'
                  const labelColor = isCritical
                    ? 'text-[#FCA5A5]'
                    : isWarning
                      ? 'text-[#F59E0B]'
                      : isSuccess
                        ? 'text-[#10B981]'
                        : 'text-[#C9A96E]'
                  return (
                    <Link
                      key={`${a.kind}-${a.partnership_id}-${i}`}
                      href={a.action_url}
                      className={`block px-3 py-2 rounded-lg border text-xs hover:bg-white/[0.03] transition-colors ${styleBorder}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-[1.2px] ${labelColor}`}>
                          {a.title}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-white/5 ${labelColor}`}>
                          {a.severity}
                        </span>
                      </div>
                      <div className="text-[#F5F0E8] text-[12px]">{a.message}</div>
                    </Link>
                  )
                })}
                {stats.insights.length > 5 && (
                  <Link
                    href="/insights"
                    className="text-[11px] text-[#9CA3AF] hover:text-[#C9A96E] transition-colors text-center pt-1.5 border-t border-dashed border-white/5"
                  >
                    + {stats.insights.length - 5} insights · ver lista completa
                  </Link>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </main>
  )
}

function KpiCard({
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
  const dotLabel =
    tone === 'warn' ? 'Alerta' : tone === 'ok' ? 'OK' : 'Live'
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
      {subtitle && (
        <div className="text-[11px] text-[#6B7280] mt-1.5">{subtitle}</div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  extra,
}: {
  title: string
  children: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
          {title}
        </h3>
        {extra}
      </div>
      {children}
    </div>
  )
}

function EmptyBlock({
  message,
  hint,
  tone = 'default',
}: {
  message: string
  hint?: string
  tone?: 'default' | 'ok'
}) {
  return (
    <div className={`py-5 text-center flex flex-col items-center gap-1.5 ${tone === 'ok' ? '' : ''}`}>
      <p className={`text-xs ${tone === 'ok' ? 'text-[#10B981]' : 'text-[#F5F0E8]'}`}>{message}</p>
      {hint && <p className="text-[11px] text-[#9CA3AF] max-w-xs">{hint}</p>}
    </div>
  )
}
