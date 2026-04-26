/**
 * ImpactSection · sec 13 do modal admin legacy.
 *
 * Mirror de `b2b-impact-panel.ui.js`. Score 0-100 normalizado pelo topo da
 * rede + 4 KV (vouchers redeemed, NPS medio, alcance, custo total).
 *
 * Server Component · 1 RPC b2b_partnership_impact_score.
 */

import { loadMiraServerContext } from '@/lib/server-context'

function scoreBand(score: number): { label: string; color: string; verdict: string } {
  if (score >= 75)
    return { label: 'Estrela', color: '#10B981', verdict: 'Manter e replicar o modelo' }
  if (score >= 50)
    return { label: 'Solida', color: '#60A5FA', verdict: 'Cadencia correta, seguir firme' }
  if (score >= 25)
    return { label: 'Morna', color: '#F59E0B', verdict: 'Ativar playbook de recuperacao' }
  if (score > 0)
    return { label: 'Fria', color: '#EF4444', verdict: 'Reavaliar contrato / permuta' }
  return {
    label: 'Sem dados ainda',
    color: '#64748B',
    verdict: 'Emitir vouchers e coletar NPS pra medir',
  }
}

export async function ImpactSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bImpact.byPartnership(partnershipId).catch(() => null)

  if (!data || data.ok === false) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Impacto & ROI</h3>
        </div>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Sem dados de impacto ainda.
        </div>
      </section>
    )
  }

  const score = Number(data.impact_score || 0)
  const band = scoreBand(score)

  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Impacto & ROI</h3>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 3,
            fontFamily: "'Cormorant Garamond', serif",
            color: band.color,
          }}
        >
          <strong style={{ fontSize: 56, fontWeight: 500, lineHeight: 1 }}>{score}</strong>
          <span style={{ fontSize: 18, opacity: 0.6 }}>/100</span>
        </div>
        <div className="flex flex-col gap-1.5 flex-1" style={{ minWidth: 220 }}>
          <div
            className="text-[11px] font-bold uppercase tracking-[1.4px] inline-flex px-2 py-1 rounded self-start"
            style={{ background: band.color, color: '#0a0a0a' }}
          >
            {band.label}
          </div>
          <div className="text-[12px] text-[var(--b2b-text-muted)]" style={{ lineHeight: 1.5 }}>
            {band.verdict}
          </div>
        </div>
      </div>

      <div
        className="grid gap-2 mt-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        <Cell label="Vouchers resgatados" value={String(data.vouchers_redeemed ?? 0)} />
        <Cell
          label="NPS medio"
          value={data.avg_nps ? Number(data.avg_nps).toFixed(1) : '—'}
        />
        <Cell label="Alcance (eventos)" value={String(data.total_reach ?? 0)} />
        <Cell
          label="Custo total"
          value={
            data.total_cost != null
              ? `R$ ${Math.round(Number(data.total_cost)).toLocaleString('pt-BR')}`
              : '—'
          }
        />
      </div>
    </section>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-0.5"
      style={{
        background: 'rgba(255,255,255,0.02)',
        padding: '10px 12px',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
      }}
    >
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <strong className="text-[17px] font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
        {value}
      </strong>
    </div>
  )
}
