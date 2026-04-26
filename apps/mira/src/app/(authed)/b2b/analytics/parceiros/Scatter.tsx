'use client'

/**
 * Scatter · espelho 1:1 de `b2bm2-scatter.widget.js`.
 *
 * SVG quadrant chart: X = vouchers emitidos 90d, Y = % conversao,
 * size = is_image_partner. Cor = classification.
 */

import { useRouter } from 'next/navigation'
import type {
  PartnerPerformanceRow,
  PartnerClassification,
} from '@clinicai/repositories'

const COLORS: Record<PartnerClassification, string> = {
  novo: '#06B6D4',
  ideal: '#10B981',
  otimo: '#84CC16',
  aceitavel: '#EAB308',
  abaixo: '#F97316',
  critico: '#EF4444',
  inativa: '#6B7280',
}

export function Scatter({ rows }: { rows: PartnerPerformanceRow[] }) {
  const router = useRouter()
  const withVol = rows.filter((r) => r.vouchers_emitted > 0)

  if (withVol.length === 0) {
    return (
      <div className="b2bm2-card b2bm2-empty">
        Sem parcerias com vouchers no período.
      </div>
    )
  }

  const maxVol = Math.max(...withVol.map((r) => r.vouchers_emitted)) || 1
  const xScale = (v: number) => Math.min(96, 4 + (v / maxVol) * 92)
  const yScale = (p: number) => Math.max(4, 96 - Math.min(100, p) * 0.92)
  const midX = 50
  const midY = yScale(30)

  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>
          Parceiras por performance <small>· rolling 90d</small>
        </h3>
        <div className="b2bm2-card-sub">
          X = volume (vouchers emitidos) · Y = % conversão pagantes · 💎 =
          parceria de imagem
        </div>
      </div>
      <div className="b2bm2-scatter-wrap">
        <svg
          className="b2bm2-scatter"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={midX}
            y1={4}
            x2={midX}
            y2={96}
            className="b2bm2-q-grid"
          />
          <line
            x1={4}
            y1={midY}
            x2={96}
            y2={midY}
            className="b2bm2-q-grid"
          />
          {withVol.map((r) => {
            const cx = xScale(r.vouchers_emitted)
            const cy = yScale(Number(r.conversion_pct) || 0)
            const color = COLORS[r.classification] || '#6B7280'
            const size = r.is_image_partner ? 10 : 7
            const title = `${r.name} · ${r.vouchers_emitted} vouchers, ${r.conversion_pct}% conv (${r.classification})${r.is_image_partner ? ' · IMAGEM' : ''}`
            return (
              <g
                key={r.partnership_id}
                className="b2bm2-dot"
                onClick={() => router.push(`/partnerships/${r.partnership_id}`)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={size}
                  fill={color}
                  opacity={0.85}
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  <title>{title}</title>
                </circle>
                {r.is_image_partner ? (
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={7}
                    fontWeight={700}
                  >
                    💎
                  </text>
                ) : null}
              </g>
            )
          })}
          <text x={96} y={10} textAnchor="end" className="b2bm2-q-lbl b2bm2-q-gold">
            ⭐ OURO
          </text>
          <text x={4} y={10} textAnchor="start" className="b2bm2-q-lbl b2bm2-q-jewel">
            💎 JÓIA
          </text>
          <text
            x={96}
            y={96}
            textAnchor="end"
            className="b2bm2-q-lbl b2bm2-q-potential"
          >
            📈 POTENCIAL
          </text>
          <text
            x={4}
            y={96}
            textAnchor="start"
            className="b2bm2-q-lbl b2bm2-q-dim"
          >
            ⚠ DESPERDÍCIO
          </text>
        </svg>
        <div className="b2bm2-scatter-axis-y">conversão →</div>
        <div className="b2bm2-scatter-axis-x">volume de vouchers →</div>
      </div>
      <div className="b2bm2-scatter-legend">
        <span className="b2bm2-chip" style={{ background: COLORS.ideal }}>
          Ideal 50%+
        </span>
        <span className="b2bm2-chip" style={{ background: COLORS.otimo }}>
          Ótimo 40-49%
        </span>
        <span className="b2bm2-chip" style={{ background: COLORS.aceitavel }}>
          Aceitável 30-39%
        </span>
        <span className="b2bm2-chip" style={{ background: COLORS.abaixo }}>
          Abaixo 10-29%
        </span>
        <span className="b2bm2-chip" style={{ background: COLORS.critico }}>
          Crítico &lt;10%
        </span>
      </div>
    </div>
  )
}
