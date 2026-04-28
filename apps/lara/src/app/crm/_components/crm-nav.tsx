'use client'

/**
 * CRM nav links · client components que destacam rota ativa via usePathname.
 *
 * Sidebar (CrmSidebarNav) · desktop fixo
 * Mobile (CrmMobileNav) · drawer via <details> · auto-close em route change
 *
 * Server Component (layout.tsx) instancia esses · Server Component nao pode
 * usar usePathname (next/navigation client-only).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  UserCircle,
} from 'lucide-react'
import { cn } from '@clinicai/ui'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
  { href: '/crm', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/crm/leads', label: 'Leads', icon: <UserCircle className="h-4 w-4" /> },
  {
    href: '/crm/pacientes',
    label: 'Pacientes',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: '/crm/agenda',
    label: 'Agenda',
    icon: <Calendar className="h-4 w-4" />,
  },
  {
    href: '/crm/orcamentos',
    label: 'Orçamentos',
    icon: <FileText className="h-4 w-4" />,
  },
]

/**
 * Match exato pra /crm (raiz) · prefix pra subrotas.
 * Evita /crm.match(true) por todas as filhas.
 */
function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/crm') return pathname === '/crm'
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`)
}

export function CrmSidebarNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Menu principal">
      {NAV.map((item) => {
        const active = isActive(item.href, pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-3 rounded-md px-3 py-2 text-xs font-display-uppercase tracking-widest transition-colors',
              active
                ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function CrmMobileNav() {
  const pathname = usePathname()
  const detailsRef = React.useRef<HTMLDetailsElement>(null)

  // Fecha drawer quando rota muda (clicou num link)
  React.useEffect(() => {
    if (detailsRef.current?.open) {
      detailsRef.current.removeAttribute('open')
    }
  }, [pathname])

  return (
    <details ref={detailsRef} className="ml-auto">
      <summary className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-[10px] font-display-uppercase tracking-widest text-[var(--foreground)]">
        Menu
      </summary>
      <nav
        aria-label="Menu mobile"
        className="absolute right-4 top-12 z-40 flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-luxury-md"
      >
        {NAV.map((item) => {
          const active = isActive(item.href, pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-display-uppercase tracking-widest transition-colors',
                active
                  ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40 hover:text-[var(--foreground)]',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </details>
  )
}
