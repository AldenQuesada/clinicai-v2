/**
 * /semana/relatorios · digests agregados em tempo real.
 *
 * Sem migration nova · agrega vouchers/attributions/parcerias via repos
 * existentes em 4 janelas:
 *   - Hoje (00:00 do dia local)
 *   - Últimos 7 dias
 *   - Últimos 30 dias
 *   - Mês corrente vs mes anterior (delta %)
 */

import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

function startOfMonthIso(monthsBack = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  if (monthsBack > 0) d.setMonth(d.getMonth() - monthsBack)
  return d.toISOString()
}

function endOfPrevMonthIso(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default async function RelatoriosPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const todayStart = startOfTodayIso()
  const since7 = daysAgoIso(7)
  const since30 = daysAgoIso(30)
  const monthStart = startOfMonthIso(0)
  const prevMonthStart = startOfMonthIso(1)
  const prevMonthEnd = endOfPrevMonthIso()

  const [
    todayVouchers,
    weekVouchers,
    monthVouchers,
    monthRedeemed,
    prevMonthVouchers,
    prevMonthRedeemed,
    activePartners,
    topPerformers,
  ] = await Promise.all([
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, todayStart),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, since7),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, monthStart),
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, monthStart, { status: 'redeemed' }),
    countByPeriodRange(repos, ctx.clinic_id, prevMonthStart, prevMonthEnd),
    countByPeriodRange(repos, ctx.clinic_id, prevMonthStart, prevMonthEnd, 'redeemed'),
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }),
    repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 5),
  ])

  const monthDelta = computeDelta(monthVouchers, prevMonthVouchers)
  const monthRedeemRate = monthVouchers > 0 ? Math.round((monthRedeemed / monthVouchers) * 100) : 0
  const prevRedeemRate =
    prevMonthVouchers > 0 ? Math.round((prevMonthRedeemed / prevMonthVouchers) * 100) : 0

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[920px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/8">
          <span className="eyebrow text-[#C9A96E]">Semana · Relatórios</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Digests do período</h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Snapshot agregado · vouchers / leads / parcerias em janelas comuns.
          </p>
        </div>

        {/* Janelas curtas */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DigestCard label="Hoje" sub={todayLabel()}>
            <Stat value={todayVouchers} label="vouchers emit." accent="#C9A96E" />
          </DigestCard>
          <DigestCard label="Últimos 7 dias" sub="janela móvel">
            <Stat value={weekVouchers} label="vouchers emit." accent="#C9A96E" />
          </DigestCard>
          <DigestCard label="Últimos 30 dias" sub="janela móvel">
            <Stat value={monthVouchers} label="vouchers emit." accent="#C9A96E" />
          </DigestCard>
        </section>

        {/* Mes corrente vs anterior */}
        <section className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-[#C9A96E]">Este mês vs mês anterior</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ComparisonStat
              label="Vouchers emitidos"
              current={monthVouchers}
              previous={prevMonthVouchers}
              delta={monthDelta}
            />
            <ComparisonStat
              label="Resgates"
              current={monthRedeemed}
              previous={prevMonthRedeemed}
              delta={computeDelta(monthRedeemed, prevMonthRedeemed)}
            />
            <ComparisonStat
              label="Conversão %"
              current={monthRedeemRate}
              previous={prevRedeemRate}
              delta={computeDelta(monthRedeemRate, prevRedeemRate)}
              suffix="%"
            />
            <ComparisonStat
              label="Parcerias ativas"
              current={activePartners.length}
              previous={activePartners.length}
              delta={0}
            />
          </div>
        </section>

        {/* Top performers */}
        {topPerformers.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="eyebrow text-[#9CA3AF]">Top 5 performers · 30d</span>
              <Link
                href="/semana/performance"
                className="text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#C9A96E]"
              >
                ver todas →
              </Link>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/8">
              {topPerformers.map((tp, i) => (
                <Link
                  key={tp.partnership.id}
                  href={`/partnerships/${tp.partnership.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="font-display text-lg text-[#C9A96E] w-6 text-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[12.5px] text-[#F5F0E8] truncate">
                    {tp.partnership.name}
                  </span>
                  <span className="font-mono text-[12px] text-[#F5F0E8] font-bold">
                    {tp.count}
                  </span>
                  <span className="eyebrow text-[#6B7280]">attribs</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

type RedeemableStatus = 'redeemed'

async function countByPeriodRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repos: any,
  clinicId: string,
  startIso: string,
  endIso: string,
  status?: RedeemableStatus,
): Promise<number> {
  // countByPeriod nao tem upper bound · pra previous month, usamos
  // (countAtPrevMonthStart) - (countAtCurrentMonthStart) como aproximacao.
  const filters = status ? { status } : {}
  const fromStart = await repos.b2bVouchers.countByPeriod(clinicId, startIso, filters)
  const fromEnd = await repos.b2bVouchers.countByPeriod(clinicId, endIso, filters)
  return Math.max(0, fromStart - fromEnd)
}

function DigestCard({
  label,
  sub,
  children,
}: {
  label: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
      <div>
        <div className="eyebrow text-[#9CA3AF]">{label}</div>
        <div className="text-[10px] text-[#6B7280] mt-0.5">{sub}</div>
      </div>
      {children}
    </div>
  )
}

function Stat({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <div>
      <div className="font-display text-3xl leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="eyebrow text-[#9CA3AF] mt-1">{label}</div>
    </div>
  )
}

function ComparisonStat({
  label,
  current,
  previous,
  delta,
  suffix,
}: {
  label: string
  current: number
  previous: number
  delta: number
  suffix?: string
}) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const accent = delta > 0 ? '#10B981' : delta < 0 ? '#FCA5A5' : '#9CA3AF'
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
      <div className="eyebrow text-[#9CA3AF]">{label}</div>
      <div className="font-display text-2xl text-[#F5F0E8] leading-none mt-1">
        {current}
        {suffix}
      </div>
      <div className="flex items-center gap-1 mt-1.5" style={{ color: accent }}>
        <Icon className="w-3 h-3" />
        <span className="text-[11px] font-mono">
          {delta > 0 ? '+' : ''}
          {delta}%
        </span>
        <span className="text-[10px] text-[#6B7280]">
          vs {previous}
          {suffix}
        </span>
      </div>
    </div>
  )
}
