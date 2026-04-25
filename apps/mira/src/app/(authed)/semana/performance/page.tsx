/**
 * /semana/performance · dashboard de performance por parceira.
 *
 * Item F da auditoria do Alden ("a coisa mais valiosa da lista") · expoe
 * dados de attribution/health/vouchers que ja existem no banco mas nao
 * tinham UI ate agora.
 *
 * Cards principais:
 *   1. Top 5 performers 30d (ranking por attributions)
 *   2. Lista de parcerias ativas com KPIs por linha:
 *      - vouchers emitidos no mes
 *      - attributions purchased/redeemed
 *      - alertas de saude (count + severidade max)
 *      - status pill
 *
 * Cada linha clicavel · drill-down /partnerships/[id]?tab=performance
 * (aba existente do detail).
 */

import Link from 'next/link'
import { ArrowRight, TrendingUp, AlertTriangle } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

export default async function PerformancePage() {
  const { ctx, repos } = await loadMiraServerContext()

  const [activePartners, topPerformers] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }),
    repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 5),
  ])

  // Pra cada parceria ativa, busca attributions e alertas em paralelo
  const enriched = await Promise.all(
    activePartners.map(async (p) => {
      const [attribs, alerts] = await Promise.all([
        repos.b2bAttributions.listByPartnership(p.id, 50),
        repos.b2bPartnerships.healthSnapshot(p.id),
      ])
      const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000
      const attribs30d = attribs.filter((a) => new Date(a.createdAt).getTime() >= since30)
      const purchased = attribs30d.filter((a) => a.attributionType === 'purchased').length
      const redeemed = attribs30d.filter((a) => a.attributionType === 'redeemed').length
      const issued = attribs30d.filter((a) => a.attributionType === 'voucher').length
      const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length
      const warningAlerts = alerts.filter((a) => a.severity === 'warning').length
      return { partnership: p, issued, purchased, redeemed, criticalAlerts, warningAlerts, alerts }
    }),
  )

  // Ordena por (criticalAlerts DESC, purchased DESC) · saude critica primeiro
  enriched.sort((a, b) => {
    if (a.criticalAlerts !== b.criticalAlerts) return b.criticalAlerts - a.criticalAlerts
    return b.purchased - a.purchased
  })

  const totalIssued = enriched.reduce((s, e) => s + e.issued, 0)
  const totalPurchased = enriched.reduce((s, e) => s + e.purchased, 0)
  const totalRedeemed = enriched.reduce((s, e) => s + e.redeemed, 0)
  const totalAlerts = enriched.reduce((s, e) => s + e.criticalAlerts + e.warningAlerts, 0)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/8">
          <span className="eyebrow text-[#C9A96E]">Semana · Performance</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Como cada parceria está performando
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Métricas rolling 30d · attributions = lead/orçamento/paciente vinculado a uma parceria
          </p>
        </div>

        {/* KPIs gerais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Vouchers emit. 30d" value={totalIssued} accent="#C9A96E" />
          <KpiCard label="Leads atribuídos" value={totalPurchased} accent="#10B981" />
          <KpiCard label="Vouchers resgatados" value={totalRedeemed} accent="#10B981" />
          <KpiCard
            label="Alertas ativos"
            value={totalAlerts}
            accent={totalAlerts > 0 ? '#F59E0B' : '#6B7280'}
          />
        </div>

        {/* Top 5 performers */}
        {topPerformers.length > 0 && (
          <section className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#C9A96E]" />
              <span className="eyebrow text-[#C9A96E]">Top 5 · 30 dias</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {topPerformers.map((tp, i) => (
                <Link
                  key={tp.partnership.id}
                  href={`/partnerships/${tp.partnership.id}?tab=performance`}
                  className="rounded-md border border-white/10 bg-white/[0.02] p-3 hover:border-[#C9A96E]/40 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-display text-lg text-[#C9A96E] leading-none">{i + 1}</span>
                    <span className="text-[10px] text-[#6B7280]">·</span>
                    <span className="font-mono text-[12px] text-[#F5F0E8] font-bold">
                      {tp.count}
                    </span>
                    <span className="text-[10px] uppercase tracking-[1px] text-[#6B7280]">
                      attribs
                    </span>
                  </div>
                  <span className="text-[12px] text-[#F5F0E8] truncate block">
                    {tp.partnership.name}
                  </span>
                  {tp.partnership.pillar && (
                    <span className="text-[10px] uppercase tracking-[1px] text-[#9CA3AF] mt-0.5 block">
                      {tp.partnership.pillar}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Lista completa */}
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="eyebrow text-[#9CA3AF]">
              Todas as parcerias ativas ({enriched.length})
            </span>
            <span className="text-[10px] text-[#6B7280]">
              ordem: alertas críticos → leads atribuídos
            </span>
          </div>

          {enriched.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhuma parceria ativa · cadastra uma em Estúdio › Cadastrar parceria
            </div>
          ) : (
            enriched.map((e) => <PartnerRow key={e.partnership.id} data={e} />)
          )}
        </section>
      </div>
    </main>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="font-display text-3xl leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="eyebrow text-[#9CA3AF] mt-2">{label}</div>
    </div>
  )
}

function PartnerRow({
  data,
}: {
  data: {
    partnership: { id: string; name: string; pillar: string | null; status: string }
    issued: number
    purchased: number
    redeemed: number
    criticalAlerts: number
    warningAlerts: number
    alerts: Array<{ severity: string; message: string }>
  }
}) {
  const { partnership, issued, purchased, redeemed, criticalAlerts, warningAlerts, alerts } = data
  const conversionRate = issued > 0 ? Math.round((purchased / issued) * 100) : 0

  return (
    <Link
      href={`/partnerships/${partnership.id}?tab=performance`}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-4 hover:border-[#C9A96E]/40 hover:bg-white/[0.04] transition-colors"
    >
      {/* Health dot */}
      <div className="shrink-0">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            criticalAlerts > 0
              ? 'bg-[#EF4444]'
              : warningAlerts > 0
                ? 'bg-[#F59E0B]'
                : 'bg-[#10B981]'
          }`}
        />
      </div>

      {/* Nome + pilar */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[#F5F0E8] font-medium truncate">{partnership.name}</div>
        {partnership.pillar && (
          <div className="eyebrow text-[#9CA3AF] mt-0.5">{partnership.pillar}</div>
        )}
        {alerts.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-[#F59E0B]">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span className="truncate">{alerts[0].message}</span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="hidden md:flex items-center gap-4 shrink-0">
        <Stat label="Vouchers" value={issued} />
        <Stat label="Leads" value={purchased} accent="#10B981" />
        <Stat label="Resgates" value={redeemed} accent="#10B981" />
        <Stat label="Conv." value={`${conversionRate}%`} accent="#C9A96E" />
      </div>

      <ArrowRight className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
    </Link>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="text-center">
      <div
        className="font-mono text-[14px] font-bold leading-none"
        style={{ color: accent || '#F5F0E8' }}
      >
        {value}
      </div>
      <div className="eyebrow text-[#6B7280] mt-1">{label}</div>
    </div>
  )
}
