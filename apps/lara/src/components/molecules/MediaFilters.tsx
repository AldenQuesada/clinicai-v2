'use client'

/**
 * MediaFilters · molecula · filtros editoriais.
 *
 * Funnel: lista de chips em italic Cormorant · ativo com underline gold
 * (em vez de pill admin colorido). Estilo "section heading de revista".
 *
 * Queixas: chips minimalistas tipo "tag de moda" · uppercase tracking,
 * underline gold no ativo.
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
    <div className="space-y-5">
      {/* Funnel · chips italic editoriais separados por bullets */}
      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
        {FUNNEL_TABS.map((tab, i) => {
          const active = funnel === tab.value
          return (
            <span key={tab.value} className="flex items-baseline gap-x-7">
              <button
                type="button"
                onClick={() => onFunnelChange(tab.value)}
                className={`relative font-[family-name:var(--font-cursive)] italic text-xl md:text-2xl font-light leading-none transition-colors duration-300 ${
                  active
                    ? 'text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {tab.label}
                <span className="ml-2 align-baseline font-display-uppercase text-[10px] tracking-[0.25em] tabular-nums opacity-70">
                  {counts[tab.value]}
                </span>
                {active && (
                  <span
                    className="absolute -bottom-1.5 left-0 right-6 h-px"
                    style={{ background: 'rgba(201, 169, 110, 0.7)' }}
                    aria-hidden
                  />
                )}
              </button>
              {i < FUNNEL_TABS.length - 1 && (
                <span aria-hidden className="text-[hsl(var(--muted-foreground))]/40 select-none">
                  ·
                </span>
              )}
            </span>
          )
        })}
      </div>

      {/* Queixas · linha de tags estilo revista de moda */}
      {sortedQueixas.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <span className="font-display-uppercase text-[9px] tracking-[0.4em] text-[hsl(var(--muted-foreground))]/60 mr-1">
            Queixa
          </span>
          {sortedQueixas.map((q) => {
            const active = selectedQueixas.includes(q)
            return (
              <button
                key={q}
                type="button"
                onClick={() => toggleQueixa(q)}
                className={`font-display-uppercase text-[10px] tracking-[0.25em] pb-0.5 transition-colors duration-300 ${
                  active
                    ? 'text-[hsl(var(--primary))] border-b border-[hsl(var(--primary))]/70'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border-b border-transparent'
                }`}
              >
                {q}
              </button>
            )
          })}
          {selectedQueixas.length > 0 && (
            <button
              type="button"
              onClick={() => onQueixasChange([])}
              className="font-[family-name:var(--font-cursive)] italic text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] ml-2"
            >
              limpar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
