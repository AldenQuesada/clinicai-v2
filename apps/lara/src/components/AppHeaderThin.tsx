'use client'

/**
 * AppHeaderThin · top bar minima (60px) · mirror Mira.
 *
 * Layout:
 *   [hamburger?] [section title]                [🔔] [Painel] [👤 dropdown]
 *
 * Section title vem do pathname · auto-resolve via detectActiveSection.
 * UserMenu (avatar + dropdown) e o ChangeRoleModal etc · entram em
 * commits seguintes. Por agora avatar simples + logout direto · mantem
 * paridade funcional com AppHeader antigo.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { detectActiveSection } from './nav/sections'
import { NotificationToggle } from '@/components/NotificationToggle'
import { AlertBell } from '@/components/AlertBell'
import { UserMenu, type UserMenuProfile } from './UserMenu'

const PAINEL_URL =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export function AppHeaderThin({ user }: { user: UserMenuProfile }) {
  const pathname = usePathname() || '/dashboard'
  const section = detectActiveSection(pathname)

  return (
    <header
      style={{
        height: 60,
        flexShrink: 0,
        background: 'var(--b2b-bg-1)',
        borderBottom: '1px solid var(--b2b-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 20,
      }}
    >
      {/* Section title (esquerda) · 1 linha · "Lara · Clinica AI - <Pagina>".
          Pagina em Cormorant Garamond italic bold (brandbook). */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1.1 }}>
        <p
          className="eyebrow"
          style={{ margin: 0, fontSize: 9, letterSpacing: 3 }}
        >
          Lara · Clinica AI
        </p>
        <span
          style={{
            fontSize: 9,
            color: 'var(--b2b-border)',
            letterSpacing: 3,
          }}
        >
          -
        </span>
        <span
          style={{
            fontSize: 20,
            color: 'var(--b2b-ivory)',
            fontStyle: 'italic',
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontWeight: 700,
            letterSpacing: -0.2,
          }}
        >
          {section.label}
        </span>
      </div>

      {/* Actions (direita) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NotificationToggle />

        {/* Mig 161 / CRM_PHASE_2G.2 · alertas internos agenda · zero WhatsApp */}
        <AlertBell />

        <Link
          href={PAINEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="b2b-btn"
          style={{ padding: '6px 12px', fontSize: 11, gap: 6 }}
        >
          Painel CRM
          <ExternalLink className="w-3 h-3" />
        </Link>

        <div
          style={{
            paddingLeft: 12,
            borderLeft: '1px solid var(--b2b-border)',
          }}
        >
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  )
}
