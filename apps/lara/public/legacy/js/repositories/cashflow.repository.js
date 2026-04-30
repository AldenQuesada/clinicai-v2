/**
 * ClinicAI — Cashflow Repository
 * Camada de acesso ao Supabase via RPCs cashflow_*
 */
;(function () {
  'use strict'
  if (window._clinicaiCashflowRepoLoaded) return
  window._clinicaiCashflowRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) nao inicializado')
    return sb
  }
  function _ok(data) { return { ok: true, data, error: null } }
  function _err(e)   { return { ok: false, data: null, error: String(e || 'erro desconhecido') } }

  async function create(entry) {
    try {
      const { data, error } = await _sb().rpc('cashflow_create_entry', { p_data: entry })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function update(id, patch) {
    try {
      const { data, error } = await _sb().rpc('cashflow_update_entry', { p_id: id, p_data: patch })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function remove(id) {
    try {
      const { data, error } = await _sb().rpc('cashflow_delete_entry', { p_id: id })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function list(filters) {
    filters = filters || {}
    try {
      const { data, error } = await _sb().rpc('cashflow_list_entries', {
        p_start_date:        filters.startDate || null,
        p_end_date:          filters.endDate   || null,
        p_direction:         filters.direction || null,
        p_method:            filters.method    || null,
        p_only_unreconciled: !!filters.onlyUnreconciled,
        p_limit:             filters.limit     || 500,
      })
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function summary(startDate, endDate) {
    try {
      const { data, error } = await _sb().rpc('cashflow_summary', {
        p_start_date: startDate,
        p_end_date:   endDate,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function linkAppointment(entryId, appointmentId, patientId) {
    try {
      const { data, error } = await _sb().rpc('cashflow_link_appointment', {
        p_entry_id:       entryId,
        p_appointment_id: appointmentId,
        p_patient_id:     patientId || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function searchAppointments(amount, date, toleranceDays) {
    try {
      const { data, error } = await _sb().rpc('cashflow_search_appointments', {
        p_amount:         amount,
        p_date:           date,
        p_tolerance_days: toleranceDays || 2,
      })
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function autoReconcile(startDate, endDate, toleranceDays, amountTolerance) {
    try {
      const { data, error } = await _sb().rpc('cashflow_auto_reconcile', {
        p_start_date:       startDate || null,
        p_end_date:         endDate   || null,
        p_tolerance_days:   toleranceDays   || 2,
        p_amount_tolerance: amountTolerance || 0.50,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getSuggestions(startDate, endDate, limit) {
    try {
      const { data, error } = await _sb().rpc('cashflow_get_suggestions', {
        p_start_date: startDate || null,
        p_end_date:   endDate   || null,
        p_limit:      limit     || 50,
      })
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function getIntelligence(year, month) {
    try {
      const { data, error } = await _sb().rpc('cashflow_intelligence', {
        p_year:  year  || null,
        p_month: month || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getDre(year, month) {
    try {
      const { data, error } = await _sb().rpc('cashflow_dre', {
        p_year:  year  || null,
        p_month: month || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getConfig() {
    try {
      const { data, error } = await _sb().rpc('cashflow_get_config')
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function saveConfig(data) {
    try {
      const { data: res, error } = await _sb().rpc('cashflow_save_config', { p_data: data })
      if (error) return _err(error.message || error)
      return _ok(res)
    } catch (e) { return _err(e.message || e) }
  }

  async function getSegments(year, month) {
    try {
      const { data, error } = await _sb().rpc('cashflow_segments', {
        p_year:  year  || null,
        p_month: month || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getPatientsLtv(limit, onlyActive) {
    try {
      const { data, error } = await _sb().rpc('cashflow_patients_ltv', {
        p_limit: limit || 100,
        p_only_active: !!onlyActive,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getVipSumidos(minDays, maxDays, limit) {
    try {
      const { data, error } = await _sb().rpc('cashflow_vip_sumidos', {
        p_min_days: minDays || 60,
        p_max_days: maxDays || 180,
        p_limit:    limit   || 20,
      })
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function getTrends(year, month) {
    try {
      const { data, error } = await _sb().rpc('cashflow_trends', {
        p_year:  year  || null,
        p_month: month || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getDasEstimate(year, month) {
    try {
      const { data, error } = await _sb().rpc('cashflow_das_estimate', {
        p_year:  year  || null,
        p_month: month || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function getForecast(monthsAhead) {
    try {
      const { data, error } = await _sb().rpc('cashflow_forecast', {
        p_months_ahead: monthsAhead || 6,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function rejectSuggestion(entryId) {
    try {
      const { data, error } = await _sb().rpc('cashflow_reject_suggestion', { p_entry_id: entryId })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  window.CashflowRepository = Object.freeze({
    create,
    update,
    remove,
    list,
    summary,
    linkAppointment,
    searchAppointments,
    autoReconcile,
    getSuggestions,
    rejectSuggestion,
    getIntelligence,
    getDre,
    getConfig,
    saveConfig,
    getSegments,
    getPatientsLtv,
    getVipSumidos,
    getTrends,
    getDasEstimate,
    getForecast,
  })
})()
