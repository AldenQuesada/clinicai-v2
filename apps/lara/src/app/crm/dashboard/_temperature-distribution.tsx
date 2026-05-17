/**
 * BLOCO 3.3 · Distribuição de temperatura · 4 mini-cards.
 *
 * Conta leads ATIVOS (lifecycle='ativo', deleted_at NULL) criados no
 * período. Snapshot · não é métrica de fluxo.
 *
 * Server component.
 */

import { Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import type { CrmDashboardTemperatureDistribution } from '@clinicai/repositories'

interface Props {
  distribution: CrmDashboardTemperatureDistribution
}

const TEMP_ROWS: Array<{
  key: keyof Pick<CrmDashboardTemperatureDistribution, 'hot' | 'warm' | 'cold' | 'unknown'>
  label: string
  emoji: string
  color: string
  bg: string
}> = [
  { key: 'hot', label: 'Hot', emoji: '🔥', color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-500/10' },
  { key: 'warm', label: 'Warm', emoji: '⚡', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10' },
  { key: 'cold', label: 'Cold', emoji: '❄', color: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-500/10' },
  { key: 'unknown', label: 'Sem tag', emoji: '·', color: 'text-[var(--muted-foreground)]', bg: 'bg-[var(--color-border-soft)]/30' },
]

function pct(n: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((n / total) * 1000) / 10}%`
}

export function TemperatureDistribution({ distribution }: Props) {
  const total = distribution.total
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de temperatura</CardTitle>
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          Leads ativos criados no período · {total.toLocaleString('pt-BR')} no total.
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="rounded border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
            Nenhum lead ativo no recorte atual.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEMP_ROWS.map((r) => {
              const v = distribution[r.key]
              return (
                <div
                  key={r.key}
                  className={`flex flex-col gap-1 rounded-md border border-[var(--border)] p-2.5 ${r.bg}`}
                >
                  <span className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                    {r.emoji} {r.label}
                  </span>
                  <span className={`text-xl font-semibold ${r.color}`}>{v}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {pct(v, total)} do total
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
