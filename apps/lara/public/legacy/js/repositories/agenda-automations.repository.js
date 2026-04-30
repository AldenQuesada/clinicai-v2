/**
 * ClinicAI — Agenda Automations Repository
 *
 * Acesso puro ao Supabase para regras de automacao da agenda.
 * RPCs: wa_agenda_auto_list, wa_agenda_auto_upsert,
 *       wa_agenda_auto_delete, wa_agenda_auto_toggle
 */
;(function () {
  'use strict'
  if (window._clinicaiAgendaAutoRepoLoaded) return
  window._clinicaiAgendaAutoRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase nao inicializado')
    return sb
  }

  async function list() {
    try {
      var { data, error } = await _sb().rpc('wa_agenda_auto_list')
      if (error) return { ok: false, data: [], error: error.message }
      return { ok: true, data: Array.isArray(data) ? data : [], error: null }
    } catch (e) { return { ok: false, data: [], error: e.message } }
  }

  async function upsert(ruleData) {
    try {
      var { data, error } = await _sb().rpc('wa_agenda_auto_upsert', { p_data: ruleData })
      if (error) return { ok: false, data: null, error: error.message }
      return { ok: true, data: data, error: null }
    } catch (e) { return { ok: false, data: null, error: e.message } }
  }

  async function remove(id) {
    try {
      var { data, error } = await _sb().rpc('wa_agenda_auto_delete', { p_id: id })
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data, error: null }
    } catch (e) { return { ok: false, error: e.message } }
  }

  async function toggle(id) {
    try {
      var { data, error } = await _sb().rpc('wa_agenda_auto_toggle', { p_id: id })
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data, error: null }
    } catch (e) { return { ok: false, error: e.message } }
  }

  window.AgendaAutomationsRepository = Object.freeze({ list, upsert, remove, toggle })
})()
