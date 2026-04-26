/**
 * Payback · espelho 1:1 de `b2bm2-payback.widget.js`.
 *
 * 2 KPIs: ROI% (cor condicional + sinal) + Payback medio em dias.
 * Sub-line: revenue/cost + criadas/resgatadas.
 */

import type { PaybackData } from '@clinicai/repositories'

function num(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function fmtBrl(v: number): string {
  try {
    return v.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  } catch {
    return v.toFixed(2).replace('.', ',')
  }
}

function fmtPct(v: number): string {
  if (isNaN(v)) return '0,0'
  return ((Math.round(v * 10) / 10).toString()).replace('.', ',')
}

function fmtDays(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return '—'
  return ((Math.round(n * 10) / 10).toString()).replace('.', ',')
}

export function Payback({ days, data }: { days: number; data: PaybackData | null }) {
  const payload = data || {}
  const revenue = num(payload.revenue ?? payload.total_revenue)
  const cost = num(payload.cost ?? payload.total_cost)
  const created = num(payload.total_created ?? payload.created)
  const redeemed = num(payload.total_redeemed ?? payload.redeemed)
  const roi =
    payload.roi_pct != null
      ? Number(payload.roi_pct)
      : cost > 0
      ? ((revenue - cost) / cost) * 100
      : 0
  const payback = payload.avg_payback_days ?? payload.payback_days

  return (
    <>
      <div className="b2bm-widget-title">Payback · ROI por voucher</div>
      <div className="b2bm-widget-sub">Últimos {days} dias</div>

      {created === 0 && revenue === 0 && cost === 0 ? (
        <div className="b2bm-empty">Sem dados de payback no período.</div>
      ) : (
        <>
          <div className="b2bm-kpi-grid">
            <div className="b2bm-kpi">
              <div className="b2bm-kpi-lbl">ROI</div>
              <div
                className="b2bm-kpi-val"
                style={{
                  color:
                    roi > 0
                      ? 'var(--green, #10b981)'
                      : roi < 0
                      ? 'var(--red, #ef4444)'
                      : 'var(--ink-muted, #9ca3af)',
                }}
              >
                {(roi > 0 ? '+' : '') + fmtPct(roi)}%
              </div>
              <div className="b2bm-kpi-sub">retorno sobre custo</div>
            </div>
            <div className="b2bm-kpi">
              <div className="b2bm-kpi-lbl">Payback médio</div>
              <div className="b2bm-kpi-val">
                {fmtDays(payback)}
                {!isNaN(Number(payback)) ? (
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-muted)',
                      fontWeight: 400,
                    }}
                  >
                    {' '}
                    dias
                  </span>
                ) : null}
              </div>
              <div className="b2bm-kpi-sub">até recuperar investimento</div>
            </div>
          </div>
          <div className="b2bm-widget-sub" style={{ marginTop: 10 }}>
            R$ {fmtBrl(revenue)} revenue / R$ {fmtBrl(cost)} custo ({created}{' '}
            criada{created === 1 ? '' : 's'}, {redeemed} resgatada
            {redeemed === 1 ? '' : 's'})
          </div>
        </>
      )}
    </>
  )
}
