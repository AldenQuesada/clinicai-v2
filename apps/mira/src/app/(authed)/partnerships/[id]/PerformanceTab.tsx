/**
 * Partnership detail · tab "Performance" · espelho 1:1 de
 * `b2b-detail-performance.ui.js`. Dashboard ROI + churn + vouchers funnel
 * + NPS + health trend + velocity em 1 tela.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BPartnershipDTO, PerformanceFull } from '@clinicai/repositories'

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

export async function PerformanceTab({ partnership }: { partnership: B2BPartnershipDTO }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bPerformance.full(partnership.id).catch(() => null)

  if (!data || !data.ok) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
        Sem dados de performance ainda. {data?.error || ''}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Meta data={data} />
      <KPIs data={data} />
      <ChurnRisk data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <NPSSection data={data} />
        <VelocitySection data={data} />
      </div>
      <VouchersFunnel data={data} />
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
    <div className="text-[11px] text-[#9CA3AF] flex flex-wrap gap-x-3 gap-y-1">
      {bits.join(' · ')}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {cards.map((c) => {
        const color =
          c.tone === 'pos' ? '#10B981' : c.tone === 'neg' ? '#EF4444' : '#F5F0E8'
        return (
          <div
            key={c.lbl}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
              {c.lbl}
            </div>
            <div
              className="text-2xl font-semibold font-mono leading-none mt-1.5"
              style={{ color }}
            >
              {c.val}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-1.5">{c.sub}</div>
          </div>
        )
      })}
    </div>
  )
}

const LEVEL_LABELS: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  critical: 'Crítico',
}

const LEVEL_COLOR: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
}

function ChurnRisk({ data }: { data: PerformanceFull }) {
  const cr = data.churn_risk
  const signals = Array.isArray(cr.signals) ? cr.signals : []
  const color = LEVEL_COLOR[cr.level] || '#9CA3AF'
  return (
    <Section
      title="Churn risk"
      right={
        <span
          className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[1px]"
          style={{ background: color + '26', color }}
        >
          {cr.score}/100 · {LEVEL_LABELS[cr.level] || cr.level}
        </span>
      }
    >
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${cr.score || 0}%`, background: color }}
        />
      </div>
      {signals.length ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-[#F5F0E8]">
          {signals.map((s, i) => (
            <li key={i}>• {s}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-[12px] text-[#10B981]">Sem sinais de risco. ✓</div>
      )}
    </Section>
  )
}

function VouchersFunnel({ data }: { data: PerformanceFull }) {
  const v = data.vouchers
  if (!v.total) {
    return (
      <Section title="Funnel de vouchers">
        <div className="text-[12px] text-[#9CA3AF] py-2">
          Ainda sem vouchers emitidos.
        </div>
      </Section>
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
    <Section
      title="Funnel de vouchers"
      right={
        <span className="text-[11px] text-[#9CA3AF]">
          {v.redemption_rate_pct || 0}% redemption · {v.total} total
        </span>
      }
    >
      <div className="flex flex-col gap-2 mt-2">
        {stages.map((s) => {
          const n = Number((v as unknown as Record<string, number | string | null>)[s.key]) || 0
          const pct = max > 0 ? (n / max) * 100 : 0
          return (
            <div key={s.key} className="grid grid-cols-[100px_1fr_50px] items-center gap-3">
              <div className="text-[11px] text-[#9CA3AF]">{s.label}</div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#C9A96E]"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
              <div className="text-[12px] text-[#F5F0E8] font-mono text-right">{n}</div>
            </div>
          )
        })}
      </div>
      {v.last_issued_at ? (
        <div className="text-[10px] text-[#6B7280] mt-2">
          Último voucher emitido: {fmtDate(v.last_issued_at)}
        </div>
      ) : null}
    </Section>
  )
}

function NPSSection({ data }: { data: PerformanceFull }) {
  const n = data.nps
  const responses = Number(n.responses_count || n.responses || 0)
  if (!responses) {
    return (
      <Section title="NPS">
        <div className="text-[12px] text-[#9CA3AF] py-2">
          Sem respostas de NPS ainda.
        </div>
      </Section>
    )
  }
  const nps = n.nps_score != null ? Number(n.nps_score).toFixed(0) : '—'
  return (
    <Section
      title="NPS"
      right={
        <span className="text-[11px] text-[#9CA3AF]">
          {responses} respostas · média{' '}
          {n.avg_score != null ? Number(n.avg_score).toFixed(1) + '/10' : '—'}
        </span>
      }
    >
      <div className="flex items-center gap-4 mt-2">
        <div
          className="text-5xl text-[#C9A96E] leading-none"
          style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}
        >
          {nps}
        </div>
        <div className="flex flex-col gap-0.5 text-[11px]">
          <div>
            <strong style={{ color: '#10B981' }}>{n.promoters || 0}</strong> promotores
          </div>
          <div>{n.passives || 0} passivos</div>
          <div>
            <strong style={{ color: '#EF4444' }}>{n.detractors || 0}</strong> detratores
          </div>
        </div>
      </div>
    </Section>
  )
}

function VelocitySection({ data }: { data: PerformanceFull }) {
  const v = data.velocity
  if (v.insufficient_data || !v.n) {
    return (
      <Section title="Velocity">
        <div className="text-[12px] text-[#9CA3AF] py-2">
          Dados insuficientes pra calcular velocity.
        </div>
      </Section>
    )
  }
  const delta = Number(v.delta_pct || 0)
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·'
  const color = delta > 0 ? '#EF4444' : delta < 0 ? '#10B981' : '#9CA3AF'
  return (
    <Section title="Velocity · dias até primeira voucher">
      <div className="flex flex-col gap-1 mt-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-[#F5F0E8] font-mono">
            {Number(v.avg_days || 0).toFixed(1)}
          </span>
          <span className="text-[11px] text-[#9CA3AF]">dias</span>
        </div>
        <div className="text-[11px] text-[#9CA3AF]">
          Range {Number(v.min_days || 0).toFixed(1)} – {Number(v.max_days || 0).toFixed(1)}{' '}
          · {v.n} amostras
        </div>
        <div className="text-[11px] mt-1" style={{ color }}>
          {arrow} {Math.abs(delta).toFixed(1)}% vs período anterior
        </div>
      </div>
    </Section>
  )
}

const HEALTH_DOT: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#6B7280',
}

function HealthTrend({ data }: { data: PerformanceFull }) {
  const h = data.health
  const t = h?.trend || { trend: null, changes: 0, history: [] }
  const hist = Array.isArray(t.history) ? t.history : []
  return (
    <Section
      title="Saúde · últimos 90 dias"
      right={
        <span className="text-[11px] text-[#9CA3AF]">
          Atual: {h.current || 'unknown'}
          {t.trend ? ` · tendência: ${t.trend}` : ''} · {t.changes || 0} mudanças
        </span>
      }
    >
      {hist.length ? (
        <div className="flex flex-col gap-1.5 mt-2">
          {hist.map((evt, i) => (
            <div key={i} className="flex items-center gap-3 text-[12px]">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: HEALTH_DOT[evt.color] || HEALTH_DOT.unknown }}
              />
              <span className="text-[10px] text-[#6B7280] font-mono w-20 shrink-0">
                {fmtDate(evt.at)}
              </span>
              <span className="text-[#9CA3AF]">
                {evt.previous || 'novo'} →{' '}
                <strong className="text-[#F5F0E8]">{evt.color}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-[#9CA3AF] py-2">
          Sem mudanças de saúde no período.
        </div>
      )}
    </Section>
  )
}

function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  )
}
