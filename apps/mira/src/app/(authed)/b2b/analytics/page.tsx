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
import { parseTimeRange } from './_shared/timeRangeUtils'
import {
  analyzeOverview,
  type OverviewDiagnostic,
  type OverviewSignal,
  type SignalStatus,
} from './_shared/overviewAnalyzer'
import type { AnalyticsBlob } from '@clinicai/repositories'

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
  let data: AnalyticsBlob | null = null
  let fetchError: string | null = null
  try {
    const { repos } = await loadMiraServerContext()
    data = await repos.b2bAnalytics.get(days).catch((e) => {
      fetchError = e instanceof Error ? e.message : String(e)
      return null
    })
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
          <ObjectivesView data={data} days={days} />
        )}
      </div>
    </main>
  )
}

function ObjectivesView({ data, days }: { data: AnalyticsBlob; days: number }) {
  // Defensive defaults · RPC pode retornar shape parcial.
  const a = data.applications ?? ({} as AnalyticsBlob['applications'])
  const v = data.vouchers ?? ({} as AnalyticsBlob['vouchers'])
  const t = data.timing ?? ({} as AnalyticsBlob['timing'])
  const h = data.health ?? ({} as AnalyticsBlob['health'])
  const m = data.mira ?? ({} as AnalyticsBlob['mira'])
  const nps = m.nps_summary ?? { responses: 0, nps_score: null }

  // Diagnostico interpretativo · transforma estatistica bruta em insights
  const diag = analyzeOverview(data, days)
  const sig = (key: OverviewSignal['section']) =>
    diag.signals.find((s) => s.section === key)

  // Snapshot · 6 KPIs micro do programa em 1 linha
  const totalActive = Number(h.total ?? 0)
  const totalGreen = Number(h.green ?? 0)
  const totalYellow = Number(h.yellow ?? 0)
  const totalRed = Number(h.red ?? 0)
  const vouchersTotal = Number(v.total ?? 0)
  const vouchersPaid = Number(v.purchased ?? 0)
  const convPct =
    vouchersTotal > 0 ? ((vouchersPaid / vouchersTotal) * 100).toFixed(1) : '0'
  const npsLabel =
    (nps.responses ?? 0) > 0 && nps.nps_score != null
      ? String(nps.nps_score)
      : '—'

  return (
    <>
      {/* ═══ CAMADA 0 · DIAGNÓSTICO INTERPRETATIVO ═══ */}
      <DiagnosticBanner diag={diag} />

      {/* ═══ CAMADA 1 · SNAPSHOT (geral) ═══ */}
      <SnapshotRow
        kpis={[
          { lbl: 'Ativas', val: String(totalActive), sub: 'parcerias' },
          {
            lbl: 'Candidaturas',
            val: String(a.pending ?? 0),
            sub: 'pendentes',
            tone: (a.pending ?? 0) > 0 ? 'amber' : null,
          },
          { lbl: 'Vouchers', val: String(vouchersTotal), sub: 'no período' },
          {
            lbl: 'Conversão',
            val: `${convPct}%`,
            sub: `${vouchersPaid}/${vouchersTotal} pagaram`,
            tone: Number(convPct) >= 30 ? 'green' : null,
          },
          {
            lbl: 'NPS',
            val: npsLabel,
            sub: `${nps.responses ?? 0} respostas`,
          },
          {
            lbl: 'Saúde',
            val: `${totalGreen}/${totalActive}`,
            sub: `${totalYellow}A · ${totalRed}V`,
            tone: totalRed > 0 ? 'red' : totalYellow > 0 ? 'amber' : 'green',
          },
        ]}
      />

      {/* ═══ CAMADA 2 · CONVERSÃO (foco principal) ═══ */}
      <CompactSection
        emoji="💰"
        title="Conversão da convidada"
        sub="Voucher enviado → agendou → compareceu → virou paciente pagante"
      >
        <JourneyBar v={v} />
        <SectionInterpretation signal={sig('conversion')} />
      </CompactSection>

      {/* ═══ CAMADA 3 · ESPECÍFICAS · 2 colunas ═══ */}
      <div
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

        <CompactSection emoji="🩺" title="Saúde do programa" sub="Distribuição das ativas">
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
              { lbl: 'Total', val: a.total ?? 0 },
              {
                lbl: 'Pendentes',
                val: a.pending ?? 0,
                tone: (a.pending ?? 0) > 0 ? 'amber' : null,
              },
              { lbl: 'Aprovadas', val: a.approved ?? 0, tone: 'green' },
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
      </div>

      {/* ═══ CAMADA 4 · ATIVIDADE MIRA (slim) ═══ */}
      <CompactSection
        emoji="🤖"
        title="Atividade Mira"
        sub="Sistemas em background"
        slim
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
                (nps.responses ?? 0) > 0
                  ? `NPS ${nps.nps_score != null ? nps.nps_score : '—'}`
                  : '—',
            },
            {
              lbl: 'Insights',
              val: m.insights_active ?? 0,
              sub: (m.insights_active ?? 0) > 0 ? 'Veja /insights' : 'Tudo em ordem',
            },
          ]}
        />
        <SectionInterpretation signal={sig('mira')} />
      </CompactSection>

      {/* ═══ CAMADA 5 · PRÓXIMOS PASSOS ═══ */}
      <NextActions actions={diag.actions} />

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

function DiagnosticBanner({ diag }: { diag: OverviewDiagnostic }) {
  const c = STATUS_COLORS[diag.status]
  return (
    <div
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
      <div style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{c.emoji}</div>
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
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 22,
                fontWeight: 500,
                color,
                lineHeight: 1,
              }}
            >
              {k.val}
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
    </div>
  )
}

function CompactSection({
  emoji,
  title,
  sub,
  slim,
  children,
}: {
  emoji: string
  title: string
  sub?: string
  slim?: boolean
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
          }}
        >
          <span style={{ marginRight: 6 }}>{emoji}</span>
          {title}
        </h3>
        {sub ? (
          <div
            style={{
              fontSize: 10.5,
              color: '#9CA3AF',
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
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 20,
                fontWeight: 500,
                color,
                lineHeight: 1,
              }}
            >
              {k.val}
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

  return (
    <>
      <div className="b2b-health-bar">
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

  return (
    <>
      <div className="b2b-split-bar">
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

function JourneyBar({ v }: { v: AnalyticsBlob['vouchers'] }) {
  const total = Number(v.total || 0)
  if (!total) {
    return <div className="b2bm2-empty">Nenhum voucher no período.</div>
  }
  const delivered = Number(v.delivered || 0)
  const opened = Number(v.opened || 0)
  const scheduled = Number(v.scheduled || 0)
  const redeemed = Number(v.redeemed || 0)
  const purchased = Number(v.purchased || 0)
  const pct = (n: number) => Math.round((n / total) * 100)

  const steps = [
    { lbl: 'Enviados', n: total, pct: 100, color: '#64748B' },
    { lbl: 'Entregues', n: delivered, pct: pct(delivered), color: '#60A5FA' },
    { lbl: 'Abertos', n: opened, pct: pct(opened), color: '#A78BFA' },
    { lbl: 'Agendaram', n: scheduled, pct: pct(scheduled), color: '#F59E0B' },
    { lbl: 'Compareceram', n: redeemed, pct: pct(redeemed), color: '#10B981' },
    {
      lbl: 'Pagaram',
      n: purchased,
      pct: pct(purchased),
      color: 'var(--m2-gold, #C9A96E)',
    },
  ]

  return (
    <div className="b2b-journey">
      {steps.map((s) => (
        <div key={s.lbl} className="b2b-journey-step">
          <div className="b2b-journey-lbl">{s.lbl}</div>
          <div className="b2b-journey-n" style={{ color: s.color }}>
            {s.n}
          </div>
          <div className="b2b-journey-pct">{s.pct}%</div>
          <div className="b2b-journey-bar">
            <div style={{ width: `${s.pct}%`, background: s.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
