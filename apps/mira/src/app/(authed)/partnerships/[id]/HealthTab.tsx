/**
 * Tab "Health" · alerts ativos · b2b_partnership_alerts (best-effort).
 */

import { loadMiraServerContext } from '@/lib/server-context'

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5 text-[hsl(var(--danger))]',
  warning: 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-[hsl(var(--warning))]',
  info: 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))]',
}

export async function HealthTab({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const alerts = await repos.b2bPartnerships.healthSnapshot(partnershipId)

  if (alerts.length === 0) {
    return (
      <div className="rounded-card border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5 p-8 text-center">
        <div className="text-sm text-[hsl(var(--success))]">
          Nenhum alerta ativo · parceria saudável.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`rounded-card border px-4 py-3 ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-display-uppercase text-[10px] tracking-widest">
              {a.kind}
            </span>
            <span className="text-[10px] uppercase tracking-widest opacity-70">
              {fmt(a.createdAt)}
            </span>
          </div>
          <p className="text-sm">{a.message}</p>
        </div>
      ))}
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
