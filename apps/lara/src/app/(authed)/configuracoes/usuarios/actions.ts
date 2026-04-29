'use server'

/**
 * Server Actions · /configuracoes/usuarios.
 *
 * Wrappers em volta de UsersRepository · port 1:1 do clinic-dashboard.
 * Cada action faz `requireAction` no inicio · RLS no Postgres e a defesa
 * final mas o gate aqui da feedback rapido + UX clean.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction, type StaffRole } from '@/lib/permissions'

const ROUTE = '/configuracoes/usuarios'

function buildJoinUrl(rawToken: string): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://lara.miriandpaula.com.br'
  return `${url}/join?token=${encodeURIComponent(rawToken)}`
}

export interface InviteActionResult {
  ok: boolean
  joinUrl?: string
  email?: string
  role?: StaffRole
  error?: string
}

export async function inviteStaffAction(formData: FormData): Promise<InviteActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'users:invite')

  const email = String(formData.get('email') || '').trim().toLowerCase()
  const role = String(formData.get('role') || '').trim() as StaffRole
  const firstName = String(formData.get('first_name') || '').trim()
  const lastName = String(formData.get('last_name') || '').trim()

  if (!firstName) {
    return { ok: false, error: 'Informe o nome' }
  }
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Email invalido' }
  }
  const validRoles: StaffRole[] = ['admin', 'therapist', 'receptionist', 'viewer']
  if (!validRoles.includes(role)) {
    return { ok: false, error: 'Role invalido' }
  }
  if (role === 'admin' && ctx.role !== 'owner') {
    return { ok: false, error: 'Apenas owner pode convidar admin' }
  }

  // Permissoes por modulo · port 1:1 do clinic-dashboard openInviteModal
  // (linhas 693-697 de users-admin.js). Admin marca/desmarca toggles antes
  // de enviar · esse override e aplicado quando user aceita convite.
  // Formato no formData: keys 'perm:<moduleId>' = 'on' (checkbox padrao HTML).
  const permissions: Array<{ moduleId: string; pageId: null; allowed: boolean }> = []
  const allModulesRaw = String(formData.get('all_modules') || '').trim()
  if (allModulesRaw) {
    const allModules = allModulesRaw.split(',').filter(Boolean)
    for (const moduleId of allModules) {
      permissions.push({
        moduleId,
        pageId: null,
        allowed: formData.get(`perm:${moduleId}`) === 'on',
      })
    }
  }

  const result = await repos.users.inviteStaff(email, role, {
    firstName,
    lastName,
    permissions: permissions.length > 0 ? permissions : undefined,
  })
  if (!result.ok || !result.rawToken) {
    return { ok: false, error: result.error || 'Falha ao criar convite' }
  }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  return {
    ok: true,
    joinUrl: buildJoinUrl(result.rawToken),
    email: result.email,
    role: result.role,
  }
}

export async function updateRoleAction(
  userId: string,
  newRole: StaffRole,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'users:change-role')

  if (userId === ctx.user_id) {
    return { ok: false, error: 'Voce nao pode mudar seu proprio role' }
  }

  const result = await repos.users.updateRole(userId, newRole)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao atualizar role' }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  return { ok: true }
}

export async function deactivateStaffAction(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'users:deactivate')

  if (userId === ctx.user_id) {
    return { ok: false, error: 'Voce nao pode desativar seu proprio acesso' }
  }

  const result = await repos.users.deactivateStaff(userId)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao desativar' }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  return { ok: true }
}

export async function activateStaffAction(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'users:reactivate')

  const result = await repos.users.activateStaff(userId)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao reativar' }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  return { ok: true }
}

export async function revokeInviteAction(
  inviteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'invites:revoke')

  const result = await repos.users.revokeInvite(inviteId)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao revogar' }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  return { ok: true }
}

export async function updateOwnProfileAction(
  fields: { firstName?: string; lastName?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadServerReposContext()
  if (!ctx.user_id) return { ok: false, error: 'Sem sessao' }

  const result = await repos.users.updateOwnProfile(ctx.user_id, fields)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao atualizar perfil' }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
  return { ok: true }
}
