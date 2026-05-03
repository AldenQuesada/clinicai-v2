/**
 * Modulos x paginas · espelho 1:1 do clinic-dashboard/js/nav-config.js
 *
 * Esta lista e a FONTE UNICA pra UI da matriz role x modulo.
 * Quando adicionar um novo modulo no clinic-dashboard NAV_CONFIG, replique aqui.
 *
 * Regras (mesma logica do vanilla):
 *   - `roles: []`           → todos os roles veem por default
 *   - `roles: ['admin']`    → so admin/owner veem por default
 *   - `pages[].roles`       → override por pagina (omitir = herda da secao)
 *   - secao 'settings'      → NAO entra na matriz (proteger acesso a config)
 *
 * Hierarquia ao resolver:
 *   user_module_permissions[user_id, module_id, page_id]   (maior)
 *   clinic_module_permissions[role, module_id, page_id]
 *   este default                                            (fallback)
 */

import type { StaffRole } from '@/lib/permissions'

export interface ModulePageDef {
  page: string
  label: string
  roles?: ReadonlyArray<StaffRole>
}

export interface ModuleDef {
  section: string
  label: string
  /** lucide icon name (pra UI) */
  icon:
    | 'grid'
    | 'star'
    | 'activity'
    | 'calendar'
    | 'heart'
    | 'message-circle'
    | 'trending-up'
    | 'zap'
    | 'dollar-sign'
    | 'book-open'
    | 'cpu'
    | 'tool'
    | 'folder'
  /** Roles que veem por default. [] = todos. */
  roles: ReadonlyArray<StaffRole>
  pages: ReadonlyArray<ModulePageDef>
}

export const MODULES: ReadonlyArray<ModuleDef> = [
  {
    section: 'dashboard',
    icon: 'grid',
    label: 'Dashboard',
    roles: [],
    pages: [{ page: 'dashboard-overview', label: 'Visão Geral' }],
  },
  {
    section: 'captacao-fullface',
    icon: 'star',
    label: 'Full Face',
    roles: ['owner', 'admin', 'receptionist'],
    pages: [
      { page: 'leads-fullface', label: 'Leads' },
      { page: 'sdh-fullface', label: 'SDR', roles: ['owner', 'admin'] },
      { page: 'quiz-fullface', label: 'Quiz', roles: ['owner', 'admin'] },
    ],
  },
  {
    section: 'captacao-protocolos',
    icon: 'activity',
    label: 'Procedimentos',
    roles: ['owner', 'admin', 'receptionist'],
    pages: [
      { page: 'leads-protocolos', label: 'Leads' },
      { page: 'sdh-protocolos', label: 'SDR', roles: ['owner', 'admin'] },
      { page: 'quiz-protocolos', label: 'Quiz', roles: ['owner', 'admin'] },
    ],
  },
  {
    section: 'agenda',
    icon: 'calendar',
    label: 'Agenda',
    roles: ['owner', 'admin', 'therapist', 'receptionist'],
    pages: [
      { page: 'agenda', label: 'Agenda' },
      { page: 'agenda-overview', label: 'Visão Geral' },
      { page: 'agenda-agendados', label: 'Agendados' },
      { page: 'agenda-cancelados', label: 'Cancelados' },
      { page: 'agenda-reports', label: 'Relatórios' },
      { page: 'agenda-eventos', label: 'Eventos' },
      { page: 'agenda-tags', label: 'Tags e Fluxos' },
      { page: 'retoques-dashboard', label: 'Retoques' },
      { page: 'case-gallery', label: 'Galeria de Casos' },
      { page: 'report-editor', label: 'Editor do Report' },
      { page: 'funnel-automations', label: 'Automações (Funis)' },
    ],
  },
  {
    section: 'patients',
    icon: 'heart',
    label: 'Pacientes',
    roles: ['owner', 'admin', 'therapist', 'receptionist'],
    pages: [
      { page: 'patients-all', label: 'Pacientes' },
      { page: 'orcamentos', label: 'Orçamentos' },
      {
        page: 'patients-prontuario',
        label: 'Prontuário Clínico',
        roles: ['owner', 'admin', 'therapist'],
      },
      { page: 'patients-docs', label: 'Documentos do Paciente' },
      {
        page: 'facial-analysis',
        label: 'Análise Facial IA',
        roles: ['owner', 'admin', 'therapist'],
      },
    ],
  },
  {
    section: 'whatsapp',
    icon: 'message-circle',
    label: 'WhatsApp',
    roles: [],
    pages: [
      { page: 'analytics-wa', label: 'AI Analytics WhatsApp' },
      { page: 'inbox', label: 'Central de WhatsApp' },
      { page: 'wa-disparos', label: 'Disparos' },
      { page: 'settings-automation', label: 'Fluxos e Regras' },
      { page: 'birthday-campaigns', label: 'Aniversários' },
      { page: 'growth-wa-links', label: 'Links WhatsApp' },
      { page: 'short-links', label: 'Encurtador de Links' },
      { page: 'page-builder', label: 'Construtor de Páginas' },
      { page: 'lp-builder-v2', label: 'Construtor de LPs · v2' },
    ],
  },
  {
    section: 'growth',
    icon: 'trending-up',
    label: 'Growth e Mkt',
    roles: ['owner', 'admin'],
    pages: [
      { page: 'growth-wa-links', label: 'Gerador de Links WA' },
      { page: 'growth-partners', label: 'Parceiros (VPI · B2C)' },
      { page: 'growth-exec', label: 'Dashboard Executivo' },
      { page: 'growth-metrics', label: 'Growth Metrics · Analytics' },
      { page: 'growth-referral', label: 'Programa de Indicação' },
      { page: 'b2b-mira', label: 'B2B (Mira)' },
      { page: 'b2b-plano', label: 'Plano B2B (roadmap)' },
      { page: 'plano-growth', label: 'Plano Growth (roadmap)' },
    ],
  },
  {
    section: 'app-rejuvenescimento',
    icon: 'zap',
    label: 'App Rejuvenescimento',
    roles: ['owner', 'admin', 'therapist'],
    pages: [
      { page: 'rejuv-dashboard', label: 'Dashboard' },
      { page: 'rejuv-leads', label: 'Leads' },
      { page: 'rejuv-msg-bank', label: 'Banco de Mensagens' },
    ],
  },
  {
    section: 'financeiro',
    icon: 'dollar-sign',
    label: 'Financeiro',
    roles: ['owner', 'admin', 'viewer'],
    pages: [
      { page: 'fin-goals', label: 'Metas Financeiras' },
      { page: 'fin-reports', label: 'Relatórios Financeiros' },
    ],
  },
  {
    section: 'revista',
    icon: 'book-open',
    label: 'Revista Digital',
    roles: ['owner', 'admin'],
    pages: [
      { page: 'revista-intake', label: 'Montar Edição' },
      { page: 'revista-editions', label: 'Edições (Hub)' },
      { page: 'revista-dashboard', label: 'Dashboard' },
      { page: 'revista-gallery', label: 'Galeria de Formatos' },
      { page: 'revista-playbook', label: 'Playbook Editorial' },
      { page: 'revista-wow', label: 'Efeitos Wow (Premium)' },
      { page: 'revista-doc', label: 'Documento Mestre' },
    ],
  },
  {
    section: 'mira',
    icon: 'cpu',
    label: 'Mira',
    roles: ['owner', 'admin'],
    pages: [
      { page: 'mira-config', label: 'Configuração' },
      { page: 'mira-console', label: 'Console de Teste' },
    ],
  },
] as const

/** Roles editaveis na matriz (owner sempre tem acesso · nao aparece). */
export const MATRIX_ROLES: ReadonlyArray<Exclude<StaffRole, 'owner'>> = [
  'admin',
  'therapist',
  'receptionist',
  'secretaria',
  'viewer',
] as const

export const ROLE_LABEL_SHORT: Record<StaffRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  therapist: 'Espec.',
  receptionist: 'Recep.',
  secretaria: 'Secret.',
  viewer: 'Visual.',
}

/**
 * Resolve o default da matriz (espelho de _getDefault do vanilla).
 *
 * @returns true se aquele role/modulo/pagina tem acesso por default.
 */
export function getDefaultAllowed(
  module: ModuleDef,
  page: ModulePageDef | null,
  role: StaffRole,
): boolean {
  if (role === 'owner') return true
  const roles = page?.roles ?? module.roles
  if (roles.length === 0) return true
  return roles.includes(role)
}

/** Compoe a chave canonica usada em maps/dirty/overrides. */
export function permKey(moduleId: string, pageId: string | null, role: StaffRole): string {
  return `${moduleId}|${pageId ?? ''}|${role}`
}

/** Compoe chave de override por user (sem role). */
export function userPermKey(moduleId: string, pageId: string | null): string {
  return `${moduleId}|${pageId ?? ''}`
}
