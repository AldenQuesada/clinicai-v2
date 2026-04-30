'use client'

/**
 * AppSidebar · navegacao primaria vertical (mirror Mira).
 *
 * Layout 56px sticky esquerda · md+. Mobile vira drawer separado.
 *
 *   ┌──────┐
 *   │  L   │  ← logo monograma (Cormorant gold)
 *   ├──────┤
 *   │ [📊] │  ← Dashboard  (active = border-left gold + bg + icone gold)
 *   │ [💬] │  ← Conversas
 *   │ [📋] │  ← Templates
 *   │ [✨] │  ← Prompts
 *   │ [🖼] │  ← Mídias
 *   │ [⚙]  │  ← Configurações
 *   └──────┘
 *
 * Tooltip nativo via title= · zero deps.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  detectActiveSection,
  visibleSections,
  type Section,
} from './nav/sections'
import type { StaffRole } from '@/lib/permissions'

export function AppSidebar({ role }: { role: StaffRole | null }) {
  const pathname = usePathname() || '/dashboard'
  const activeKey = detectActiveSection(pathname).key
  const sections = visibleSections(role)

  return (
    <aside
      className="hidden md:flex flex-col items-stretch w-[56px] shrink-0 z-30"
      style={{
        background: 'var(--b2b-bg-0)',
        borderRight: '1px solid var(--b2b-border)',
      }}
      aria-label="Navegação principal"
    >
      {/* Logo monograma */}
      <Link
        href="/dashboard"
        title="Lara · Clinica AI"
        className="flex items-center justify-center h-[60px] group"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--b2b-champagne)',
            color: 'var(--b2b-bg-0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'Cormorant Garamond, serif',
          }}
        >
          L
        </div>
      </Link>

      <nav
        className="flex flex-col items-stretch gap-1 py-3"
        role="navigation"
      >
        {sections.map((s) => (
          <SidebarItem
            key={s.key}
            section={s}
            active={s.key === activeKey}
          />
        ))}
      </nav>
    </aside>
  )
}

function SidebarItem({ section, active }: { section: Section; active: boolean }) {
  const Icon = section.icon
  // External (.html static · sub-apps legacy) abre em tab nova ·
  // Next <Link> client-route nao funciona pra static · usa <a> nativo.
  const commonClass =
    'relative flex items-center justify-center h-11 group transition-colors'
  const commonStyle = {
    color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-muted)',
    background: active ? 'rgba(201,169,110,0.06)' : 'transparent',
  }
  const indicator = active ? (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 6,
        bottom: 6,
        width: 2,
        background: 'var(--b2b-champagne)',
        borderRadius: 1,
      }}
    />
  ) : null

  if (section.external) {
    return (
      <a
        href={section.path}
        title={section.label}
        target="_blank"
        rel="noopener noreferrer"
        className={commonClass}
        style={commonStyle}
      >
        {indicator}
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
      </a>
    )
  }

  return (
    <Link
      href={section.path}
      title={section.label}
      className={commonClass}
      style={commonStyle}
    >
      {indicator}
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
    </Link>
  )
}
