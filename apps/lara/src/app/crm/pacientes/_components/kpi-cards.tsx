/**
 * KpiCards · 8 KPIs de pacientes em grid responsivo (8 cards no header).
 *
 * Espelha clinic-dashboard legacy js/patients.js (kpiPatients* IDs).
 * 2 KPIs deferidos pra Camada 8 (Agenda):
 *   - Retorno (count com appointments futuros)
 *   - Return Days medio
 *
 * RSC · sem state · render direto dos numbers calculados pelo repository.
 */

import { Card } from '@clinicai/ui'

interface KpiCardsProps {
  total: number
  active: number
  churn: number
  churnPct: number
  revenueTotal: number
  proceduresTotal: number
  ticketAvg: number
  orcamentoOpenCount: number
  orcamentoOpenValue: number
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})
const NUM = new Intl.NumberFormat('pt-BR')
const PCT = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function KpiCards(props: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiCard label="Total" value={NUM.format(props.total)} hint="todos pacientes" />
      <KpiCard
        label="Ativos"
        value={NUM.format(props.active)}
        hint="status=active"
        accent="success"
      />
      <KpiCard
        label="Churn"
        value={NUM.format(props.churn)}
        hint="sem retorno >90d"
        accent={props.churn > 0 ? 'warning' : undefined}
      />
      <KpiCard
        label="Churn %"
        value={PCT.format(props.churnPct / 100)}
        hint={`vs ${NUM.format(props.active)} ativos`}
        accent={props.churnPct > 30 ? 'warning' : undefined}
      />
      <KpiCard
        label="Revenue"
        value={BRL.format(props.revenueTotal)}
        hint="acumulado"
      />
      <KpiCard
        label="Ticket Médio"
        value={BRL.format(props.ticketAvg)}
        hint={`/ ${NUM.format(props.proceduresTotal)} procs`}
      />
      <KpiCard
        label="Orçam. Abertos"
        value={NUM.format(props.orcamentoOpenCount)}
        hint="status=sent/viewed"
        accent="info"
      />
      <KpiCard
        label="Valor Aberto"
        value={BRL.format(props.orcamentoOpenValue)}
        hint="potencial"
        accent="info"
      />
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  accent?: 'success' | 'warning' | 'info'
}

function KpiCard({ label, value, hint, accent }: KpiCardProps) {
  return (
    <Card className="p-3">
      <div className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={`mt-1 font-display-italic text-xl ${
          accent === 'success'
            ? 'text-emerald-400'
            : accent === 'warning'
              ? 'text-amber-400'
              : accent === 'info'
                ? 'text-sky-400'
                : 'text-[var(--foreground)]'
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]/70">
          {hint}
        </div>
      )}
    </Card>
  )
}
