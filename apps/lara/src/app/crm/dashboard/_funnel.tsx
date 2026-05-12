/**
 * FunnelCard · server component · renderiza funil canônico v2.
 * Snapshot atual (leads ativos · não filtra por período pois é piramide).
 */

import { Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import type { CrmDashboardFunnel } from '@clinicai/repositories'

interface Props {
  funnel: CrmDashboardFunnel
}

export function FunnelCard({ funnel }: Props) {
  // Order: lead → agendado → compareceu → paciente/orcamento → perdido/recuperado
  const stages = [
    { label: 'Leads ativos', value: funnel.totalLeads, tone: undefined },
    { label: 'Em phase agendado', value: funnel.agendado, tone: undefined },
    { label: 'Compareceram (chegada)', value: funnel.compareceu, tone: undefined },
    { label: 'Pacientes (convertidos)', value: funnel.paciente, tone: 'ok' as const },
    { label: 'Orçamentos (intenção)', value: funnel.orcamento, tone: undefined },
    { label: 'Perdidos (total histórico)', value: funnel.perdido, tone: 'alert' as const },
    { label: 'Recuperados', value: funnel.recuperado, tone: 'ok' as const },
  ]

  const maxValue = Math.max(funnel.totalLeads, funnel.compareceu, funnel.perdido, 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil canônico</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stages.map((s) => {
            const width = Math.max(8, Math.round((s.value / maxValue) * 100))
            const barColor =
              s.tone === 'ok'
                ? 'bg-emerald-500/60 dark:bg-emerald-400/40'
                : s.tone === 'alert'
                  ? 'bg-red-500/60 dark:bg-red-400/40'
                  : 'bg-[var(--primary)]/40'
            return (
              <div key={s.label} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className="text-[var(--muted-foreground)]">{s.label}</span>
                  <span className="text-[var(--foreground)] font-semibold">{s.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-border-soft)]/30">
                  <div
                    className={`h-1.5 rounded-full ${barColor}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
          Pirâmide canônica v2 · phase ∈ &#123;lead, agendado, paciente, orcamento&#125; ·
          perdidos vivem em <code>perdidos</code> table · `compareceu` derivado de
          appointments com <code>chegada_em</code> presente.
        </p>
      </CardContent>
    </Card>
  )
}
