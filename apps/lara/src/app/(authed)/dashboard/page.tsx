/**
 * Dashboard · Lara · Server Component.
 *
 * Mostra metricas do dia + 7 dias:
 *   - Custo IA (Anthropic + Groq) via BudgetRepository
 *   - Mensagens trafegadas via MessageRepository.countByDirection
 *   - Conversas ativas / aguardando humano / transbordadas via ConversationRepository.count
 *   - Funnel breakdown (olheiras vs fullface vs procedimentos)
 *
 * Multi-tenant ADR-028 · queries escopadas por clinic_id (JWT).
 * ADR-012 · todo acesso via Repositories (sem supabase.from inline).
 */

import {
  DollarSign,
  MessageCircle,
  Users,
  Activity,
  TrendingUp,
  Phone,
  Clock,
} from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'

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

function emptyStats(): Stats {
  return {
    cost_today_usd: 0,
    cost_7d_usd: 0,
    msgs_today_in: 0,
    msgs_today_out: 0,
    msgs_7d_in: 0,
    msgs_7d_out: 0,
    active_conversations: 0,
    waiting_human: 0,
    transbordo_today: 0,
    funnel_breakdown: {},
    total_leads: 0,
    leads_today: 0,
  }
}

async function loadStatsRaw(): Promise<Stats> {
  const { ctx, repos } = await loadServerReposContext()
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const todayIso = new Date(today + 'T00:00:00.000Z').toISOString()

  // Custo IA · hoje + 7 dias
  const [costToday, cost7d] = await Promise.all([
    repos.budget.getTodayCost(ctx.clinic_id),
    repos.budget.getRecentCost(ctx.clinic_id, 7),
  ])

  // Mensagens (in/out) hoje + 7 dias · 1 query por janela
  const [todayMsgs, weekMsgs] = await Promise.all([
    repos.messages.countByDirection(ctx.clinic_id, todayIso),
    repos.messages.countByDirection(ctx.clinic_id, sevenDaysAgo),
  ])

  // Conversas
  const [activeConvs, waitingHuman, transbordoToday] = await Promise.all([
    repos.conversations.count(ctx.clinic_id, { statuses: ['active'] }),
    repos.conversations.count(ctx.clinic_id, {
      statuses: ['active', 'paused'],
      aiEnabled: false,
    }),
    repos.conversations.count(ctx.clinic_id, {
      statuses: ['dra'],
      lastMessageSince: todayIso,
    }),
  ])

  // Funnel breakdown via LeadRepository.countByFunnels
  const funnel_breakdown = await repos.leads.countByFunnels(ctx.clinic_id, [
    'olheiras',
    'fullface',
    'procedimentos',
  ])

  // Leads totais + criados hoje
  const [totalLeads, leadsToday] = await Promise.all([
    repos.leads.count(ctx.clinic_id),
    repos.leads.count(ctx.clinic_id, { createdSince: todayIso }),
  ])

  return {
    cost_today_usd: costToday,
    cost_7d_usd: cost7d,
    msgs_today_in: todayMsgs.inbound,
    msgs_today_out: todayMsgs.outbound,
    msgs_7d_in: weekMsgs.inbound,
    msgs_7d_out: weekMsgs.outbound,
    active_conversations: activeConvs,
    waiting_human: waitingHuman,
    transbordo_today: transbordoToday,
    funnel_breakdown,
    total_leads: totalLeads,
    leads_today: leadsToday,
  }
}

async function loadStats(): Promise<Stats> {
  try {
    return await loadStatsRaw()
  } catch (e) {
    console.error('[/dashboard] loadStats failed:', (e as Error).message, (e as Error).stack)
    return emptyStats()
  }
}

export default async function DashboardPage() {
  const stats = await loadStats()

  const usd = (n: number) => `$${n.toFixed(2)}`
  const msgsTodayTotal = stats.msgs_today_in + stats.msgs_today_out
  const msgs7dTotal = stats.msgs_7d_in + stats.msgs_7d_out

  return (
    <PageContainer variant="wide">
      <PageHero
        kicker="Painel · Lara"
        title={<>Visão <em>geral</em></>}
        lede="Saúde da Lara · métricas de hoje + últimos 7 dias"
      />

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
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--b2b-ivory)' }}>{labels[funnel] ?? funnel}</span>
                      <span style={{ color: 'var(--b2b-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--b2b-bg-3)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          background: 'var(--b2b-champagne)',
                          width: `${pct}%`,
                          transition: 'width 0.3s ease',
                        }}
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
        <div
          style={{
            marginTop: 32,
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 2,
            fontWeight: 600,
          }}
        >
          <Phone className="inline w-3 h-3 mr-1.5" />
          Lara em produção · Meta Cloud API · Sonnet 4.6 · Whisper-large-v3
        </div>
    </PageContainer>
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
  const toneColor =
    tone === 'warn'
      ? 'var(--b2b-amber)'
      : tone === 'success'
        ? 'var(--b2b-sage)'
        : 'var(--b2b-champagne)'
  const toneBg =
    tone === 'warn'
      ? 'rgba(245, 158, 11, 0.08)'
      : tone === 'success'
        ? 'rgba(138, 158, 136, 0.08)'
        : 'rgba(201, 169, 110, 0.06)'
  return (
    <div
      className="luxury-card"
      style={{ padding: 16, borderColor: tone === 'default' ? undefined : `${toneColor}40` }}
    >
      <div
        style={{
          display: 'inline-flex',
          padding: 6,
          borderRadius: 4,
          background: toneBg,
          color: toneColor,
          marginBottom: 10,
        }}
      >
        {icon}
      </div>
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="font-display"
        style={{
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--b2b-ivory)',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 4 }}>{subtitle}</div>
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
    <div className="luxury-card" style={{ padding: 20 }}>
      <h3
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: 'var(--b2b-champagne)',
          fontWeight: 600,
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: '1px solid var(--b2b-border)',
        }}
      >
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '8px 0',
        borderBottom: '1px solid var(--b2b-border)',
      }}
    >
      <div>
        <div style={{ color: 'var(--b2b-ivory)', fontSize: 13 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 10, color: 'var(--b2b-text-muted)', marginTop: 2 }}>{hint}</div>
        )}
      </div>
      <div
        className="font-display"
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--b2b-champagne)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}
