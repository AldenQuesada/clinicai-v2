/**
 * Dashboard · Lara · Server Component.
 *
 * Mostra metricas do dia + 7 dias:
 *   - Custo IA (Anthropic + Groq) via v_ai_budget_today
 *   - Mensagens trafegadas (inbound + outbound)
 *   - Conversas ativas / aguardando humano / transbordadas
 *   - Funnel breakdown (olheiras vs fullface vs procedimentos)
 *
 * Multi-tenant ADR-028 · queries escopadas por clinic_id resolvido via JWT.
 */

import { cookies } from 'next/headers'
import { createServerClient, requireClinicContext } from '@clinicai/supabase'
import {
  DollarSign,
  MessageCircle,
  Users,
  Activity,
  TrendingUp,
  Phone,
  Clock,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Stats {
  cost_today_usd: number
  cost_7d_usd: number
  msgs_today_in: number
  msgs_today_out: number
  msgs_7d_in: number
  msgs_7d_out: number
  active_conversations: number
  waiting_human: number
  transbordo_today: number
  funnel_breakdown: Record<string, number>
  total_leads: number
  leads_today: number
}

async function loadStats(): Promise<Stats> {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  const ctx = await requireClinicContext(supabase)
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const todayIso = new Date(today + 'T00:00:00.000Z').toISOString()

  // Cost via v_ai_budget_today (hoje · single row por clinic_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayBudget = await (supabase.from('v_ai_budget_today') as any)
    .select('total_cost_usd')
    .eq('clinic_id', ctx.clinic_id)
    .maybeSingle()

  // Cost 7 dias · soma direta na tabela
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sevenDayBudget = await (supabase.from('_ai_budget') as any)
    .select('cost_usd')
    .eq('clinic_id', ctx.clinic_id)
    .gte('day_bucket', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))

  const cost_7d_usd = (sevenDayBudget.data ?? []).reduce(
    (sum: number, r: { cost_usd: number }) => sum + Number(r.cost_usd ?? 0),
    0,
  )

  // Mensagens hoje (inbound + outbound separado)
  const [msgsTodayIn, msgsTodayOut, msgs7dIn, msgs7dOut] = await Promise.all([
    supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('direction', 'inbound')
      .gte('sent_at', todayIso),
    supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('direction', 'outbound')
      .gte('sent_at', todayIso),
    supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('direction', 'inbound')
      .gte('sent_at', sevenDaysAgo),
    supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('direction', 'outbound')
      .gte('sent_at', sevenDaysAgo),
  ])

  // Conversas
  const [activeConvs, waitingHuman, transbordoToday] = await Promise.all([
    supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('status', 'active'),
    supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('ai_enabled', false)
      .in('status', ['active', 'paused']),
    supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .eq('status', 'dra')
      .gte('last_message_at', todayIso),
  ])

  // Funnel breakdown · agregação manual (Postgres agg via RPC seria ideal, mas count por filter funciona)
  const funnels = ['olheiras', 'fullface', 'procedimentos']
  const funnelEntries = await Promise.all(
    funnels.map(async (f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from('leads') as any)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', ctx.clinic_id)
        .eq('funnel', f)
      return [f, count ?? 0] as [string, number]
    }),
  )
  const funnel_breakdown = Object.fromEntries(funnelEntries)

  // Leads totais
  const [totalLeads, leadsToday] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinic_id)
      .gte('created_at', todayIso),
  ])

  return {
    cost_today_usd: Number(todayBudget.data?.total_cost_usd ?? 0),
    cost_7d_usd,
    msgs_today_in: msgsTodayIn.count ?? 0,
    msgs_today_out: msgsTodayOut.count ?? 0,
    msgs_7d_in: msgs7dIn.count ?? 0,
    msgs_7d_out: msgs7dOut.count ?? 0,
    active_conversations: activeConvs.count ?? 0,
    waiting_human: waitingHuman.count ?? 0,
    transbordo_today: transbordoToday.count ?? 0,
    funnel_breakdown,
    total_leads: totalLeads.count ?? 0,
    leads_today: leadsToday.count ?? 0,
  }
}

export default async function DashboardPage() {
  const stats = await loadStats()

  const usd = (n: number) => `$${n.toFixed(2)}`
  const msgsTodayTotal = stats.msgs_today_in + stats.msgs_today_out
  const msgs7dTotal = stats.msgs_7d_in + stats.msgs_7d_out

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
            Saúde da Lara · métricas de hoje + últimos 7 dias
          </p>
        </div>

        {/* Stat cards principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Custo IA hoje"
            value={usd(stats.cost_today_usd)}
            subtitle={`7 dias: ${usd(stats.cost_7d_usd)}`}
            tone={stats.cost_today_usd >= 4 ? 'warn' : 'default'}
          />
          <StatCard
            icon={<MessageCircle className="w-5 h-5" />}
            label="Mensagens hoje"
            value={String(msgsTodayTotal)}
            subtitle={`${stats.msgs_today_in} in · ${stats.msgs_today_out} out`}
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Conversas ativas"
            value={String(stats.active_conversations)}
            subtitle={`${stats.waiting_human} aguardando humano`}
            tone={stats.waiting_human > 0 ? 'warn' : 'default'}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Leads totais"
            value={String(stats.total_leads)}
            subtitle={`+${stats.leads_today} hoje`}
            tone="success"
          />
        </div>

        {/* Funnel breakdown + 7 dias */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Funis dos leads" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="space-y-3">
              {Object.entries(stats.funnel_breakdown).map(([funnel, count]) => {
                const total = Object.values(stats.funnel_breakdown).reduce(
                  (s, v) => s + v,
                  0,
                )
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                const labels: Record<string, string> = {
                  olheiras: 'Olheiras (Smooth Eyes)',
                  fullface: 'Full Face (Lifting 5D)',
                  procedimentos: 'Procedimentos Gerais',
                }
                return (
                  <div key={funnel}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[hsl(var(--foreground))]">
                        {labels[funnel] ?? funnel}
                      </span>
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {count} ({pct}%)
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
          </SectionCard>

          <SectionCard title="Últimos 7 dias" icon={<Clock className="w-4 h-4" />}>
            <div className="space-y-4 text-sm">
              <Row label="Mensagens trafegadas" value={String(msgs7dTotal)} />
              <Row label="Inbound (paciente)" value={String(stats.msgs_7d_in)} />
              <Row label="Outbound (Lara + humano)" value={String(stats.msgs_7d_out)} />
              <Row label="Custo IA acumulado" value={usd(stats.cost_7d_usd)} />
              <Row
                label="Transbordo hoje"
                value={String(stats.transbordo_today)}
                hint="conversas que escalaram pra Dra. Mirian"
              />
            </div>
          </SectionCard>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-widest">
          <Phone className="inline w-3 h-3 mr-1.5" />
          Lara em produção · Meta Cloud API · Sonnet 4.6 · Whisper-large-v3
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
      ? 'border-yellow-500/30 bg-yellow-500/5'
      : tone === 'success'
      ? 'border-green-500/20 bg-green-500/5'
      : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]'
  const iconTone =
    tone === 'warn'
      ? 'text-yellow-500 bg-yellow-500/10'
      : tone === 'success'
      ? 'text-green-500 bg-green-500/10'
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

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-[hsl(var(--chat-border))] last:border-0">
      <div>
        <div className="text-[hsl(var(--foreground))]">{label}</div>
        {hint && <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{hint}</div>}
      </div>
      <div className="font-bold text-[hsl(var(--primary))]">{value}</div>
    </div>
  )
}
