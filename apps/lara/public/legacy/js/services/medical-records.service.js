/**
 * ClinicAI — Medical Records Service
 *
 * Lógica de negócio para o módulo de prontuário eletrônico.
 * Cache em localStorage + sync com Supabase (Supabase é a fonte de verdade para leitura).
 * Graceful degradation: funciona sem Supabase (só cache local).
 *
 * Depende de:
 *   MedicalRecordsRepository  (medical-records.repository.js)
 *   PermissionsService        (permissions.service.js)
 *
 * API pública (window.MedicalRecordsService):
 *   listForPatient(patientId, opts)        — lista paginada com cache local
 *   getPatientSummary(patientId)           — contadores por tipo
 *   create(params)                         — cria registro
 *   update(id, changes)                    — edita registro
 *   remove(id)                             — soft delete
 *   canCreate()                            — boolean: pode criar?
 *   canEdit(record)                        — boolean: pode editar este registro?
 *   canDelete(record)                      — boolean: pode deletar este registro?
 */

;(function () {
  'use strict'

  if (window._clinicaiMrServiceLoaded) return
  window._clinicaiMrServiceLoaded = true

  // ── Chave de cache localStorage ───────────────────────────────
  const CACHE_PREFIX = 'clinicai_mr_'

  function _cacheKey(patientId) { return CACHE_PREFIX + patientId }

  // ── Helpers de acesso ─────────────────────────────────────────
  function _repo()  { return window.MedicalRecordsRepository || null }
  function _perms() { return window.PermissionsService        || null }

  function _currentUid() {
    const profile = typeof window.getCurrentProfile === 'function'
      ? window.getCurrentProfile() : null
    return profile?.id || null
  }

  function _currentRole() {
    const profile = typeof window.getCurrentProfile === 'function'
      ? window.getCurrentProfile() : null
    return profile?.role || null
  }

  // ── Permissões ────────────────────────────────────────────────
  function canCreate() {
    const perms = _perms()
    return perms ? perms.can('prontuario:create') : false
  }

  function canEdit(record) {
    if (!record) return false
    const role = _currentRole()
    if (role === 'admin' || role === 'owner') return true
    return record.professional_id === _currentUid()
  }

  function canDelete(record) {
    return canEdit(record)
  }

  // ── Cache localStorage ────────────────────────────────────────
  function _readCache(patientId) {
    try {
      return JSON.parse(localStorage.getItem(_cacheKey(patientId)) || 'null')
    } catch { return null }
  }

  function _writeCache(patientId, records) {
    try {
      localStorage.setItem(_cacheKey(patientId), JSON.stringify(records))
    } catch (e) {
      if (e.name !== 'QuotaExceededError') console.warn('[MedicalRecordsService] cache:', e)
    }
  }

  function _invalidateCache(patientId) {
    try { localStorage.removeItem(_cacheKey(patientId)) } catch {}
  }

  // ── listForPatient ────────────────────────────────────────────
  /**
   * Retorna lista paginada de registros.
   * Se Supabase indisponível, retorna cache local (página 0 apenas).
   *
   * @param {string} patientId
   * @param {object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @param {string|null} [opts.typeFilter]
   * @returns {Promise<{records, total, has_more, fromCache}>}
   */
  async function listForPatient(patientId, opts = {}) {
    const { limit = 20, offset = 0, typeFilter = null } = opts
    const repo = _repo()

    if (!repo) {
      const cached = _readCache(patientId) || []
      const filtered = typeFilter ? cached.filter(r => r.record_type === typeFilter) : cached
      const page = filtered.slice(offset, offset + limit)
      return { records: page, total: filtered.length, has_more: false, fromCache: true }
    }

    const result = await repo.listForPatient(patientId, { limit, offset, typeFilter })

    if (!result.ok) {
      console.warn('[MedicalRecordsService] Supabase indisponível, usando cache:', result.error)
      const cached = _readCache(patientId) || []
      const filtered = typeFilter ? cached.filter(r => r.record_type === typeFilter) : cached
      const page = filtered.slice(offset, offset + limit)
      return { records: page, total: filtered.length, has_more: false, fromCache: true }
    }

    const { records, total, has_more } = result.data

    // Atualiza cache local com página 0 (sem filtro) para fallback
    if (offset === 0 && !typeFilter) {
      _writeCache(patientId, records)
    }

    return { records, total, has_more, fromCache: false }
  }

  // ── getPatientSummary ─────────────────────────────────────────
  /**
   * @param {string} patientId
   * @returns {Promise<{total, last_record, by_type}>}
   */
  async function getPatientSummary(patientId) {
    const repo = _repo()
    const fallback = { total: 0, last_record: null, by_type: {} }

    if (!repo) return fallback

    const result = await repo.getPatientSummary(patientId)
    if (!result.ok) {
      console.warn('[MedicalRecordsService] summary indisponível:', result.error)
      return fallback
    }
    return result.data || fallback
  }

  // ── create ────────────────────────────────────────────────────
  /**
   * Cria um novo registro. Requer permissão 'prontuario:create'.
   * @param {object} params
   * @returns {Promise<{ok, id?, error?}>}
   */
  async function create(params) {
    if (!canCreate()) return { ok: false, error: 'Permissão insuficiente para criar registro' }

    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    if (!params.content?.trim()) return { ok: false, error: 'O conteúdo do registro não pode estar vazio' }

    const result = await repo.create(params)
    if (!result.ok) return { ok: false, error: result.error }

    _invalidateCache(params.patientId)
    return { ok: true, id: result.data?.id }
  }

  // ── update ────────────────────────────────────────────────────
  /**
   * Edita um registro existente.
   * @param {string} id
   * @param {object} record  — registro completo (para checar permissão)
   * @param {object} changes — { title?, content?, recordType?, isConfidential? }
   * @returns {Promise<{ok, error?}>}
   */
  async function update(id, record, changes) {
    if (!canEdit(record)) return { ok: false, error: 'Somente o autor ou administrador pode editar este registro' }

    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    if (changes.content !== undefined && !changes.content?.trim()) {
      return { ok: false, error: 'O conteúdo do registro não pode estar vazio' }
    }

    const result = await repo.update(id, changes)
    if (!result.ok) return { ok: false, error: result.error }

    _invalidateCache(record.patient_id)
    return { ok: true }
  }

  // ── remove ────────────────────────────────────────────────────
  /**
   * Soft delete de um registro.
   * @param {string} id
   * @param {object} record — registro completo (para checar permissão e invalidar cache)
   * @returns {Promise<{ok, error?}>}
   */
  async function remove(id, record) {
    if (!canDelete(record)) return { ok: false, error: 'Somente o autor ou administrador pode remover este registro' }

    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    const result = await repo.remove(id)
    if (!result.ok) return { ok: false, error: result.error }

    _invalidateCache(record.patient_id)
    return { ok: true }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.MedicalRecordsService = Object.freeze({
    listForPatient,
    getPatientSummary,
    create,
    update,
    remove,
    canCreate,
    canEdit,
    canDelete,
  })

})()
