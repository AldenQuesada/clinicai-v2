/**
 * BroadcastService
 *
 * Orquestra operacoes de broadcasting (disparo em massa):
 * CRUD + start/cancel via BroadcastRepository.
 *
 * Dependencias:
 *   BroadcastRepository  (broadcast.repository.js)
 *
 * API publica (window.BroadcastService):
 *   loadBroadcasts()        -> {ok, data:[]}
 *   createBroadcast(data)   -> {ok, data:{id, total_targets}}
 *     data: {name, content, media_url?, media_caption?, target_filter?,
 *            batch_size?, batch_interval_min?, selected_lead_ids?}
 *   startBroadcast(id)      -> {ok, data:{enqueued, estimated_minutes}}
 *   cancelBroadcast(id)     -> {ok, data:{removed_from_outbox}}
 */
;(function () {
  'use strict'

  if (window.BroadcastService) return

  // ── Helpers ─────────────────────────────────────────────────

  function _repo() { return window.BroadcastRepository }

  function _unavailable() {
    return { ok: false, error: 'BroadcastRepository nao carregado' }
  }

  // ── loadBroadcasts ──────────────────────────────────────────

  async function loadBroadcasts() {
    if (!_repo()) return _unavailable()
    return _repo().list()
  }

  // ── createBroadcast ─────────────────────────────────────────

  async function createBroadcast(data) {
    if (!_repo()) return _unavailable()
    if (!data || !data.name || !data.content) {
      return { ok: false, error: 'name e content sao obrigatorios' }
    }
    var hasFilters = data.target_filter && Object.keys(data.target_filter).length > 0
    var hasManual = data.selected_lead_ids && data.selected_lead_ids.length > 0
    if (!hasFilters && !hasManual) {
      return { ok: false, error: 'Selecione pelo menos um filtro ou um lead manualmente' }
    }
    return _repo().create(data)
  }

  // ── startBroadcast ──────────────────────────────────────────

  async function startBroadcast(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().start(id)
  }

  // ── cancelBroadcast ─────────────────────────────────────────

  async function cancelBroadcast(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().cancel(id)
  }

  // ── Expose ──────────────────────────────────────────────────

  async function deleteBroadcast(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().remove(id)
  }

  async function rescheduleBroadcast(id, data) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().reschedule(id, data)
  }

  async function updateBroadcast(id, data) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().update(id, data)
  }

  async function getBroadcastStats(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().stats(id)
  }

  async function getBroadcastLeads(id, segment) {
    if (!_repo()) return _unavailable()
    return _repo().leads(id, segment)
  }

  window.BroadcastService = Object.freeze({
    loadBroadcasts,
    createBroadcast,
    startBroadcast,
    cancelBroadcast,
    deleteBroadcast,
    rescheduleBroadcast,
    updateBroadcast,
    getBroadcastStats,
    getBroadcastLeads,
  })
})()
