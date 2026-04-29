/**
 * UsersRepository · administracao de membros da clinica.
 *
 * Port 1:1 do clinic-dashboard/js/repositories/users.repository.js (vanilla)
 * pra TS · mesmas RPCs · mesmas semanticas { ok, data, error }.
 *
 * RPCs consumidas (todas SECURITY DEFINER · validam role internamente):
 *   list_staff                   · lista membros ativos da clinica
 *   invite_staff                 · cria convite (retorna raw_token + URL)
 *   accept_invitation            · novo membro aceita convite
 *   update_staff_role            · muda role de um membro
 *   deactivate_staff             · desliga acesso (soft)
 *   activate_staff               · religa
 *   list_pending_invites         · convites nao aceitos
 *   revoke_invite                · invalida convite
 *   get_my_profile               · perfil do usuario logado
 *   get_module_permissions       · matriz role x modulo
 *   get_user_permissions         · overrides por usuario
 *   set_user_permissions         · batch upsert de overrides
 *   get_my_effective_permissions · permissoes efetivas (role + overrides)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>

// ── Types ──────────────────────────────────────────────────────────

export type StaffRole = 'owner' | 'admin' | 'therapist' | 'receptionist' | 'viewer'

export interface StaffMemberDTO {
  id: string
  email: string | null
  firstName: string
  lastName: string
  role: StaffRole
  isActive: boolean
  avatarUrl: string | null
  createdAt: string | null
}

export interface PendingInviteDTO {
  id: string
  email: string
  role: StaffRole
  invitedBy: string | null
  invitedByName: string | null
  expiresAt: string
  createdAt: string
}

export interface MyProfileDTO {
  id: string
  clinicId: string | null
  email: string | null
  firstName: string
  lastName: string
  role: StaffRole | null
  isActive: boolean
  avatarUrl: string | null
}

export interface ModulePermissionRow {
  moduleId: string
  /** null = secao inteira; senao page_id especifico */
  pageId: string | null
  role: StaffRole
  allowed: boolean
}

export interface UserPermissionRow {
  moduleId: string
  /** null = secao inteira; senao page_id especifico */
  pageId: string | null
  allowed: boolean
}

export interface InviteResult {
  ok: boolean
  rawToken?: string
  email?: string
  role?: StaffRole
  expiresIn?: string
  inviteId?: string
  error?: string
}

export interface RpcResult<T = unknown> {
  ok: boolean
  data: T | null
  error: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────

function ok<T>(data: T): RpcResult<T> {
  return { ok: true, data, error: null }
}

function err(e: unknown): RpcResult<never> {
  const msg =
    typeof e === 'string'
      ? e
      : (e as { message?: string } | null)?.message || 'Erro desconhecido'
  return { ok: false, data: null, error: msg }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcShape(data: any): { ok: boolean; error?: string; payload: any } {
  // Padrao das RPCs do clinic-dashboard: { ok: bool, error?: string, ...rest }
  if (data && typeof data === 'object' && 'ok' in data) {
    return { ok: !!data.ok, error: data.error, payload: data }
  }
  return { ok: true, payload: data }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStaff(row: any): StaffMemberDTO {
  return {
    id: String(row.id),
    email: row.email ?? null,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    role: (row.role || 'viewer') as StaffRole,
    isActive: row.is_active !== false,
    avatarUrl: row.avatar_url ?? null,
    createdAt: row.created_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvite(row: any): PendingInviteDTO {
  return {
    id: String(row.id),
    email: row.email ?? '',
    role: (row.role || 'viewer') as StaffRole,
    invitedBy: row.invited_by ?? null,
    invitedByName: row.invited_by_name ?? null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

// ── Repository ──────────────────────────────────────────────────────

export class UsersRepository {
  constructor(private supabase: AnyClient) {}

  /** Lista membros ativos da clinica (RPC list_staff). */
  async listStaff(): Promise<RpcResult<StaffMemberDTO[]>> {
    try {
      const { data, error } = await this.supabase.rpc('list_staff')
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'list_staff_failed')
      const list = shape.payload?.staff ?? shape.payload ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ok((Array.isArray(list) ? list : []).map((r: any) => mapStaff(r)))
    } catch (e) {
      return err(e)
    }
  }

  /** Cria convite · retorna raw_token pra montar URL /join?token=... */
  async inviteStaff(
    email: string,
    role: StaffRole,
    opts?: { permissions?: Array<{ moduleId: string; pageId?: string | null; allowed: boolean }> },
  ): Promise<InviteResult> {
    try {
      const params: Record<string, unknown> = { p_email: email, p_role: role }
      if (opts?.permissions != null) {
        params.p_permissions = opts.permissions.map((p) => ({
          module_id: p.moduleId,
          page_id: p.pageId ?? null,
          allowed: p.allowed,
        }))
      }
      const { data, error } = await this.supabase.rpc('invite_staff', params)
      if (error) return { ok: false, error: error.message }
      const shape = rpcShape(data)
      if (!shape.ok) return { ok: false, error: shape.error || 'invite_failed' }
      return {
        ok: true,
        rawToken: shape.payload?.raw_token,
        email: shape.payload?.email,
        role: shape.payload?.role,
        expiresIn: shape.payload?.expires_in,
        inviteId: shape.payload?.invite_id,
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  /** Aceita convite · cria/atualiza profile do usuario logado. */
  async acceptInvitation(
    rawToken: string,
    firstName: string,
    lastName: string,
  ): Promise<RpcResult<{ role: StaffRole; clinicId: string }>> {
    try {
      const { data, error } = await this.supabase.rpc('accept_invitation', {
        p_raw_token: rawToken,
        p_first_name: firstName,
        p_last_name: lastName,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'accept_failed')
      return ok({
        role: shape.payload?.role as StaffRole,
        clinicId: shape.payload?.clinic_id,
      })
    } catch (e) {
      return err(e)
    }
  }

  /** Muda role de membro (apenas owner pode promover/rebaixar admin/owner). */
  async updateRole(userId: string, newRole: StaffRole): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('update_staff_role', {
        p_user_id: userId,
        p_new_role: newRole,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'update_role_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  async deactivateStaff(userId: string): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('deactivate_staff', { p_user_id: userId })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'deactivate_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  async activateStaff(userId: string): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('activate_staff', { p_user_id: userId })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'activate_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  async listPendingInvites(): Promise<RpcResult<PendingInviteDTO[]>> {
    try {
      const { data, error } = await this.supabase.rpc('list_pending_invites')
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'list_invites_failed')
      const list = Array.isArray(shape.payload)
        ? shape.payload
        : shape.payload?.data ?? shape.payload?.invites ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ok((Array.isArray(list) ? list : []).map((r: any) => mapInvite(r)))
    } catch (e) {
      return err(e)
    }
  }

  async revokeInvite(inviteId: string): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('revoke_invite', { p_invite_id: inviteId })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'revoke_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  async getMyProfile(): Promise<RpcResult<MyProfileDTO>> {
    try {
      const { data, error } = await this.supabase.rpc('get_my_profile')
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'get_profile_failed')
      const p = shape.payload?.profile ?? shape.payload
      if (!p) return err('profile_not_found')
      return ok({
        id: p.id,
        clinicId: p.clinic_id ?? null,
        email: p.email ?? null,
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        role: (p.role ?? null) as StaffRole | null,
        isActive: p.is_active !== false,
        avatarUrl: p.avatar_url ?? null,
      })
    } catch (e) {
      return err(e)
    }
  }

  async updateOwnProfile(
    userId: string,
    fields: { firstName?: string; lastName?: string; avatarUrl?: string },
  ): Promise<RpcResult<unknown>> {
    try {
      const update: Record<string, unknown> = {}
      if (fields.firstName !== undefined) update.first_name = fields.firstName
      if (fields.lastName !== undefined) update.last_name = fields.lastName
      if (fields.avatarUrl !== undefined) update.avatar_url = fields.avatarUrl
      const { error } = await this.supabase.from('profiles').update(update).eq('id', userId)
      if (error) return err(error)
      return ok(null)
    } catch (e) {
      return err(e)
    }
  }

  // ── Permissoes (matriz role x modulo + overrides por user) ──────────

  async getModulePermissions(): Promise<RpcResult<ModulePermissionRow[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_module_permissions')
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'get_module_permissions_failed')
      const list = (shape.payload?.permissions ?? []) as Array<Record<string, unknown>>
      return ok(
        list.map((p) => ({
          moduleId: String(p.module_id ?? ''),
          pageId: (p.page_id ?? null) as string | null,
          role: String(p.role ?? '') as StaffRole,
          allowed: !!p.allowed,
        })),
      )
    } catch (e) {
      return err(e)
    }
  }

  /** Aplica batch de overrides role x modulo (owner protected no DB). */
  async bulkSetModulePermissions(
    permissions: Array<{
      moduleId: string
      pageId?: string | null
      role: StaffRole
      allowed: boolean
    }>,
  ): Promise<RpcResult<{ updated: number }>> {
    try {
      const { data, error } = await this.supabase.rpc('bulk_set_module_permissions', {
        p_permissions: permissions.map((p) => ({
          module_id: p.moduleId,
          page_id: p.pageId ?? null,
          role: p.role,
          allowed: p.allowed,
        })),
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'bulk_set_module_permissions_failed')
      return ok({ updated: Number(shape.payload?.updated ?? 0) })
    } catch (e) {
      return err(e)
    }
  }

  async getUserPermissions(userId: string): Promise<RpcResult<UserPermissionRow[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_user_permissions', {
        p_user_id: userId,
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'get_user_permissions_failed')
      const list = (shape.payload?.permissions ?? []) as Array<Record<string, unknown>>
      return ok(
        list.map((p) => ({
          moduleId: String(p.module_id ?? ''),
          pageId: (p.page_id ?? null) as string | null,
          allowed: !!p.allowed,
        })),
      )
    } catch (e) {
      return err(e)
    }
  }

  async setUserPermissions(
    userId: string,
    permissions: Array<{ moduleId: string; pageId?: string | null; allowed: boolean }>,
  ): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('set_user_permissions', {
        p_user_id: userId,
        p_permissions: permissions.map((p) => ({
          module_id: p.moduleId,
          page_id: p.pageId ?? null,
          allowed: p.allowed,
        })),
      })
      if (error) return err(error)
      const shape = rpcShape(data)
      if (!shape.ok) return err(shape.error || 'set_user_permissions_failed')
      return ok(shape.payload)
    } catch (e) {
      return err(e)
    }
  }

  async getMyEffectivePermissions(): Promise<RpcResult<unknown>> {
    try {
      const { data, error } = await this.supabase.rpc('get_my_effective_permissions')
      if (error) return err(error)
      return ok(data)
    } catch (e) {
      return err(e)
    }
  }
}
