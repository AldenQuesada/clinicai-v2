/**
 * KPIs do painel /crm/orcamentos · 6 cards.
 *
 * Calculados a partir da lista visivel (filtrada). Para clinicas com muitos
 * orcamentos, considerar mover pra RPC SQL no futuro (countByStatus e sum).
 */

import { Card } from '@clinicai/ui'
import type { OrcamentoDTO } from '@clinicai/repositories'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface OrcamentoKpis {
  total: number
  open: number
  approved: number
  lost: number
  conversionRate: number
  averageTicket: number
  totalValue: number
  approvedValue: number
  openValue: number
}

export function computeOrcamentoKpis(orcs: OrcamentoDTO[]): OrcamentoKpis {
  const total = orcs.length
  const approved = orcs.filter((o) => o.status === 'approved').length
  const lost = orcs.filter((o) => o.status === 'lost').length
  const open = total - approved - lost
  const totalValue = orcs.reduce((s, o) => s + o.total, 0)
  const approvedValue = orcs
    .filter((o) => o.status === 'approved')
    .reduce((s, o) => s + o.total, 0)
  const openValue = orcs
    .filter((o) => o.status !== 'approved' && o.status !== 'lost')
    .reduce((s, o) => s + o.total, 0)
  const decided = approved + lost
  const conversionRate = decided > 0 ? (approved / decided) * 100 : 0
  const averageTicket = total > 0 ? totalValue / total : 0
  return {
    total,
    open,
    approved,
    lost,
    conversionRate,
    averageTicket,
    totalValue,
    approvedValue,
    openValue,
  }
}

export function OrcamentoKpiCards({ kpis }: { kpis: OrcamentoKpis }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="Total" value={kpis.total.toString()} />
      <KpiCard label="Em aberto" value={kpis.open.toString()} accent="info" />
      <KpiCard label="Aprovados" value={kpis.approved.toString()} accent="success" />
      <KpiCard
        label="Conversão"
        value={`${kpis.conversionRate.toFixed(0)}%`}
        accent={kpis.conversionRate >= 50 ? 'success' : 'warning'}
      />
      <KpiCard
        label="Ticket médio"
        value={BRL.format(kpis.averageTicket)}
        accent="primary"
      />
      <KpiCard
        label="Recuperado / em aberto"
        value={`${BRL.format(kpis.approvedValue)} / ${BRL.format(kpis.openValue)}`}
      />
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  accent?: 'info' | 'primary' | 'success' | 'warning' | 'destructive'
}

function KpiCard({ label, value, accent }: KpiCardProps) {
  return (
    <Card className="p-3">
      <div className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={`mt-1 font-display-italic text-xl ${
          accent === 'success'
            ? 'text-emerald-400'
            : accent === 'destructive'
              ? 'text-rose-400'
              : accent === 'warning'
                ? 'text-amber-400'
                : accent === 'info'
                  ? 'text-sky-400'
                  : accent === 'primary'
                    ? 'text-[var(--primary)]'
                    : 'text-[var(--foreground)]'
        }`}
      >
        {value}
      </div>
    </Card>
  )
}
