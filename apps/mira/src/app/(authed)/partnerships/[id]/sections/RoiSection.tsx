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
import { CountUp, Sparkline, EmptyState } from '@clinicai/ui'

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

/**
 * Agrupa timestamps ISO em 7 buckets de 1 dia · ultimo bucket = hoje.
 * Retorna [d-6, d-5, ..., d-1, d-0] · serie pronta pra Sparkline.
 *
 * Defensive: timestamp invalido ou fora do range cai fora silenciosamente.
 */
function bucket7d(timestamps: Array<string | null | undefined>): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0]
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayMs = 86400000
  const start = todayStart - 6 * dayMs
  for (const ts of timestamps) {
    if (!ts) continue
    const t = new Date(ts).getTime()
    if (Number.isNaN(t)) continue
    if (t < start || t > todayStart + dayMs) continue
    const idx = Math.min(6, Math.max(0, Math.floor((t - start) / dayMs)))
    buckets[idx] += 1
  }
  return buckets
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
        <EmptyState
          variant="vouchers"
          title="Sem dados de ROI"
          message="Emita vouchers e cruze com agendamentos pra começar a medir retorno."
        />
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

  // Sparklines (7 dias) · derivadas in-memory dos leads ja fetchados.
  // Nao fazemos query nova · so agrupa o array existente por dia.
  const referredSeries = bucket7d(leads.map((l) => l.created_at))
  const convertedSeries = bucket7d(
    leads
      .filter((l) => l.status === 'converted' && l.converted_at)
      .map((l) => l.converted_at as string),
  )

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
          <Kpi
            lbl="Indicados"
            numeric={Number(roi.referred || 0)}
            series={referredSeries}
            tip="Total de leads indicados pela parceira (atribuição via voucher emitido ou indicação manual). Sparkline = últimos 7 dias."
          />
          <Kpi
            lbl="Foram a clinica"
            numeric={Number(roi.matched || 0)}
            tip="Indicados que cruzaram com agendamento confirmado na clínica (matched no funil)."
          />
          <Kpi
            lbl="Converteram"
            numeric={Number(roi.converted || 0)}
            series={convertedSeries}
            color="#10B981"
            tip="Indicados que viraram pacientes pagantes (status converted · gerou faturamento). Sparkline = conversões nos últimos 7 dias."
          />
          <Kpi
            lbl="Taxa conversao"
            val={roi.conversion_rate != null ? `${roi.conversion_rate}%` : '—'}
            numeric={roi.conversion_rate != null ? Number(roi.conversion_rate) : null}
            valueFormat={(n) => `${n.toFixed(0)}%`}
            tip="Conversão = Converteram / Indicados (lifetime)."
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
          <MoneyLine
            label="Faturamento"
            value={fmtBRL(roi.revenue_brl)}
            numeric={roi.revenue_brl ?? null}
            tip="Soma do faturamento dos leads convertidos atribuídos a essa parceria (lifetime)."
          />
          <MoneyLine
            label="Custo"
            value={fmtBRL(roi.cost_brl)}
            numeric={roi.cost_brl ?? null}
            tip="Custo total acumulado: vouchers resgatados × custo unitário + custo dos eventos."
          />
          <div
            className="flex items-baseline justify-between gap-2 pt-2"
            style={{ borderTop: `1px solid ${roiBand.color}` }}
            title="Líquido = Faturamento − Custo. Se positivo, parceria pagou-se sozinha."
          >
            <span className="text-[11px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
              Liquido
            </span>
            <strong
              className="text-[20px] font-semibold"
              style={{ color: roiBand.color, fontFamily: "'Cormorant Garamond', serif" }}
            >
              {typeof roi.net_brl === 'number' && Number.isFinite(roi.net_brl) ? (
                <CountUp value={roi.net_brl} format={(n) => fmtBRL(n)} />
              ) : (
                fmtBRL(roi.net_brl)
              )}
            </strong>
          </div>
          <div
            className="text-[11px] font-bold uppercase tracking-[1.2px] inline-flex px-2 py-1 rounded self-start"
            style={{ background: roiBand.color, color: '#0a0a0a' }}
            title="ROI% = (Líquido / Custo) × 100. Bandas: >=100% positivo · 0-99% empate · <0% prejuízo."
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
          <EmptyState
            variant="leads"
            title="Sem leads indicados"
            message="Ao emitir voucher, os leads atribuídos à parceria aparecem aqui."
          />
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
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={`Status: ${m.label} · referred=indicado, matched=foi à clínica, converted=virou paciente, lost=perdido.`}
                        >
                          <i
                            aria-label={`status ${m.label}`}
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

function Kpi({
  lbl,
  val,
  numeric,
  series,
  color,
  tip,
  valueFormat,
}: {
  lbl: string
  /** Fallback string quando `numeric` ausente · ex: '—' ou '12%'. */
  val?: string
  /** Quando presente · usa CountUp animado. */
  numeric?: number | null
  /** Serie 7d · renderiza Sparkline mini ao lado quando >=2 pontos. */
  series?: number[]
  color?: string
  tip?: string
  /** Formatter custom · default toLocaleString('pt-BR') (inteiros). */
  valueFormat?: (n: number) => string
}) {
  const c = color ?? 'var(--b2b-ivory)'
  const sparkColor = color ?? '#C9A96E'
  return (
    <div className="flex flex-col gap-0.5" title={tip}>
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {lbl}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        <strong
          className="text-[22px] font-semibold"
          style={{ color: c, fontFamily: "'Cormorant Garamond', serif" }}
        >
          {typeof numeric === 'number' && Number.isFinite(numeric) ? (
            <CountUp value={numeric} format={valueFormat} />
          ) : (
            val ?? '—'
          )}
        </strong>
        {series && series.length >= 2 ? (
          <Sparkline data={series} width={48} height={14} color={sparkColor} />
        ) : null}
      </span>
    </div>
  )
}

function MoneyLine({
  label,
  value,
  numeric,
  tip,
}: {
  label: string
  value: string
  /** Quando presente · CountUp formatando via fmtBRL. */
  numeric?: number | null
  tip?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={tip}>
      <span className="text-[11px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <strong
        className="text-[16px] font-semibold"
        style={{ color: 'var(--b2b-ivory)', fontFamily: "'Cormorant Garamond', serif" }}
      >
        {typeof numeric === 'number' && Number.isFinite(numeric) ? (
          <CountUp value={numeric} format={(n) => fmtBRL(n)} />
        ) : (
          value
        )}
      </strong>
    </div>
  )
}
