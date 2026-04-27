'use client'

import { usePathname } from 'next/navigation'
import { Search, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  onOpenPalette: () => void
  onOpenMobileNav: () => void
}

const TITLES: Record<string, string> = {
  '/': 'Catálogo',
  '/admin': 'Administração',
  '/stats': 'Estatísticas',
  '/settings': 'Configurações',
}

export function Topbar({ onOpenPalette, onOpenMobileNav }: Props) {
  const pathname = usePathname()
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(/(Mac|iPod|iPhone|iPad)/.test(navigator.platform))
  }, [])

  const title = TITLES[pathname] ?? pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? ''

  return (
    <header className="sticky top-0 h-14 z-20 border-b border-border bg-bg/80 backdrop-blur-md flex items-center px-4 lg:px-8 gap-4">
      <button
        onClick={onOpenMobileNav}
        aria-label="Abrir menu"
        className="lg:hidden p-2 -ml-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="font-display italic text-text text-lg md:text-xl truncate capitalize">
          {title}
        </h1>
      </div>

      <button
        onClick={onOpenPalette}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded border border-border hover:border-border-strong text-text-muted hover:text-text transition group"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">Buscar livros, ações…</span>
        <kbd className="font-meta text-[9px] text-text-dim bg-bg-panel border border-border px-1.5 py-0.5 rounded ml-2 group-hover:text-gold transition">
          {isMac ? '⌘K' : 'CTRL K'}
        </kbd>
      </button>

      <button
        onClick={onOpenPalette}
        aria-label="Buscar"
        className="md:hidden p-2 -mr-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition"
      >
        <Search className="w-5 h-5" />
      </button>
    </header>
  )
}
