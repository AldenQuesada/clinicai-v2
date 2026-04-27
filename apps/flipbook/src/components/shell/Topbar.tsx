'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Menu, Home, BookOpen } from 'lucide-react'
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
  const isHome = pathname === '/'

  return (
    <header className="sticky top-0 h-14 z-20 border-b border-border bg-bg/80 backdrop-blur-md flex items-center px-4 lg:px-8 gap-3">
      {/* Mobile · hamburger */}
      <button
        onClick={onOpenMobileNav}
        aria-label="Abrir menu"
        className="lg:hidden p-2 -ml-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo home button · sempre visível, sempre leva pra / */}
      <Link
        href="/"
        aria-label="Ir para home"
        className="lg:hidden flex items-center gap-1.5 group"
      >
        <BookOpen className="w-4 h-4 text-gold group-hover:scale-110 transition" strokeWidth={1.5} />
        <span className="font-display italic text-text text-base">Flipbook</span>
      </Link>

      {/* Desktop · botão Home (sai do que estiver fazendo) */}
      {!isHome && (
        <Link
          href="/"
          aria-label="Voltar pra home"
          title="Home"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition text-xs font-meta"
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
      )}

      <div className="flex-1 min-w-0 hidden md:block">
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
        className="md:hidden ml-auto p-2 -mr-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition"
      >
        <Search className="w-5 h-5" />
      </button>
    </header>
  )
}
