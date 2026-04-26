'use client'

/**
 * SearchHint · input de busca largo no AppHeader.
 *
 * Visualmente parece um input real (ocupa espaco confortavel ao centro/esq),
 * mas no clique dispara o modal QuickSearch via custom event. Mostra placeholder
 * descritivo + atalho `⌘K` na direita pra discoverability.
 *
 * Antes era um botao quadrado de 36px (apertado, ofuscava). Agora ocupa
 * min 220px md / 320px lg, "respira" no header.
 */

import { Search } from 'lucide-react'

export function SearchHint() {
  return (
    <button
      type="button"
      title="Buscar parcerias, ações (Ctrl+K)"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('mira:open-quicksearch'))
      }}
      className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] text-[#9CA3AF] hover:text-[#F5F0E8] hover:border-[#C9A96E]/40 hover:bg-white/[0.04] transition-colors text-[12px] w-[260px] lg:w-[340px] cursor-text"
    >
      <Search className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left truncate">Buscar parcerias, ações…</span>
      <span className="font-mono text-[10px] opacity-60 px-1.5 py-0.5 border border-white/10 rounded bg-white/[0.03] shrink-0">
        ⌘K
      </span>
    </button>
  )
}
