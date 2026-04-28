'use client'

/**
 * MediaFilters · molecula · barra de filtros de /midia.
 *
 * - Funnel: single-select (Todos / Full Face / Olheiras / Sem funnel)
 * - Queixas: multi-select chips (AND logic)
 *
 * Estado controlado pelo pai · sem URL state aqui (caller pode fazer se quiser).
 */

import { useMemo } from 'react'
import { QueixaTag } from '@/components/atoms/QueixaTag'

export type FunnelFilter = 'all' | 'fullface' | 'olheiras' | 'none'

const FUNNEL_TABS: { value: FunnelFilter; label: string; emoji: string }[] = [
  { value: 'all', label: 'Todos', emoji: '📸' },
  { value: 'fullface', label: 'Full Face', emoji: '✨' },
  { value: 'olheiras', label: 'Olheiras', emoji: '👁️' },
  { value: 'none', label: 'Sem funnel', emoji: '○' },
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
  const sortedQueixas = useMemo(() => {
    return [...availableQueixas].sort()
  }, [availableQueixas])

  const toggleQueixa = (q: string) => {
    if (selectedQueixas.includes(q)) {
      onQueixasChange(selectedQueixas.filter((x) => x !== q))
    } else {
      onQueixasChange([...selectedQueixas, q])
    }
  }

  return (
    <div className="space-y-3">
      {/* Funnel tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-card bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] w-fit">
        {FUNNEL_TABS.map((tab) => {
          const active = funnel === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFunnelChange(tab.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest font-display-uppercase transition-colors ${
                active
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <span aria-hidden>{tab.emoji}</span>
              {tab.label}
              <span
                className={`ml-1 tabular-nums text-[10px] ${
                  active ? 'opacity-80' : 'opacity-60'
                }`}
              >
                {counts[tab.value]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Queixas chips */}
      {sortedQueixas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))] mr-1">
            Queixa:
          </span>
          {sortedQueixas.map((q) => (
            <QueixaTag
              key={q}
              label={q}
              selected={selectedQueixas.includes(q)}
              onClick={() => toggleQueixa(q)}
            />
          ))}
          {selectedQueixas.length > 0 && (
            <button
              type="button"
              onClick={() => onQueixasChange([])}
              className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] ml-1"
            >
              limpar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
