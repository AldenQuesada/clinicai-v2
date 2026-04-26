/**
 * HealthSnapshotSection · sec 5 do modal admin legacy.
 *
 * Mirror de `b2b-health-snapshot.ui.js` · score 0-100 real-time + triggers
 * + metrics (vouchers, cap, conversao, NPS).
 *
 * Server Component · 1 RPC b2b_partnership_health_snapshot.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const COLORS = {
  green: { hex: '#10B981', label: 'Saudavel' },
  yellow: { hex: '#F59E0B', label: 'Atencao' },
  red: { hex: '#EF4444', label: 'Critico' },
  unknown: { hex: '#9CA3AF', label: 'Sem dado' },
} as const

export async function HealthSnapshotSection({
  partnershipId,
}: {
  partnershipId: string
}) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bHealthSnapshot.byPartnership(partnershipId).catch(() => null)

  if (!data || !data.ok) {
    return (
      <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
        Sem dado de saude disponivel ainda.
      </div>
    )
  }

  const c = COLORS[data.color as keyof typeof COLORS] || COLORS.unknown
  const score = Number(data.score || 0)
  const circumference = 2 * Math.PI * 36
  const dash = (score / 100) * circumference

  return (
    <div className="b2b-card" data-health-color={data.color}>
      <div className="flex items-center justify-between mb-3">
        <div className="b2b-sec-title" style={{ marginTop: 0 }}>
          Saude em tempo real
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Ring SVG */}
        <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke={c.hex}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash.toFixed(2)} ${circumference.toFixed(2)}`}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            <strong style={{ fontSize: 24, fontWeight: 500, color: 'var(--b2b-ivory)' }}>
              {score}
            </strong>
            <small style={{ fontSize: 10, color: 'var(--b2b-text-muted)' }}>/100</small>
          </div>
        </div>

        {/* Right side */}
        <div className="flex flex-col gap-2 flex-1" style={{ minWidth: 200 }}>
          <div
            className="text-[11px] font-bold uppercase tracking-[1.4px] inline-flex items-center gap-1.5 px-2 py-1 rounded self-start"
            style={{ color: c.hex, border: `1px solid ${c.hex}40` }}
          >
            {c.label}
          </div>

          {data.triggers.length > 0 ? (
            <ul className="text-[11.5px]" style={{ color: 'var(--b2b-text-dim)', paddingLeft: 16, margin: 0 }}>
              {data.triggers.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] text-[var(--b2b-text-muted)]" style={{ fontStyle: 'italic' }}>
              Sem alertas — saude saudavel.
            </div>
          )}

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Metric
              val={
                data.metrics.days_since_last_voucher >= 999
                  ? '—'
                  : `${data.metrics.days_since_last_voucher}d`
              }
              lbl="desde voucher"
            />
            <Metric
              val={`${data.metrics.cap_used}/${data.metrics.cap_total}`}
              lbl="cap mensal"
            />
            <Metric
              val={data.metrics.conv_pct != null ? `${data.metrics.conv_pct.toFixed(0)}%` : '—'}
              lbl={`conv. 90d (${data.metrics.conv_90d}/${data.metrics.vouchers_90d})`}
            />
            <Metric
              val={data.metrics.nps_avg != null ? data.metrics.nps_avg.toFixed(1) : '—'}
              lbl="NPS medio"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ val, lbl }: { val: string; lbl: string }) {
  return (
    <div
      className="flex flex-col gap-0.5"
      style={{
        background: 'rgba(255,255,255,0.02)',
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
      }}
    >
      <span className="text-[15px] font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
        {val}
      </span>
      <small className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {lbl}
      </small>
    </div>
  )
}
