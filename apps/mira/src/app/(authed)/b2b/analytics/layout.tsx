/**
 * /b2b/analytics layout · banner de alertas criticos sticky no topo
 * em todas as 6 sub-tabs (Overview/Crescimento/Parceiros/Retorno/Imagem/NPS).
 *
 * Espelha o slot `b2bm2AlertsHost` do shell legado b2bm2.shell.js que
 * renderiza `b2b_critical_alerts` antes das tabs.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { AlertsBanner } from './AlertsBanner'
import type { CriticalAlert } from '@clinicai/repositories'

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Defensive: nunca crashar o segmento inteiro por causa de RPC opcional.
  // Se loadMiraServerContext throw (auth race) ou criticalAlerts throw com
  // shape estranho, ainda renderiza children sem o banner.
  let alerts: CriticalAlert[] = []
  try {
    const { repos } = await loadMiraServerContext()
    alerts = await repos.b2bMetricsV2.criticalAlerts().catch(() => [])
  } catch {
    alerts = []
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {alerts.length > 0 ? <AlertsBanner alerts={alerts} /> : null}
      {children}
    </div>
  )
}
