/**
 * ClinicAI — Consent Manager (LGPD)
 *
 * API unificada de consentimento pra pixels e trackers. Centraliza o estado
 * de opt-in/opt-out salvo em localStorage + expoe helpers pra gatear
 * injecao de pixels (Facebook, Google, TikTok, GTM) por categoria.
 *
 * Categorias:
 *   - necessary  — sempre true (funcionamento da pagina)
 *   - analytics  — GA4, metricas, heatmap
 *   - marketing  — FB Pixel, TikTok, GTM, remarketing
 *
 * API:
 *   window.ClinicConsent.get()            → { necessary, analytics, marketing, version, timestamp }
 *   window.ClinicConsent.isGranted(cat)   → boolean
 *   window.ClinicConsent.grant(cats[])    → persiste { necessary, ...cats granted }
 *   window.ClinicConsent.revoke()         → persiste so necessary
 *   window.ClinicConsent.onChange(cb)     → subscribe a mudancas (returns unsubscribe)
 *
 * Compat com LPBLgpdBanner: escuta mesma key `lpb_lgpd_consent::<slug>`
 * e faz bridge — quando lp-builder banner salva consent, ClinicConsent reflete.
 *
 * Uso:
 *   if (ClinicConsent.isGranted('marketing')) {
 *     injectFbPixel(id)
 *   }
 *
 * Refs:
 *   - code-review/lp-builder.md C5 — pixels antes de consent
 *   - code-review/quiz.md M6 — quiz pixels sem gate
 */
;(function () {
  'use strict'

  if (window.ClinicConsent) return

  var STORAGE_KEY = 'clinicai_consent'
  var CURRENT_VERSION = '1.0'
  var VALID_CATEGORIES = { necessary: 1, analytics: 1, marketing: 1 }

  var _listeners = []

  function _safeGet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      var parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed
    } catch (e) { return null }
  }

  function _safeSet(record) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)) } catch (e) {}
  }

  function _emit(record) {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](record) } catch (e) { /* no-op */ }
    }
    try {
      document.dispatchEvent(new CustomEvent('clinicai:consent-changed', { detail: record }))
    } catch (e) { /* no-op */ }
  }

  function get() {
    var rec = _safeGet()
    if (!rec) {
      // Default: so necessary ate user decidir. NAO assume consent.
      return {
        necessary: true,
        analytics: false,
        marketing: false,
        version:   CURRENT_VERSION,
        timestamp: null,   // null = ainda nao decidiu
      }
    }
    return {
      necessary: true,
      analytics: !!rec.analytics,
      marketing: !!rec.marketing,
      version:   String(rec.version || CURRENT_VERSION),
      timestamp: rec.timestamp || null,
    }
  }

  function isGranted(category) {
    if (category === 'necessary') return true
    if (!VALID_CATEGORIES[category]) return false
    var rec = get()
    if (!rec.timestamp) return false   // user nao decidiu ainda — gate
    return !!rec[category]
  }

  function hasDecided() {
    var rec = get()
    return !!rec.timestamp
  }

  function grant(categories) {
    if (!Array.isArray(categories)) categories = []
    var record = {
      necessary: true,
      analytics: categories.indexOf('analytics') !== -1,
      marketing: categories.indexOf('marketing') !== -1,
      version:   CURRENT_VERSION,
      timestamp: new Date().toISOString(),
    }
    _safeSet(record)
    _emit(record)
    return record
  }

  function revoke() {
    var record = {
      necessary: true,
      analytics: false,
      marketing: false,
      version:   CURRENT_VERSION,
      timestamp: new Date().toISOString(),
    }
    _safeSet(record)
    _emit(record)
    return record
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return function () {}
    _listeners.push(cb)
    return function unsubscribe() {
      var i = _listeners.indexOf(cb)
      if (i !== -1) _listeners.splice(i, 1)
    }
  }

  // Bridge: se LPBLgpdBanner salvou consent por slug, espelha pra ClinicConsent
  // (so a primeira vez — lp-builder tem seu proprio store). Prioridade pra
  // ClinicConsent (mais recente).
  function _bridgeLpbBanner() {
    try {
      var existing = _safeGet()
      if (existing && existing.timestamp) return  // ja decidido aqui
      // Procura qualquer chave lpb_lgpd_consent::*
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i)
        if (key && key.indexOf('lpb_lgpd_consent::') === 0) {
          var raw = localStorage.getItem(key)
          if (raw) {
            var parsed = JSON.parse(raw)
            if (parsed && (parsed.analytics !== undefined || parsed.marketing !== undefined)) {
              // Espelha
              var record = {
                necessary: true,
                analytics: !!parsed.analytics,
                marketing: !!parsed.marketing,
                version:   String(parsed.version || CURRENT_VERSION),
                timestamp: parsed.timestamp || new Date().toISOString(),
              }
              _safeSet(record)
              return
            }
          }
        }
      }
    } catch (e) { /* no-op */ }
  }

  _bridgeLpbBanner()

  window.ClinicConsent = Object.freeze({
    get:         get,
    isGranted:   isGranted,
    hasDecided:  hasDecided,
    grant:       grant,
    revoke:      revoke,
    onChange:    onChange,
    STORAGE_KEY: STORAGE_KEY,
    VERSION:     CURRENT_VERSION,
  })
})()
