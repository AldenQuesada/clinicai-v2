/**
 * DiagnosticSection · 4 cards visuais respondendo "onde perdemos conversão?".
 *
 * Layout 2-col responsive:
 *   ImpactScore (hero · score 0-100 + barra) │ Conversion Lifetime
 *   ────────────────────────────────────────  │ ────────────────────
 *   Trend (90d direção + history dots)        │ Cost (vouchers brl + cap)
 *
 * Visual luxury · classes b2b-diag-* · Cormorant 44px nos numbers,
 * eyebrow champagne, bars com transition 600ms.
 */

import type { GrowthPanel } from '@clinicai/repositories'

const HEALTH_COLOR: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#6B7280',
}

const DIRECTION_LABEL: Record<string, { lbl: string; color: string; arrow: string }> = {
  improving: { lbl: 'Melhorando', color: '#10B981', arrow: '↗' },
  stable: { lbl: 'Estável', color: '#9CA3AF', arrow: '→' },
  worsening: { lbl: 'Piorando', color: '#EF4444', arrow: '↘' },
}

function fmtBrl(v: number): string {
  try {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  } catch {
    return `R$ ${v.toFixed(2)}`
  }
}

export function DiagnosticSection({ data }: { data: GrowthPanel }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">🎯 Diagnóstico</span>
        <span className="text-[11.5px] text-[var(--b2b-text-muted)]">
          Onde estamos perdendo conversão?
        </span>
      </div>

      <div className="b2b-diag-grid">
        <ImpactCard data={data} />
        <ConversionCard data={data} />
        <TrendCard data={data} />
        <CostCard data={data} />
      </div>
    </div>
  )
}

function ImpactCard({ data }: { data: GrowthPanel }) {
  const score = data.impact.score
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  const tier =
    score >= 70 ? 'Alto impacto' : score >= 40 ? 'Médio' : 'Baixo · oportunidade'

  return (
    <Card
      title="Score de Impacto"
      emoji="⚡"
      highlight
      tip="Score 0-100 normalizado pelo topo da rede · vouchers convertidos + NPS + alcance − custo. Bandas: >=70 alto · 40-69 médio · <40 baixo."
    >
      <div className="flex items-baseline gap-3">
        <div
          className="b2b-diag-big"
          style={{ color }}
          title={`Score atual: ${score}/100. Faixa: ${tier}.`}
        >
          {score}
        </div>
        <div className="text-[11px] text-[var(--b2b-text-muted)]">/ 100</div>
      </div>
      <div className="b2b-diag-bar" title={`${score}% do score máximo`}>
        <div
          className="b2b-diag-bar-fill"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
          }}
        />
      </div>
      <div className="b2b-diag-tier-label" style={{ color }}>
        {tier}
      </div>
      <div className="b2b-diag-foot">
        Composto de vouchers convertidos + NPS + alcance − custo
      </div>
    </Card>
  )
}

function ConversionCard({ data }: { data: GrowthPanel }) {
  const c = data.conversion_lifetime
  const conv = c.conv_pct
  const color = conv >= 30 ? '#10B981' : conv >= 15 ? '#F59E0B' : '#EF4444'

  return (
    <Card
      title="Conversão (lifetime)"
      emoji="💰"
      tip="Conversão = vouchers que viraram pagantes / vouchers emitidos (recorte lifetime). Bandas: >=30% verde · 15-29% amarelo · <15% vermelho."
    >
      <div className="flex items-baseline gap-3">
        <div
          className="b2b-diag-big"
          style={{ color, fontSize: 36 }}
          title={`Conversão lifetime: ${conv.toFixed(1)}% (${c.vouchers_purchased} pagantes / ${c.vouchers_total} emitidos).`}
        >
          {conv.toFixed(1)}%
        </div>
        <div className="text-[11px] text-[var(--b2b-text-muted)]">conversão</div>
      </div>

      <div className="b2b-diag-mini-grid">
        <Mini
          lbl="Emitidos"
          val={c.vouchers_total}
          tip="Total de vouchers emitidos lifetime."
        />
        <Mini
          lbl="Compareceram"
          val={c.vouchers_redeemed}
          tip="Vouchers que viraram presença na clínica (status redeemed)."
        />
        <Mini
          lbl="Pagaram"
          val={c.vouchers_purchased}
          color={color}
          tip="Vouchers que viraram pacientes pagantes (status purchased)."
        />
      </div>

      <div className="b2b-diag-foot">
        Stages: Emitiu → Compareceu → Pagou (recorte total)
      </div>
    </Card>
  )
}

function TrendCard({ data }: { data: GrowthPanel }) {
  const t = data.trend
  const dir = DIRECTION_LABEL[t.direction] || DIRECTION_LABEL.stable

  return (
    <Card
      title="Tendência (90d)"
      emoji="📈"
      tip="Comparativo da cor de saúde de hoje com 90 dias atrás. Improving = melhorou · Stable = igual · Worsening = piorou."
    >
      <div className="flex items-baseline gap-3">
        <span
          className="b2b-diag-big"
          style={{ color: dir.color, fontSize: 38 }}
          aria-label={`Direção: ${dir.lbl}`}
          title={`Tendência: ${dir.lbl}`}
        >
          {dir.arrow}
        </span>
        <div>
          <div className="b2b-diag-tier-label" style={{ color: dir.color }}>
            {dir.lbl}
          </div>
          <div
            className="text-[11px] text-[var(--b2b-text-muted)]"
            title="Quantas vezes a cor de saúde mudou na janela 90d"
          >
            {t.changes_90d} mudança(s) na janela
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--b2b-text-muted)]">de</span>
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ background: HEALTH_COLOR[t.first] || '#6B7280' }}
          title={`Cor de saúde 90d atrás: ${t.first}`}
          aria-label={`Início janela: ${t.first}`}
        />
        <span className="text-[10px] text-[var(--b2b-text-muted)]">→</span>
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ background: HEALTH_COLOR[t.current] || '#6B7280' }}
          title={`Cor de saúde hoje: ${t.current}`}
          aria-label={`Hoje: ${t.current}`}
        />
        <span className="text-[10px] text-[var(--b2b-text-muted)] ml-1">hoje</span>
      </div>

      {t.history.length > 0 ? (
        <div
          className="flex items-center gap-1 flex-wrap"
          title="Últimas 12 mudanças de cor (mais recentes à direita)"
        >
          {t.history
            .slice(0, 12)
            .reverse()
            .map((h, i) => (
              <span
                key={i}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: HEALTH_COLOR[h.color] || '#6B7280' }}
                title={`${h.at.slice(0, 10)}: ${h.color}`}
                aria-label={`Mudança em ${h.at.slice(0, 10)}: ${h.color}`}
              />
            ))}
        </div>
      ) : null}
    </Card>
  )
}

function CostCard({ data }: { data: GrowthPanel }) {
  const c = data.cost
  const overCap = c.over_cap
  const color = overCap ? '#EF4444' : 'var(--b2b-ivory)'
  const cap = c.monthly_cap_brl
  const pct = cap && cap > 0 ? Math.min(100, (c.vouchers_brl / cap) * 100) : null

  return (
    <Card
      title="Custo acumulado"
      emoji="💵"
      tip="Custo mensal corrente em vouchers comparecidos × custo unitário. Cap configurado na parceria limita gasto."
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <div
          className="b2b-diag-big"
          style={{ color, fontSize: 32 }}
          title="Vouchers comparecidos × custo unitário (mês corrente)"
        >
          {fmtBrl(c.vouchers_brl)}
        </div>
        {overCap ? (
          <span
            className="text-[10px] uppercase tracking-[1.4px] font-bold"
            style={{ color: '#EF4444' }}
            title="Atenção: gasto mensal já passou do teto configurado. Pause emissões ou ajuste cap."
          >
            ⚠ ACIMA DO CAP
          </span>
        ) : null}
      </div>

      <div className="text-[11px] text-[var(--b2b-text-muted)]">
        {fmtBrl(c.voucher_unit_cost_brl)}/voucher · vouchers comparecidos
      </div>

      {pct !== null ? (
        <>
          <div
            className="b2b-diag-bar"
            title={`${pct.toFixed(0)}% do teto mensal consumido`}
          >
            <div
              className="b2b-diag-bar-fill"
              style={{
                width: `${pct}%`,
                background: overCap ? '#EF4444' : pct > 80 ? '#F59E0B' : '#10B981',
              }}
            />
          </div>
          <div className="b2b-diag-foot">
            {pct.toFixed(0)}% do teto mensal ({fmtBrl(cap || 0)})
          </div>
        </>
      ) : (
        <div className="b2b-diag-foot">
          Sem teto configurado · veja Configurações → Padrões
        </div>
      )}
    </Card>
  )
}

function Card({
  title,
  emoji,
  highlight,
  children,
  tip,
}: {
  title: string
  emoji: string
  highlight?: boolean
  children: React.ReactNode
  tip?: string
}) {
  return (
    <div
      className={`b2b-diag-card${highlight ? ' b2b-diag-card-highlight' : ''}`}
      title={tip}
    >
      <div className="b2b-diag-card-hdr">
        <span className="b2b-diag-card-emoji" aria-hidden>
          {emoji}
        </span>
        <span className="b2b-diag-card-title">{title}</span>
      </div>
      {children}
    </div>
  )
}

function Mini({
  lbl,
  val,
  color,
  tip,
}: {
  lbl: string
  val: number | string
  color?: string
  tip?: string
}) {
  return (
    <div title={tip}>
      <div className="b2b-diag-mini-val" style={color ? { color } : undefined}>
        {val}
      </div>
      <div className="b2b-diag-mini-lbl">{lbl}</div>
    </div>
  )
}
