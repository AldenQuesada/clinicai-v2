/**
 * ClinicAI — Anamnesis Repository
 *
 * Acesso puro ao Supabase para anamnese.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   sdr_get_wa_templates()
 *   sdr_upsert_wa_template(p_id, p_type, p_name, p_message, p_day, p_active, p_sort_order)
 *   sdr_delete_wa_template(p_id)
 *   create_anamnesis_request(p_clinic_id, p_patient_id, p_template_id, p_expires_at)
 *   revoke_anamnesis_request(p_id)
 *
 * Tabelas acessadas via .from():
 *   anamnesis_templates  — templates de anamnese da clínica
 *   anamnesis_requests   — solicitações de preenchimento
 *   anamnesis_responses  — respostas preenchidas
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiAnamnesisRepoLoaded) return
  window._clinicaiAnamnesisRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)  { return { ok: true,  data: data,  error: null  } }
  function _err(e)    { return { ok: false, data: null,  error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }

  // ── getTemplates ──────────────────────────────────────────────
  /**
   * Lista templates de anamnese de uma clínica.
   * @param {string} clinicId
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getTemplates(clinicId) {
    try {
      var { data, error } = await _sb()
        .from('anamnesis_templates')
        .select('id,name,description')
        .eq('clinic_id', clinicId)
        .order('name')
      if (error) return _err(error)
      return _ok(data || [])
    } catch (e) { return _err(e) }
  }

  // ── getRequests ───────────────────────────────────────────────
  /**
   * Lista solicitações de anamnese com dados do paciente.
   * @param {string} clinicId
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getRequests(clinicId) {
    try {
      var { data, error } = await _sb()
        .from('anamnesis_requests')
        .select('*, patient:anamnesis_templates(id,name)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
      if (error) return _err(error)
      return _ok(data || [])
    } catch (e) { return _err(e) }
  }

  // ── createRequest ─────────────────────────────────────────────
  /**
   * Cria uma solicitação de preenchimento de anamnese via RPC.
   * @param {string} clinicId
   * @param {string} patientId
   * @param {string} templateId
   * @param {string|null} expiresAt  — ISO timestamp de expiração
   * @returns {Promise<{ok, data, error}>}
   */
  async function createRequest(clinicId, patientId, templateId, expiresAt) {
    try {
      var { data, error } = await _sb().rpc('create_anamnesis_request', {
        p_clinic_id:   clinicId,
        p_patient_id:  patientId,
        p_template_id: templateId,
        p_expires_at:  expiresAt || null,
      })
      if (error) return _err(error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── getResponses ──────────────────────────────────────────────
  /**
   * Lista respostas de anamnese de uma clínica.
   * @param {string} clinicId
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getResponses(clinicId) {
    try {
      var { data, error } = await _sb()
        .from('anamnesis_responses')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
      if (error) return _err(error)
      return _ok(data || [])
    } catch (e) { return _err(e) }
  }

  // ── revokeRequest ─────────────────────────────────────────────
  /**
   * Revoga uma solicitação de anamnese via RPC ou update de status.
   * @param {string} requestId
   * @returns {Promise<{ok, data, error}>}
   */
  async function revokeRequest(requestId) {
    try {
      // Tenta RPC dedicada; se não existir, atualiza o campo status diretamente
      var { data, error } = await _sb().rpc('revoke_anamnesis_request', {
        p_id: requestId,
      })
      if (error) {
        // Fallback: update direto na tabela
        var { data: upData, error: upError } = await _sb()
          .from('anamnesis_requests')
          .update({ status: 'revogado' })
          .eq('id', requestId)
        if (upError) return _err(upError)
        return _ok(upData)
      }
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── getWaTemplates ────────────────────────────────────────────
  /**
   * Lista templates de mensagem WhatsApp via RPC (usado em agenda-mensagens.js).
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getWaTemplates() {
    try {
      var { data, error } = await _sb().rpc('sdr_get_wa_templates')
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data && data.data ? data.data : [])
    } catch (e) { return _err(e) }
  }

  // ── upsertWaTemplate ──────────────────────────────────────────
  /**
   * Cria ou atualiza um template de mensagem WhatsApp.
   * @param {object} msg  — objeto com {id?, type, name, message, day, active}
   * @returns {Promise<{ok, data, error}>}
   */
  async function upsertWaTemplate(msg) {
    try {
      var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(msg.id || ''))
      var { data, error } = await _sb().rpc('sdr_upsert_wa_template', {
        p_id:         isUUID ? msg.id : null,
        p_type:       msg.type       || 'confirmacao',
        p_name:       msg.name       || 'Mensagem',
        p_message:    msg.message    || '',
        p_day:        msg.day        !== undefined ? msg.day : 0,
        p_active:     msg.active     !== undefined ? msg.active : true,
        p_sort_order: msg.sort_order || 0,
      })
      if (error) return _err(error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── deleteWaTemplate ──────────────────────────────────────────
  /**
   * Remove um template de mensagem WhatsApp.
   * @param {string} msgId  — UUID do template
   * @returns {Promise<{ok, data, error}>}
   */
  async function deleteWaTemplate(msgId) {
    try {
      var { data, error } = await _sb().rpc('sdr_delete_wa_template', { p_id: msgId })
      if (error) return _err(error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AnamnesisRepository = Object.freeze({
    getTemplates,
    getRequests,
    createRequest,
    getResponses,
    revokeRequest,
    getWaTemplates,
    upsertWaTemplate,
    deleteWaTemplate,
  })

})()
