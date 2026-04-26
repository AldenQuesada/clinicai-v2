'use client'

/**
 * MobileNavDrawer · drawer hamburguer pra <md (sidebar fica oculta).
 *
 * Botao "Menu" (icone Menu) no thin header dispatcha custom event
 * `mira:open-mobile-nav` · drawer escuta, abre, mostra os 4 fathers em
 * lista vertical com label completo (Geral · Disparos · Analytics ·
 * Configuracoes). Click em item navega + fecha. Click outside / ESC
 * tambem fecham.
 *
 * Decisao · drawer left-side (slide from left) · fechado por padrao,
 * z-50 · backdrop preto/70.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, X } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import {
  SECTIONS,
  detectActiveSection,
  urgencyForSection,
  type Section,
  type SubtabCounts,
} from './nav/sections'

export type MobileDrawerUser = {
  displayName: string
  initials: string
  role: string
}

export function MobileNavDrawer({
  user,
  counts = {},
  urgentInsights = 0,
}: {
  user: MobileDrawerUser
  counts?: SubtabCounts
  urgentInsights?: number
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() || '/dashboard'
  const activeKey = detectActiveSection(pathname).key

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mira:open-mobile-nav', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mira:open-mobile-nav', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Auto-close ao navegar (pathname change)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  if (!open) return null

  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

      {/* Drawer panel */}
      <aside
        className="relative w-[260px] max-w-[80vw] h-full bg-[#0F0D0A] border-r border-[#C9A96E]/20 flex flex-col shadow-2xl"
        aria-label="Navegação principal"
      >
        {/* Header drawer · brand + close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex flex-col leading-tight"
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '3px',
                color: '#C9A96E',
              }}
            >
              Círculo Mirian de Paula
            </span>
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontWeight: 300,
                fontSize: 18,
                lineHeight: 1.05,
                color: '#F5F0E8',
                marginTop: 2,
              }}
            >
              Programa de{' '}
              <em style={{ fontStyle: 'italic', color: '#C9A96E' }}>parcerias</em>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fathers em lista vertical com label */}
        <nav className="flex flex-col gap-1 p-2">
          {SECTIONS.map((s) => (
            <DrawerItem
              key={s.key}
              section={s}
              active={s.key === activeKey}
              badge={urgencyForSection(s.key, counts, urgentInsights)}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>

        {/* Rodape · user + logout */}
        <div className="mt-auto flex items-center gap-3 px-4 py-3 border-t border-white/5">
          <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 text-[#F5F0E8] flex items-center justify-center text-[12px] font-semibold shrink-0">
            {user.initials}
          </div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[12px] font-medium text-[#F5F0E8] truncate">
              {user.displayName}
            </span>
            {user.role && (
              <span
                className="text-[9px] uppercase text-[#6B7280]"
                style={{ letterSpacing: '1.5px' }}
              >
                {user.role}
              </span>
            )}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="p-1.5 rounded text-[#9CA3AF] hover:text-[#FCA5A5] hover:bg-white/5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </aside>
    </div>
  )
}

function DrawerItem({
  section,
  active,
  badge,
  onClick,
}: {
  section: Section
  active: boolean
  badge: number
  onClick: () => void
}) {
  const Icon = section.icon
  return (
    <Link
      href={section.defaultHref}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
        active
          ? 'bg-[#C9A96E]/12 text-[#C9A96E]'
          : 'text-[#9CA3AF] hover:bg-white/5 hover:text-[#F5F0E8]'
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.7} />
      <span className="text-[13px] font-medium flex-1">{section.label}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}

/**
 * MobileMenuButton · trigger do drawer · fica no thin header (md-down).
 * Importado pelo AppHeaderThin · client-side pq dispatcha custom event.
 */
export function MobileMenuButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('mira:open-mobile-nav'))
      }}
      className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-white/10 bg-white/[0.02] text-[#9CA3AF] hover:text-[#F5F0E8] hover:border-[#C9A96E]/40 transition-colors"
      aria-label="Abrir menu"
      title="Menu"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  )
}
