'use client'

/**
 * SearchHint · botao no AppHeader que abre o QuickSearch via custom event.
 * QuickSearch escuta `mira:open-quicksearch` e abre o modal.
 *
 * Decorativo: tambem mostra o atalho `⌘K` pra quem nao sabe.
 */

import { Search } from 'lucide-react'

export function SearchHint() {
  return (
    <button
      type="button"
      title="Buscar (Ctrl+K)"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('mira:open-quicksearch'))
      }}
      className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded border border-white/10 text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors text-[11px]"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="font-mono text-[10px] opacity-70">⌘K</span>
    </button>
  )
}
