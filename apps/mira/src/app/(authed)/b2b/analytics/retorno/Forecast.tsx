/**
 * Forecast · espelho 1:1 de `b2bm2-forecast.widget.js`.
 *
 * Projecao mes (parcerias novas + vouchers) com 2 blocos KPI side-by-side
 * + status overall + comparacao mes anterior.
 */

import type { ForecastData, ForecastStatus } from '@clinicai/repositories'

const STATUS_LABEL: Record<ForecastStatus, string> = {
  acima: 'Acima da meta',
  ok: 'No ritmo',
  atento: 'Atenção',
  risco: 'Em risco',
}

function statusVar(s: ForecastStatus): string {
  if (s === 'acima') return 'green'
  if (s === 'ok') return 'blue'
  if (s === 'atento') return 'amber'
  return 'red'
}

function normStatus(s: unknown): ForecastStatus {
  const v = String(s || 'ok').toLowerCase()
  if (v === 'acima' || v === 'ok' || v === 'atento' || v === 'risco') return v
  return 'ok'
}

function overallStatus(s1: ForecastStatus, s2: ForecastStatus): ForecastStatus {
  const rank: Record<ForecastStatus, number> = { risco: 0, atento: 1, ok: 2, acima: 3 }
  return rank[s1] <= rank[s2] ? s1 : s2
}

export function Forecast({ data }: { data: ForecastData | null }) {
  if (!data) {
    return (
      <>
        <div className="b2bm-widget-title">Projeção do mês</div>
        <div className="b2bm-empty">Sem dados de forecast.</div>
      </>
    )
  }

  const statusNew = normStatus(data.status_new)
  const statusVouch = normStatus(data.status_vouchers)
  const overall = data.status_overall
    ? normStatus(data.status_overall)
    : overallStatus(statusNew, statusVouch)
  const daysPassed = Math.max(1, Number(data.days_passed || 1))

  return (
    <>
      <div className="b2bm-widget-title">Projeção do mês</div>
      <div className="b2bm-widget-sub">Runrate x meta · parcerias e vouchers</div>

      <div className="b2bm-forecast-dual">
        <Block
          label="Novas parcerias"
          meta={data.meta_new_partners}
          realized={data.new_realized}
          projection={data.new_projection}
          pct={data.pct_of_meta_new}
          status={statusNew}
        />
        <Block
          label="Vouchers"
          meta={data.meta_vouchers}
          realized={data.vouch_realized}
          projection={data.vouch_projection}
          pct={data.pct_of_meta_vouchers}
          status={statusVouch}
        />
      </div>

      <div className="b2bm-forecast-overall">
        <span
          className={`b2bm-forecast-status ${overall}`}
          style={{ background: `var(--${statusVar(overall)})` }}
        >
          {STATUS_LABEL[overall]}
        </span>
        <span className="b2bm-kpi-sub">
          Dia {daysPassed} · mês anterior: {data.prev_month_new_partners} parcerias /{' '}
          {data.prev_month_vouchers} vouchers
        </span>
      </div>
    </>
  )
}

function Block({
  label,
  meta,
  realized,
  projection,
  pct,
  status,
}: {
  label: string
  meta: number | null | undefined
  realized: number | null | undefined
  projection: number | null | undefined
  pct: number | null | undefined
  status: ForecastStatus
}) {
  // Defensive: RPC pode retornar shape parcial (ex.: partner sem vouchers
  // ainda no mes · projection/pct undefined). .toFixed em undefined throw
  // TypeError e crashava o segmento inteiro com digest opaco.
  const safeMeta = Number(meta ?? 0)
  const safeRealized = Number(realized ?? 0)
  const safeProjection = Number(projection ?? 0)
  const safePct = Number(pct ?? 0)
  const barW = Math.min(100, Math.max(0, safePct))
  return (
    <div className="b2bm-forecast-block">
      <div className="b2bm-forecast-block-title">{label}</div>
      <div className="b2bm-kpi-grid">
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val">{safeRealized}</div>
          <div className="b2bm-kpi-lbl">Realizado</div>
        </div>
        <div className="b2bm-kpi">
          <div className="b2bm-kpi-val" style={{ fontSize: 22 }}>
            {safeProjection.toFixed(1)}
          </div>
          <div className="b2bm-kpi-lbl">Projeção fim do mês</div>
        </div>
      </div>
      <div className="b2bm-forecast-meta">
        <span>
          {safePct.toFixed(0)}% da meta ({safeMeta})
        </span>
        <span
          className={`b2bm-forecast-status ${status}`}
          style={{ background: `var(--${statusVar(status)})` }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className="b2bm-forecast-bar">
        <div
          className={`b2bm-forecast-fill ${status}`}
          style={{ width: `${barW.toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}
