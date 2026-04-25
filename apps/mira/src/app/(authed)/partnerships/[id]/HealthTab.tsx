/**
 * Tab "Health" · alerts ativos · b2b_partnership_alerts (best-effort).
 * Visual mirror b2b-config.css `.bcfg-err-block` (vermelho dim) + cards densos.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const SEVERITY_STYLE: Record<string, { wrap: string; text: string }> = {
  critical: {
    wrap: 'border-[#EF4444]/30 bg-[#EF4444]/8',
    text: 'text-[#FCA5A5]',
  },
  warning: {
    wrap: 'border-[#F59E0B]/30 bg-[#F59E0B]/8',
    text: 'text-[#F59E0B]',
  },
  info: {
    wrap: 'border-white/10 bg-white/[0.02]',
    text: 'text-[#F5F0E8]',
  },
}

export async function HealthTab({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const alerts = await repos.b2bPartnerships.healthSnapshot(partnershipId)

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/8 p-5 text-center">
        <div className="text-xs text-[#10B981] font-semibold">
          Nenhum alerta ativo · parceria saudável.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {alerts.map((a, i) => {
        const style = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info
        return (
          <div
            key={i}
            className={`rounded-lg border px-3.5 py-2.5 ${style.wrap}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-[1.2px] ${style.text}`}>
                {a.kind}
              </span>
              <span className="text-[9px] uppercase tracking-[1.2px] text-[#9CA3AF] font-mono">
                {fmt(a.createdAt)}
              </span>
            </div>
            <p className={`text-xs ${style.text}`}>{a.message}</p>
          </div>
        )
      })}
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
