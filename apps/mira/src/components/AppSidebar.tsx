'use client'

/**
 * AppSidebar · navegacao primaria vertical (4 fathers).
 *
 * Substitui a "linha 1" do AppNav antigo (4 chips horizontais no topo).
 * Decidido com Alden 2026-04-26: sidebar 56px sticky esquerda · ganha 1
 * linha de altura no viewport (linha 1 morre · sub-tabs e thin header
 * ficam nas linhas 2-3).
 *
 * Layout:
 *   ┌──────┐
 *   │  M   │  ← logo monograma (Cormorant, gold)
 *   ├──────┤
 *   │ [🏠] │  ← Geral       (active = border-left gold + bg + icone gold)
 *   │ [💬] │  ← Disparos
 *   │ [📊] │  ← Analytics
 *   │ [⚙]  │  ← Config
 *   │      │
 *   │      │
 *   ├──────┤
 *   │ [⏻]  │  ← logout (mt-auto, rodape)
 *   └──────┘
 *
 * Tooltip nativo (title=) · decisao consciente sobre Radix Tooltip:
 * mantem zero-deps, ja consistente com NotificationsBell/NewMenu, e
 * sidebar com 4 itens nao precisa de tooltip rico (label e tudo).
 *
 * Mobile (<768px) · sidebar nao renderiza aqui · vira drawer no
 * AppShellMobile (botao hamburger no thin header). O grid tambem
 * cola pra `grid-cols-[1fr]` em md-down (ver layout.tsx).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import {
  SECTIONS,
  detectActiveSection,
  urgencyForSection,
  type Section,
  type SubtabCounts,
} from './nav/sections'

export type SidebarUser = {
  displayName: string
  initials: string
  role: string
}

export function AppSidebar({
  user,
  counts = {},
  urgentInsights = 0,
}: {
  user: SidebarUser
  counts?: SubtabCounts
  urgentInsights?: number
}) {
  const pathname = usePathname() || '/dashboard'
  const activeKey = detectActiveSection(pathname).key

  return (
    <aside
      className="hidden md:flex flex-col items-stretch w-[56px] shrink-0 bg-[#0F0D0A] border-r border-[#C9A96E]/15 z-30"
      aria-label="Navegação principal"
    >
      {/* ── Logo · monograma "M" Cormorant ────────────────────────── */}
      <Link
        href="/dashboard"
        title="Mira · Programa de parcerias B2B"
        className="flex items-center justify-center h-[60px] border-b border-white/5 group"
      >
        <span
          className="text-[#C9A96E] group-hover:text-[#DFC5A0] transition-colors leading-none"
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontWeight: 300,
            fontSize: 28,
          }}
        >
          M
        </span>
      </Link>

      {/* ── Fathers · 4 icones com active border-left gold ────────── */}
      <nav className="flex flex-col items-stretch gap-1 py-3" role="navigation">
        {SECTIONS.map((s) => (
          <SidebarItem
            key={s.key}
            section={s}
            active={s.key === activeKey}
            badge={urgencyForSection(s.key, counts, urgentInsights)}
          />
        ))}
      </nav>

      {/* ── Rodape · avatar + logout ──────────────────────────────── */}
      <div className="mt-auto flex flex-col items-center gap-2 pb-3 pt-2 border-t border-white/5">
        <div
          title={`${user.displayName}${user.role ? ` · ${user.role}` : ''}`}
          className="w-8 h-8 rounded-md bg-white/5 border border-white/10 text-[#F5F0E8] flex items-center justify-center text-[11px] font-semibold"
        >
          {user.initials}
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
  )
}

function SidebarItem({
  section,
  active,
  badge,
}: {
  section: Section
  active: boolean
  badge: number
}) {
  const Icon = section.icon
  return (
    <Link
      href={section.defaultHref}
      title={section.label}
      aria-label={section.label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center justify-center h-[44px] mx-1.5 rounded-md transition-colors group ${
        active
          ? 'bg-[#C9A96E]/12 text-[#C9A96E]'
          : 'text-[#9CA3AF] hover:bg-white/5 hover:text-[#F5F0E8]'
      }`}
    >
      {/* Border-left gold indicador de active · 2px · canto esq absoluto */}
      {active && (
        <span
          aria-hidden
          className="absolute left-[-6px] top-2 bottom-2 w-[2px] rounded-full bg-[#C9A96E]"
        />
      )}
      <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.2 : 1.7} />

      {/* Badge urgencia · vermelho top-right */}
      {badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center border border-[#0F0D0A]">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
