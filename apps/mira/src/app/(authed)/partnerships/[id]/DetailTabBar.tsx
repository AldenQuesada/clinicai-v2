'use client'

/**
 * DetailTabBar · client component pra navegacao entre tabs.
 *
 * Pedido Alden 2026-04-26: <Link> em intercepting route nao re-renderiza
 * quando so o search param muda · tabs paravam de responder no modal.
 * Solução: router.push() forca navegacao client-side · funciona em ambos
 * contextos (modal interceptado + page full).
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { ComponentType } from 'react'

export interface DetailTab {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export function DetailTabBar({
  partnershipId,
  activeTab,
  tabs,
}: {
  partnershipId: string
  activeTab: string
  tabs: ReadonlyArray<DetailTab>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function go(key: string) {
    if (key === activeTab) return
    const href = `/partnerships/${partnershipId}?tab=${key}`
    startTransition(() => {
      router.push(href, { scroll: false })
    })
  }

  return (
    <nav className="b2b-tab-bar" aria-label="Tabs do detalhe">
      {tabs.map((t) => {
        const Icon = t.icon
        const isActive = activeTab === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            disabled={pending && !isActive}
            className={`b2b-tab-link ${isActive ? 'is-active' : ''}`}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
