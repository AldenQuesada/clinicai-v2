/**
 * ClinicAI — Medical Records Repository
 *
 * Acesso puro ao Supabase para o módulo de prontuário.
 * Sem lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   mr_list_for_patient(patient_id, limit, offset, type_filter)
 *   mr_create(patient_id, record_type, title, content, appointment_id, is_confidential)
 *   mr_update(id, title, content, record_type, is_confidential)
 *   mr_delete(id)                   — soft delete
 *   mr_get_patient_summary(patient_id)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiMrRepoLoaded) return
  window._clinicaiMrRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── listForPatient ────────────────────────────────────────────
  /**
   * Lista registros paginados de um paciente.
   * @param {string} patientId
   * @param {object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @param {string|null} [opts.typeFilter]
   * @returns {Promise<{ok, data: {records, total, has_more}, error}>}
   */
  async function listForPatient(patientId, { limit = 20, offset = 0, typeFilter = null } = {}) {
    try {
      const { data, error } = await _sb().rpc('mr_list_for_patient', {
        p_patient_id:  patientId,
        p_limit:       limit,
        p_offset:      offset,
        p_type_filter: typeFilter,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── create ────────────────────────────────────────────────────
  /**
   * @param {object} params
   * @param {string}  params.patientId
   * @param {string}  params.recordType
   * @param {string}  params.title
   * @param {string}  params.content
   * @param {string|null} [params.appointmentId]
   * @param {boolean} [params.isConfidential]
   * @returns {Promise<{ok, data: {id}, error}>}
   */
  async function create({ patientId, recordType, title, content, appointmentId = null, isConfidential = false }) {
    try {
      const { data, error } = await _sb().rpc('mr_create', {
        p_patient_id:      patientId,
        p_record_type:     recordType,
        p_title:           title      || '',
        p_content:         content,
        p_appointment_id:  appointmentId,
        p_is_confidential: isConfidential,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── update ────────────────────────────────────────────────────
  /**
   * @param {string} id
   * @param {object} changes  — { title?, content?, recordType?, isConfidential? }
   */
  async function update(id, { title = null, content = null, recordType = null, isConfidential = null } = {}) {
    try {
      const { data, error } = await _sb().rpc('mr_update', {
        p_id:              id,
        p_title:           title,
        p_content:         content,
        p_record_type:     recordType,
        p_is_confidential: isConfidential,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── remove (soft delete) ──────────────────────────────────────
  /**
   * @param {string} id
   */
  async function remove(id) {
    try {
      const { data, error } = await _sb().rpc('mr_delete', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getPatientSummary ─────────────────────────────────────────
  /**
   * @param {string} patientId
   * @returns {Promise<{ok, data: {total, last_record, by_type}, error}>}
   */
  async function getPatientSummary(patientId) {
    try {
      const { data, error } = await _sb().rpc('mr_get_patient_summary', {
        p_patient_id: patientId,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── search (full-text server-side) ─────────────────────────────
  /**
   * @param {string} patientId
   * @param {string} query
   * @param {number} [limit=20]
   */
  async function search(patientId, query, limit = 20) {
    try {
      const { data, error } = await _sb().rpc('mr_search', {
        p_patient_id: patientId,
        p_query:      query,
        p_limit:      limit,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.MedicalRecordsRepository = Object.freeze({
    listForPatient,
    create,
    update,
    remove,
    getPatientSummary,
    search,
  })

})()
