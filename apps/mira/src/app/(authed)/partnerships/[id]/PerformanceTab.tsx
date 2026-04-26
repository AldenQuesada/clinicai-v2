/**
 * Partnership detail · tab "Performance" · espelho 1:1 de
 * `b2b-detail-performance.ui.js`. Dashboard ROI + churn + vouchers funnel
 * + NPS + health trend + velocity em 1 tela.
 *
 * Visual luxury usando classes b2b-perf-* canonicas (Cormorant 30-56px,
 * cards b2b-perf-section, KPIs grid auto-fit, churn bar com data-level,
 * funnel grid 110/1fr/44, health timeline com dots).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BPartnershipDTO, PerformanceFull } from '@clinicai/repositories'
import { ImpactSection } from './sections/ImpactSection'
import { RoiSection } from './sections/RoiSection'
import { CostSection } from './sections/CostSection'
import { TrendSection } from './sections/TrendSection'

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00'
  try {
    return v.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    })
  } catch {
    return `R$ ${v}`
  }
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return Number(v).toFixed(1) + '%'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

const LEVEL_LABELS: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  critical: 'Crítico',
}

export async function PerformanceTab({ partnership }: { partnership: B2BPartnershipDTO }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bPerformance.full(partnership.id).catch(() => null)

  if (!data || !data.ok) {
    return (
      <div className="b2b-empty">
        Sem dados de performance ainda. {data?.error || ''}
      </div>
    )
  }

  return (
    <div className="b2b-perf-host">
      <Meta data={data} />
      <KPIs data={data} />
      <ChurnRisk data={data} />
      <div className="b2b-perf-grid-2">
        <NPSSection data={data} />
        <VelocitySection data={data} />
      </div>
      <VouchersFunnel data={data} />
      {/* Sec 13 · Impact score */}
      <ImpactSection partnershipId={partnership.id} />
      {/* Sec 14 · ROI real */}
      <RoiSection partnershipId={partnership.id} />
      {/* Sec 15 · Cost breakdown */}
      <CostSection partnershipId={partnership.id} />
      {/* Sec 16 · Health trend 90d (server-rendered via mig 800-35 RPC) */}
      <TrendSection partnershipId={partnership.id} />
      {/* Health trend (legacy ja inclui · mantem como redundancia/backup) */}
      <HealthTrend data={data} />
    </div>
  )
}

function Meta({ data }: { data: PerformanceFull }) {
  const p = data.partnership
  const h = data.health
  const bits: string[] = []
  bits.push(`Status: ${p.status || '—'}`)
  if (p.pillar) bits.push(`Pilar: ${p.pillar}`)
  if (p.tier) bits.push(`Tier ${p.tier}`)
  if (h?.partner_age_days != null) bits.push(`${h.partner_age_days}d de parceria`)
  if (h?.days_since_last_voucher != null) {
    bits.push(`último voucher há ${h.days_since_last_voucher}d`)
  }
  return (
    <div className="b2b-perf-meta">
      {bits.map((b, i) => (
        <span key={i}>{b}</span>
      ))}
    </div>
  )
}

function KPIs({ data }: { data: PerformanceFull }) {
  const roi = data.roi
  const v = data.vouchers
  const cards = [
    {
      lbl: 'Receita atribuída',
      val: fmtBRL(roi.revenue_brl),
      sub: `${roi.converted || 0} convertidos de ${roi.referred || 0} referidos`,
      tone: 'default',
    },
    {
      lbl: 'Custo total',
      val: fmtBRL(roi.cost_brl),
      sub: `${v.total} vouchers emitidos`,
      tone: 'default',
    },
    {
      lbl: 'ROI',
      val:
        roi.roi_pct != null
          ? (roi.roi_pct > 0 ? '+' : '') + fmtPct(roi.roi_pct)
          : '—',
      sub: `Líquido ${fmtBRL(roi.net_brl)}`,
      tone:
        roi.roi_pct == null
          ? 'default'
          : roi.roi_pct > 0
          ? 'pos'
          : roi.roi_pct < 0
          ? 'neg'
          : 'default',
    },
    {
      lbl: 'Conversão',
      val: fmtPct(roi.conversion_rate),
      sub: 'referidos → convertidos',
      tone: 'default',
    },
  ] as const
  return (
    <div className="b2b-perf-kpis">
      {cards.map((c) => {
        const cls =
          'b2b-perf-kpi' +
          (c.tone === 'pos' ? ' b2b-perf-kpi-pos' : '') +
          (c.tone === 'neg' ? ' b2b-perf-kpi-neg' : '')
        return (
          <div key={c.lbl} className={cls}>
            <div className="b2b-perf-kpi-val">{c.val}</div>
            <div className="b2b-perf-kpi-lbl">{c.lbl}</div>
            <div className="b2b-perf-kpi-sub">{c.sub}</div>
          </div>
        )
      })}
    </div>
  )
}

function ChurnRisk({ data }: { data: PerformanceFull }) {
  const cr = data.churn_risk
  const signals = Array.isArray(cr.signals) ? cr.signals : []
  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Churn risk</h3>
        <span className="b2b-perf-churn-badge" data-level={cr.level}>
          {cr.score}/100 · {LEVEL_LABELS[cr.level] || cr.level}
        </span>
      </div>
      <div className="b2b-perf-churn-bar">
        <div
          className="b2b-perf-churn-fill"
          data-level={cr.level}
          style={{ ['--pct' as string]: cr.score || 0 } as React.CSSProperties}
        />
      </div>
      {signals.length ? (
        <ul className="b2b-perf-signals">
          {signals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : (
        <div className="b2b-perf-signals-empty">Sem sinais de risco. ✓</div>
      )}
    </section>
  )
}

function VouchersFunnel({ data }: { data: PerformanceFull }) {
  const v = data.vouchers
  if (!v.total) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Funnel de vouchers</h3>
        </div>
        <div className="b2b-empty" style={{ padding: 18 }}>
          Ainda sem vouchers emitidos.
        </div>
      </section>
    )
  }
  const stages = [
    { key: 'issued', label: 'Emitidos' },
    { key: 'delivered', label: 'Entregues' },
    { key: 'opened', label: 'Abertos' },
    { key: 'redeemed', label: 'Resgatados' },
  ] as const
  const max = stages.reduce((m, s) => {
    const n = (v as unknown as Record<string, number | string | null>)[s.key]
    return Math.max(m, Number(n) || 0)
  }, 1)
  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Funnel de vouchers</h3>
        <span className="b2b-perf-sub">
          {v.redemption_rate_pct || 0}% redemption · {v.total} total
        </span>
      </div>
      <div className="b2b-perf-funnel">
        {stages.map((s) => {
          const n = Number((v as unknown as Record<string, number | string | null>)[s.key]) || 0
          const pct = max > 0 ? (n / max) * 100 : 0
          return (
            <div key={s.key} className="b2b-perf-funnel-row">
              <div className="b2b-perf-funnel-lbl">{s.label}</div>
              <div className="b2b-perf-funnel-bar">
                <div
                  className="b2b-perf-funnel-fill"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
              <div className="b2b-perf-funnel-num">{n}</div>
            </div>
          )
        })}
      </div>
      {v.last_issued_at ? (
        <div className="b2b-perf-footnote">
          Último voucher emitido: {fmtDate(v.last_issued_at)}
        </div>
      ) : null}
    </section>
  )
}

function NPSSection({ data }: { data: PerformanceFull }) {
  const n = data.nps
  const responses = Number(n.responses_count || n.responses || 0)
  if (!responses) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>NPS</h3>
        </div>
        <div className="b2b-perf-signals-empty">Sem respostas de NPS ainda.</div>
      </section>
    )
  }
  const nps = n.nps_score != null ? Number(n.nps_score).toFixed(0) : '—'
  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>NPS</h3>
        <span className="b2b-perf-sub">
          {responses} respostas · média{' '}
          {n.avg_score != null ? Number(n.avg_score).toFixed(1) + '/10' : '—'}
        </span>
      </div>
      <div className="b2b-perf-nps-hero">
        <div className="b2b-perf-nps-big">{nps}</div>
        <div className="b2b-perf-nps-breakdown">
          <div>
            <strong style={{ color: '#10B981' }}>{n.promoters || 0}</strong> promotores
          </div>
          <div>{n.passives || 0} passivos</div>
          <div>
            <strong style={{ color: '#EF4444' }}>{n.detractors || 0}</strong> detratores
          </div>
        </div>
      </div>
    </section>
  )
}

function VelocitySection({ data }: { data: PerformanceFull }) {
  const v = data.velocity
  if (v.insufficient_data || !v.n) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Velocity</h3>
        </div>
        <div className="b2b-perf-signals-empty">
          Dados insuficientes pra calcular velocity.
        </div>
      </section>
    )
  }
  const delta = Number(v.delta_pct || 0)
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·'
  const cls = delta > 0 ? 'down' : delta < 0 ? 'up' : 'flat'
  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Velocity · 1ª voucher</h3>
      </div>
      <div className="b2b-perf-velocity">
        <div className="b2b-perf-velocity-big">
          {Number(v.avg_days || 0).toFixed(1)}
          <span>dias</span>
        </div>
        <div className="b2b-perf-velocity-sub">
          Range {Number(v.min_days || 0).toFixed(1)} – {Number(v.max_days || 0).toFixed(1)}
          {' · '}
          {v.n} amostras
        </div>
        <div className={`b2b-perf-velocity-delta ${cls}`}>
          {arrow} {Math.abs(delta).toFixed(1)}% vs período anterior
        </div>
      </div>
    </section>
  )
}

function HealthTrend({ data }: { data: PerformanceFull }) {
  const h = data.health
  const t = h?.trend || { trend: null, changes: 0, history: [] }
  const hist = Array.isArray(t.history) ? t.history : []
  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Saúde · últimos 90 dias</h3>
        <span className="b2b-perf-sub">
          Atual: {h.current || 'unknown'}
          {t.trend ? ` · tendência: ${t.trend}` : ''} · {t.changes || 0} mudanças
        </span>
      </div>
      {hist.length ? (
        <div className="b2b-perf-health-timeline">
          {hist.map((evt, i) => (
            <div key={i} className="b2b-perf-health-evt">
              <span className="b2b-perf-health-dot" data-health={evt.color || 'unknown'} />
              <span className="b2b-perf-health-date">{fmtDate(evt.at)}</span>
              <span style={{ color: 'var(--b2b-text-dim)' }}>
                {evt.previous || 'novo'} →{' '}
                <strong style={{ color: 'var(--b2b-ivory)' }}>{evt.color}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="b2b-perf-signals-empty">Sem mudanças de saúde no período.</div>
      )}
    </section>
  )
}
