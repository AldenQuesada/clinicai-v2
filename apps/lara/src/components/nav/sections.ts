/**
 * Sections do sidebar Lara · fonte unica de verdade.
 *
 * Espelha o padrao Mira (apps/mira/src/components/nav/sections.ts) ·
 * mesma key + label + icon + path · usado por AppSidebar +
 * MobileNavDrawer + AppHeaderThin (titulo da pagina).
 */

import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { can, type StaffRole, type Action } from '@/lib/permissions'

export interface Section {
  key: string
  label: string
  path: string
  icon: LucideIcon
  /** Acao de permissao requerida pra ver o item · null = sempre visivel pra logados */
  requires: Action | null
}

export const SECTIONS: readonly Section[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    requires: null,
  },
  {
    key: 'conversas',
    label: 'Conversas',
    path: '/conversas',
    icon: MessageSquare,
    requires: 'lara:view-conversas',
  },
  {
    key: 'templates',
    label: 'Templates',
    path: '/templates',
    icon: FileText,
    requires: 'lara:edit-templates',
  },
  {
    key: 'prompts',
    label: 'Prompts',
    path: '/prompts',
    icon: Sparkles,
    requires: 'lara:edit-prompts',
  },
  {
    key: 'midia',
    label: 'Mídias',
    path: '/midia',
    icon: ImageIcon,
    requires: 'lara:manage-midia',
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    path: '/configuracoes',
    icon: Settings,
    requires: 'lara:edit-config',
  },
] as const

/** Detecta sessao ativa pelo pathname (matches por prefixo). */
export function detectActiveSection(pathname: string): Section {
  for (const s of SECTIONS) {
    if (pathname === s.path || pathname.startsWith(s.path + '/')) return s
  }
  return SECTIONS[0]
}

/** Filtra sessoes visiveis pro role atual. */
export function visibleSections(role: StaffRole | null | undefined): Section[] {
  return SECTIONS.filter((s) => {
    if (!s.requires) return true
    return can(role, s.requires)
  })
}
