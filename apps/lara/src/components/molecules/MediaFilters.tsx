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
      {/* Funnel tabs · brandbook style: underline-on-active, sem botoes pill */}
      <div className="flex flex-wrap items-center gap-6 border-b border-[hsl(var(--chat-border))] pb-2">
        {FUNNEL_TABS.map((tab) => {
          const active = funnel === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFunnelChange(tab.value)}
              className={`relative inline-flex items-center gap-2 pb-2 -mb-2.5 font-display-uppercase text-[11px] tracking-[0.25em] transition-colors ${
                active
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {tab.label}
              <span
                className={`tabular-nums text-[10px] font-mono ${
                  active ? 'text-[hsl(var(--primary))]/70' : 'text-[hsl(var(--muted-foreground))]/60'
                }`}
              >
                {counts[tab.value]}
              </span>
              {active && (
                <span className="absolute -bottom-[1px] left-0 right-0 h-px bg-[hsl(var(--primary))]" />
              )}
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
