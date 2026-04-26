/**
 * RoiSection · sec 14 do modal admin legacy.
 *
 * Mirror de `b2b-roi-panel.ui.js`. Retorno real (registro + conversao):
 *   - 4 KPIs (indicados / foram a clinica / converteram / taxa conv.)
 *   - Faturamento / Custo / Liquido / band ROI
 *   - Historico dos leads atribuidos
 *
 * Server Component · 2 RPCs em paralelo (b2b_attribution_roi + leads).
 */

import { loadMiraServerContext } from '@/lib/server-context'

const STATUS_META: Record<string, { label: string; color: string }> = {
  referred: { label: 'Indicado', color: '#64748B' },
  matched: { label: 'Foi a clinica', color: '#60A5FA' },
  converted: { label: 'Converteu', color: '#10B981' },
  lost: { label: 'Perdido', color: '#EF4444' },
}

const SOURCE_META: Record<string, string> = {
  wa_mira: 'Via Mira',
  admin_manual: 'Manual',
  backfill: 'Historico',
  import: 'Importado',
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  try {
    return Number(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    })
  } catch {
    return `R$ ${v}`
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function fmtPhone(p: string | null): string {
  if (!p) return '—'
  const d = String(p).replace(/\D/g, '')
  if (d.length >= 11) return `(${d.slice(-11, -9)}) ${d.slice(-9, -4)}-${d.slice(-4)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return p
}

export async function RoiSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const [roi, leads] = await Promise.all([
    repos.b2bAttributions.roi(partnershipId).catch(() => null),
    repos.b2bAttributions.leads(partnershipId, 50).catch(() => []),
  ])

  if (!roi || !roi.ok) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Retorno real (registro + conversao)</h3>
        </div>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Sem dados de ROI ainda. Emita vouchers + cruze com agendamentos.
        </div>
      </section>
    )
  }

  const roiBand =
    roi.roi_pct == null
      ? { lbl: 'Sem custo pra medir', color: '#64748B' }
      : roi.roi_pct >= 100
      ? { lbl: `ROI positivo (+${roi.roi_pct}%)`, color: '#10B981' }
      : roi.roi_pct >= 0
      ? { lbl: `Empate (${roi.roi_pct}%)`, color: '#60A5FA' }
      : { lbl: `Prejuizo (${roi.roi_pct}%)`, color: '#EF4444' }

  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Retorno real (registro + conversao)</h3>
      </div>

      {/* KPIs + Money */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div
          className="grid grid-cols-2 gap-2 p-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4,
          }}
        >
          <Kpi lbl="Indicados" val={String(roi.referred || 0)} />
          <Kpi lbl="Foram a clinica" val={String(roi.matched || 0)} />
          <Kpi lbl="Converteram" val={String(roi.converted || 0)} color="#10B981" />
          <Kpi
            lbl="Taxa conversao"
            val={roi.conversion_rate != null ? `${roi.conversion_rate}%` : '—'}
          />
        </div>
        <div
          className="flex flex-col gap-2 p-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4,
          }}
        >
          <MoneyLine label="Faturamento" value={fmtBRL(roi.revenue_brl)} />
          <MoneyLine label="Custo" value={fmtBRL(roi.cost_brl)} />
          <div
            className="flex items-baseline justify-between gap-2 pt-2"
            style={{ borderTop: `1px solid ${roiBand.color}` }}
          >
            <span className="text-[11px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
              Liquido
            </span>
            <strong
              className="text-[20px] font-semibold"
              style={{ color: roiBand.color, fontFamily: "'Cormorant Garamond', serif" }}
            >
              {fmtBRL(roi.net_brl)}
            </strong>
          </div>
          <div
            className="text-[11px] font-bold uppercase tracking-[1.2px] inline-flex px-2 py-1 rounded self-start"
            style={{ background: roiBand.color, color: '#0a0a0a' }}
          >
            {roiBand.lbl}
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div>
        <div className="text-[11px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)] mb-2">
          Historico de indicacoes ({leads.length})
        </div>
        {leads.length === 0 ? (
          <div className="b2b-empty" style={{ padding: 16, fontStyle: 'italic' }}>
            Nenhum lead indicado ainda. Ao emitir voucher, aparece aqui.
          </div>
        ) : (
          <div
            className="overflow-x-auto"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 4,
            }}
          >
            <table className="b2b-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Telefone</th>
                  <th>Origem</th>
                  <th>Indicado em</th>
                  <th>Status</th>
                  <th>R$</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const m = STATUS_META[l.status] || { label: l.status, color: '#64748B' }
                  return (
                    <tr key={l.id}>
                      <td>{l.lead_name || '(sem nome)'}</td>
                      <td className="font-mono text-[11px]">{fmtPhone(l.lead_phone)}</td>
                      <td className="text-[10px] uppercase tracking-[1px]">
                        {SOURCE_META[l.source || ''] || l.source || '—'}
                      </td>
                      <td>{fmtDate(l.created_at)}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <i
                            style={{
                              display: 'inline-block',
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: m.color,
                            }}
                          />
                          {m.label}
                        </span>
                      </td>
                      <td>
                        {Number(l.revenue_brl) > 0 ? fmtBRL(l.revenue_brl) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Kpi({ lbl, val, color }: { lbl: string; val: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {lbl}
      </span>
      <strong
        className="text-[22px] font-semibold"
        style={{
          color: color ?? 'var(--b2b-ivory)',
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        {val}
      </strong>
    </div>
  )
}

function MoneyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <strong
        className="text-[16px] font-semibold"
        style={{ color: 'var(--b2b-ivory)', fontFamily: "'Cormorant Garamond', serif" }}
      >
        {value}
      </strong>
    </div>
  )
}
