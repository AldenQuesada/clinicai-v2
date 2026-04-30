/**
 * ClinicAI — Global error boundary
 *
 * Captura erros que escapam de try/catch local:
 *  - window.onerror             → exceptions sincronas
 *  - window.onunhandledrejection → promises rejeitadas
 *  - mostra toast user-facing (Modal.alert) se Modal disponível
 *  - delega para Logger se disponível
 *  - opcional: envia para endpoint remoto (configurável)
 *
 * NÃO se inicializa automaticamente — chamar ErrorBoundary.install()
 * uma vez no boot da aplicação.
 */
// @ts-nocheck — wrapper IIFE
(function () {
  'use strict'
  if (typeof window === 'undefined') return

  var _installed = false
  var _remoteEndpoint = null
  var _suppressUntil = 0    // throttle: ignora bursts de mesmo erro
  var _lastErrorMsg = null

  function _shouldShowToast(msg) {
    var now = Date.now()
    if (msg === _lastErrorMsg && now < _suppressUntil) return false
    _lastErrorMsg = msg
    _suppressUntil = now + 5000  // 5s
    return true
  }

  function _toUserMsg(err) {
    var msg = err && (err.message || err.toString && err.toString())
    if (!msg || msg === '[object Object]') msg = 'Erro inesperado.'
    if (msg.length > 200) msg = msg.slice(0, 200) + '...'
    return msg
  }

  function _handle(source, err, extra) {
    var msg = _toUserMsg(err)
    var ctx = Object.assign({ source: source }, extra || {})

    // Log estruturado
    if (window.Logger) {
      window.Logger.error('error_boundary:' + source, Object.assign({
        message: msg,
        stack: err && err.stack,
      }, ctx))
    } else {
      console.error('[error_boundary:' + source + ']', msg, ctx)
    }

    // Envio remoto: Supabase clinic_data + endpoint customizado
    var payload = {
      source: source,
      message: msg,
      stack: (err && err.stack || '').slice(0, 2000),
      ts: new Date().toISOString(),
      url: window.location.href,
      ua: navigator.userAgent,
    }
    if (window._sbShared) {
      try {
        var logs = JSON.parse(localStorage.getItem('clinicai_error_log') || '[]')
        logs.push(payload)
        if (logs.length > 50) logs = logs.slice(-50)
        localStorage.setItem('clinicai_error_log', JSON.stringify(logs))
        if (window.sbSave) sbSave('clinicai_error_log', logs)
      } catch (e2) { /* quota */ }
    }
    if (_remoteEndpoint) {
      try {
        fetch(_remoteEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(function() { /* fail silently */ })
      } catch (e) { /* */ }
    }

    // User-facing toast (com throttle)
    if (_shouldShowToast(msg) && window.Modal) {
      window.Modal.alert({
        title: 'Erro inesperado',
        message: msg + '\n\nA equipe técnica foi notificada. Tente novamente — se persistir, recarregue a página.',
        tone: 'error',
      })
    }
  }

  function install(opts) {
    if (_installed) return
    _installed = true
    if (opts && opts.remoteEndpoint) _remoteEndpoint = opts.remoteEndpoint

    window.addEventListener('error', function (e) {
      _handle('window.error', e.error || new Error(e.message), {
        filename: e.filename,
        line: e.lineno,
        col: e.colno,
      })
    })

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason
      var err = reason instanceof Error ? reason : new Error(String(reason))
      _handle('unhandledrejection', err)
    })
  }

  window.ErrorBoundary = {
    install: install,
    test: function () { throw new Error('ErrorBoundary test') },
  }
})()
