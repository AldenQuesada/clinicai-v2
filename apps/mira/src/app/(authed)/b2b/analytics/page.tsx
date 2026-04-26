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

import { loadMiraServerContext } from '@/lib/server-context'
import { TimeRangePicker } from './_shared/TimeRangePicker'
import { parseTimeRange } from './_shared/timeRangeUtils'
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
          <ObjectivesView data={data} />
        )}
      </div>
    </main>
  )
}

function ObjectivesView({ data }: { data: AnalyticsBlob }) {
  // Defensive defaults · RPC pode retornar shape parcial.
  const a = data.applications ?? ({} as AnalyticsBlob['applications'])
  const v = data.vouchers ?? ({} as AnalyticsBlob['vouchers'])
  const t = data.timing ?? ({} as AnalyticsBlob['timing'])
  const h = data.health ?? ({} as AnalyticsBlob['health'])
  const m = data.mira ?? ({} as AnalyticsBlob['mira'])
  const nps = m.nps_summary ?? { responses: 0, nps_score: null }

  return (
    <>
      {/* ─── OBJETIVO 1 · Crescimento de novas parcerias ──────────────── */}
      <ObjectiveSection
        emoji="🎯"
        title="Crescimento de novas parcerias"
        sub="Funil de candidaturas → aprovações no período. Fonte do crescimento do programa."
      >
        <KpiGrid
          kpis={[
            { lbl: 'Total candidaturas', val: a.total ?? 0 },
            {
              lbl: 'Pendentes',
              val: a.pending ?? 0,
              tone: (a.pending ?? 0) > 0 ? 'amber' : null,
            },
            { lbl: 'Aprovadas', val: a.approved ?? 0, tone: 'green' },
            { lbl: 'Rejeitadas', val: a.rejected ?? 0 },
            {
              lbl: 'Taxa conversão',
              val: `${a.conversion_rate ?? 0}%`,
              sub: `${a.approved ?? 0}/${a.total ?? 0} viraram parceria`,
            },
          ]}
        />
      </ObjectiveSection>

      {/* ─── OBJETIVO 2 · Atividade do voucher (volume) · 2 colunas ──── */}
      <div className="b2bm2-row b2bm2-row-2col">
        <ObjectiveSection
          emoji="🎟"
          title="Vouchers (volume bruto)"
          sub="Total de vouchers movimentados no período (exclui demos)."
        >
          <KpiGrid
            kpis={[
              { lbl: 'Emitidos', val: v.total ?? 0 },
              { lbl: 'Entregues', val: v.delivered ?? 0 },
              { lbl: 'Abertos', val: v.opened ?? 0 },
              {
                lbl: 'Agendaram',
                val: v.scheduled ?? 0,
                tone: (v.scheduled ?? 0) > 0 ? 'amber' : null,
              },
              { lbl: 'Compareceram', val: v.redeemed ?? 0, tone: 'green' },
              { lbl: 'Pagaram', val: v.purchased ?? 0, tone: 'green' },
            ]}
          />
        </ObjectiveSection>

        <ObjectiveSection
          emoji="🌟"
          title="Origem dos vouchers"
          sub="Quantos vieram da Mira (automação) vs admin manual vs backfill histórico."
        >
          <VoucherSplit v={v} />
        </ObjectiveSection>
      </div>

      {/* ─── OBJETIVO 3 · Conversão da convidada (funnel wide) ────────── */}
      <ObjectiveSection
        emoji="💰"
        title="Conversão da convidada (funil)"
        sub="Voucher enviado → agendou → compareceu → virou paciente pagante."
      >
        <JourneyBar v={v} />
      </ObjectiveSection>

      {/* ─── OBJETIVO 4 · Velocity (2 colunas) ────────────────────────── */}
      <div className="b2bm2-row b2bm2-row-2col">
        <ObjectiveSection
          emoji="⏱"
          title="Velocity de aprovação"
          sub="Tempo até a Mira/admin aprovar uma candidatura nova."
        >
          <KpiGrid
            kpis={[
              {
                lbl: 'Média',
                val: `${t.avg_approval_hours ?? 0}h`,
                sub: `${t.resolved_count ?? 0} resolvidas`,
              },
              { lbl: 'Maior tempo', val: `${t.max_approval_hours ?? 0}h` },
            ]}
          />
        </ObjectiveSection>

        <ObjectiveSection
          emoji="🤖"
          title="Atividade Mira (background)"
          sub="Estado dos sistemas que rodam atrás (telefones autorizados, NPS, insights)."
        >
          <KpiGrid
            kpis={[
              {
                lbl: 'Telefones',
                val: m.wa_senders_active ?? 0,
                sub: `de ${m.wa_senders_total ?? 0} cadastrados`,
              },
              {
                lbl: 'Respostas NPS',
                val: m.nps_responses ?? 0,
                sub:
                  (nps.responses ?? 0) > 0
                    ? `NPS ${nps.nps_score != null ? nps.nps_score : '—'}`
                    : '',
              },
              {
                lbl: 'Insights ativos',
                val: m.insights_active ?? 0,
                sub:
                  (m.insights_active ?? 0) > 0 ? 'Olha na página' : 'Tudo em ordem',
              },
            ]}
          />
        </ObjectiveSection>
      </div>

      {/* ─── OBJETIVO 5 · Saúde do programa ────────────────────────────── */}
      <ObjectiveSection
        emoji="🩺"
        title="Saúde do programa"
        sub="Distribuição das parcerias ativas por saúde · sinais de alerta agregados."
      >
        <HealthBar h={h} />
      </ObjectiveSection>

      {/* Footer info */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--b2b-text-muted)',
          textAlign: 'right',
          marginTop: 8,
        }}
      >
        Gerado em {data.generated_at ? new Date(data.generated_at).toLocaleString('pt-BR') : '—'}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Building blocks
// ═══════════════════════════════════════════════════════════════════════

function ObjectiveSection({
  emoji,
  title,
  sub,
  children,
}: {
  emoji: string
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>
          <span style={{ marginRight: 8 }}>{emoji}</span>
          {title}
        </h3>
        {sub ? <div className="b2bm2-card-sub">{sub}</div> : null}
      </div>
      <div className="b2bm2-card-body">{children}</div>
    </div>
  )
}

type Tone = 'green' | 'amber' | 'red' | null
interface Kpi {
  lbl: string
  val: number | string
  sub?: string
  tone?: Tone
}

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="b2bm-kpi-grid">
      {kpis.map((k) => {
        const color =
          k.tone === 'green'
            ? '#10B981'
            : k.tone === 'amber'
            ? '#F59E0B'
            : k.tone === 'red'
            ? '#EF4444'
            : undefined
        return (
          <div key={k.lbl} className="b2bm-kpi">
            <div
              className="b2bm-kpi-val"
              style={color ? { color } : undefined}
            >
              {k.val}
            </div>
            <div className="b2bm-kpi-lbl">{k.lbl}</div>
            {k.sub ? <div className="b2bm-kpi-sub">{k.sub}</div> : null}
          </div>
        )
      })}
    </div>
  )
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
