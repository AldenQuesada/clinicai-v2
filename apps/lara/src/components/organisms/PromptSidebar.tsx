'use client'

/**
 * PromptSidebar · sidebar com search + grupos + items.
 * Visual: padrao Mira · b2b-input pra search, dot champagne pra override,
 * b2b-form-sec pra titulo de grupo.
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
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderRight: '1px solid var(--b2b-border)',
        background: 'var(--b2b-bg-1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Search */}
      <div style={{ padding: 16, borderBottom: '1px solid var(--b2b-border)' }}>
        <div style={{ position: 'relative' }}>
          <Search
            aria-hidden
            className="w-3.5 h-3.5"
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--b2b-text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar layer..."
            className="b2b-input"
            style={{ paddingLeft: 32, paddingRight: query ? 32 : 12 }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--b2b-text-muted)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Groups · scroll */}
      <nav
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: 'auto', padding: 8 }}
      >
        {filteredGroups.length === 0 ? (
          <p
            style={{
              padding: '16px 12px',
              fontSize: 11,
              color: 'var(--b2b-text-muted)',
              fontStyle: 'italic',
            }}
          >
            Nenhum layer bate com &quot;{query}&quot;
          </p>
        ) : (
          filteredGroups.map((group) => {
            const overrideCount = group.prompts.filter((p) => p.hasOverride).length
            return (
              <div key={group.title} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    padding: '6px 12px 8px',
                  }}
                >
                  <h3
                    style={{
                      flex: 1,
                      fontSize: 10,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: 'var(--b2b-champagne)',
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {group.title}
                  </h3>
                  {overrideCount > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--b2b-champagne)',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
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
