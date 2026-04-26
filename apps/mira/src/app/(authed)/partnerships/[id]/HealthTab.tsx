/**
 * Tab "Health" · sec 5 (health snapshot real-time) + alerts ativos.
 *
 * Sec 5 (HealthSnapshotSection) consome RPC b2b_partnership_health_snapshot
 * (mig 800-35) · score 0-100 + triggers + metrics.
 *
 * Alerts vem de b2b_partnership_alerts (best-effort · tabela criada na mig
 * 800-35).
 *
 * Visual luxury · usa b2b-insight (data-tone) pra cores semanticas.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { HealthSnapshotSection } from './sections/HealthSnapshotSection'

const SEVERITY_TONE: Record<string, 'warn' | 'opportunity' | 'ok'> = {
  critical: 'warn',
  warning: 'opportunity',
  info: 'ok',
}

export async function HealthTab({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const alerts = await repos.b2bPartnerships.healthSnapshot(partnershipId)

  return (
    <div className="flex flex-col gap-4">
      {/* Sec 5 · Health snapshot real-time (score 0-100 + triggers + metrics) */}
      <HealthSnapshotSection partnershipId={partnershipId} />

      <h3 className="b2b-sec-title">Alertas ativos</h3>
      {alerts.length === 0 ? (
        <div className="b2b-insight" data-tone="ok">
          <span className="b2b-insight-icon">✓</span>
          <span style={{ color: 'var(--b2b-sage)', fontWeight: 600 }}>
            Nenhum alerta ativo · parceria saudável.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((a, i) => {
            const tone = SEVERITY_TONE[a.severity] ?? 'ok'
            return (
              <div
                key={i}
                className="b2b-insight"
                data-tone={tone}
                style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[1.4px]"
                    style={{ color: tone === 'warn' ? 'var(--b2b-red)' : 'var(--b2b-champagne)' }}
                  >
                    {a.kind}
                  </span>
                  <span className="text-[9px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)] font-mono">
                    {fmt(a.createdAt)}
                  </span>
                </div>
                <p className="text-[12.5px] m-0" style={{ color: 'var(--b2b-ivory)' }}>
                  {a.message}
                </p>
              </div>
            )
          })}
        </div>
      )}
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
