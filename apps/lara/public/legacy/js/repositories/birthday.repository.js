/**
 * ClinicAI — Birthday Repository
 *
 * Acesso puro ao Supabase para campanhas de aniversario.
 * Zero logica de negocio — apenas chamadas RPC com retorno normalizado.
 * Reaproveita padrao _rpc do projeto.
 *
 * RPCs consumidas:
 *   wa_birthday_stats(p_year)
 *   wa_birthday_upcoming(p_days)
 *   wa_birthday_templates_list()
 *   wa_birthday_template_save(...)
 *   wa_birthday_template_delete(p_id)
 *   wa_birthday_list(p_segment, p_status, p_month)
 *   wa_birthday_scan()
 *   wa_birthday_enqueue()
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayRepoLoaded) return
  window._clinicaiBirthdayRepoLoaded = true

  function _sb() { return window._sbShared || null }

  async function _rpc(name, params) {
    try {
      var sb = _sb()
      if (!sb) return { ok: false, data: null, error: 'Supabase not ready' }
      var res = await sb.rpc(name, params || {})
      if (res.error) return { ok: false, data: null, error: res.error.message }
      return { ok: true, data: res.data, error: null }
    } catch (e) { return { ok: false, data: null, error: e.message } }
  }

  // ── RPCs ───────────────────────────────────────────────────

  async function stats(year) {
    return _rpc('wa_birthday_stats', year ? { p_year: year } : {})
  }

  async function upcoming(days) {
    return _rpc('wa_birthday_upcoming', { p_days: days || 60 })
  }

  async function templatesList() {
    return _rpc('wa_birthday_templates_list')
  }

  async function templateSave(data) {
    return _rpc('wa_birthday_template_save', {
      p_id: data.id || null,
      p_day_offset: data.day_offset || 30,
      p_send_hour: data.send_hour || 13,
      p_label: data.label || 'Nova mensagem',
      p_content: data.content || '',
      p_media_url: data.media_url || null,
      p_media_position: data.media_position || 'above',
      p_is_active: data.is_active !== false,
      p_sort_order: data.sort_order || 99
    })
  }

  async function templateDelete(id) {
    return _rpc('wa_birthday_template_delete', { p_id: id })
  }

  async function list(segment, status, month) {
    var params = {}
    if (segment) params.p_segment = segment
    if (status) params.p_status = status
    if (month) params.p_month = month
    return _rpc('wa_birthday_list', params)
  }

  async function scan() {
    return _rpc('wa_birthday_scan')
  }

  async function enqueue() {
    return _rpc('wa_birthday_enqueue')
  }

  async function pauseAll() {
    return _rpc('wa_birthday_pause_all')
  }

  async function resumeAll() {
    return _rpc('wa_birthday_resume_all')
  }

  async function toggleLead(campaignId, active) {
    return _rpc('wa_birthday_toggle_lead', { p_campaign_id: campaignId, p_active: active })
  }

  async function autoExclude() {
    return _rpc('wa_birthday_auto_exclude')
  }

  // ── Expose ─────────────────────────────────────────────────

  window.BirthdayRepository = Object.freeze({
    stats, upcoming, templatesList, templateSave, templateDelete,
    list, scan, enqueue, pauseAll, resumeAll, toggleLead, autoExclude
  })
})()
