/**
 * ClinicAI — Agenda Access Service
 *
 * Gerencia quem pode ver e editar a agenda de cada profissional.
 * Cache em memória — recarregado automaticamente após operações de mutação.
 *
 * Depende de:
 *   AgendaVisibilityRepository  (agenda-visibility.repository.js)
 *   getCurrentProfile            (auth.js)
 *
 * API pública (window.AgendaAccessService):
 *   init()                  — carrega dados do backend (chamar uma vez no boot)
 *   getAll()                — array de profissionais acessíveis ao usuário atual
 *   canView(profileId)      — boolean
 *   canEdit(profileId)      — boolean
 *   getPermission(profileId)— 'edit' | 'view' | null
 *   grantAccess(ownerId, viewerId, permission) — admin/owner/self
 *   revokeAccess(ownerId, viewerId)            — admin/owner/self
 *   upsertProfile(params)   — cria/atualiza perfil clínico
 *   refresh()               — força recarregamento do cache
 *   onChange(fn)            — inscreve listener para mudanças no cache
 *   offChange(fn)           — remove listener
 */

;(function () {
  'use strict'

  if (window._clinicaiAgendaAccessLoaded) return
  window._clinicaiAgendaAccessLoaded = true

  // ── Cache interno ───────────────────────────────────────────────────────

  /** @type {ProfessionalAccess[]|null} */
  let _cache     = null
  let _loading   = false
  let _listeners = []

  // Map de profileId → ProfessionalAccess para lookup O(1)
  /** @type {Map<string, ProfessionalAccess>} */
  let _byId = new Map()

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _getRepo() {
    if (!window.AgendaVisibilityRepository) {
      console.error('[AgendaAccessService] AgendaVisibilityRepository não carregado.')
      return null
    }
    return window.AgendaVisibilityRepository
  }

  function _setCache(professionals) {
    _cache = Array.isArray(professionals) ? professionals : []
    _byId.clear()
    _cache.forEach(p => _byId.set(p.id, p))
    _listeners.forEach(fn => { try { fn(_cache) } catch (e) { /* não quebra */ } })
  }

  // ── API pública ─────────────────────────────────────────────────────────

  /**
   * Carrega os profissionais acessíveis ao usuário atual.
   * Seguro para chamar múltiplas vezes — ignora se já está carregando.
   *
   * @returns {Promise<boolean>} — true se sucesso
   */
  async function init() {
    if (_loading) return false
    _loading = true
    try {
      const repo   = _getRepo()
      if (!repo) return false

      const result = await repo.listVisibleProfessionals()
      if (!result.ok) {
        console.warn('[AgendaAccessService] init falhou:', result.error)
        return false
      }
      _setCache(result.data)
      return true
    } finally {
      _loading = false
    }
  }

  /**
   * Retorna todos os profissionais acessíveis ao usuário atual (do cache).
   * Inclui o campo `permission` ('view' | 'edit') e `is_self`.
   *
   * @returns {ProfessionalAccess[]}
   */
  function getAll() {
    return _cache || []
  }

  /**
   * Retorna a permissão efetiva do usuário atual para a agenda do profissional.
   *
   * @param {string} profileId
   * @returns {'edit'|'view'|null}
   */
  function getPermission(profileId) {
    return _byId.get(profileId)?.permission ?? null
  }

  /**
   * @param {string} profileId
   * @returns {boolean}
   */
  function canView(profileId) {
    return _byId.has(profileId)
  }

  /**
   * @param {string} profileId
   * @returns {boolean}
   */
  function canEdit(profileId) {
    return _byId.get(profileId)?.permission === 'edit'
  }

  /**
   * Concede acesso à agenda de um profissional.
   *
   * @param {string} ownerId
   * @param {string} viewerId
   * @param {'view'|'edit'} permission
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function grantAccess(ownerId, viewerId, permission) {
    const repo = _getRepo()
    if (!repo) return { ok: false, error: 'repository_unavailable' }

    const result = await repo.setVisibility(ownerId, viewerId, permission)
    if (result.ok) await refresh()
    return result
  }

  /**
   * Revoga acesso à agenda de um profissional.
   *
   * @param {string} ownerId
   * @param {string} viewerId
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function revokeAccess(ownerId, viewerId) {
    const repo = _getRepo()
    if (!repo) return { ok: false, error: 'repository_unavailable' }

    const result = await repo.setVisibility(ownerId, viewerId, 'none')
    if (result.ok) await refresh()
    return result
  }

  /**
   * Cria ou atualiza o perfil clínico de um profissional.
   *
   * @param {object} params — ver AgendaVisibilityRepository.upsertProfessionalProfile
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function upsertProfile(params) {
    const repo = _getRepo()
    if (!repo) return { ok: false, error: 'repository_unavailable' }

    const result = await repo.upsertProfessionalProfile(params)
    if (result.ok) await refresh()
    return result
  }

  /**
   * Força recarregamento do cache a partir do backend.
   * Notifica todos os listeners registrados com os novos dados.
   *
   * @returns {Promise<boolean>}
   */
  async function refresh() {
    _loading = false  // permite re-init
    return init()
  }

  /**
   * Inscreve um listener para ser notificado quando o cache muda.
   * Útil para a UI atualizar o seletor de profissionais automaticamente.
   *
   * @param {function(ProfessionalAccess[]):void} fn
   */
  function onChange(fn) {
    if (typeof fn === 'function' && !_listeners.includes(fn)) {
      _listeners.push(fn)
    }
  }

  /**
   * Remove um listener previamente inscrito.
   * @param {function} fn
   */
  function offChange(fn) {
    _listeners = _listeners.filter(l => l !== fn)
  }

  // ── Inicialização automática após auth ──────────────────────────────────
  // O serviço carrega automaticamente quando o login completa.
  document.addEventListener('clinicai:auth-success', () => {
    init().catch(e => console.warn('[AgendaAccessService] auto-init:', e))
  })

  // ── Exposição global ────────────────────────────────────────────────────
  window.AgendaAccessService = Object.freeze({
    init,
    getAll,
    getPermission,
    canView,
    canEdit,
    grantAccess,
    revokeAccess,
    upsertProfile,
    refresh,
    onChange,
    offChange,
  })

})()
