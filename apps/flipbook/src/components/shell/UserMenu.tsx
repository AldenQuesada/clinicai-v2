'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Settings, LogOut, ChevronUp, User } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils/cn'

interface Props {
  user: { email: string; isAdmin: boolean }
  /** Compact mode (topbar): só mostra avatar + label "Account". Dropdown abre pra baixo. */
  compact?: boolean
}

interface MenuPos {
  /** Posição do canto direito do dropdown — usado em compact (alinhamento direita) */
  right?: number
  /** Posição left absoluta — usado no modo full (sidebar) */
  left?: number
  /** Posição top — usado em compact (dropdown abre pra baixo) */
  top?: number
  /** Distância do bottom da viewport — usado em full (dropdown abre pra cima) */
  bottom?: number
  width: number
}

/**
 * Dropdown do usuário · click no avatar/botão abre menu com Settings + Sair.
 * Renderiza menu via portal pra ficar acima de tudo.
 *
 * Modos:
 * - full (default): sidebar · avatar + email + role · dropdown abre PRA CIMA
 * - compact (topbar): icon Account vertical · dropdown abre PRA BAIXO alinhado à direita
 */
export function UserMenu({ user, compact }: Props) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<MenuPos>({ width: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      if (compact) {
        const right = window.innerWidth - r.right
        setPos({ right, top: r.bottom + 4, width: 220 })
      } else {
        setPos({
          left: r.left,
          bottom: window.innerHeight - r.top + 4,
          width: r.width,
        })
      }
    }
    setOpen(true)
  }

  async function logout() {
    setLoading(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {compact ? (
        <button
          ref={triggerRef}
          onClick={() => open ? setOpen(false) : openMenu()}
          aria-label="Conta"
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded transition relative',
            open ? 'text-gold' : 'text-text-muted hover:text-text',
          )}
        >
          <div className="w-5 h-5 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center font-display italic text-gold text-[10px] leading-none">
            {user.email[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="font-meta text-[9px] leading-none">Account</span>
          {open && (
            <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-gold rounded-t" />
          )}
        </button>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => open ? setOpen(false) : openMenu()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-bg-panel transition group"
        >
          <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center font-display italic text-gold text-sm">
            {user.email[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-sm text-text truncate group-hover:text-gold transition">{user.email}</div>
            <div className="font-meta text-text-dim text-[9px]">{user.isAdmin ? 'Admin' : 'Leitor'}</div>
          </div>
          <ChevronUp
            className={`w-3.5 h-3.5 text-text-muted shrink-0 transition ${open ? 'rotate-180' : ''}`}
          />
        </button>
      )}

      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-bg-elevated border border-border-strong rounded shadow-2xl z-[9999] py-1.5"
            style={{
              minWidth: 220,
              ...(pos.left !== undefined ? { left: pos.left } : {}),
              ...(pos.right !== undefined ? { right: pos.right } : {}),
              ...(pos.top !== undefined ? { top: pos.top } : {}),
              ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
              width: compact ? 220 : Math.max(220, pos.width),
            }}
          >
            <div className="px-3.5 py-2 border-b border-border mb-1">
              <div className="font-meta text-text-dim text-[9px]">Logado como</div>
              <div className="text-sm text-text truncate">{user.email}</div>
              <div className="font-meta text-text-dim text-[9px] mt-0.5">{user.isAdmin ? 'Admin' : 'Leitor'}</div>
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-muted hover:text-text hover:bg-bg-panel transition"
            >
              <Settings className="w-3.5 h-3.5" /> Configurações
            </Link>
            {user.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-muted hover:text-text hover:bg-bg-panel transition"
              >
                <User className="w-3.5 h-3.5" /> Área admin
              </Link>
            )}
            <div className="border-t border-border my-1" />
            <button
              onClick={logout}
              disabled={loading}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {loading ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
