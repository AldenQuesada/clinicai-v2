;(function () {
  'use strict'
  if (window._healthMonitorLoaded) return
  window._healthMonitorLoaded = true

  var CHECK_INTERVAL = 5 * 60 * 1000
  var _lastAlert = {}

  function _check(name, url, method) {
    var headers = {}
    var key = window.ClinicEnv?.SUPABASE_KEY
    if (key) { headers['apikey'] = key; headers['Authorization'] = 'Bearer ' + key }
    return fetch(url, { method: method || 'HEAD', headers: headers, signal: AbortSignal.timeout(8000) })
      .then(function (r) { return { name: name, ok: r.ok, status: r.status } })
      .catch(function (e) { return { name: name, ok: false, status: 0, error: e.message } })
  }

  function _alertOnce(name, msg) {
    var now = Date.now()
    if (_lastAlert[name] && now - _lastAlert[name] < 30 * 60 * 1000) return
    _lastAlert[name] = now
    if (window._showToast) _showToast('Servico indisponivel', name + ': ' + msg, 'error')
    if (window.Logger) Logger.error('health:down', { service: name, message: msg })
  }

  async function runChecks() {
    var env = window.ClinicEnv || {}
    var checks = []

    if (env.SUPABASE_URL) {
      checks.push(_check('Supabase', env.SUPABASE_URL + '/auth/v1/health', 'GET'))
    }

    var results = await Promise.all(checks)
    var down = results.filter(function (r) { return !r.ok })
    down.forEach(function (r) { _alertOnce(r.name, r.error || 'HTTP ' + r.status) })

    var log = { ts: new Date().toISOString(), services: results.map(function (r) { return { name: r.name, ok: r.ok } }) }
    try {
      var logs = JSON.parse(localStorage.getItem('clinicai_health_log') || '[]')
      logs.push(log)
      if (logs.length > 100) logs = logs.slice(-50)
      localStorage.setItem('clinicai_health_log', JSON.stringify(logs))
    } catch (e) { /* quota */ }

    return results
  }

  var _timer = null
  function start() {
    if (_timer) return
    runChecks()
    _timer = setInterval(runChecks, CHECK_INTERVAL)
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null }
  }

  document.addEventListener('clinicai:auth-success', start)

  window.HealthMonitor = Object.freeze({ start: start, stop: stop, check: runChecks })
})()
