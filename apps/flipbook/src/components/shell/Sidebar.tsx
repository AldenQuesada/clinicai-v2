'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Library, Upload, BarChart3, Settings, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface NavItem {
  href: string
  label: string
  Icon: typeof Library
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { href: '/',       label: 'Catálogo', Icon: Library },
  { href: '/admin',  label: 'Admin',    Icon: Upload, adminOnly: true },
  { href: '/stats',  label: 'Estatísticas', Icon: BarChart3, adminOnly: true },
  { href: '/settings', label: 'Configurações', Icon: Settings, adminOnly: true },
]

export function Sidebar({ user }: { user: { email: string; isAdmin: boolean } | null }) {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col border-r border-border bg-bg-elevated z-30">
      {/* Brand */}
      <div className="px-6 pt-7 pb-8 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <BookOpen className="w-5 h-5 text-gold transition-transform group-hover:scale-110" strokeWidth={1.5} />
          <span className="font-display italic text-2xl text-text leading-none">Flipbook</span>
        </Link>
        <div className="font-meta text-text-dim mt-2 text-[10px]">Biblioteca · Premium</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {NAV.map(({ href, label, Icon, adminOnly }) => {
          if (adminOnly && !user?.isAdmin) return null
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded text-sm transition-all',
                active
                  ? 'bg-gold/10 text-gold border-l-2 border-gold pl-[14px]'
                  : 'text-text-muted hover:text-text hover:bg-bg-panel border-l-2 border-transparent',
              )}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-4 py-4 border-t border-border">
          <Link href="/settings" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center font-display italic text-gold text-sm">
              {user.email[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text truncate group-hover:text-gold transition">{user.email}</div>
              <div className="font-meta text-text-dim text-[9px]">{user.isAdmin ? 'Admin' : 'Leitor'}</div>
            </div>
          </Link>
        </div>
      )}
      {!user && (
        <div className="px-4 py-4 border-t border-border">
          <Link
            href="/login"
            className="block text-center font-meta text-gold border border-gold/30 rounded py-2.5 hover:bg-gold/10 transition"
          >
            Entrar
          </Link>
        </div>
      )}

      {/* Brand footer */}
      <div className="px-6 py-3 border-t border-border font-meta text-text-dim text-[9px] text-center">
        v1.0 · 2026
      </div>
    </aside>
  )
}
