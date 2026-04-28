'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, LayoutDashboard, BarChart3, Plus, Pencil,
  HelpCircle, Menu, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { UserMenu } from './UserMenu'

interface Props {
  user: { email: string; isAdmin: boolean } | null
  onToggleEditorSidebar?: () => void
  showHamburger?: boolean
}

interface NavItem {
  href: string
  label: string
  Icon: typeof Home
  matchPrefix?: string
  showOnEdit?: boolean
}

const NAV: NavItem[] = [
  { href: '/',        label: 'Home',         Icon: Home },
  { href: '/admin',   label: 'Dashboard',    Icon: LayoutDashboard, matchPrefix: '/admin' },
  { href: '/stats',   label: 'Stats',        Icon: BarChart3 },
  { href: '/admin/new', label: 'New flipbook', Icon: Plus, matchPrefix: '/admin/new' },
]

/**
 * Topbar Heyzine-style · 7 itens vertical (icon top + label bottom).
 * "Edit" aparece ativo só quando estiver editando livro (/admin/[slug]/edit).
 * Sem Sidebar lateral — toda navegação mora aqui.
 */
export function Topbar({ user, onToggleEditorSidebar, showHamburger }: Props) {
  const pathname = usePathname()
  const isEditMode = /^\/admin\/[^/]+\/edit/.test(pathname)

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-bg-elevated/95 backdrop-blur-md flex items-center px-3 lg:px-5 gap-2">
      {/* Hambúrguer · só aparece no editor pra colapsar sidebar */}
      {showHamburger && (
        <button
          onClick={onToggleEditorSidebar}
          aria-label="Alternar sidebar"
          className="p-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition"
        >
          <Menu className="w-4 h-4" strokeWidth={1.5} />
        </button>
      )}

      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-2 group shrink-0">
        <BookOpen className="w-5 h-5 text-gold transition-transform group-hover:scale-110" strokeWidth={1.5} />
        <span className="font-display italic text-text text-xl leading-none hidden sm:inline">Flipbook</span>
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Nav · vertical icon-em-cima */}
      <nav className="flex items-stretch gap-1">
        {NAV.map(({ href, label, Icon, matchPrefix }) => {
          let active = false
          if (isEditMode) {
            active = false // Edit item separado vai assumir
          } else if (href === '/admin/new') {
            active = pathname.startsWith('/admin/new')
          } else if (href === '/admin') {
            active = pathname === '/admin' || (pathname.startsWith('/admin/') && !pathname.startsWith('/admin/new'))
          } else if (matchPrefix) {
            active = pathname.startsWith(matchPrefix)
          } else {
            active = pathname === href
          }
          return (
            <NavBtn key={href} href={href} label={label} Icon={Icon} active={active} />
          )
        })}

        {/* Edit · contextual · só visível em rota /admin/[slug]/edit */}
        {isEditMode && (
          <NavBtn href={pathname} label="Edit" Icon={Pencil} active />
        )}

        {/* Support · placeholder · vai pra /settings por enquanto */}
        {user?.isAdmin && (
          <NavBtn href="/settings" label="Support" Icon={HelpCircle} active={pathname === '/settings'} />
        )}
      </nav>

      {/* Account · dropdown UserMenu · ou botão Entrar */}
      <div className="ml-2 pl-2 border-l border-border flex items-center">
        {user ? (
          <UserMenu user={user} compact />
        ) : (
          <Link
            href="/login"
            className="font-meta text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition"
          >
            Entrar
          </Link>
        )}
      </div>
    </header>
  )
}

function NavBtn({
  href, label, Icon, active,
}: { href: string; label: string; Icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded transition relative',
        active
          ? 'text-gold'
          : 'text-text-muted hover:text-text',
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      <span className="font-meta text-[9px] leading-none">{label}</span>
      {active && (
        <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-gold rounded-t" />
      )}
    </Link>
  )
}
