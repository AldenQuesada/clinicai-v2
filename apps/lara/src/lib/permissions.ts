/**
 * Permissions · port 1:1 do clinic-dashboard/js/services/permissions.service.js
 *
 * Source de verdade pra "quem pode fazer o que" no front.
 * RLS no Postgres ja protege backend · esta camada e UX (esconder botao /
 * tab) e short-circuit em Server Actions.
 *
 * Hierarquia (do menor pro maior):
 *   viewer → receptionist → therapist → admin → owner
 */

export type StaffRole = 'owner' | 'admin' | 'therapist' | 'receptionist' | 'viewer'

const ROLE_HIERARCHY: readonly StaffRole[] = [
  'viewer',
  'receptionist',
  'therapist',
  'admin',
  'owner',
] as const

export const ACTION_ROLES: Readonly<Record<string, readonly StaffRole[]>> = {
  // Gestao de usuarios
  'users:view': ['receptionist', 'therapist', 'admin', 'owner'],
  'users:invite': ['admin', 'owner'],
  'users:deactivate': ['admin', 'owner'],
  'users:reactivate': ['admin', 'owner'],
  'users:change-role': ['owner'],
  'invites:revoke': ['admin', 'owner'],

  // Agenda
  'agenda:view': ['receptionist', 'therapist', 'admin', 'owner'],
  'agenda:create': ['receptionist', 'admin', 'owner'],
  'agenda:edit': ['receptionist', 'therapist', 'admin', 'owner'],
  'agenda:delete': ['admin', 'owner'],
  'agenda:view-all-pros': ['receptionist', 'admin', 'owner'],
  'agenda:manage-visibility': ['admin', 'owner'],
  'agenda:share-own': ['therapist', 'admin', 'owner'],
  'professional:manage-all': ['admin', 'owner'],
  'professional:manage-own': ['therapist', 'admin', 'owner'],

  // Pacientes / prontuario
  'patients:view': ['receptionist', 'therapist', 'admin', 'owner'],
  'patients:create': ['receptionist', 'therapist', 'admin', 'owner'],
  'patients:edit': ['receptionist', 'therapist', 'admin', 'owner'],
  'patients:delete': ['admin', 'owner'],
  'patients:prontuario': ['therapist', 'admin', 'owner'],
  'prontuario:view': ['therapist', 'admin', 'owner'],
  'prontuario:create': ['therapist', 'admin', 'owner'],
  'prontuario:edit': ['therapist', 'admin', 'owner'],
  'prontuario:delete': ['admin', 'owner'],

  // Financeiro
  'financeiro:view': ['viewer', 'admin', 'owner'],
  'financeiro:edit': ['admin', 'owner'],

  // Configuracoes
  'settings:view': ['admin', 'owner'],
  'settings:edit': ['admin', 'owner'],
  'settings:clinic-data': ['owner'],

  // Lara · IA conversacional (especifico Lara)
  'lara:view-conversas': ['receptionist', 'therapist', 'admin', 'owner'],
  'lara:assume-conversa': ['receptionist', 'therapist', 'admin', 'owner'],
  'lara:edit-templates': ['therapist', 'admin', 'owner'],
  'lara:edit-prompts': ['admin', 'owner'],
  'lara:edit-config': ['admin', 'owner'],
  'lara:manage-midia': ['admin', 'owner'],

  // Relatorios
  'reports:view': ['viewer', 'receptionist', 'therapist', 'admin', 'owner'],
  'reports:export': ['admin', 'owner'],

  // Notificacoes
  'notifications:view': ['receptionist', 'therapist', 'admin', 'owner', 'viewer'],
  'notifications:send': ['admin', 'owner'],
  'notifications:broadcast': ['admin', 'owner'],
}

export type Action = keyof typeof ACTION_ROLES

function normalizeRole(role: string | null | undefined): StaffRole | null {
  if (!role) return null
  const r = String(role).toLowerCase() as StaffRole
  return (ROLE_HIERARCHY as readonly string[]).includes(r) ? r : null
}

export function can(role: StaffRole | string | null | undefined, action: Action | string): boolean {
  const r = normalizeRole(role)
  if (!r) return false
  const allowed = ACTION_ROLES[action]
  if (!allowed) {
    console.warn('[permissions] acao desconhecida:', action)
    return false
  }
  return allowed.includes(r)
}

export function canAny(
  role: StaffRole | string | null | undefined,
  actions: Array<Action | string>,
): boolean {
  return actions.some((a) => can(role, a))
}

export function canAll(
  role: StaffRole | string | null | undefined,
  actions: Array<Action | string>,
): boolean {
  return actions.every((a) => can(role, a))
}

export function isAtLeast(
  role: StaffRole | string | null | undefined,
  minRole: StaffRole,
): boolean {
  const r = normalizeRole(role)
  if (!r) return false
  return ROLE_HIERARCHY.indexOf(r) >= ROLE_HIERARCHY.indexOf(minRole)
}

export function requireAction(
  role: StaffRole | string | null | undefined,
  action: Action | string,
): void {
  if (!can(role, action)) {
    const r = normalizeRole(role) ?? '(sem role)'
    throw new Error(`forbidden · role=${r} nao tem permissao pra ${action}`)
  }
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Proprietária',
  admin: 'Administrador',
  therapist: 'Terapeuta',
  receptionist: 'Recepcionista',
  viewer: 'Visualizador',
}

export const ROLE_COLORS: Record<StaffRole, { bg: string; text: string }> = {
  owner: { bg: 'rgba(201,169,110,0.20)', text: 'var(--b2b-champagne)' },
  admin: { bg: 'rgba(212,184,148,0.18)', text: '#D4B894' },
  therapist: { bg: 'rgba(138,158,136,0.18)', text: 'var(--b2b-sage)' },
  receptionist: { bg: 'rgba(181,168,148,0.15)', text: 'var(--b2b-text-dim)' },
  viewer: { bg: 'rgba(122,113,101,0.15)', text: 'var(--b2b-text-muted)' },
}
