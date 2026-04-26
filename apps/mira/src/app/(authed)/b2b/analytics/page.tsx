/**
 * /b2b/analytics · Visão geral do programa B2B agrupada por OBJETIVOS.
 *
 * 6 objetivos visuais (decisao 2026-04-25 com Alden):
 *   🎯 Crescimento de novas parcerias    (KPI grid · 5 cards)
 *   🎟 Atividade do voucher (volume)     (KPI 6 + Origem em 2-col)
 *   💰 Conversão da convidada (funil)    (JourneyBar wide)
 *   ⏱ Velocity / tempo de resposta      (KPI 2 + Atividade Mira em 2-col)
 *   🩺 Saúde do programa                 (HealthBar wide)
 *
 * IMPORT FIX 2026-04-26: parseTimeRange agora vem de ./_shared/timeRangeUtils
 * (modulo puro, server-safe). Antes vinha de TimeRangePicker.tsx que tem
 * 'use client' · Server Components nao podem chamar funcao de modulo client
 * (digest 941761223).
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import { TimeRangePicker } from './_shared/TimeRangePicker'
import { parseTimeRange, timeRangeLabel } from './_shared/timeRangeUtils'
import {
  analyzeOverview,
  type OverviewDiagnostic,
  type OverviewSignal,
  type SignalStatus,
} from './_shared/overviewAnalyzer'
import {
  computePop,
  computeVoucherPop,
  formatPopTooltip,
  type PopDelta,
} from './_shared/popUtils'
import { PopChip } from './_shared/PopChip'
import { FinancialCard } from './_shared/FinancialCard'
import type {
  AnalyticsBlob,
  B2BFunnelBenchmarkDTO,
  B2BFunnelStage,
  FinancialKpisBlob,
} from '@clinicai/repositories'

/**
 * Benchmarks de step-rate do funil B2B · agora vem da DB
 * (mig 800-26 · b2b_funnel_benchmarks · 1 row por stage por clinica).
 *
 * Mapa stage → { target, label } usado pelo JourneyBar e FunnelLegend.
 * Server fetcha via repos.b2bFunnelBenchmarks.list() e passa via prop.
 *
 * Verde · acima do benchmark
 * Amarelo · 50-100% do benchmark (zona de atenção)
 * Vermelho · abaixo de 50% do benchmark (problema)
 *
 * Editar em /b2b/config/regras (bloco Funnel).
 */
type FunnelBenchmarks = Record<B2BFunnelStage, { target: number; label: string }>

const FUNNEL_BENCHMARKS_FALLBACK: FunnelBenchmarks = {
  delivered: { target: 90, label: 'Taxa de entrega · WhatsApp aceito' },
  opened: { target: 60, label: 'Taxa de abertura · convidada engajou' },
  scheduled: {
    target: 50,
    label: 'Taxa de agendamento · CTA do voucher funcionou',
  },
  redeemed: {
    target: 80,
    label: 'Taxa de comparecimento · no-show < 20%',
  },
  purchased: {
    target: 35,
    label: 'Taxa de fechamento · combo case, scripts ok',
  },
}

function buildBenchmarks(rows: B2BFunnelBenchmarkDTO[]): FunnelBenchmarks {
  const out: FunnelBenchmarks = {
    delivered: { ...FUNNEL_BENCHMARKS_FALLBACK.delivered },
    opened: { ...FUNNEL_BENCHMARKS_FALLBACK.opened },
    scheduled: { ...FUNNEL_BENCHMARKS_FALLBACK.scheduled },
    redeemed: { ...FUNNEL_BENCHMARKS_FALLBACK.redeemed },
    purchased: { ...FUNNEL_BENCHMARKS_FALLBACK.purchased },
  }
  for (const r of rows) {
    out[r.stage] = { target: r.targetPct, label: r.label }
  }
  return out
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>
}

export default async function AnalyticsOverviewPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const tr = parseTimeRange(sp)
  const days = tr.days ?? Math.max(
    1,
    Math.ceil(
      (new Date(tr.toIso! + 'T23:59:59Z').getTime() -
        new Date(tr.fromIso! + 'T00:00:00Z').getTime()) /
        86400000,
    ),
  )

  // Defensive: loadMiraServerContext throw se ctx auth invalido. Antes
  // escapava do .catch da chamada b2bAnalytics e crashava o segmento.
  //
  // PoP fetch (mig 800-29):
  //   - data         : analytics(days)        · periodo atual
  //   - dataDouble   : analytics(2*days)      · 2x do periodo · usado pra
  //                    derivar o periodo anterior (diff = anterior)
  //   - financial    : b2b_financial_kpis(days) · ja traz current/previous/delta
  //                    nativo no RPC (revenue, ticket medio, CAC).
  let data: AnalyticsBlob | null = null
  let dataDouble: AnalyticsBlob | null = null
  let financial: FinancialKpisBlob | null = null
  let fetchError: string | null = null
  let benchmarks: FunnelBenchmarks = FUNNEL_BENCHMARKS_FALLBACK
  try {
    const { repos } = await loadMiraServerContext()
    const [analyticsRes, analyticsDoubleRes, financialRes, benchmarkRows] =
      await Promise.all([
        repos.b2bAnalytics.get(days).catch((e) => {
          fetchError = e instanceof Error ? e.message : String(e)
          return null
        }),
        // 2x o periodo · usado pra derivar PoP de vouchers (diff entre janelas)
        repos.b2bAnalytics.get(days * 2).catch(() => null),
        repos.b2bFinancial.getKpis(days).catch(() => null),
        repos.b2bFunnelBenchmarks.list().catch(() => []),
      ])
    data = analyticsRes
    dataDouble = analyticsDoubleRes
    financial = financialRes
    benchmarks = buildBenchmarks(benchmarkRows)
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e)
    data = null
  }

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Visão geral</h1>
            <p className="b2bm2-sub">
              Resumo do programa agrupado por objetivo · janela atual:{' '}
              {tr.fromIso && tr.toIso
                ? `${tr.fromIso} → ${tr.toIso}`
                : `últimos ${days} dias`}
              .
            </p>
          </div>
          <div className="b2bm2-header-ctrl">
            <TimeRangePicker />
          </div>
        </header>

        {!data || !data.ok ? (
          <div className="b2bm2-card b2bm2-empty">
            <strong>Sem dados no período selecionado.</strong>
            <p>
              Tente outra janela temporal ou verifique se há vouchers/parcerias
              registradas no banco.
            </p>
            {fetchError && (
              <pre style={{
                marginTop: 12,
                padding: 8,
                background: 'rgba(239,68,68,0.05)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                color: '#FCA5A5',
                whiteSpace: 'pre-wrap',
              }}>
                fetchError: {fetchError}
              </pre>
            )}
          </div>
        ) : (
          <ObjectivesView
            data={data}
            dataDouble={dataDouble}
            financial={financial}
            days={days}
            rangeLabel={timeRangeLabel(tr)}
            benchmarks={benchmarks}
          />
        )}
      </div>
    </main>
  )
}

function ObjectivesView({
  data,
  dataDouble,
  financial,
  days,
  rangeLabel,
  benchmarks,
}: {
  data: AnalyticsBlob
  dataDouble: AnalyticsBlob | null
  financial: FinancialKpisBlob | null
  days: number
  rangeLabel: string
  benchmarks: FunnelBenchmarks
}) {
  // Defensive defaults · RPC pode retornar shape parcial.
  const a = data.applications ?? ({} as AnalyticsBlob['applications'])
  const v = data.vouchers ?? ({} as AnalyticsBlob['vouchers'])
  const t = data.timing ?? ({} as AnalyticsBlob['timing'])
  const h = data.health ?? ({} as AnalyticsBlob['health'])
  const m = data.mira ?? ({} as AnalyticsBlob['mira'])
  const nps = m.nps_summary ?? { responses: 0, nps_score: null }

  // Diagnostico interpretativo · transforma estatistica bruta em insights
  const diag = analyzeOverview(data, days, rangeLabel)
  const sig = (key: OverviewSignal['section']) =>
    diag.signals.find((s) => s.section === key)

  // Snapshot · 6 KPIs micro do programa em 1 linha
  const totalActive = Number(h.total ?? 0)
  const totalGreen = Number(h.green ?? 0)
  const totalYellow = Number(h.yellow ?? 0)
  const totalRed = Number(h.red ?? 0)
  const vouchersTotal = Number(v.total ?? 0)
  const vouchersPaid = Number(v.purchased ?? 0)
  const vouchersDelivered = Number(v.delivered ?? 0)
  const vouchersOpened = Number(v.opened ?? 0)
  const vouchersScheduled = Number(v.scheduled ?? 0)
  const vouchersRedeemed = Number(v.redeemed ?? 0)
  const convPct =
    vouchersTotal > 0 ? ((vouchersPaid / vouchersTotal) * 100).toFixed(1) : '0'
  const npsLabel =
    (nps.responses ?? 0) > 0 && nps.nps_score != null
      ? String(nps.nps_score)
      : '—'

  // ─── PoP · derivado de dataDouble (analytics 2x days) ─────────────────
  // Periodo anterior = diff entre janela 2N e janela N.
  // Funciona pra COUNT(*) FILTER (que sao counts do periodo).
  // NAO funciona pra estado-agora (saude.green/yellow/red etc).
  const dv = dataDouble?.vouchers ?? ({} as AnalyticsBlob['vouchers'])
  const da = dataDouble?.applications ?? ({} as AnalyticsBlob['applications'])
  const dm = dataDouble?.mira ?? ({} as AnalyticsBlob['mira'])
  const prevVouchersTotal = Math.max(0, Number(dv.total ?? 0) - vouchersTotal)
  const prevVouchersPaid = Math.max(0, Number(dv.purchased ?? 0) - vouchersPaid)
  const prevVouchersDelivered = Math.max(0, Number(dv.delivered ?? 0) - vouchersDelivered)
  const prevVouchersOpened = Math.max(0, Number(dv.opened ?? 0) - vouchersOpened)
  const prevVouchersScheduled = Math.max(0, Number(dv.scheduled ?? 0) - vouchersScheduled)
  const prevVouchersRedeemed = Math.max(0, Number(dv.redeemed ?? 0) - vouchersRedeemed)
  const prevApplications = Math.max(0, Number(da.total ?? 0) - Number(a.total ?? 0))
  const prevApplicationsApproved = Math.max(0, Number(da.approved ?? 0) - Number(a.approved ?? 0))
  const prevNpsResponses = Math.max(0, Number(dm.nps_responses ?? 0) - Number(m.nps_responses ?? 0))

  const voucherPop = computeVoucherPop(
    { total: vouchersTotal, purchased: vouchersPaid },
    { total: prevVouchersTotal, purchased: prevVouchersPaid },
  )
  const popApplications: PopDelta = computePop(
    Number(a.total ?? 0),
    prevApplications,
    prevApplications,
  )
  const popApprovals: PopDelta = computePop(
    Number(a.approved ?? 0),
    prevApplicationsApproved,
    prevApplications,
  )
  const popDelivered: PopDelta = computePop(
    vouchersDelivered,
    prevVouchersDelivered,
    prevVouchersTotal,
  )
  const popOpened: PopDelta = computePop(
    vouchersOpened,
    prevVouchersOpened,
    prevVouchersTotal,
  )
  const popScheduled: PopDelta = computePop(
    vouchersScheduled,
    prevVouchersScheduled,
    prevVouchersTotal,
  )
  const popRedeemed: PopDelta = computePop(
    vouchersRedeemed,
    prevVouchersRedeemed,
    prevVouchersTotal,
  )
  const popNps: PopDelta = computePop(
    Number(m.nps_responses ?? 0),
    prevNpsResponses,
    prevNpsResponses,
  )

  // Tooltip text comum · range do periodo anterior
  const popTooltip = (() => {
    if (!financial)
      return `vs últimos ${days}d (período anterior de mesma duração)`
    return formatPopTooltip(
      financial.range_previous.from,
      financial.range_previous.to,
      days,
    )
  })()

  return (
    <>
      {/* ═══ CAMADA 0 · DIAGNÓSTICO INTERPRETATIVO ═══ */}
      <DiagnosticBanner diag={diag} />

      {/* ═══ CAMADA 1 · SNAPSHOT (geral) · labels diferenciam estado vs periodo ═══
          PoP chips adicionados (mig 800-29):
            - Vouchers / Conversão · derivados de dataDouble (analytics 2x days)
            - Ativas / Saúde · NÃO mostram PoP · sao snapshots de estado-agora
       */}
      <SnapshotRow
        kpis={[
          { lbl: 'Ativas', val: String(totalActive), sub: 'parcerias · agora' },
          {
            lbl: 'Candidaturas',
            val: String(a.pending ?? 0),
            sub: 'pendentes · agora',
            tone: (a.pending ?? 0) > 0 ? 'amber' : null,
          },
          {
            lbl: 'Vouchers',
            val: String(vouchersTotal),
            sub: rangeLabel,
            pop: voucherPop.total.delta,
            popTooltip: popTooltip + ` · anterior: ${voucherPop.total.previous}`,
          },
          {
            lbl: 'Conversão',
            val: `${convPct}%`,
            sub: `${vouchersPaid}/${vouchersTotal} · ${rangeLabel}`,
            tone:
              vouchersTotal < 20
                ? null
                : Number(convPct) >= 25
                  ? 'green'
                  : Number(convPct) < 12
                    ? 'red'
                    : 'amber',
            pop: voucherPop.conversion_pct.delta,
            popTooltip:
              popTooltip +
              ` · anterior: ${voucherPop.conversion_pct.previous.toFixed(1)}%`,
          },
          {
            lbl: 'NPS',
            val: npsLabel,
            sub: `${nps.responses ?? 0} respostas · lifetime`,
          },
          {
            lbl: 'Saúde',
            val: `${totalGreen}/${totalActive}`,
            sub: `${totalYellow}A · ${totalRed}V · agora`,
            tone: totalRed > 0 ? 'red' : totalYellow > 0 ? 'amber' : 'green',
          },
        ]}
      />

      {/* ═══ CAMADA 1.5 · FINANCEIRO (mig 800-29) ═══ */}
      <FinancialCard blob={financial} days={days} />

      {/* ═══ CAMADA 2 · CONVERSÃO (foco principal · SO WHAT) ═══ */}
      <CompactSection
        emoji="💰"
        title="Conversão da convidada"
        sub="Voucher enviado → agendou → compareceu → virou paciente pagante"
      >
        <JourneyBar v={v} benchmarks={benchmarks} />
        <SectionInterpretation signal={sig('conversion')} />
      </CompactSection>

      {/* ═══ CAMADA 3 · NEXT ACTIONS (NOW WHAT · subiu antes do deep-dive) ═══ */}
      <NextActions actions={diag.actions} />

      {/* ═══ CAMADA 3 · ESPECÍFICAS · 2 colunas ═══ */}
      <div
        className="b2bm-cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 8,
          marginTop: 8,
        }}
      >
        <CompactSection emoji="🌟" title="Origem dos vouchers" sub="Mira / Manual / Backfill">
          <VoucherSplit v={v} />
          <SectionInterpretation signal={sig('origin')} />
        </CompactSection>

        <CompactSection
          emoji="🩺"
          title="Saúde do programa"
          sub="Distribuição das parcerias ativas"
          snapshot
        >
          <HealthBar h={h} />
          <SectionInterpretation signal={sig('health')} />
        </CompactSection>

        <CompactSection
          emoji="🎯"
          title="Crescimento"
          sub="Candidaturas no período"
        >
          <CompactKpiGrid
            kpis={[
              {
                lbl: 'Total',
                val: a.total ?? 0,
                pop: popApplications,
                popTooltip:
                  popTooltip + ` · anterior: ${prevApplications}`,
              },
              {
                lbl: 'Pendentes',
                val: a.pending ?? 0,
                tone: (a.pending ?? 0) > 0 ? 'amber' : null,
              },
              {
                lbl: 'Aprovadas',
                val: a.approved ?? 0,
                tone: 'green',
                pop: popApprovals,
                popTooltip:
                  popTooltip + ` · anterior: ${prevApplicationsApproved}`,
              },
              {
                lbl: 'Taxa',
                val: `${a.conversion_rate ?? 0}%`,
              },
            ]}
          />
          <SectionInterpretation signal={sig('growth')} />
        </CompactSection>

        <CompactSection
          emoji="⏱"
          title="Velocity de aprovação"
          sub="Tempo até admin aprovar candidatura"
        >
          <CompactKpiGrid
            kpis={[
              {
                lbl: 'Média',
                val: `${t.avg_approval_hours ?? 0}h`,
                sub: `${t.resolved_count ?? 0} resolv.`,
              },
              { lbl: 'Maior', val: `${t.max_approval_hours ?? 0}h` },
            ]}
          />
          <SectionInterpretation signal={sig('velocity')} />
        </CompactSection>

        {/* Atividade Mira · snapshot puro · zero alertas/CTA. Tudo que precisa
            atencao vai pro sino (lib/system-insights.ts). Aqui so estado. */}
        <CompactSection
          emoji="🤖"
          title="Atividade Mira"
          sub="Snapshot atual"
          snapshot
        >
          <CompactKpiGrid
            kpis={[
              {
                lbl: 'Telefones',
                val: m.wa_senders_active ?? 0,
                sub: `${m.wa_senders_total ?? 0} cadastrados`,
              },
              {
                lbl: 'NPS respostas',
                val: m.nps_responses ?? 0,
                sub:
                  (nps.responses ?? 0) > 0 && nps.nps_score != null
                    ? `NPS ${nps.nps_score}`
                    : '—',
              },
              {
                lbl: 'Insights',
                val: m.insights_active ?? 0,
                sub: '—',
              },
            ]}
          />
        </CompactSection>
      </div>

      {/* Footer */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--b2b-text-muted, #7A7165)',
          textAlign: 'right',
          marginTop: 8,
        }}
      >
        gerado em{' '}
        {data.generated_at
          ? new Date(data.generated_at).toLocaleString('pt-BR')
          : '—'}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Interpretive layer · diagnostic + signals + actions (2026-04-26)
// ═══════════════════════════════════════════════════════════════════════

const STATUS_COLORS: Record<SignalStatus, { bg: string; border: string; text: string; emoji: string }> = {
  green: {
    bg: 'rgba(16, 185, 129, 0.06)',
    border: 'rgba(16, 185, 129, 0.3)',
    text: '#6EE7B7',
    emoji: '✓',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.06)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#FCD34D',
    emoji: '⚠',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.06)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#FCA5A5',
    emoji: '🔴',
  },
  neutral: {
    bg: 'rgba(201, 169, 110, 0.04)',
    border: 'rgba(201, 169, 110, 0.2)',
    text: '#D4B785',
    emoji: '·',
  },
}

/**
 * Icone SVG redundante (forma distinta de cor) · BI win #6 acessibilidade.
 * Color-blind users diferenciam por shape · cor sozinha falha em deuteranopia.
 *   green   = circulo com check
 *   amber   = triangulo com !
 *   red     = octogono (parar)
 *   neutral = circulo neutro com info
 */
function StatusIcon({
  status,
  size = 22,
}: {
  status: SignalStatus
  size?: number
}) {
  const c = STATUS_COLORS[status]
  if (status === 'green') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill={c.bg} stroke={c.text} strokeWidth="2" />
        <path d="M7 12l3 3 7-7" stroke={c.text} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'amber') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 L22 21 L2 21 Z" fill={c.bg} stroke={c.text} strokeWidth="2" strokeLinejoin="round" />
        <line x1="12" y1="10" x2="12" y2="15" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="18" r="1.2" fill={c.text} />
      </svg>
    )
  }
  if (status === 'red') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <polygon
          points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"
          fill={c.bg}
          stroke={c.text}
          strokeWidth="2"
        />
        <line x1="8" y1="8" x2="16" y2="16" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="16" y1="8" x2="8" y2="16" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={c.bg} stroke={c.text} strokeWidth="2" />
      <line x1="12" y1="8" x2="12" y2="13" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.2" fill={c.text} />
    </svg>
  )
}

function DiagnosticBanner({ diag }: { diag: OverviewDiagnostic }) {
  const c = STATUS_COLORS[diag.status]
  return (
    <div
      role="region"
      aria-label={`Diagnóstico do programa: ${diag.headline} ${diag.subtitle}`}
      style={{
        padding: '14px 18px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <StatusIcon status={diag.status} size={28} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: c.text,
            fontFamily: 'Inter, system-ui, sans-serif',
            marginBottom: 4,
          }}
        >
          Diagnóstico do programa
        </div>
        <div
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 22,
            fontWeight: 500,
            color: '#F5F0E8',
            lineHeight: 1.15,
            marginBottom: 4,
          }}
        >
          {diag.headline}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#9CA3AF',
            fontFamily: 'Inter, system-ui, sans-serif',
            lineHeight: 1.4,
          }}
        >
          {diag.subtitle}
        </div>
      </div>
    </div>
  )
}

function SectionInterpretation({
  signal,
}: {
  signal: OverviewSignal | undefined
}) {
  if (!signal) return null
  const c = STATUS_COLORS[signal.status]
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px dashed rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <span style={{ color: c.text, fontSize: 11, marginTop: 1 }}>{c.emoji}</span>
      <span
        style={{
          fontSize: 11,
          color: '#B5A894',
          fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: 1.45,
        }}
      >
        {signal.message}
      </span>
    </div>
  )
}

function NextActions({
  actions,
}: {
  actions: OverviewDiagnostic['actions']
}) {
  if (!actions || actions.length === 0) return null
  return (
    <div
      style={{
        marginTop: 12,
        padding: '14px 16px',
        background: 'rgba(201, 169, 110, 0.05)',
        border: '1px solid rgba(201, 169, 110, 0.25)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '2.5px',
          textTransform: 'uppercase',
          color: '#C9A96E',
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 10,
        }}
      >
        🎯 Próximos passos sugeridos
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((act, i) => {
          const num = i + 1
          const inner = (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: act.href ? 'pointer' : 'default',
              }}
            >
              <span
                style={{
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#C9A96E',
                  lineHeight: 1,
                  minWidth: 16,
                }}
              >
                {num}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#F5F0E8',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginBottom: 2,
                  }}
                >
                  {act.title}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: '#9CA3AF',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    lineHeight: 1.4,
                  }}
                >
                  {act.rationale}
                </div>
              </div>
              {act.href ? (
                <span
                  style={{
                    fontSize: 11,
                    color: '#C9A96E',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginTop: 2,
                  }}
                >
                  →
                </span>
              ) : null}
            </div>
          )
          return act.href ? (
            <Link
              key={`${act.priority}-${act.title}`}
              href={act.href}
              style={{ textDecoration: 'none' }}
            >
              {inner}
            </Link>
          ) : (
            <div key={`${act.priority}-${act.title}`}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Compact building blocks · redesign 2026-04-26
// ═══════════════════════════════════════════════════════════════════════

function SnapshotRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div
      className="b2bm-snapshot-grid"
      role="region"
      aria-label="Snapshot dos KPIs principais do programa"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 8,
        padding: '12px 14px',
        background: 'rgba(201, 169, 110, 0.04)',
        border: '1px solid rgba(201, 169, 110, 0.2)',
        borderRadius: 10,
        marginBottom: 12,
      }}
    >
      {kpis.map((k) => {
        const color =
          k.tone === 'green'
            ? '#10B981'
            : k.tone === 'amber'
            ? '#F59E0B'
            : k.tone === 'red'
            ? '#EF4444'
            : '#F5F0E8'
        return (
          <div key={k.lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontSize: 22,
                  fontWeight: 500,
                  color,
                  lineHeight: 1,
                }}
              >
                {k.val}
              </span>
              {k.pop ? (
                <PopChip delta={k.pop} tooltip={k.popTooltip ?? ''} />
              ) : null}
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#7A7165',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {k.lbl}
            </div>
            {k.sub ? (
              <div
                style={{
                  fontSize: 10,
                  color: '#9CA3AF',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {k.sub}
              </div>
            ) : null}
          </div>
        )
      })}
      <style>{`
        @media (max-width: 640px) {
          .b2bm-snapshot-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .b2bm-cards-grid    { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function CompactSection({
  emoji,
  title,
  sub,
  slim,
  snapshot,
  children,
}: {
  emoji: string
  title: string
  sub?: string
  slim?: boolean
  /** True quando a section mostra estado-agora (ignora filtro de periodo). */
  snapshot?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(201, 169, 110, 0.15)',
        borderRadius: 8,
        padding: slim ? '10px 14px' : '12px 14px',
      }}
    >
      <div style={{ marginBottom: slim ? 6 : 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: '#F5F0E8',
            letterSpacing: '0.3px',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{emoji}</span>
            {title}
          </span>
          {snapshot ? (
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 600,
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(201, 169, 110, 0.12)',
                color: '#C9A96E',
                border: '1px solid rgba(201, 169, 110, 0.3)',
              }}
              title="Estado atual · não depende do filtro de período"
            >
              snapshot atual
            </span>
          ) : null}
        </h3>
        {sub ? (
          <div
            style={{
              fontSize: 10.5,
              color: '#B5A894', // BI #5 · contrast bumped
              marginTop: 2,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  )
}

function CompactKpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 10,
      }}
    >
      {kpis.map((k) => {
        const color =
          k.tone === 'green'
            ? '#10B981'
            : k.tone === 'amber'
            ? '#F59E0B'
            : k.tone === 'red'
            ? '#EF4444'
            : '#F5F0E8'
        return (
          <div key={k.lbl} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontSize: 20,
                  fontWeight: 500,
                  color,
                  lineHeight: 1,
                }}
              >
                {k.val}
              </span>
              {k.pop ? (
                <PopChip delta={k.pop} tooltip={k.popTooltip ?? ''} />
              ) : null}
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#7A7165',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {k.lbl}
            </div>
            {k.sub ? (
              <div
                style={{
                  fontSize: 9.5,
                  color: '#9CA3AF',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {k.sub}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Tipos compartilhados + remaining building blocks
// (ObjectiveSection + KpiGrid antigos removidos · substituidos por
//  SnapshotRow + CompactSection + CompactKpiGrid acima)
// ═══════════════════════════════════════════════════════════════════════

type Tone = 'green' | 'amber' | 'red' | null
interface Kpi {
  lbl: string
  val: number | string
  sub?: string
  tone?: Tone
  /** PoP delta · quando presente, renderiza PopChip ao lado do valor */
  pop?: PopDelta
  /** Tooltip do chip · ex "vs ultimos 30d (28/03 a 26/04)" */
  popTooltip?: string
  /** Tooltip explicativo do KPI · threshold/criterio · aparece on hover do label */
  tip?: string
}

function HealthBar({ h }: { h: AnalyticsBlob['health'] }) {
  const total = Number(h.total || 0)
  if (!total) {
    return <div className="b2bm2-empty">Nenhuma parceria ativa.</div>
  }
  const g = Number(h.green || 0)
  const y = Number(h.yellow || 0)
  const r = Number(h.red || 0)
  const u = Number(h.unknown || 0)
  const pct = (n: number) => ((n / total) * 100).toFixed(1)
  const ariaLabel = `Distribuição de saúde: ${g} verdes, ${y} amarelas, ${r} vermelhas, ${u} sem dado · total ${total}`

  return (
    <>
      <div
        className="b2b-health-bar"
        role="img"
        aria-label={ariaLabel}
      >
        {g > 0 ? (
          <div
            style={{ width: `${pct(g)}%`, background: '#10B981' }}
            title={`Verde · ${g}`}
          />
        ) : null}
        {y > 0 ? (
          <div
            style={{ width: `${pct(y)}%`, background: '#F59E0B' }}
            title={`Amarela · ${y}`}
          />
        ) : null}
        {r > 0 ? (
          <div
            style={{ width: `${pct(r)}%`, background: '#EF4444' }}
            title={`Vermelha · ${r}`}
          />
        ) : null}
        {u > 0 ? (
          <div
            style={{ width: `${pct(u)}%`, background: '#64748B' }}
            title={`Sem dado · ${u}`}
          />
        ) : null}
      </div>
      <div className="b2b-health-legend">
        {g > 0 ? (
          <span>
            <i style={{ background: '#10B981' }} /> {g} verdes
          </span>
        ) : null}
        {y > 0 ? (
          <span>
            <i style={{ background: '#F59E0B' }} /> {y} em atenção
          </span>
        ) : null}
        {r > 0 ? (
          <span>
            <i style={{ background: '#EF4444' }} /> {r} críticas
          </span>
        ) : null}
        {u > 0 ? (
          <span>
            <i style={{ background: '#64748B' }} /> {u} sem dado
          </span>
        ) : null}
      </div>
    </>
  )
}

function VoucherSplit({ v }: { v: AnalyticsBlob['vouchers'] }) {
  const total = Number(v.total || 0)
  if (!total) {
    return <div className="b2bm2-empty">Nenhum voucher no período.</div>
  }
  const mira = Number(v.via_mira || 0)
  const admin = Number(v.via_admin || 0)
  const bf = Number(v.via_backfill || 0)
  const pct = (n: number) => ((n / total) * 100).toFixed(0)
  const ariaLabel = `Origem dos vouchers: ${mira} via Mira, ${admin} manual, ${bf} backfill · total ${total}`

  return (
    <>
      <div
        className="b2b-split-bar"
        role="img"
        aria-label={ariaLabel}
      >
        {mira > 0 ? (
          <div
            style={{
              width: `${pct(mira)}%`,
              background: 'var(--m2-gold, #C9A96E)',
            }}
            title="Via Mira"
          />
        ) : null}
        {admin > 0 ? (
          <div
            style={{ width: `${pct(admin)}%`, background: '#60A5FA' }}
            title="Manual"
          />
        ) : null}
        {bf > 0 ? (
          <div
            style={{ width: `${pct(bf)}%`, background: '#64748B' }}
            title="Backfill"
          />
        ) : null}
      </div>
      <div className="b2b-split-legend">
        {mira > 0 ? (
          <span>
            <i style={{ background: 'var(--m2-gold, #C9A96E)' }} />
            {mira} via Mira ({pct(mira)}%)
          </span>
        ) : null}
        {admin > 0 ? (
          <span>
            <i style={{ background: '#60A5FA' }} />
            {admin} manual
          </span>
        ) : null}
        {bf > 0 ? (
          <span>
            <i style={{ background: '#64748B' }} />
            {bf} histórico
          </span>
        ) : null}
      </div>
    </>
  )
}

/**
 * Benchmarks de step-rate vem como prop (server fetch via
 * repos.b2bFunnelBenchmarks.list() · mig 800-26 · editavel em
 * /b2b/config/regras). Fallback acima trata clinicas sem rows.
 */

function stepStatus(rate: number, target: number): SignalStatus {
  if (rate >= target) return 'green'
  if (rate >= target * 0.5) return 'amber'
  return 'red'
}

function STEP_COLOR(s: SignalStatus): string {
  if (s === 'green') return '#10B981'
  if (s === 'amber') return '#F59E0B'
  if (s === 'red') return '#EF4444'
  return '#64748B'
}

function JourneyBar({
  v,
  benchmarks,
}: {
  v: AnalyticsBlob['vouchers']
  benchmarks: FunnelBenchmarks
}) {
  const total = Number(v.total || 0)
  if (!total) {
    return <div className="b2bm2-empty">Nenhum voucher no período.</div>
  }
  const delivered = Number(v.delivered || 0)
  const opened = Number(v.opened || 0)
  const scheduled = Number(v.scheduled || 0)
  const redeemed = Number(v.redeemed || 0)
  const purchased = Number(v.purchased || 0)

  // Step-rate (% sobre etapa anterior) · BI standard pra detectar gargalo
  const sr = (n: number, prev: number) =>
    prev > 0 ? Math.round((n / prev) * 100) : 0
  const totalPct = (n: number) => Math.round((n / total) * 100)

  const steps = [
    {
      lbl: 'Enviados',
      n: total,
      stepRate: 100,
      totalPct: 100,
      status: 'neutral' as SignalStatus,
      bench: null as { target: number; label: string } | null,
      prev: null as string | null,
    },
    {
      lbl: 'Entregues',
      n: delivered,
      stepRate: sr(delivered, total),
      totalPct: totalPct(delivered),
      status: stepStatus(sr(delivered, total), benchmarks.delivered.target),
      bench: benchmarks.delivered,
      prev: 'Enviados',
    },
    {
      lbl: 'Abertos',
      n: opened,
      stepRate: sr(opened, delivered),
      totalPct: totalPct(opened),
      status: stepStatus(sr(opened, delivered), benchmarks.opened.target),
      bench: benchmarks.opened,
      prev: 'Entregues',
    },
    {
      lbl: 'Agendaram',
      n: scheduled,
      stepRate: sr(scheduled, opened),
      totalPct: totalPct(scheduled),
      status: stepStatus(sr(scheduled, opened), benchmarks.scheduled.target),
      bench: benchmarks.scheduled,
      prev: 'Abertos',
    },
    {
      lbl: 'Compareceram',
      n: redeemed,
      stepRate: sr(redeemed, scheduled),
      totalPct: totalPct(redeemed),
      status: stepStatus(sr(redeemed, scheduled), benchmarks.redeemed.target),
      bench: benchmarks.redeemed,
      prev: 'Agendaram',
    },
    {
      lbl: 'Pagaram',
      n: purchased,
      stepRate: sr(purchased, redeemed),
      totalPct: totalPct(purchased),
      status: stepStatus(sr(purchased, redeemed), benchmarks.purchased.target),
      bench: benchmarks.purchased,
      prev: 'Compareceram',
    },
  ]

  const ariaLabel = `Funil: ${steps
    .map((s) => `${s.lbl} ${s.n} (${s.stepRate}% vs ${s.prev ?? 'inicio'})`)
    .join(', ')}`

  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="b2b-journey">
        {steps.map((s, idx) => {
          const color = idx === 0 ? '#9CA3AF' : STEP_COLOR(s.status)
          return (
            <div key={s.lbl} className="b2b-journey-step">
              <div className="b2b-journey-lbl">{s.lbl}</div>
              <div className="b2b-journey-n" style={{ color }}>
                {s.n}
              </div>
              <div
                className="b2b-journey-pct"
                style={{ color: idx === 0 ? '#9CA3AF' : color, fontWeight: 600 }}
                title={
                  idx === 0
                    ? 'Etapa inicial · 100%'
                    : `${s.stepRate}% vs ${s.prev} · meta ≥${s.bench?.target}%`
                }
              >
                {idx === 0 ? '100%' : `${s.stepRate}%`}
              </div>
              {idx > 0 && (
                <div
                  style={{
                    fontSize: 9.5,
                    color: '#7A7165',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginTop: 2,
                    textAlign: 'center',
                  }}
                >
                  {s.totalPct}% total
                </div>
              )}
              <div className="b2b-journey-bar" style={{ marginTop: 6 }}>
                <div
                  style={{
                    width: `${idx === 0 ? 100 : s.stepRate}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda · cores + benchmarks visíveis */}
      <FunnelLegend benchmarks={benchmarks} />
    </div>
  )
}

function FunnelLegend({ benchmarks }: { benchmarks: FunnelBenchmarks }) {
  const benches = [
    { lbl: 'Entrega', ...benchmarks.delivered },
    { lbl: 'Abertura', ...benchmarks.opened },
    { lbl: 'Agendamento', ...benchmarks.scheduled },
    { lbl: 'Comparecimento', ...benchmarks.redeemed },
    { lbl: 'Fechamento', ...benchmarks.purchased },
  ]
  return (
    <div
      style={{
        marginTop: 16,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(201, 169, 110, 0.2)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#C9A96E',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Como ler · cor por step-rate
        </span>
        <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#B5A894' }}>
          <LegendDot color="#10B981" label="≥ meta · saudável" />
          <LegendDot color="#F59E0B" label="50-100% da meta · atenção" />
          <LegendDot color="#EF4444" label="< 50% da meta · crítico" />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 6,
          paddingTop: 6,
          borderTop: '1px dashed rgba(255,255,255,0.05)',
        }}
      >
        {benches.map((b) => (
          <div
            key={b.lbl}
            style={{
              fontSize: 10.5,
              color: '#B5A894',
              fontFamily: 'Inter, system-ui, sans-serif',
              lineHeight: 1.4,
            }}
          >
            <span style={{ color: '#C9A96E', fontWeight: 600 }}>{b.lbl}:</span>{' '}
            meta ≥{b.target}% ·{' '}
            <span style={{ color: '#7A7165', fontStyle: 'italic' }}>{b.label}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px dashed rgba(255,255,255,0.05)',
          fontSize: 10,
          color: '#7A7165',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontStyle: 'italic',
        }}
      >
        💡 Step-rate revela onde o funil sangra · ex: Agendaram 0% vs Abertos = problema no CTA do voucher.
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: 999,
          background: color,
        }}
      />
      {label}
    </span>
  )
}
