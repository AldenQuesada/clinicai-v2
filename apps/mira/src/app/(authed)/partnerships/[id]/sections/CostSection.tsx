/**
 * CostSection · sec 15 do modal admin legacy.
 *
 * Mirror de `b2b-cost-panel.ui.js`. Custo real acumulado:
 *   - vouchers redeemed × voucher_unit_cost_brl
 *   - eventos × cost_estimate_brl
 *   - over_cap warning se passou monthly_value_cap_brl
 *
 * Server Component · 1 RPC b2b_partnership_cost.
 */

import { loadMiraServerContext } from '@/lib/server-context'

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

export async function CostSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bCost.byPartnership(partnershipId).catch(() => null)

  if (!data || !data.ok) {
    return (
      <section className="b2b-perf-section">
        <div className="b2b-perf-section-hdr">
          <h3>Custo real acumulado</h3>
        </div>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Sem dado de custo ainda.
        </div>
      </section>
    )
  }

  const totalColor = data.over_cap ? '#EF4444' : '#10B981'
  const unitLabel =
    data.voucher_unit_cost_brl != null
      ? `${fmtBRL(data.voucher_unit_cost_brl)}/voucher`
      : 'sem custo unitario cadastrado'

  return (
    <section className="b2b-perf-section">
      <div className="b2b-perf-section-hdr">
        <h3>Custo real acumulado</h3>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        <Cell label="Vouchers resgatados" value={String(data.voucher_redeemed)} sub={unitLabel} />
        <Cell label="Custo vouchers" value={fmtBRL(data.voucher_total_cost)} />
        <Cell
          label="Exposicoes grupo"
          value={String(data.group_exposures)}
          sub={`${data.group_reach || 0} alcancadas`}
        />
        <Cell label="Custo eventos" value={fmtBRL(data.group_total_cost)} />
        <div
          className="flex flex-col gap-0.5 col-span-2"
          style={{
            background: data.over_cap
              ? 'rgba(239, 68, 68, 0.06)'
              : 'rgba(16,185,129,0.04)',
            padding: '10px 12px',
            border: `1px solid ${totalColor}`,
            borderRadius: 4,
          }}
        >
          <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
            Total
          </span>
          <strong className="text-[20px] font-semibold" style={{ color: totalColor }}>
            {fmtBRL(data.total_cost)}
          </strong>
          {data.monthly_cap_brl != null ? (
            <span className="text-[11px] text-[var(--b2b-text-muted)]">
              teto: {fmtBRL(data.monthly_cap_brl)}
            </span>
          ) : null}
        </div>
      </div>

      {data.over_cap ? (
        <div
          className="text-[12px] mt-2 p-2 rounded"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#EF4444',
          }}
        >
          Custo passou do teto mensal configurado — revise a parceria.
        </div>
      ) : null}
      {data.voucher_unit_cost_brl == null && data.voucher_redeemed > 0 ? (
        <div
          className="text-[11px] mt-2 italic"
          style={{ color: 'var(--b2b-text-muted)' }}
        >
          Cadastre o custo unitario do voucher na edicao da parceria pra ver
          valores reais.
        </div>
      ) : null}
    </section>
  )
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
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
      <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
        {label}
      </span>
      <strong className="text-[16px] font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
        {value}
      </strong>
      {sub ? (
        <span className="text-[11px] text-[var(--b2b-text-muted)]">{sub}</span>
      ) : null}
    </div>
  )
}
