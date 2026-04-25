'use client'

/**
 * AnalyticsClient · espelho 1:1 de `b2b-analytics.ui.js`.
 *
 * 5 secoes:
 *   1. Header com período (7d/30d/90d)
 *   2. Candidaturas (5 KPIs)
 *   3. Vouchers (6 KPIs) + Jornada (funnel) + Origem (split bar)
 *   4. Tempo de resposta (2 KPIs)
 *   5. Saúde (bar verde/amarelo/vermelho/sem-dado)
 *   6. Atividade Mira (3 KPIs)
 *
 * Strings, classes (.b2b-kpi*, .b2b-journey*, .b2b-split*, .b2b-health*)
 * preservadas literalmente.
 */

import { useEffect, useState } from 'react'
import { fetchAnalyticsAction } from './actions'
import type { AnalyticsBlob } from '@clinicai/repositories'

const PERIOD_OPTIONS = [7, 30, 90] as const

export function AnalyticsClient({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState<number>(initialDays)
  const [data, setData] = useState<AnalyticsBlob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetchAnalyticsAction(days)
      .then((d) => {
        if (!alive) return
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [days])

  if (loading) {
    return <div className="b2b-empty">Carregando analytics…</div>
  }
  if (error) {
    return <div className="b2b-empty b2b-empty-err">{error}</div>
  }
  if (!data || !data.ok) {
    return <div className="b2b-empty">Sem dados.</div>
  }

  const a = data.applications || ({} as AnalyticsBlob['applications'])
  const v = data.vouchers || ({} as AnalyticsBlob['vouchers'])
  const t = data.timing || ({} as AnalyticsBlob['timing'])
  const h = data.health || ({} as AnalyticsBlob['health'])
  const m = data.mira || ({} as AnalyticsBlob['mira'])
  const nps = m.nps_summary || ({} as AnalyticsBlob['mira']['nps_summary'])

  return (
    <div className="b2b-analytics">
      <div className="b2b-analytics-hdr">
        <div>
          <div className="b2b-list-count">
            Analytics Mira B2B · últimos {data.period_days} dias
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--b2b-text-muted)',
              marginTop: '2px',
            }}
          >
            Gerado em {new Date(data.generated_at).toLocaleString('pt-BR')}
          </div>
        </div>
        <div className="b2b-analytics-period">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={'b2b-tab' + (days === d ? ' active' : '')}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="b2b-sec-title">Candidaturas</div>
      <div className="b2b-sec-sub">
        Parceiras que submeteram formulário ou vieram por scout externo.{' '}
        <em>Scout Apify ≠ candidatura</em> — candidatos prospectados ficam na aba
        &quot;Candidatos&quot; da seção Geral.
      </div>
      <div className="b2b-kpis-grid">
        <Kpi label="Total" value={a.total ?? 0} />
        <Kpi
          label="Pendentes"
          value={a.pending ?? 0}
          color={(a.pending ?? 0) > 0 ? 'amber' : null}
        />
        <Kpi label="Aprovadas" value={a.approved ?? 0} color="green" />
        <Kpi label="Rejeitadas" value={a.rejected ?? 0} />
        <Kpi
          label="Conversão"
          value={`${a.conversion_rate ?? 0}%`}
          sub={`${a.approved ?? 0}/${a.total ?? 0} viraram parceria`}
        />
      </div>

      <div className="b2b-sec-title">
        Vouchers <small>(exclui demos)</small>
      </div>
      <div className="b2b-kpis-grid">
        <Kpi label="Emitidos" value={v.total ?? 0} />
        <Kpi label="Entregues" value={v.delivered ?? 0} />
        <Kpi label="Abertos" value={v.opened ?? 0} />
        <Kpi
          label="Agendaram"
          value={v.scheduled ?? 0}
          color={(v.scheduled ?? 0) > 0 ? 'amber' : null}
        />
        <Kpi label="Compareceram" value={v.redeemed ?? 0} color="green" />
        <Kpi label="Viraram compra" value={v.purchased ?? 0} color="green" />
      </div>

      <div className="b2b-sec-title">Jornada da convidada</div>
      <div className="b2b-sec-sub">
        Funil de conversão: voucher enviado → agendou → compareceu → virou paciente
        pagante.
      </div>
      <JourneyBar v={v} />

      <div className="b2b-analytics-split">
        <div className="b2b-split-hdr">Origem dos vouchers</div>
        <VoucherSplit v={v} />
      </div>

      <div className="b2b-sec-title">Tempo de resposta</div>
      <div className="b2b-kpis-grid">
        <Kpi
          label="Aprovação média"
          value={`${t.avg_approval_hours ?? 0}h`}
          sub={`${t.resolved_count ?? 0} resolvidas no período`}
        />
        <Kpi label="Maior tempo" value={`${t.max_approval_hours ?? 0}h`} />
      </div>

      <div className="b2b-sec-title">Saúde das parcerias</div>
      <HealthBar h={h} />

      <div className="b2b-sec-title">Atividade Mira</div>
      <div className="b2b-kpis-grid">
        <Kpi
          label="Telefones autorizados"
          value={m.wa_senders_active ?? 0}
          sub={`de ${m.wa_senders_total ?? 0} cadastrados`}
        />
        <Kpi
          label="Respostas NPS"
          value={m.nps_responses ?? 0}
          sub={
            (nps.responses ?? 0) > 0
              ? `NPS atual: ${nps.nps_score != null ? nps.nps_score : '—'}`
              : ''
          }
        />
        <Kpi
          label="Insights ativos"
          value={m.insights_active ?? 0}
          sub={
            (m.insights_active ?? 0) > 0 ? 'Olha na página' : 'Tudo em ordem'
          }
        />
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number | string
  sub?: string
  color?: 'green' | 'amber' | 'red' | null
}) {
  return (
    <div className={'b2b-kpi' + (color ? ' b2b-kpi-' + color : '')}>
      <div className="b2b-kpi-val">{value}</div>
      <div className="b2b-kpi-lbl">{label}</div>
      {sub ? <div className="b2b-kpi-sub">{sub}</div> : null}
    </div>
  )
}

function HealthBar({ h }: { h: AnalyticsBlob['health'] }) {
  const total = Number(h.total || 0)
  if (!total) {
    return (
      <div
        className="b2b-empty"
        style={{ padding: '12px', fontStyle: 'italic' }}
      >
        Nenhuma parceria ativa
      </div>
    )
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
            <i style={{ background: '#10B981' }} />
            {g} verdes
          </span>
        ) : null}
        {y > 0 ? (
          <span>
            <i style={{ background: '#F59E0B' }} />
            {y} em atenção
          </span>
        ) : null}
        {r > 0 ? (
          <span>
            <i style={{ background: '#EF4444' }} />
            {r} críticas
          </span>
        ) : null}
        {u > 0 ? (
          <span>
            <i style={{ background: '#64748B' }} />
            {u} sem dado
          </span>
        ) : null}
      </div>
    </>
  )
}

function VoucherSplit({ v }: { v: AnalyticsBlob['vouchers'] }) {
  const total = Number(v.total || 0)
  if (!total) {
    return (
      <div
        className="b2b-empty"
        style={{ padding: '12px', fontStyle: 'italic' }}
      >
        Nenhum voucher no período
      </div>
    )
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
              background: 'var(--b2b-champagne)',
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
            <i style={{ background: 'var(--b2b-champagne)' }} />
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
  const delivered = Number(v.delivered || 0)
  const opened = Number(v.opened || 0)
  const scheduled = Number(v.scheduled || 0)
  const redeemed = Number(v.redeemed || 0)
  const purchased = Number(v.purchased || 0)
  if (!total) return <div className="b2b-empty">Nenhum voucher no período.</div>

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <div className="b2b-journey">
      <JourneyStep label="Enviados" n={total} pct={100} color="#64748B" />
      <JourneyStep
        label="Entregues"
        n={delivered}
        pct={pct(delivered)}
        color="#60A5FA"
      />
      <JourneyStep label="Abertos" n={opened} pct={pct(opened)} color="#A78BFA" />
      <JourneyStep
        label="Agendaram"
        n={scheduled}
        pct={pct(scheduled)}
        color="#F59E0B"
      />
      <JourneyStep
        label="Compareceram"
        n={redeemed}
        pct={pct(redeemed)}
        color="#10B981"
      />
      <JourneyStep
        label="Pagaram"
        n={purchased}
        pct={pct(purchased)}
        color="var(--b2b-champagne)"
      />
    </div>
  )
}

function JourneyStep({
  label,
  n,
  pct,
  color,
}: {
  label: string
  n: number
  pct: number
  color: string
}) {
  return (
    <div className="b2b-journey-step">
      <div className="b2b-journey-lbl">{label}</div>
      <div className="b2b-journey-n" style={{ color }}>
        {n}
      </div>
      <div className="b2b-journey-pct">{pct}%</div>
      <div className="b2b-journey-bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
