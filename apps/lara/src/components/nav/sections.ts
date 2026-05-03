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
  MessageSquareText,
  Users,
  Send,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Settings,
  ClipboardList,
  Briefcase,
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
  /** External · path eh URL absoluta ou static .html · usa <a target> em vez de <Link> */
  external?: boolean
}

export const SECTIONS: readonly Section[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    // Mig 97 · secretaria nao ve dashboard · reports:view inclui todos
    // outros roles + viewer mas exclui secretaria (sidebar minimal pra ela)
    requires: 'reports:view',
  },
  {
    key: 'conversas',
    label: 'Conversas',
    path: '/conversas',
    icon: MessageSquare,
    requires: 'lara:view-conversas',
  },
  {
    // Mig 91 · inbox dedicada da clinica (numero da secretaria) ·
    // mostra inbound direto + handoffs Lara→secretaria · sem AI.
    // Mig 97 · acessivel pelo role 'secretaria' (entry-level)
    key: 'secretaria',
    label: 'Secretaria',
    path: '/secretaria',
    icon: MessageSquareText,
    requires: 'secretaria:view-inbox',
  },
  {
    key: 'leads',
    label: 'Leads',
    path: '/leads',
    icon: Users,
    requires: 'patients:view',
  },
  {
    // CRM landing /crm com sub-nav (Pacientes, Agenda, Orcamentos) ·
    // Camadas 7/8/9 entregues 2026-04-29. Sem entrada no sidebar
    // ate hoje · descoberto durante onboarding Alden 2026-04-30.
    key: 'crm',
    label: 'CRM',
    path: '/crm',
    icon: Briefcase,
    requires: 'patients:view',
  },
  {
    key: 'campanhas',
    label: 'Campanhas',
    path: '/campanhas',
    icon: Send,
    requires: 'notifications:broadcast',
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
    // Sub-app legado · clinic-dashboard/anamnese servido como static
    // sob /legacy/ · liberado em PUBLIC_PATHS (legacy faz seu auth via
    // anon key + RLS · paciente preenche via token, admin via session
    // do mesmo Supabase). Decisao 2026-04-30: nao migrar pra v2 · UX
    // perfeita, FKs ja apontam pra public.X · drop legacy schema em
    // 2026-05-28 nao quebra (anamnese vive em public).
    key: 'anamnese',
    label: 'Anamnese',
    path: '/legacy/anamnese.html',
    icon: ClipboardList,
    requires: 'patients:view',
    external: true,
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
