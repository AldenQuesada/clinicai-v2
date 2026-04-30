/**
 * ClinicAI - Report Luxury Templates Service
 *
 * Cache em memoria + load do banco + save por chave.
 * Renderer usa get(key) que faz fallback aos defaults.
 *
 * API:
 *   load()              -> Promise<map>      (carrega tudo do banco e cacheia)
 *   get(key)            -> string             (overrides ? defaults)
 *   getRaw(key)         -> string|null        (so override do banco)
 *   set(key, value)     -> Promise<void>      (upsert + atualiza cache)
 *   reset(key)          -> Promise<void>      (delete + remove do cache)
 *   isLoaded()          -> bool
 */
;(function () {
  'use strict'
  if (window._reportLuxuryTemplatesServiceLoaded) return
  window._reportLuxuryTemplatesServiceLoaded = true

  var _cache = {}
  var _loaded = false
  var _loadingPromise = null

  function _sb() { return window._sbShared || window.supabaseClient || null }
  function _defaults() { return window.ReportLuxuryTemplatesDefaults }

  function _load() {
    if (_loadingPromise) return _loadingPromise
    var sb = _sb()
    if (!sb) {
      _loaded = true
      return Promise.resolve(_cache)
    }
    _loadingPromise = sb.rpc('report_template_load_all').then(function (res) {
      if (res.error) {
        console.warn('[ReportTemplates] load:', res.error)
      } else if (Array.isArray(res.data)) {
        res.data.forEach(function (row) { _cache[row.template_key] = row.value })
      }
      _loaded = true
      _loadingPromise = null
      return _cache
    }).catch(function (e) {
      console.warn('[ReportTemplates] load catch:', e)
      _loaded = true
      _loadingPromise = null
      return _cache
    })
    return _loadingPromise
  }

  function _get(key) {
    if (_cache[key] != null) return _cache[key]
    var d = _defaults()
    return d ? d.getDefault(key) : null
  }

  function _getRaw(key) {
    return _cache[key] != null ? _cache[key] : null
  }

  function _set(key, value) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('report_template_upsert', { p_key: key, p_value: value }).then(function (res) {
      if (res.error) throw res.error
      _cache[key] = value
    })
  }

  function _reset(key) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('report_template_reset', { p_key: key }).then(function (res) {
      if (res.error) throw res.error
      delete _cache[key]
    })
  }

  window.ReportLuxuryTemplates = {
    load:      _load,
    get:       _get,
    getRaw:    _getRaw,
    set:       _set,
    reset:     _reset,
    isLoaded:  function () { return _loaded },
  }

  // Auto-load no boot — assim o renderer nao precisa esperar
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(_load, 500)  // pequena espera para sb shared estar pronto
  })
})()
