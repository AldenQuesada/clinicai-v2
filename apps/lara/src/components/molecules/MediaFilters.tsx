'use client'

/**
 * MediaFilters · molecula · filtros padrao Mira (.b2b-tab + .b2b-chip).
 */

import { useMemo } from 'react'

export type FunnelFilter = 'all' | 'fullface' | 'olheiras' | 'none'

const FUNNEL_TABS: { value: FunnelFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'fullface', label: 'Full Face' },
  { value: 'olheiras', label: 'Olheiras' },
  { value: 'none', label: 'Sem funnel' },
]

export function MediaFilters({
  funnel,
  onFunnelChange,
  selectedQueixas,
  onQueixasChange,
  availableQueixas,
  counts,
}: {
  funnel: FunnelFilter
  onFunnelChange: (f: FunnelFilter) => void
  selectedQueixas: string[]
  onQueixasChange: (qs: string[]) => void
  availableQueixas: string[]
  counts: Record<FunnelFilter, number>
}) {
  const sortedQueixas = useMemo(() => [...availableQueixas].sort(), [availableQueixas])

  const toggleQueixa = (q: string) => {
    if (selectedQueixas.includes(q)) {
      onQueixasChange(selectedQueixas.filter((x) => x !== q))
    } else {
      onQueixasChange([...selectedQueixas, q])
    }
  }

  return (
    <div className="space-y-3">
      {/* Funnel · .b2b-tab */}
      <div className="flex flex-wrap gap-2">
        {FUNNEL_TABS.map((tab) => {
          const active = funnel === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFunnelChange(tab.value)}
              className={`b2b-tab ${active ? 'active' : ''}`}
            >
              {tab.label}
              <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
                {counts[tab.value]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Queixas · .b2b-chip */}
      {sortedQueixas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[2px] text-[var(--b2b-text-muted)] font-semibold mr-1">
            Queixa
          </span>
          {sortedQueixas.map((q) => {
            const active = selectedQueixas.includes(q)
            return (
              <button
                key={q}
                type="button"
                onClick={() => toggleQueixa(q)}
                className={`b2b-chip ${active ? 'b2b-chip-active' : ''}`}
              >
                {q}
              </button>
            )
          })}
          {selectedQueixas.length > 0 && (
            <button
              type="button"
              onClick={() => onQueixasChange([])}
              className="text-[11px] text-[var(--b2b-text-muted)] hover:text-[var(--b2b-red)] underline-offset-2 hover:underline ml-1"
            >
              limpar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
