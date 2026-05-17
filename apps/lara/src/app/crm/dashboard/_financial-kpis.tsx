/**
 * BLOCO 3.3 · KPI cards financeiros do dashboard CRM.
 *
 * Lê CrmDashboardFinancialSummary calculado em `repos.crmDashboard.getFinancialSummary`.
 *
 * COPY SEGURA:
 *   - "Valor finalizado" (não "faturamento" · não é contábil)
 *   - "Ticket médio finalizado" (média de appointments com value > 0)
 *
 * Server component · zero state.
 */

import { Card, CardContent } from '@clinicai/ui'
import type { CrmDashboardFinancialSummary } from '@clinicai/repositories'

interface Props {
  financial: CrmDashboardFinancialSummary
  rangeLabel: string
}

function fmtMoney(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

export function FinancialKpis({ financial, rangeLabel }: Props) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        label="Valor finalizado"
        value={fmtMoney(financial.valorFinalizado)}
        hint={`${financial.finalizadosComValor} consulta${
          financial.finalizadosComValor === 1 ? '' : 's'
        } com valor · ${rangeLabel}`}
        tone="ok"
      />
      <KpiCard
        label="Ticket médio finalizado"
        value={fmtMoney(financial.ticketMedio)}
        hint={
          financial.finalizadosComValor > 0
            ? `Média de ${financial.finalizadosComValor} consulta${financial.finalizadosComValor === 1 ? '' : 's'} com value > 0`
            : 'Sem dados pra cálculo no período'
        }
      />
      <KpiCard
        label="Finalizados totais"
        value={financial.finalizadosTotal.toLocaleString('pt-BR')}
        hint={
          financial.finalizadosTotal > 0 && financial.finalizadosComValor < financial.finalizadosTotal
            ? `${financial.finalizadosTotal - financial.finalizadosComValor} sem valor (cortesia/zero)`
            : undefined
        }
        tone="muted"
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'ok' | 'muted' | 'alert'
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'alert'
        ? 'text-[var(--destructive)]'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className={`text-2xl font-semibold ${color}`}>{value}</span>
        {hint && <span className="text-[10px] text-[var(--muted-foreground)]">{hint}</span>}
      </CardContent>
    </Card>
  )
}
