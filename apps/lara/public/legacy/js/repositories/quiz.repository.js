/**
 * ClinicAI — Quiz Repository
 *
 * Acesso puro ao Supabase para quiz_templates e quiz_responses.
 * Zero lógica de negócio — apenas chamadas RPC/REST com retorno normalizado.
 *
 * Tabelas consumidas:
 *   quiz_templates  — definições de quizzes
 *   quiz_responses  — respostas submetidas
 *
 * RPC consumida:
 *   submit_quiz_response(...)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton (já inicializado no app)
 */

;(function () {
  'use strict'

  if (window._clinicaiQuizRepoLoaded) return
  window._clinicaiQuizRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── getTemplates ──────────────────────────────────────────
  /**
   * Lista todos os quiz_templates ativos de uma clínica.
   * @param {string} clinicId
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getTemplates(clinicId) {
    try {
      const { data, error } = await _sb()
        .from('quiz_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('active', true)
        .order('created_at', { ascending: false })

      if (error) return _err(error.message || String(error))
      return _ok(Array.isArray(data) ? data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getTemplate ───────────────────────────────────────────
  /**
   * Busca um quiz_template pelo slug (para páginas públicas, sem clinic_id).
   * @param {string} slug
   * @returns {Promise<{ok, data: object|null, error}>}
   */
  async function getTemplate(slug) {
    try {
      const { data, error } = await _sb()
        .from('quiz_templates')
        .select('*')
        .eq('slug', slug)
        .eq('active', true)
        .single()

      if (error) return _err(error.message || String(error))
      return _ok(data || null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── createTemplate ────────────────────────────────────────
  /**
   * Cria um novo quiz_template.
   * @param {string} clinicId
   * @param {object} data  — { slug, title, kanban_target, pipeline?, schema? }
   * @returns {Promise<{ok, data: object, error}>}
   */
  async function createTemplate(clinicId, templateData) {
    try {
      const payload = {
        clinic_id:     clinicId,
        slug:          templateData.slug,
        title:         templateData.title,
        kanban_target: templateData.kanban_target,
        pipeline:      templateData.pipeline || 'evolution',
        schema:        templateData.schema   || {},
        active:        true,
      }

      const { data, error } = await _sb()
        .from('quiz_templates')
        .insert([payload])
        .select()
        .single()

      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── updateTemplate ────────────────────────────────────────
  /**
   * Atualiza campos de um quiz_template existente.
   * Sempre atualiza updated_at.
   * @param {string} id
   * @param {object} updates  — campos a atualizar (slug, title, schema, etc.)
   * @returns {Promise<{ok, data: object, error}>}
   */
  async function updateTemplate(id, updates) {
    try {
      const payload = {
        ...updates,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await _sb()
        .from('quiz_templates')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── deleteTemplate ────────────────────────────────────────
  /**
   * Soft delete: marca o template como inativo (active=false).
   * @param {string} id
   * @returns {Promise<{ok, data: object, error}>}
   */
  async function deleteTemplate(id) {
    try {
      const { data, error } = await _sb()
        .from('quiz_templates')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── submitResponse ────────────────────────────────────────
  /**
   * Submete uma resposta de quiz via RPC (SECURITY DEFINER).
   * Cria quiz_response + lead em uma transação.
   *
   * @param {object} payload
   * @param {string} payload.quiz_id
   * @param {string} payload.clinic_id
   * @param {object} payload.answers
   * @param {number} payload.score
   * @param {string} payload.temperature  — 'hot' | 'warm' | 'cold'
   * @param {string} payload.contact_name
   * @param {string} payload.contact_phone
   * @param {string} [payload.contact_email]
   * @param {string} [payload.utm_source]
   * @param {string} [payload.utm_medium]
   * @param {string} [payload.utm_campaign]
   * @param {string} payload.kanban_target
   * @returns {Promise<{ok, data: {quiz_response_id, lead_id}, error}>}
   */
  async function submitResponse(payload) {
    try {
      const { data, error } = await _sb().rpc('submit_quiz_response', {
        p_quiz_id:       payload.quiz_id,
        p_clinic_id:     payload.clinic_id,
        p_answers:       payload.answers       || {},
        p_score:         payload.score         || 0,
        p_temperature:   payload.temperature   || 'cold',
        p_contact_name:  payload.contact_name  || '',
        p_contact_phone: payload.contact_phone || '',
        p_contact_email: payload.contact_email || null,
        p_utm_source:    payload.utm_source    || null,
        p_utm_medium:    payload.utm_medium    || null,
        p_utm_campaign:  payload.utm_campaign  || null,
        p_kanban_target: payload.kanban_target || '',
      })

      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getResponses ───────────────────────────────────────────
  /**
   * Lista respostas de um quiz com dados de contato.
   * @param {string} quizId
   * @param {object} [opts] - { limit, offset, from, to }
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getResponses(quizId, opts) {
    try {
      var q = _sb()
        .from('quiz_responses')
        .select('id, contact_name, contact_phone, contact_email, answers, score, temperature, submitted_at, utm_source, utm_medium, utm_campaign, lead_id, leads:lead_id(phase)')
        .eq('quiz_id', quizId)
        .order('submitted_at', { ascending: false })

      if (opts && opts.from) q = q.gte('submitted_at', opts.from)
      if (opts && opts.to)   q = q.lte('submitted_at', opts.to)
      if (opts && opts.limit)  q = q.limit(opts.limit)
      if (opts && opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 50) - 1)

      var res = await q
      if (res.error) return _err(res.error.message || String(res.error))
      var rows = Array.isArray(res.data) ? res.data : []
      // Extrair phase do join com leads
      rows = rows.map(function(r) {
        var phase = (r.leads && r.leads.phase) ? r.leads.phase : 'lead'
        r.phase = phase
        delete r.leads
        return r
      })
      return _ok(rows)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getAnalytics ─────────────────────────────────────────
  /**
   * Busca métricas agregadas via RPC quiz_analytics.
   * @param {string} quizId
   * @param {string} clinicId
   * @param {string} [from]  - ISO date
   * @param {string} [to]    - ISO date
   * @returns {Promise<{ok, data: object, error}>}
   */
  async function getAnalytics(quizId, clinicId, from, to) {
    try {
      var params = {
        p_quiz_id:   quizId,
        p_clinic_id: clinicId,
      }
      if (from) params.p_from = from
      if (to)   params.p_to   = to

      var res = await _sb().rpc('quiz_analytics', params)
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data || {})
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── trackEvent ───────────────────────────────────────────
  /**
   * Registra evento de tracking do quiz (fire-and-forget).
   * @param {object} payload
   * @returns {Promise<{ok, data, error}>}
   */
  async function trackEvent(payload) {
    try {
      var res = await _sb().rpc('insert_quiz_event', {
        p_quiz_id:       payload.quiz_id,
        p_clinic_id:     payload.clinic_id,
        p_session_id:    payload.session_id,
        p_event_type:    payload.event_type,
        p_step_index:    payload.step_index    != null ? payload.step_index : null,
        p_step_label:    payload.step_label    || null,
        p_contact_name:  payload.contact_name  || null,
        p_contact_phone: payload.contact_phone || null,
        p_utm_source:    payload.utm_source    || null,
        p_utm_medium:    payload.utm_medium    || null,
        p_utm_campaign:  payload.utm_campaign  || null,
        p_metadata:      payload.metadata      || {},
      })
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getAbandonedLeads ──────────────────────────────────────
  /**
   * Busca leads que abandonaram o quiz (step_view sem quiz_complete).
   * @param {string} quizId
   * @param {string} clinicId
   * @param {string} [from]  - ISO date
   * @param {string} [to]    - ISO date
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getAbandonedLeads(quizId, clinicId, from, to) {
    try {
      var params = {
        p_quiz_id:   quizId,
        p_clinic_id: clinicId,
      }
      if (from) params.p_from = from
      if (to)   params.p_to   = to

      var res = await _sb().rpc('quiz_abandoned_leads', params)
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getAlerts ──────────────────────────────────────────────
  async function getAlerts(quizId, clinicId, status) {
    try {
      var params = { p_quiz_id: quizId, p_clinic_id: clinicId }
      if (status) params.p_status = status
      var res = await _sb().rpc('quiz_get_alerts', params)
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── markAlertDone ─────────────────────────────────────────
  async function markAlertDone(alertId, doneBy) {
    try {
      var res = await _sb().rpc('quiz_mark_alert_done', {
        p_alert_id: alertId,
        p_done_by: doneBy || 'sdr',
      })
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getAlertCounts ────────────────────────────────────────
  async function getAlertCounts(quizId, clinicId) {
    try {
      var res = await _sb().rpc('quiz_alert_counts', {
        p_quiz_id: quizId,
        p_clinic_id: clinicId,
      })
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data || {})
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── rpc (chamada genérica) ──────────────────────────────────
  async function rpc(fnName, params) {
    try {
      var res = await _sb().rpc(fnName, params || {})
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── deleteAbandonedSessions ──────────────────────────────
  /**
   * Deleta quiz_events das sessoes abandonadas informadas.
   * @param {string} quizId
   * @param {string} clinicId
   * @param {string[]} sessionIds
   * @returns {Promise<{ok, data: {deleted:number}, error}>}
   */
  async function deleteAbandonedSessions(quizId, clinicId, sessionIds) {
    try {
      var res = await _sb().rpc('quiz_delete_abandoned_sessions', {
        p_quiz_id:     quizId,
        p_clinic_id:   clinicId,
        p_session_ids: sessionIds || [],
      })
      if (res.error) return _err(res.error.message || String(res.error))
      return _ok(res.data || { deleted: 0 })
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────
  window.QuizRepository = Object.freeze({
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    submitResponse,
    getResponses,
    getAnalytics,
    getAbandonedLeads,
    deleteAbandonedSessions,
    trackEvent,
    getAlerts,
    markAlertDone,
    getAlertCounts,
    rpc,
  })

})()
