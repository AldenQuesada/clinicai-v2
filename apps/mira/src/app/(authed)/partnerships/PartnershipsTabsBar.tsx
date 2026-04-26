'use client'

/**
 * PartnershipsTabsBar · Tabs visuais (Ativas / Prospects / Inativas) que
 * mirroram a barra de tabs do legado `b2b-list.ui.js`.
 *
 * Visual: replica EXATA das tabs `.b2b-tab` do clinic-dashboard/css/b2b.css
 * (font-size 13, letter-spacing 0.5px, padding 12px 20px, underline champagne).
 *
 * Comportamento: troca de tab atualiza ?tab= preservando ?pillar= e ?q=.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const TABS = [
  { id: 'active', label: 'Ativas' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'inactive', label: 'Inativas' },
] as const

type TabId = (typeof TABS)[number]['id']

export function PartnershipsTabsBar({ active }: { active: TabId }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function go(tab: TabId) {
    if (tab === active) return
    const params = new URLSearchParams(sp.toString())
    params.set('tab', tab)
    // Drop legacy `filter=` to evitar conflito com `tab=`.
    params.delete('filter')
    startTransition(() => {
      router.push(`/partnerships?${params.toString()}`)
    })
  }

  return (
    <nav className="b2b-tabs-page" aria-busy={isPending}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`b2b-tab-page${t.id === active ? ' active' : ''}`}
          onClick={() => go(t.id)}
        >
          {t.label}
        </button>
      ))}
      <style jsx>{`
        .b2b-tabs-page {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--b2b-border);
          margin: 0 0 24px;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .b2b-tabs-page::-webkit-scrollbar {
          height: 4px;
        }
        .b2b-tabs-page::-webkit-scrollbar-thumb {
          background: var(--b2b-border-strong);
          border-radius: 2px;
        }
        .b2b-tab-page {
          background: transparent;
          border: none;
          color: var(--b2b-text-muted);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.5px;
          padding: 12px 20px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          font-family: inherit;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .b2b-tab-page:hover {
          color: var(--b2b-champagne-light);
        }
        .b2b-tab-page.active {
          color: var(--b2b-champagne);
          border-bottom-color: var(--b2b-champagne);
        }
      `}</style>
    </nav>
  )
}

export type { TabId }
