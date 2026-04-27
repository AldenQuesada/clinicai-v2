'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { X, Library, Upload, BarChart3, Settings, BookOpen, LogOut, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  user: { email: string; isAdmin: boolean } | null
}

const NAV = [
  { href: '/',         label: 'Catálogo',       Icon: Library,    adminOnly: false },
  { href: '/admin',    label: 'Admin',          Icon: Upload,     adminOnly: true },
  { href: '/stats',    label: 'Estatísticas',   Icon: BarChart3,  adminOnly: true },
  { href: '/settings', label: 'Configurações',  Icon: Settings,   adminOnly: true },
]

export function MobileDrawer({ open, onClose, user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  async function logout() {
    await supabase.auth.signOut()
    onClose()
    router.push('/login')
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 lg:hidden bg-black/60 backdrop-blur-sm transition-opacity',
        open ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      onClick={onClose}
    >
      <aside
        className={cn(
          'absolute left-0 top-0 h-full w-[280px] bg-bg-elevated border-r border-border flex flex-col transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-7 border-b border-border">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-gold" strokeWidth={1.5} />
            <span className="font-display italic text-2xl text-text leading-none">Flipbook</span>
          </Link>
          <button onClick={onClose} aria-label="Fechar" className="p-2 -mr-2 text-text-muted hover:text-gold transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, Icon, adminOnly }) => {
            if (adminOnly && !user?.isAdmin) return null
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-3 rounded text-base transition',
                  active ? 'bg-gold/10 text-gold' : 'text-text-muted hover:text-text hover:bg-bg-panel',
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          {user ? (
            <>
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center font-display italic text-gold">
                  {user.email[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text truncate">{user.email}</div>
                  <div className="font-meta text-text-dim text-[9px]">{user.isAdmin ? 'Admin' : 'Leitor'}</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 justify-center font-meta text-text-muted border border-border rounded py-2.5 hover:text-gold hover:border-gold/40 transition text-xs"
              >
                <LogOut className="w-3.5 h-3.5" /> Sair
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="w-full flex items-center gap-2 justify-center font-meta text-gold border border-gold/30 rounded py-3 hover:bg-gold/10 transition"
            >
              <LogIn className="w-4 h-4" /> Entrar
            </Link>
          )}
        </div>
      </aside>
    </div>
  )
}
