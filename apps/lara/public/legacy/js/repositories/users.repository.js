/**
 * ClinicAI — Users Repository
 *
 * Acesso puro ao Supabase para administração de usuários/staff.
 * Zero lógica de negócio — apenas chamadas RPC e .from() com retorno normalizado.
 *
 * RPCs consumidas:
 *   list_staff()
 *   invite_staff(p_email, p_role)
 *   update_staff_role(p_user_id, p_new_role)
 *   deactivate_staff(p_user_id)
 *   activate_staff(p_user_id)
 *   list_pending_invites()
 *   revoke_invite(p_invite_id)
 *
 * Tabelas acessadas via .from():
 *   profiles  — atualização de first_name / last_name do próprio usuário
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiUsersRepoLoaded) return
  window._clinicaiUsersRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)  { return { ok: true,  data: data,  error: null  } }
  function _err(e)    { return { ok: false, data: null,  error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }

  // ── getStaff ──────────────────────────────────────────────────
  /**
   * Lista todos os membros de staff da clínica.
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getStaff() {
    try {
      var { data, error } = await _sb().rpc('list_staff')
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data && data.staff ? data.staff : [])
    } catch (e) { return _err(e) }
  }

  // ── inviteStaff ───────────────────────────────────────────────
  /**
   * Convida um novo membro para a clínica.
   * @param {string} email
   * @param {string} role  — 'therapist' | 'receptionist' | 'admin' | 'viewer'
   * @param {object} [opts] — { permissions: Array, professionalId: string }
   * @returns {Promise<{ok, data, error}>}
   */
  async function inviteStaff(email, role, opts) {
    try {
      var params = { p_email: email, p_role: role }
      if (opts && opts.permissions != null)    params.p_permissions = opts.permissions
      if (opts && opts.professionalId != null) params.p_professional_id = opts.professionalId
      var { data, error } = await _sb().rpc('invite_staff', params)
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── inviteProfessionalAsUser ──────────────────────────────────
  /**
   * Convida um profissional existente como usuario do sistema.
   * Persiste o email no professional_profiles e vincula user_id ao aceitar.
   * @param {string} professionalId
   * @param {string} email
   * @param {string} role
   * @param {Array}  [permissions]
   * @returns {Promise<{ok, data, error}>}
   */
  async function inviteProfessionalAsUser(professionalId, email, role, permissions) {
    try {
      var { data, error } = await _sb().rpc('invite_professional_as_user', {
        p_professional_id: professionalId,
        p_email:           email,
        p_role:            role,
        p_permissions:     permissions || null,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── updateRole ────────────────────────────────────────────────
  /**
   * Altera o nível de acesso de um usuário.
   * @param {string} userId
   * @param {string} newRole
   * @returns {Promise<{ok, data, error}>}
   */
  async function updateRole(userId, newRole) {
    try {
      var { data, error } = await _sb().rpc('update_staff_role', {
        p_user_id:  userId,
        p_new_role: newRole,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── deactivateStaff ───────────────────────────────────────────
  /**
   * Desativa o acesso de um membro.
   * @param {string} userId
   * @returns {Promise<{ok, data, error}>}
   */
  async function deactivateStaff(userId) {
    try {
      var { data, error } = await _sb().rpc('deactivate_staff', {
        p_user_id: userId,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── activateStaff ─────────────────────────────────────────────
  /**
   * Reativa o acesso de um membro desativado.
   * @param {string} userId
   * @returns {Promise<{ok, data, error}>}
   */
  async function activateStaff(userId) {
    try {
      var { data, error } = await _sb().rpc('activate_staff', {
        p_user_id: userId,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── getPendingInvites ─────────────────────────────────────────
  /**
   * Lista convites pendentes de aceitação.
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getPendingInvites() {
    try {
      var { data, error } = await _sb().rpc('list_pending_invites')
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(Array.isArray(data) ? data : (data && data.data ? data.data : []))
    } catch (e) { return _err(e) }
  }

  // ── linkToProfessional ────────────────────────────────────────
  async function linkToProfessional(userId, professionalId) {
    try {
      var { data, error } = await _sb().rpc('link_user_to_professional', {
        p_user_id: userId, p_professional_id: professionalId,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── unlinkFromProfessional ────────────────────────────────────
  async function unlinkFromProfessional(userId) {
    try {
      var { data, error } = await _sb().rpc('unlink_user_from_professional', {
        p_user_id: userId,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── listUnlinkedProfessionals ─────────────────────────────────
  async function listUnlinkedProfessionals() {
    try {
      var { data, error } = await _sb().rpc('list_unlinked_professionals')
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data && data.professionals ? data.professionals : [])
    } catch (e) { return _err(e) }
  }

  // ── revokeInvite ──────────────────────────────────────────────
  /**
   * Revoga um convite pendente.
   * @param {string} inviteId
   * @returns {Promise<{ok, data, error}>}
   */
  async function revokeInvite(inviteId) {
    try {
      var { data, error } = await _sb().rpc('revoke_invite', {
        p_invite_id: inviteId,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── getProfile ────────────────────────────────────────────────
  /**
   * Lê o perfil de um usuário da tabela profiles.
   * @param {string} clinicId
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getProfiles(clinicId) {
    try {
      var { data, error } = await _sb()
        .from('profiles')
        .select('*')
        .eq('clinic_id', clinicId)
      if (error) return _err(error)
      return _ok(data || [])
    } catch (e) { return _err(e) }
  }

  // ── updateProfile ─────────────────────────────────────────────
  /**
   * Atualiza first_name e last_name do próprio usuário.
   * @param {string} userId
   * @param {object} fields  — { first_name, last_name }
   * @returns {Promise<{ok, data, error}>}
   */
  async function updateProfile(userId, fields) {
    try {
      var { data, error } = await _sb()
        .from('profiles')
        .update(fields)
        .eq('id', userId)
      if (error) return _err(error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.UsersRepository = Object.freeze({
    getStaff,
    inviteStaff,
    inviteProfessionalAsUser,
    linkToProfessional,
    unlinkFromProfessional,
    listUnlinkedProfessionals,
    updateRole,
    deactivateStaff,
    activateStaff,
    getPendingInvites,
    revokeInvite,
    getProfiles,
    updateProfile,
  })

})()
