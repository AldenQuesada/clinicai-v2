'use client'

/**
 * PromptSidebar · organismo · sidebar com search + grupos + items.
 *
 * - Search filtra items por label (case-insensitive)
 * - Grupos com header em font-display-uppercase
 * - Counter no header do grupo (overrides / total)
 */

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { PromptSidebarItem } from '@/components/molecules/PromptSidebarItem'

export interface SidebarPrompt {
  key: string
  label: string
  hasOverride: boolean
  overrideLength: number
  defaultLength: number
}

export interface SidebarGroup {
  title: string
  emoji: string
  prompts: SidebarPrompt[]
}

export function PromptSidebar({
  groups,
  activeKey,
  onSelect,
}: {
  groups: SidebarGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
}) {
  const [query, setQuery] = useState('')

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        prompts: g.prompts.filter((p) => p.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.prompts.length > 0)
  }, [groups, query])

  return (
    <aside className="w-full lg:w-[320px] shrink-0 border-r border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex flex-col">
      {/* Search */}
      <div className="p-4 border-b border-[hsl(var(--chat-border))]">
        <div className="relative">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar layer..."
            className="w-full pl-9 pr-9 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-xs focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Groups · scrollavel */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
        {filteredGroups.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))] italic">
            Nenhum layer bate com &quot;{query}&quot;
          </p>
        ) : (
          filteredGroups.map((group) => {
            const overrideCount = group.prompts.filter((p) => p.hasOverride).length
            return (
              <div key={group.title} className="space-y-0.5">
                <div className="flex items-center gap-2 px-3 py-2 mt-2">
                  <h3 className="font-display-uppercase text-[10px] tracking-[0.3em] text-[hsl(var(--primary))]/80 flex-1">
                    {group.title}
                  </h3>
                  {overrideCount > 0 && (
                    <span className="text-[9px] tabular-nums text-[hsl(var(--primary))] font-mono">
                      {overrideCount}/{group.prompts.length}
                    </span>
                  )}
                </div>
                {group.prompts.map((p) => (
                  <PromptSidebarItem
                    key={p.key}
                    label={p.label}
                    hasOverride={p.hasOverride}
                    overrideLength={p.overrideLength}
                    defaultLength={p.defaultLength}
                    active={activeKey === p.key}
                    onClick={() => onSelect(p.key)}
                  />
                ))}
              </div>
            )
          })
        )}
      </nav>
    </aside>
  )
}
