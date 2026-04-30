/**
 * ClinicAI — Agenda Visibility Repository
 *
 * Camada de acesso a dados para professional_profiles e agenda_visibility.
 * Sem lógica de negócio — apenas chamadas ao Supabase.
 *
 * Todas as operações retornam { ok, data?, error? }.
 * Erros de rede são capturados e normalizados aqui — o serviço que usa
 * este repositório nunca precisa lidar com exceções brutas.
 */

;(function () {
  'use strict'

  if (window._clinicaiAgendaVisRepoLoaded) return
  window._clinicaiAgendaVisRepoLoaded = true

  // ── Cliente Supabase (singleton compartilhado) ──────────────────────────
  function _sb() {
    var e = window.ClinicEnv || {}
    return window._sbShared
      || (window.supabase?.createClient && e.SUPABASE_URL
          ? window.supabase.createClient(e.SUPABASE_URL, e.SUPABASE_KEY)
          : null)
  }

  // ── Normaliza resultado do Supabase ─────────────────────────────────────
  function _ok(data)  { return { ok: true,  data, error: null } }
  function _err(e)    { return { ok: false, data: null, error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }
  function _wrap(data, error) {
    if (error) return _err(error)
    if (data && data.ok === false) return _err(data.error || 'unknown_error')
    return _ok(data?.data ?? data)
  }

  // ── Repositório ─────────────────────────────────────────────────────────

  /**
   * Lista os profissionais que o usuário atual pode ver na agenda,
   * com a permissão efetiva (view | edit).
   *
   * @returns {Promise<{ok:boolean, data?:ProfessionalAccess[], error?:string}>}
   *
   * ProfessionalAccess = {
   *   id: string (UUID),
   *   display_name: string,
   *   specialty: string|null,
   *   crm: string|null,
   *   color: string,
   *   bio: string|null,
   *   permission: 'view'|'edit',
   *   is_self: boolean
   * }
   */
  async function listVisibleProfessionals() {
    try {
      const { data, error } = await _sb().rpc('list_visible_professionals')
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Lista TODOS os profissionais da clínica (apenas admin/owner).
   * Usado no painel de configuração de visibilidade.
   *
   * @returns {Promise<{ok:boolean, data?:Professional[], error?:string}>}
   */
  async function listAllProfessionals() {
    try {
      const { data, error } = await _sb().rpc('list_all_professionals')
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Lista quem tem acesso à agenda de um profissional específico.
   *
   * @param {string} ownerId — UUID do profissional dono da agenda
   * @returns {Promise<{ok:boolean, data?:Grant[], error?:string}>}
   *
   * Grant = {
   *   grant_id: string,
   *   viewer_id: string,
   *   viewer_name: string,
   *   viewer_role: string,
   *   permission: 'view'|'edit',
   *   created_at: string
   * }
   */
  async function listGrants(ownerId) {
    try {
      const { data, error } = await _sb().rpc('list_agenda_grants', { p_owner_id: ownerId })
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Concede ou revoga acesso à agenda de um profissional.
   *
   * @param {string} ownerId     — dono da agenda
   * @param {string} viewerId    — quem terá (ou perderá) acesso
   * @param {'view'|'edit'|'none'} permission
   * @returns {Promise<{ok:boolean, error?:string, note?:string}>}
   */
  async function setVisibility(ownerId, viewerId, permission) {
    try {
      const { data, error } = await _sb().rpc('set_agenda_visibility', {
        p_owner_id:   ownerId,
        p_viewer_id:  viewerId,
        p_permission: permission,
      })
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Cria ou atualiza o perfil clínico de um profissional.
   *
   * @param {object} params
   * @param {string}  [params.targetId]    — UUID alvo (null = próprio usuário)
   * @param {string}  params.displayName
   * @param {string}  [params.specialty]
   * @param {string}  [params.crm]
   * @param {string}  [params.color]       — hex, ex: '#7C3AED'
   * @param {string}  [params.bio]
   * @param {boolean} [params.isActive]
   * @returns {Promise<{ok:boolean, data?:{id:string}, error?:string}>}
   */
  async function upsertProfessionalProfile(params) {
    try {
      const { data, error } = await _sb().rpc('upsert_professional_profile', {
        p_target_id:    params.targetId    ?? null,
        p_display_name: params.displayName ?? null,
        p_specialty:    params.specialty   ?? null,
        p_crm:          params.crm         ?? null,
        p_color:        params.color       ?? '#7C3AED',
        p_bio:          params.bio         ?? null,
        p_is_active:    params.isActive    ?? true,
      })
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.AgendaVisibilityRepository = Object.freeze({
    listVisibleProfessionals,
    listAllProfessionals,
    listGrants,
    setVisibility,
    upsertProfessionalProfile,
  })

})()
