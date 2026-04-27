'use client'

/**
 * DetailTabBar · client component pra navegacao entre tabs.
 *
 * Pedido Alden 2026-04-26: <Link> em intercepting route nao re-renderiza
 * quando so o search param muda · tabs paravam de responder no modal.
 * Solução: router.push() forca navegacao client-side · funciona em ambos
 * contextos (modal interceptado + page full).
 *
 * IMPORTANTE: TABS array vive AQUI (client) e nao no parent (server)
 * porque icones lucide-react sao funcoes e funcoes nao cruzam boundary
 * RSC/client (digest opaco crash · vide system-component-debug memory).
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import {
  Info, Ticket, BarChart3, FileSignature, TrendingUp,
  Activity, MessageSquare, ScrollText,
} from 'lucide-react'

const TABS = [
  { key: 'detail', label: 'Detalhe', icon: Info },
  { key: 'vouchers', label: 'Vouchers', icon: Ticket },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'contrato', label: 'Contrato', icon: FileSignature },
  { key: 'documentos', label: 'Documentos', icon: ScrollText },
  { key: 'crescer', label: 'Crescer', icon: TrendingUp },
  { key: 'comments', label: 'Comentários', icon: MessageSquare },
  { key: 'health', label: 'Health', icon: Activity },
] as const

export function DetailTabBar({
  partnershipId,
  activeTab,
}: {
  partnershipId: string
  activeTab: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function go(key: string) {
    if (key === activeTab) return
    const href = `/partnerships/${partnershipId}?tab=${key}`
    startTransition(() => {
      // replace · nao adiciona entry de history · close volta direto
      // pra /partnerships sem ter que voltar tab por tab (Alden 2026-04-27).
      router.replace(href, { scroll: false })
    })
  }

  return (
    <nav className="b2b-tab-bar" aria-label="Tabs do detalhe">
      {TABS.map((t) => {
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
