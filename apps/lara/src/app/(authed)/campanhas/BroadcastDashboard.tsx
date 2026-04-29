'use client'

/**
 * BroadcastDashboard · KPIs + line chart por periodo.
 *
 * Espelho 1:1 de clinic-dashboard/js/broadcast-dashboard.ui.js:
 *  · 5 periodos: hoje | 7d | mes | 90d | tudo
 *  · 6 KPIs: Disparos | Enviados | Taxa envio | Taxa entrega | Taxa leitura | Responderam | Taxa resp.
 *  · Line chart SVG nativo (sem biblioteca · diretiva Lara)
 *  · 10 metric tabs (sent, rate, dlv, dlv_rate, read, read_rate, resp, resp_rate, failed, targets)
 */

import { useMemo, useState } from 'react'
import type { BroadcastDTO } from '@clinicai/repositories'

type Period = 'today' | '7d' | 'month' | '90d' | 'all'
type Metric =
  | 'sent'
  | 'rate'
  | 'dlv'
  | 'dlv_rate'
  | 'read'
  | 'read_rate'
  | 'resp'
  | 'resp_rate'
  | 'failed'
  | 'targets'

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Mes' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Todos' },
]

const METRICS: Array<{ key: Metric; label: string; color: string }> = [
  { key: 'sent', label: 'Enviados', color: '#10B981' },
  { key: 'rate', label: 'Taxa envio', color: '#C9A96E' },
  { key: 'dlv', label: 'Entregues', color: '#0EA5E9' },
  { key: 'dlv_rate', label: 'Taxa entrega', color: '#0284C7' },
  { key: 'read', label: 'Lidos', color: '#8B5CF6' },
  { key: 'read_rate', label: 'Taxa leitura', color: '#7C3AED' },
  { key: 'resp', label: 'Responderam', color: '#2563EB' },
  { key: 'resp_rate', label: 'Taxa resposta', color: '#1D4ED8' },
  { key: 'failed', label: 'Falhas', color: '#EF4444' },
  { key: 'targets', label: 'Destinatarios', color: '#6B7280' },
]

function filterByPeriod(broadcasts: BroadcastDTO[], period: Period): BroadcastDTO[] {
  if (period === 'all') return broadcasts.slice()
  const now = new Date()
  let cutoff: number
  if (period === 'today') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  } else if (period === '7d') {
    cutoff = now.getTime() - 7 * 86400000
  } else if (period === 'month') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  } else if (period === '90d') {
    cutoff = now.getTime() - 90 * 86400000
  } else {
    return broadcasts.slice()
  }
  return broadcasts.filter((b) => {
    const ts = b.created_at ? new Date(b.created_at).getTime() : 0
    return ts >= cutoff
  })
}

function metricValue(b: BroadcastDTO, m: Metric): number {
  const sent = b.sent_count || 0
  const targets = b.total_targets || 0
  const responded = b.responded || 0
  const delivered = b.delivered || 0
  const readCount = b.read || 0
  switch (m) {
    case 'sent':
      return sent
    case 'rate':
      return targets > 0 ? Math.round((sent / targets) * 100) : 0
    case 'dlv':
      return delivered
    case 'dlv_rate':
      return sent > 0 ? Math.round((delivered / sent) * 100) : 0
    case 'read':
      return readCount
    case 'read_rate':
      return sent > 0 ? Math.round((readCount / sent) * 100) : 0
    case 'resp':
      return responded
    case 'resp_rate':
      return sent > 0 ? Math.round((responded / sent) * 100) : 0
    case 'failed':
      return b.failed_count || 0
    case 'targets':
      return targets
    default:
      return 0
  }
}

const PERCENT_METRICS: Metric[] = ['rate', 'dlv_rate', 'read_rate', 'resp_rate']

function LineChart({
  filtered,
  metric,
}: {
  filtered: BroadcastDTO[]
  metric: Metric
}) {
  const sorted = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
    [filtered],
  )
  if (sorted.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 20,
          color: 'var(--b2b-text-muted)',
          fontSize: 12,
        }}
      >
        Sem dados no periodo
      </div>
    )
  }

  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0]
  const isPercent = PERCENT_METRICS.includes(metric)
  const values = sorted.map((b) => metricValue(b, metric))
  const labels = sorted.map((b) => {
    const d = b.created_at ? new Date(b.created_at) : null
    return d
      ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      : '-'
  })
  const names = sorted.map((b) => b.name || '')

  let maxVal = Math.max(...values)
  if (maxVal <= 0) maxVal = 1

  const W = 500
  const H = 180
  const PAD = 40
  const PADR = 15
  const PADT = 10
  const PADB = 40
  const chartW = W - PAD - PADR
  const chartH = H - PADT - PADB
  const n = values.length
  const yMaxChart = isPercent ? 100 : maxVal

  const points = values.map((v, idx) => {
    const px = PAD + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2)
    const py = PADT + chartH - (v / yMaxChart) * chartH
    return `${px.toFixed(1)},${py.toFixed(1)}`
  })
  const firstX = PAD + (n > 1 ? 0 : chartW / 2)
  const lastX = PAD + (n > 1 ? chartW : chartW / 2)
  const areaBottom = (PADT + chartH).toFixed(1)
  const polygonPoints = `${firstX.toFixed(1)},${areaBottom} ${points.join(' ')} ${lastX.toFixed(1)},${areaBottom}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const yVal = isPercent ? i * 25 : Math.round((maxVal * i) / 4)
        const yPos = PADT + chartH - (i / 4) * chartH
        return (
          <g key={i}>
            <text x={PAD - 5} y={yPos + 3} textAnchor="end" fill="#9CA3AF" fontSize="9">
              {yVal}
              {isPercent ? '%' : ''}
            </text>
            <line
              x1={PAD}
              y1={yPos}
              x2={W - PADR}
              y2={yPos}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3,3"
            />
          </g>
        )
      })}
      {labels.map((lbl, j) => {
        const x = PAD + (n > 1 ? (j / (n - 1)) * chartW : chartW / 2)
        return (
          <g key={j}>
            <text x={x} y={H - 18} textAnchor="middle" fill="#6B7280" fontSize="7" fontWeight="600">
              {names[j].slice(0, 4)}
            </text>
            <text x={x} y={H - 6} textAnchor="middle" fill="#9CA3AF" fontSize="8">
              {lbl}
            </text>
          </g>
        )
      })}
      <line x1={PAD} y1={PADT} x2={PAD} y2={PADT + chartH} stroke="rgba(255,255,255,0.1)" />
      <polygon points={polygonPoints} fill={activeMetric.color} opacity={0.08} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={activeMetric.color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, idx) => {
        const px = PAD + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2)
        const py = PADT + chartH - (v / yMaxChart) * chartH
        const valLabel = `${v}${isPercent ? '%' : ''}`
        return (
          <g key={idx}>
            <circle
              cx={px}
              cy={py}
              r={4}
              fill="var(--b2b-bg-1, #1a1a1a)"
              stroke={activeMetric.color}
              strokeWidth={2}
            />
            <text
              x={px}
              y={py - 10}
              textAnchor="middle"
              fill={activeMetric.color}
              fontSize="9"
              fontWeight="700"
            >
              {valLabel}
            </text>
            <title>
              {names[idx]} — {valLabel}
            </title>
          </g>
        )
      })}
    </svg>
  )
}

export function BroadcastDashboard({ broadcasts }: { broadcasts: BroadcastDTO[] }) {
  const [period, setPeriod] = useState<Period>('7d')
  const [metric, setMetric] = useState<Metric>('sent')

  const filtered = useMemo(() => filterByPeriod(broadcasts, period), [broadcasts, period])

  // KPIs (espelho de _renderBroadcastDashboard linhas 178–197)
  const totalDisparos = filtered.length
  let totalEnviados = 0
  let totalTargets = 0
  let totalResponded = 0
  let totalDelivered = 0
  let totalRead = 0
  filtered.forEach((b) => {
    totalEnviados += b.sent_count || 0
    totalTargets += b.total_targets || 0
    totalResponded += b.responded || 0
    totalDelivered += b.delivered || 0
    totalRead += b.read || 0
  })
  const taxaEnvio = totalTargets > 0 ? Math.round((totalEnviados / totalTargets) * 100) : 0
  const taxaEntrega = totalEnviados > 0 ? Math.round((totalDelivered / totalEnviados) * 100) : 0
  const taxaLeitura = totalEnviados > 0 ? Math.round((totalRead / totalEnviados) * 100) : 0
  const taxaResposta = totalEnviados > 0 ? Math.round((totalResponded / totalEnviados) * 100) : 0

  return (
    <div className="luxury-card" style={{ padding: 18, marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className="b2b-btn"
            style={{
              padding: '6px 12px',
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderColor:
                period === p.key ? 'var(--b2b-champagne)' : 'var(--b2b-border)',
              color: period === p.key ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
              background: period === p.key ? 'rgba(201,169,110,0.10)' : 'transparent',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="b2b-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi value={totalDisparos} label="Disparos" />
        <Kpi value={totalEnviados} label="Enviados" />
        <Kpi value={`${taxaEnvio}%`} label="Taxa envio" />
        <Kpi value={`${taxaEntrega}%`} label="Taxa entrega" />
        <Kpi value={`${taxaLeitura}%`} label="Taxa leitura" />
        <Kpi value={totalResponded} label="Responderam" />
        <Kpi value={`${taxaResposta}%`} label="Taxa resp." />
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 12,
        }}
      >
        {METRICS.map((m) => {
          const isActive = metric === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              style={{
                padding: '4px 10px',
                fontSize: 10,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontWeight: 600,
                border: `1px solid ${isActive ? m.color : 'var(--b2b-border)'}`,
                color: isActive ? m.color : 'var(--b2b-text-muted)',
                background: isActive ? `${m.color}10` : 'transparent',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      <LineChart filtered={filtered} metric={metric} />
    </div>
  )
}

function Kpi({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="b2b-kpi">
      <div className="b2b-kpi-num">{value}</div>
      <div className="b2b-kpi-lbl">{label}</div>
    </div>
  )
}
