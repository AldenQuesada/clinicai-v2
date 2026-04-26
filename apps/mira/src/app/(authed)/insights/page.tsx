/**
 * /insights · lista global de alertas/oportunidades cross-partnership.
 *
 * Server Component magro · fetch via b2bInsights.global() (RPC mig 800-19)
 * + InsightsList (client) com filtros por severity/kind.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { InsightsList } from './InsightsList'

export const dynamic = 'force-dynamic'

export default async function InsightsPage() {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bInsights.global().catch(() => null)

  const insights = data?.insights ?? []
  const scanned = data?.partnerships_scanned ?? 0
  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'

  const counts = {
    critical: insights.filter((i) => i.severity === 'critical').length,
    warning: insights.filter((i) => i.severity === 'warning').length,
    success: insights.filter((i) => i.severity === 'success').length,
    info: insights.filter((i) => i.severity === 'info').length,
  }

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="flex items-end justify-between pb-2 border-b border-white/10">
          <div>
            <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
              Insights · cross-parcerias
            </span>
            <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Alertas e oportunidades</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              {scanned} parcerias analisadas · gerado {generatedAt}. Click em qualquer card abre a parceria.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10.5px]">
            <Stat label="Críticos" value={counts.critical} color="#EF4444" />
            <Stat label="Warnings" value={counts.warning} color="#F59E0B" />
            <Stat label="Oportunidades" value={counts.success} color="#10B981" />
            <Stat label="Info" value={counts.info} color="#C9A96E" />
          </div>
        </div>

        <InsightsList insights={insights} />
      </div>
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[18px] font-mono font-bold leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[1.4px] text-[#9CA3AF] mt-1">{label}</span>
    </div>
  )
}
