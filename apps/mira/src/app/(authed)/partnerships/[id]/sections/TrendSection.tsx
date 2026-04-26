/**
 * TrendSection · sec 16 do modal admin legacy.
 *
 * Mirror de `b2b-trend-panel.ui.js`. Tendencia de saude 90d:
 *   - Atual + Inicio janela (chips coloridos)
 *   - Trend badge: improving/stable/worsening
 *   - Mudancas + serie de dots (ultimas mudancas)
 *
 * Server Component · 1 RPC b2b_health_trend.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const COLORS: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#64748B',
}

const LABELS: Record<string, string> = {
  green: 'Verde',
  yellow: 'Amarelo',
  red: 'Vermelho',
  unknown: 'Sem dado',
}

const TREND_META: Record<
  string,
  { lbl: string; bg: string; glyph: string }
> = {
  improving: { lbl: 'Melhorando', bg: '#10B981', glyph: '▲' },
  stable: { lbl: 'Estavel', bg: '#64748B', glyph: '■' },
  worsening: { lbl: 'Piorando', bg: '#EF4444', glyph: '▼' },
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

export async function TrendSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bHealthTrend.byPartnership(partnershipId, 90).catch(() => null)

  if (!data || !data.ok) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Tendencia de saude · 90 dias</h3>
        </div>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Sem dados de tendencia ainda.
        </div>
      </section>
    )
  }

  const tm = TREND_META[data.trend] || TREND_META.stable

  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Tendencia de saude · 90 dias</h3>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        <Cell label="Atual">
          <Chip color={COLORS[data.current] || COLORS.unknown}>
            {LABELS[data.current] || '—'}
          </Chip>
        </Cell>
        <Cell label="Inicio janela">
          <Chip color={COLORS[data.first_in_window || data.current] || COLORS.unknown}>
            {LABELS[data.first_in_window || data.current] || '—'}
          </Chip>
        </Cell>
        <Cell label="Tendencia">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-[1px]"
            style={{ background: tm.bg, color: '#0a0a0a' }}
          >
            <span>{tm.glyph}</span> {tm.lbl}
          </span>
        </Cell>
        <Cell label="Mudancas">
          <strong className="text-[18px] font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
            {data.changes || 0}
          </strong>
          <span className="text-[11px] text-[var(--b2b-text-muted)] ml-2">
            {data.green_changes || 0} verdes · {data.red_changes || 0} vermelhas
          </span>
        </Cell>
      </div>
      {data.history.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5 mt-3 p-2 rounded"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {data.history.map((h, i) => (
            <span
              key={i}
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: COLORS[h.color] || COLORS.unknown }}
              title={`${LABELS[h.color] || h.color} · ${fmtDate(h.at)}`}
            />
          ))}
        </div>
      ) : (
        <div className="text-[11px] mt-2 italic text-[var(--b2b-text-muted)]">
          sem mudancas registradas na janela
        </div>
      )}
    </section>
  )
}

function Cell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col gap-1"
      style={{
        background: 'rgba(255,255,255,0.02)',
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
      }}
    >
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase tracking-[1px]"
      style={{ background: color, color: '#0a0a0a' }}
    >
      {children}
    </span>
  )
}
