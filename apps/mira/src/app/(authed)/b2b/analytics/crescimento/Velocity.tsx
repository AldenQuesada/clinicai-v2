/**
 * Velocity · espelho 1:1 de `b2bm2-velocity.widget.js`.
 *
 * Tempo medio (dias) ate primeira voucher de novas parcerias + delta vs
 * periodo anterior + range min-max.
 */

import type { VelocityData } from '@clinicai/repositories'
import { CountUp } from '@clinicai/ui'

function fmt(n: number, d: number = 1): string {
  return Number(n || 0).toFixed(d)
}

function deltaClass(d: number): 'up' | 'down' | 'flat' {
  if (d > 0) return 'down' // tempo subiu = piorou
  if (d < 0) return 'up'
  return 'flat'
}

function deltaArrow(d: number): string {
  if (d > 0) return '↑'
  if (d < 0) return '↓'
  return '·'
}

export function Velocity({ data }: { data: VelocityData | null }) {
  const avg = Number(data?.avg_days || 0)
  const min = Number(data?.min_days || 0)
  const max = Number(data?.max_days || 0)
  const n = Number(data?.n || 0)
  const delta = Number(data?.delta_pct || 0)

  return (
    <>
      <div className="b2bm-widget-title">Velocity · dias até primeira voucher</div>
      <div className="b2bm-widget-sub">Média, range e tendência</div>

      {n === 0 && avg === 0 ? (
        <div className="b2bm-empty">Sem vouchers emitidas no período.</div>
      ) : (
        <div className="b2bm-kpi-grid">
          <div className="b2bm-kpi">
            <div className="b2bm-kpi-val">
              <CountUp value={avg} formatType="decimal-1" />
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--ink-muted)',
                  marginLeft: 6,
                }}
              >
                dias
              </span>
            </div>
            <div className="b2bm-kpi-lbl">Média até primeira voucher</div>
            <div className={`b2bm-kpi-sub b2bm-kpi-delta ${deltaClass(delta)}`}>
              {deltaArrow(delta)} {Math.abs(delta).toFixed(1)}% vs período anterior
            </div>
          </div>
          <div className="b2bm-kpi">
            <div className="b2bm-kpi-val" style={{ fontSize: 22 }}>
              {fmt(min, 1)} – {fmt(max, 1)}
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--ink-muted)',
                  marginLeft: 6,
                }}
              >
                dias
              </span>
            </div>
            <div className="b2bm-kpi-lbl">Range (mín – máx)</div>
            <div className="b2bm-kpi-sub">{n} parcerias ativadas no período</div>
          </div>
        </div>
      )}
    </>
  )
}
