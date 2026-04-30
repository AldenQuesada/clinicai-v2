/**
 * ClinicAI — Pluggy Repository
 * Wrapper das RPCs pluggy_*
 */
;(function () {
  'use strict'
  if (window._clinicaiPluggyRepoLoaded) return
  window._clinicaiPluggyRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) nao inicializado')
    return sb
  }
  function _ok(data) { return { ok: true, data, error: null } }
  function _err(e)   { return { ok: false, data: null, error: String(e || 'erro') } }

  async function registerConnection(data) {
    try {
      const { data: res, error } = await _sb().rpc('pluggy_register_connection', { p_data: data })
      if (error) return _err(error.message || error)
      return _ok(res)
    } catch (e) { return _err(e.message || e) }
  }

  async function listConnections() {
    try {
      const { data, error } = await _sb().rpc('pluggy_list_connections')
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function disconnect(id) {
    try {
      const { data, error } = await _sb().rpc('pluggy_disconnect', { p_id: id })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  window.PluggyRepository = Object.freeze({
    registerConnection,
    listConnections,
    disconnect,
  })
})()
