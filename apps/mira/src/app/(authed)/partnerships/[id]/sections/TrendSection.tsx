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
import { CountUp, Sparkline } from '@clinicai/ui'

// Mapeia cor de saude pra valor numerico · permite sparkline mostrar
// trajetoria continua (red baixo, green alto). unknown vira null (gap).
const COLOR_TO_SCORE: Record<string, number | null> = {
  red: 0,
  yellow: 50,
  green: 100,
  unknown: 50,
}

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
        <Cell label="Atual" tip="Cor de saúde de hoje (verde/amarelo/vermelho).">
          <Chip
            color={COLORS[data.current] || COLORS.unknown}
            tip={`Status atual: ${LABELS[data.current] || '—'}.`}
          >
            {LABELS[data.current] || '—'}
          </Chip>
        </Cell>
        <Cell label="Inicio janela" tip="Cor de saúde 90 dias atrás (ponto de partida da janela).">
          <Chip
            color={COLORS[data.first_in_window || data.current] || COLORS.unknown}
            tip={`Cor no início da janela 90d: ${LABELS[data.first_in_window || data.current] || '—'}.`}
          >
            {LABELS[data.first_in_window || data.current] || '—'}
          </Chip>
        </Cell>
        <Cell
          label="Tendencia"
          tip="Direção comparando saúde atual vs. início da janela 90d. Improving = melhorou, Stable = igual, Worsening = piorou."
        >
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-[1px]"
            style={{ background: tm.bg, color: '#0a0a0a' }}
            title={`Tendência: ${tm.lbl} (${data.trend}).`}
          >
            <span aria-hidden>{tm.glyph}</span> {tm.lbl}
          </span>
        </Cell>
        <Cell label="Mudancas" tip="Quantas vezes a cor de saúde mudou na janela 90d.">
          <strong
            className="text-[18px] font-semibold"
            style={{ color: 'var(--b2b-ivory)' }}
            title={`${data.changes || 0} transições de cor de saúde na janela 90d.`}
          >
            <CountUp value={data.changes || 0} />
          </strong>
          <span
            className="text-[11px] text-[var(--b2b-text-muted)] ml-2"
            title="Verdes: transições para melhor (recuperações). Vermelhas: pioras (alertas)."
          >
            {data.green_changes || 0} verdes · {data.red_changes || 0} vermelhas
          </span>
        </Cell>
      </div>
      {data.history.length > 0 ? (
        <div
          className="flex flex-col gap-2 mt-3 p-3 rounded"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {/* Sparkline · trajetoria score 0-100 derivado das cores */}
          <Sparkline
            data={data.history
              .map((h) => COLOR_TO_SCORE[h.color])
              .filter((v): v is number => v != null)}
            width={220}
            height={32}
            color={COLORS[data.current] || COLORS.unknown}
            fill={true}
          />
          {/* Dots tradicionais · 1 por mudanca */}
          <div className="flex flex-wrap gap-1.5">
            {data.history.map((h, i) => (
              <span
                key={i}
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: COLORS[h.color] || COLORS.unknown }}
                title={`${LABELS[h.color] || h.color} · ${fmtDate(h.at)}`}
              />
            ))}
          </div>
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
  tip,
}: {
  label: string
  children: React.ReactNode
  tip?: string
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
      title={tip}
    >
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}

function Chip({
  children,
  color,
  tip,
}: {
  children: React.ReactNode
  color: string
  tip?: string
}) {
  return (
    <span
      className="inline-flex px-2 py-1 rounded text-[11px] font-bold uppercase tracking-[1px]"
      style={{ background: color, color: '#0a0a0a' }}
      title={tip}
    >
      {children}
    </span>
  )
}
