'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Settings, LogOut, ChevronUp, User } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'

interface Props {
  user: { email: string; isAdmin: boolean }
}

/**
 * Dropdown do usuário · click no avatar abre menu com Settings + Sair.
 * Funciona em sidebar desktop (parent passa user). Renderiza menu via portal
 * pra ficar acima de tudo.
 */
export function UserMenu({ user }: Props) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ left: 0, bottom: 0, width: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({
        left: r.left,
        bottom: window.innerHeight - r.top + 4,
        width: r.width,
      })
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

      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-bg-elevated border border-border-strong rounded shadow-2xl z-[9999] py-1.5 min-w-[220px]"
            style={{ left: pos.left, bottom: pos.bottom, width: Math.max(220, pos.width) }}
          >
            <div className="px-3.5 py-2 border-b border-border mb-1">
              <div className="font-meta text-text-dim text-[9px]">Logado como</div>
              <div className="text-sm text-text truncate">{user.email}</div>
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
