'use client'

/**
 * CrmShell · wrapper client · state collapsed do sidebar.
 *
 * Espelha clinic-dashboard/js/sidebar.js L526-528:
 *   - default: collapsed=true (legacy auto-collapse pós primeira navegação)
 *   - localStorage key: 'crm_sidebar_collapsed' ('1' | '0')
 *   - toggle persiste estado
 *
 * Renderiza estrutura literal legacy index.html L82-94:
 *   <aside class="sidebar">
 *     <div class="sidebar-logo">
 *       <Link><sidebar-logo-icon><sidebar-logo-text></Link>
 *       <button class="sidebar-toggle-btn">
 *     </div>
 *     {sidebarNav}
 *     {sidebarFooter}
 *   </aside>
 *
 * Server layout faz auth + profile · passa pra cá já hidratado.
 */

import * as React from 'react'
import Link from 'next/link'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'

interface CrmShellProps {
  /** Conteúdo do .sidebar-logo-text (nome + badge) · receberá Link wrapping */
  logoText: React.ReactNode
  sidebarNav: React.ReactNode
  sidebarFooter: React.ReactNode
  topbar: React.ReactNode
  mobileHeader: React.ReactNode
  children: React.ReactNode
}

const STORAGE_KEY = 'crm_sidebar_collapsed'

export function CrmShell({
  logoText,
  sidebarNav,
  sidebarFooter,
  topbar,
  mobileHeader,
  children,
}: CrmShellProps) {
  // Default collapsed (espelha legacy auto-collapse on navigate)
  const [collapsed, setCollapsed] = React.useState(true)

  // Rehydrate from localStorage on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved !== null) {
        setCollapsed(saved === '1')
      }
    } catch {
      /* localStorage unavailable · keep default */
    }
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* noop */
      }
      return next
    })
  }

  return (
    <div
      className={
        collapsed
          ? 'crm-light-scope sidebar-collapsed flex h-screen overflow-hidden'
          : 'crm-light-scope flex h-screen overflow-hidden'
      }
    >
      {/* Sidebar · desktop only · estrutura LITERAL legacy index.html L82-94 */}
      <aside className="sidebar hidden md:flex">
        <div className="sidebar-logo">
          <Link
            href="/crm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              flex: 1,
              minWidth: 0,
            }}
          >
            <div className="sidebar-logo-icon">C</div>
            <div className="sidebar-logo-text">{logoText}</div>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="sidebar-toggle-btn"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </button>
        </div>

        {sidebarNav}
        {sidebarFooter}
      </aside>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {mobileHeader}
        {topbar}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            background: 'var(--bg)',
            padding: '28px',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
