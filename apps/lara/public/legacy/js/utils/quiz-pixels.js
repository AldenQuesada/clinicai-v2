/**
 * ClinicAI — Quiz Pixels Module
 *
 * Carrega pixels de terceiros (Facebook, Google, TikTok) dinamicamente
 * e dispara eventos padronizados nos pontos de conversão do quiz.
 *
 * Eventos disparados:
 *   PageView      — quiz carregou
 *   InitiateQuiz  — clicou Começar
 *   CompleteQuiz  — finalizou (LGPD confirmada)
 *   Lead          — lead criado (após submit)
 *   Contact       — clicou WhatsApp na tela final
 *
 * Uso:
 *   QuizPixels.init(pixelsConfig)  — carrega os scripts dos pixels
 *   QuizPixels.fire(eventName, data) — dispara evento em todos os pixels ativos
 */
;(function () {
  'use strict'

  if (window._clinicaiQuizPixelsLoaded) return
  window._clinicaiQuizPixelsLoaded = true

  var _config = {}
  var _loaded = { facebook: false, gtag: false, tiktok: false }

  // ── Loader helpers (inject script tag once) ────────────────────────────────
  function _loadScript(src, id, cb) {
    if (document.getElementById(id)) { if (cb) cb(); return }
    var s = document.createElement('script')
    s.id = id
    s.async = true
    s.src = src
    s.onload = function () { if (cb) cb() }
    s.onerror = function () { console.warn('[quiz-pixels] Failed to load:', src) }
    document.head.appendChild(s)
  }

  // ── Facebook Pixel ────────────────────────────────────────────────────────
  function _initFacebook(pixelId) {
    if (!pixelId || _loaded.facebook) return
    // fbq snippet inline (standard Meta initialization)
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', pixelId)
    window.fbq('track', 'PageView')
    _loaded.facebook = true
  }

  function _fireFacebook(event, data) {
    if (!_loaded.facebook || !window.fbq) return
    var map = {
      'PageView':      function() { /* already fired on init */ },
      'InitiateQuiz':  function() { window.fbq('trackCustom', 'InitiateQuiz', data || {}) },
      'CompleteQuiz':  function() { window.fbq('trackCustom', 'CompleteQuiz', data || {}) },
      'Lead':          function() { window.fbq('track', 'Lead', data || {}) },
      'Contact':       function() { window.fbq('track', 'Contact', data || {}) },
    }
    if (map[event]) map[event]()
  }

  // ── Google Tag (GA4 / GTM) ────────────────────────────────────────────────
  function _initGoogle(tagId) {
    if (!tagId || _loaded.gtag) return

    if (tagId.indexOf('GTM-') === 0) {
      // Google Tag Manager
      ;(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
      var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
      j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
      f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',tagId);
    } else {
      // GA4 (G-XXXXXXX)
      _loadScript('https://www.googletagmanager.com/gtag/js?id=' + tagId, 'gtag-script', function() {
        window.dataLayer = window.dataLayer || []
        window.gtag = function() { window.dataLayer.push(arguments) }
        window.gtag('js', new Date())
        window.gtag('config', tagId)
      })
    }
    _loaded.gtag = true
  }

  function _fireGoogle(event, data) {
    if (!_loaded.gtag) return
    // GTM uses dataLayer
    if (window.dataLayer) {
      window.dataLayer.push(Object.assign({ event: event }, data || {}))
    }
    // GA4 uses gtag
    if (window.gtag) {
      window.gtag('event', event, data || {})
    }
  }

  // ── Google Ads Conversion ─────────────────────────────────────────────────
  function _fireGoogleAds(event, data) {
    if (!_config.google_ads_id || !window.gtag) return
    // Only fire conversion on Lead/CompleteQuiz
    if (event === 'Lead' || event === 'CompleteQuiz') {
      window.gtag('event', 'conversion', {
        send_to: _config.google_ads_id + '/' + (_config.google_ads_label || ''),
      })
    }
  }

  // ── TikTok Pixel ──────────────────────────────────────────────────────────
  function _initTikTok(pixelId) {
    if (!pixelId || _loaded.tiktok) return
    !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=
    ["page","track","identify","instances","debug","on","off","once","ready","alias",
    "group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){
    t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;
    i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],
    n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){
    var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];
    ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e+""]=+new Date;ttq._o=ttq._o||{};ttq._o[e+""]=
    n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=
    i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];
    a.parentNode.insertBefore(o,a)};}(window,document,'ttq');

    window.ttq.load(pixelId)
    window.ttq.page()
    _loaded.tiktok = true
  }

  function _fireTikTok(event, data) {
    if (!_loaded.tiktok || !window.ttq) return
    var map = {
      'PageView':      function() { /* already fired on init */ },
      'InitiateQuiz':  function() { window.ttq.track('ClickButton', data || {}) },
      'CompleteQuiz':  function() { window.ttq.track('CompleteRegistration', data || {}) },
      'Lead':          function() { window.ttq.track('SubmitForm', data || {}) },
      'Contact':       function() { window.ttq.track('Contact', data || {}) },
    }
    if (map[event]) map[event]()
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init(pixels) {
    if (!pixels || typeof pixels !== 'object') return
    _config = pixels
    if (pixels.facebook_pixel_id) _initFacebook(pixels.facebook_pixel_id)

    // Google: se admin preencheu google_tag_id, usa esse. Senao, se
    // preencheu google_ads_id sozinho, auto-carrega gtag com o proprio
    // Google Ads ID (AW-XXX) — assim window.gtag fica disponivel pro
    // _fireGoogleAds. Fix 2026-04-24: antes admin podia preencher so
    // google_ads_id e nada funcionava silenciosamente.
    if (pixels.google_tag_id) {
      _initGoogle(pixels.google_tag_id)
    } else if (pixels.google_ads_id) {
      var adsId = pixels.google_ads_id.indexOf('AW-') === 0
        ? pixels.google_ads_id
        : 'AW-' + pixels.google_ads_id
      _initGoogle(adsId)
    }

    if (pixels.tiktok_pixel_id)   _initTikTok(pixels.tiktok_pixel_id)
  }

  // ── Error tracking ────────────────────────────────────────────────────────
  var _errors = []

  function _logPixelError(provider, event, err) {
    var entry = { provider: provider, event: event, error: String(err), at: new Date().toISOString() }
    _errors.push(entry)
    if (_errors.length > 50) _errors.splice(0, _errors.length - 50)
    console.warn('[quiz-pixels] ' + provider + ' error on ' + event + ':', err)
  }

  function fire(event, data) {
    try { _fireFacebook(event, data) } catch (e) { _logPixelError('facebook', event, e) }
    try { _fireGoogle(event, data) }   catch (e) { _logPixelError('google', event, e) }
    try { _fireGoogleAds(event, data) } catch (e) { _logPixelError('google_ads', event, e) }
    try { _fireTikTok(event, data) }   catch (e) { _logPixelError('tiktok', event, e) }
  }

  function isActive() {
    return _loaded.facebook || _loaded.gtag || _loaded.tiktok
  }

  function getErrors() {
    return _errors.slice()
  }

  // ── Exposição global ──────────────────────────────────────────────────────
  window.QuizPixels = Object.freeze({
    init:      init,
    fire:      fire,
    isActive:  isActive,
    getErrors: getErrors,
  })

})()
