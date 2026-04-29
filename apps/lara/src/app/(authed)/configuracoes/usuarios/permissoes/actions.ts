'use server'

/**
 * Server Actions · /configuracoes/usuarios/permissoes
 *
 * Port 1:1 do clinic-dashboard module-permissions.ui.js + parte de users-admin.js
 * (drawer de override por user).
 *
 * Cada action faz `requireAction(role, 'settings:edit')` no inicio · RLS no
 * Postgres e a defesa final mas o gate aqui da feedback rapido.
 *
 * Owner protection (replica do vanilla):
 *   - Owner sempre tem acesso · nunca entra na matriz
 *   - bulk_set_module_permissions ignora role='owner' com allowed=false
 *   - getUserPermissions / setUserPermissions nao se aplicam a owner
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction, type StaffRole } from '@/lib/permissions'

const ROUTE = '/configuracoes/usuarios/permissoes'

export interface MatrixSavePayload {
  permissions: Array<{
    moduleId: string
    pageId: string | null
    role: StaffRole
    allowed: boolean
  }>
}

export interface UserPermsSavePayload {
  userId: string
  permissions: Array<{
    moduleId: string
    pageId: string | null
    allowed: boolean
  }>
}

export async function saveMatrixPermissionsAction(
  payload: MatrixSavePayload,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'settings:edit')

  if (!Array.isArray(payload?.permissions) || payload.permissions.length === 0) {
    return { ok: false, error: 'Nenhuma alteracao para salvar' }
  }

  // Sanitizacao defensiva (DB tambem valida)
  const validRoles: StaffRole[] = ['owner', 'admin', 'therapist', 'receptionist', 'viewer']
  const cleaned = payload.permissions
    .filter((p) => p && typeof p.moduleId === 'string' && validRoles.includes(p.role))
    // Owner nunca perde acesso · DB ignora mas filtramos pra UX
    .filter((p) => !(p.role === 'owner' && p.allowed === false))

  if (cleaned.length === 0) {
    return { ok: false, error: 'Payload invalido' }
  }

  const result = await repos.users.bulkSetModulePermissions(cleaned)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Falha ao salvar permissoes' }
  }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes/usuarios')
  return { ok: true, updated: result.data?.updated ?? 0 }
}

export async function saveUserPermissionsAction(
  payload: UserPermsSavePayload,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'settings:edit')

  if (!payload?.userId || typeof payload.userId !== 'string') {
    return { ok: false, error: 'userId invalido' }
  }
  if (!Array.isArray(payload.permissions)) {
    return { ok: false, error: 'permissions invalido' }
  }

  const cleaned = payload.permissions.filter(
    (p) => p && typeof p.moduleId === 'string' && typeof p.allowed === 'boolean',
  )

  const result = await repos.users.setUserPermissions(payload.userId, cleaned)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Falha ao salvar permissoes do usuario' }
  }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}

export async function loadUserPermissionsAction(
  userId: string,
): Promise<{
  ok: boolean
  permissions?: Array<{ moduleId: string; pageId: string | null; allowed: boolean }>
  error?: string
}> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'settings:edit')

  if (!userId) return { ok: false, error: 'userId invalido' }

  const result = await repos.users.getUserPermissions(userId)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Falha ao carregar permissoes do usuario' }
  }
  return { ok: true, permissions: result.data ?? [] }
}
