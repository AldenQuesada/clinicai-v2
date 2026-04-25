/**
 * Dashboard · Mira · Server Component.
 *
 * KPIs B2B do dia + 7d + 30d:
 *   - Custo IA (BudgetRepository · compartilhado com Lara)
 *   - Parcerias ativas total
 *   - Vouchers emitidos hoje + 7d
 *   - Conversoes 30d (vouchers redeemed/purchased)
 *   - Top 5 parceiras 30d (rolling attributions)
 *   - Alerts criticos (best-effort via b2b_critical_alerts RPC se existir)
 *
 * Multi-tenant ADR-028 · ctx.clinic_id obrigatorio. ADR-012 · todo acesso via
 * repositories.
 */

import {
  DollarSign,
  Handshake,
  Ticket,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Activity,
} from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

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
  criticalAlerts: Array<{ kind: string; severity: string; message: string }>
}

async function loadStats(): Promise<DashboardStats> {
  const { ctx, repos, supabase } = await loadMiraServerContext()
  const todayIso = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

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
    repos.budget.getTodayCost(ctx.clinic_id),
    repos.budget.getRecentCost(ctx.clinic_id, 7),
    repos.b2bPartnerships.count(ctx.clinic_id, { status: 'active' }),
    repos.b2bPartnerships.count(ctx.clinic_id, { status: 'paused' }),
    repos.b2bPartnerships.count(ctx.clinic_id, { status: 'dna_check' }),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, todayIso),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, sevenDaysAgo),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDaysAgo, {
      status: ['redeemed', 'opened'],
    }),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDaysAgo),
    repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 5),
  ])

  // Critical alerts · best-effort RPC
  let criticalAlerts: DashboardStats['criticalAlerts'] = []
  try {
    const { data } = await supabase.rpc('b2b_critical_alerts', { p_clinic_id: ctx.clinic_id })
    if (Array.isArray(data)) {
      criticalAlerts = (data as Array<{
        alert_kind?: string
        severity?: string
        message?: string
      }>).slice(0, 5).map((a) => ({
        kind: String(a.alert_kind ?? 'unknown'),
        severity: String(a.severity ?? 'info'),
        message: String(a.message ?? ''),
      }))
    }
  } catch {
    // RPC pode nao existir em prod · ignore
  }

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
    criticalAlerts,
  }
}

export default async function DashboardPage() {
  const stats = await loadStats()
  const usd = (n: number) => `$${n.toFixed(2)}`
  const conversionRate = stats.vouchers30d > 0
    ? Math.round((stats.conversions30d / stats.vouchers30d) * 100)
    : 0

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-[hsl(var(--foreground))]">
            <span className="font-cursive-italic text-[hsl(var(--primary))]">
              Visão geral
            </span>
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Mira · saúde B2B · hoje + últimos 7/30 dias
          </p>
        </div>

        {/* Stat cards principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Handshake className="w-5 h-5" />}
            label="Parcerias ativas"
            value={String(stats.partnershipsActive)}
            subtitle={`${stats.partnershipsPaused} pausadas · ${stats.partnershipsPending} aguardando`}
            tone="success"
          />
          <StatCard
            icon={<Ticket className="w-5 h-5" />}
            label="Vouchers hoje"
            value={String(stats.vouchersToday)}
            subtitle={`7 dias: ${stats.vouchers7d}`}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Conversões 30d"
            value={`${stats.conversions30d}/${stats.vouchers30d}`}
            subtitle={`Taxa: ${conversionRate}%`}
            tone={conversionRate >= 30 ? 'success' : conversionRate < 10 ? 'warn' : 'default'}
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Custo IA hoje"
            value={usd(stats.costTodayUsd)}
            subtitle={`7 dias: ${usd(stats.cost7dUsd)}`}
            tone={stats.costTodayUsd >= 4 ? 'warn' : 'default'}
          />
        </div>

        {/* Top performers + alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Top 5 parceiras · 30 dias" icon={<Sparkles className="w-4 h-4" />}>
            {stats.topPerformers.length === 0 ? (
              <div className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center">
                Nenhuma atribuição nos últimos 30 dias.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.topPerformers.map((tp, idx) => {
                  const max = stats.topPerformers[0]?.count ?? 1
                  const pct = max > 0 ? Math.round((tp.count / max) * 100) : 0
                  return (
                    <div key={`${tp.name}-${idx}`}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[hsl(var(--foreground))]">
                          {idx + 1}. {tp.name}
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                            {tp.pillar}
                          </span>
                        </span>
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {tp.count} {tp.count === 1 ? 'lead' : 'leads'}
                        </span>
                      </div>
                      <div className="h-2 bg-[hsl(var(--muted))] rounded-pill overflow-hidden">
                        <div
                          className="h-full bg-[hsl(var(--primary))] rounded-pill transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Alertas críticos" icon={<AlertTriangle className="w-4 h-4" />}>
            {stats.criticalAlerts.length === 0 ? (
              <div className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center flex items-center justify-center gap-2">
                <Activity className="w-4 h-4 text-[hsl(var(--success))]" />
                Tudo verde · nenhum alerta crítico aberto.
              </div>
            ) : (
              <div className="space-y-2">
                {stats.criticalAlerts.map((a, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2 rounded-md border text-xs ${
                      a.severity === 'critical'
                        ? 'border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5 text-[hsl(var(--danger))]'
                        : 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-[hsl(var(--warning))]'
                    }`}
                  >
                    <div className="font-display-uppercase text-[10px] tracking-widest mb-1">
                      {a.kind}
                    </div>
                    <div className="text-[hsl(var(--foreground))]">{a.message}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-8 text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-widest">
          Mira em produção · Evolution API · WhatsApp B2B + admin
        </div>
      </div>
    </main>
  )
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  tone?: 'default' | 'warn' | 'success'
}) {
  const toneClasses =
    tone === 'warn'
      ? 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5'
      : tone === 'success'
      ? 'border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5'
      : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]'
  const iconTone =
    tone === 'warn'
      ? 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10'
      : tone === 'success'
      ? 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10'
      : 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
  return (
    <div className={`rounded-card border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-md ${iconTone}`}>{icon}</div>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
        {label}
      </div>
      <div className="text-2xl font-bold text-[hsl(var(--foreground))] mt-1">{value}</div>
      {subtitle && (
        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{subtitle}</div>
      )}
    </div>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
      <h3 className="flex items-center gap-2 text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}
