/**
 * ClinicAI — Broadcast Repository
 *
 * Acesso puro ao Supabase para o modulo de Broadcasting (disparo em massa).
 * Zero logica de negocio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   wa_broadcast_list()
 *   wa_broadcast_create(p_name, p_content, p_media_url, p_media_caption, p_target_filter, p_scheduled_at, p_batch_size, p_batch_interval_min, p_selected_lead_ids)
 *   wa_broadcast_start(p_broadcast_id)
 *   wa_broadcast_cancel(p_broadcast_id)
 *
 * Depende de:
 *   window.ClinicEnv — configuracao Supabase (SUPABASE_URL, SUPABASE_KEY)
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastRepoLoaded) return
  window._clinicaiBroadcastRepoLoaded = true

  function _sb() { return window._sbShared || null }

  async function _rpc(name, params = {}) {
    try {
      const sb = _sb()
      if (!sb) return { ok: false, data: null, error: 'Supabase not ready' }
      const res = await sb.rpc(name, params)
      if (res.error) return { ok: false, data: null, error: res.error.message }
      return { ok: true, data: res.data, error: null }
    } catch (e) { return { ok: false, data: null, error: e.message } }
  }

  // ── Broadcast ─────────────────────────────────────────────────

  async function list() {
    return _rpc('wa_broadcast_list_with_stats')
  }

  async function create(data) {
    return _rpc('wa_broadcast_create', {
      p_name: data.name,
      p_content: data.content,
      p_media_url: data.media_url || null,
      p_media_caption: data.media_caption || null,
      p_target_filter: data.target_filter || {},
      p_scheduled_at: data.scheduled_at || null,
      p_batch_size: data.batch_size || 10,
      p_batch_interval_min: data.batch_interval_min || 10,
      p_selected_lead_ids: data.selected_lead_ids && data.selected_lead_ids.length > 0 ? data.selected_lead_ids : null,
      p_media_position: data.media_position || 'above',
    })
  }

  async function start(id) {
    return _rpc('wa_broadcast_start', { p_broadcast_id: id })
  }

  async function cancel(id) {
    return _rpc('wa_broadcast_cancel', { p_broadcast_id: id })
  }

  async function remove(id) {
    return _rpc('wa_broadcast_delete', { p_broadcast_id: id })
  }

  async function stats(id) {
    return _rpc('wa_broadcast_stats', { p_broadcast_id: id })
  }

  async function leads(id, segment) {
    return _rpc('wa_broadcast_leads', { p_broadcast_id: id, p_segment: segment || 'all' })
  }

  async function reschedule(id, data) {
    return _rpc('wa_broadcast_reschedule', {
      p_broadcast_id: id,
      p_name: data.name,
      p_content: data.content,
      p_media_url: data.media_url || null,
      p_target_filter: data.target_filter || {},
      p_scheduled_at: data.scheduled_at || null,
      p_batch_size: data.batch_size || 10,
      p_batch_interval_min: data.batch_interval_min || 10,
      p_selected_lead_ids: data.selected_lead_ids && data.selected_lead_ids.length > 0 ? data.selected_lead_ids : null,
      p_media_position: data.media_position || 'above',
    })
  }

  async function update(id, data) {
    return _rpc('wa_broadcast_update', {
      p_broadcast_id: id,
      p_name: data.name || null,
      p_content: data.content || null,
      p_media_url: data.media_url !== undefined ? data.media_url : null,
      p_media_caption: data.media_caption || null,
      p_target_filter: data.target_filter || null,
      p_scheduled_at: data.scheduled_at || null,
      p_batch_size: data.batch_size || null,
      p_batch_interval_min: data.batch_interval_min || null,
      p_selected_lead_ids: data.selected_lead_ids && data.selected_lead_ids.length > 0 ? data.selected_lead_ids : null,
      p_media_position: data.media_position || null,
    })
  }

  // ── Expose ────────────────────────────────────────────────────

  window.BroadcastRepository = Object.freeze({
    list,
    create,
    update,
    reschedule,
    start,
    cancel,
    remove,
    stats,
    leads,
  })
})()
