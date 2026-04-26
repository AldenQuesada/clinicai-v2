/**
 * PartnershipsScoutBudget · widget Scout toggle + Budget badge no topo
 * da page /partnerships. Mirror legacy b2b-shell.ui.js sem o eyebrow/title
 * (que ja vivem no chrome global).
 *
 * Server Component · fetcha scout consumption defensivo.
 * Inline styles pra eliminar suspeita de Tailwind JIT purge.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { ConsumptionDTO } from '@clinicai/repositories'

export async function PartnershipsScoutBudget() {
  let consumption: ConsumptionDTO | null = null
  try {
    const { repos } = await loadMiraServerContext()
    consumption = await repos.b2bScout.consumedCurrentMonth().catch(() => null)
  } catch {
    consumption = null
  }

  const enabled = consumption?.scout_enabled ?? true
  const totalBrl = Number(consumption?.total_brl ?? 0)
  const capBrl = Number(consumption?.budget_cap_brl ?? 100)
  const pct = capBrl > 0 ? Math.min(100, (totalBrl / capBrl) * 100) : 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '12px 0 16px',
        flexWrap: 'wrap',
      }}
    >
      {/* Scout toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid rgba(201,169,110,0.25)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#9CA3AF',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Scout
          </span>
          <span
            style={{
              fontSize: 11,
              color: enabled ? '#C9A96E' : '#7A7165',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {enabled ? 'Ativo' : 'Desligado'}
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            width: 40,
            height: 20,
            borderRadius: 999,
            background: enabled ? '#C9A96E' : 'rgba(255,255,255,0.1)',
            transition: 'background 200ms ease',
          }}
          role="img"
          aria-label={enabled ? 'Scout ativo' : 'Scout desligado'}
        >
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: enabled ? 22 : 2,
              width: 16,
              height: 16,
              borderRadius: 999,
              background: '#0F0D0A',
              transition: 'left 200ms ease',
            }}
          />
        </div>
      </div>

      {/* Budget badge */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid rgba(201,169,110,0.25)',
          background: 'rgba(255,255,255,0.02)',
          minWidth: 180,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#9CA3AF',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Budget
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: '#F5F0E8',
            }}
          >
            R$ {totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/
            {capBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 999,
              background: pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#C9A96E',
              transition: 'width 400ms ease',
            }}
          />
        </div>
      </div>
    </div>
  )
}
