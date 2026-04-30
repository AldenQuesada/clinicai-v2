/**
 * ClinicAI — Alexa Notification Service
 *
 * Envia notificacoes para dispositivos Alexa quando paciente chega.
 * Inclui retry com backoff, rate limiting e toast honesto.
 *
 * Config: clinic_alexa_config (Supabase) via get_alexa_config RPC
 * Rooms: clinic_rooms.alexa_device_name
 */
;(function () {
  'use strict'

  if (window._clinicaiAlexaServiceLoaded) return
  window._clinicaiAlexaServiceLoaded = true

  var _config = null
  var _configLoaded = false

  // ── Config ─────────────────────────────────────────────────
  async function _ensureConfig() {
    if (_configLoaded) return _config
    _configLoaded = true
    if (!window._sbShared) return null
    try {
      var res = await window._sbShared.rpc('get_alexa_config', {})
      if (res.data && res.data.ok && res.data.data) _config = res.data.data
    } catch (e) {
      console.warn('[Alexa] Falha ao carregar config:', e)
    }
    return _config
  }

  // ── Template rendering ─────────────────────────────────────
  function _render(template, vars) {
    if (!template) return ''
    return template.replace(/\{\{(\w+)\}\}/g, function (_, key) { return vars[key] || '' })
  }

  // ── Room for appointment ───────────────────────────────────
  function _getRoomForAppt(appt) {
    var rooms = typeof getRooms === 'function' ? getRooms() : []
    if (appt.salaIdx !== null && appt.salaIdx !== undefined && rooms[appt.salaIdx]) {
      return rooms[appt.salaIdx]
    }
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[appt.profissionalIdx]
    if (prof) {
      for (var i = 0; i < rooms.length; i++) {
        if (prof.sala_id === rooms[i].id) return rooms[i]
      }
    }
    return null
  }

  // ── Fetch with retry (3 attempts, backoff 2s/4s/8s) ───────
  async function _fetchWithRetry(url, opts, maxRetries) {
    var retries = maxRetries || 3
    var delay = 2000
    for (var attempt = 1; attempt <= retries; attempt++) {
      try {
        var r = await fetch(url, opts)
        if (r.ok) return { ok: true, status: r.status }
        var body = null
        try { body = await r.json() } catch (e) { /* ignore */ }
        // Cookie expirado — nao retenta
        if (body && body.code === 'COOKIE_EXPIRED') {
          return { ok: false, status: r.status, code: 'COOKIE_EXPIRED', error: body.error }
        }
        // Rate limited — espera e retenta
        if (r.status === 429 && attempt < retries) {
          await new Promise(function(res) { setTimeout(res, delay) })
          delay *= 2
          continue
        }
        if (attempt < retries && r.status >= 500) {
          await new Promise(function(res) { setTimeout(res, delay) })
          delay *= 2
          continue
        }
        return { ok: false, status: r.status, error: body ? body.error : 'HTTP ' + r.status }
      } catch (e) {
        if (attempt < retries) {
          await new Promise(function(res) { setTimeout(res, delay) })
          delay *= 2
          continue
        }
        return { ok: false, status: 0, error: e.message || 'Network error' }
      }
    }
    return { ok: false, status: 0, error: 'Max retries exceeded' }
  }

  // ── Delay helper ───────────────────────────────────────────
  function _delay(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

  // ══════════════════════════════════════════════════════════
  //  MAIN: notifyArrival
  // ══════════════════════════════════════════════════════════
  async function notifyArrival(appt) {
    var config = await _ensureConfig()
    if (!config || !config.is_active || !config.webhook_url) {
      console.log('[Alexa] Desativada ou sem config')
      return
    }

    var room = _getRoomForAppt(appt)
    var roomDeviceName = room ? room.alexa_device_name : null
    var roomNome = room ? room.nome : 'Sala'

    var vars = {
      nome:         appt.pacienteNome || 'Paciente',
      profissional: appt.profissionalNome || '',
      procedimento: appt.procedimento || appt.tipoConsulta || '',
      sala:         roomNome,
      hora:         appt.horaInicio || '',
    }

    var welcomeMsg = _render(config.welcome_template, vars)
    var roomMsg = _render(config.room_template, vars)

    var headers = { 'Content-Type': 'application/json' }
    if (config.auth_token) headers['Authorization'] = 'Bearer ' + config.auth_token

    // Resolver device da recepcao
    var receptionDevice = config.reception_device_name || ''
    if (!receptionDevice || receptionDevice === 'Recepcao' || receptionDevice === 'Recepção') {
      if (window.AlexaDevicesRepository) {
        var devRes = await AlexaDevicesRepository.getAll()
        if (devRes.ok && devRes.data) {
          for (var di = 0; di < devRes.data.length; di++) {
            var loc = (devRes.data[di].location_label || '').toLowerCase()
            if (loc.indexOf('recepc') >= 0 || loc.indexOf('recepç') >= 0) {
              receptionDevice = devRes.data[di].device_name
              break
            }
          }
          if ((!receptionDevice || receptionDevice === 'Recepcao') && devRes.data.length > 0) {
            receptionDevice = devRes.data[0].device_name
          }
        }
      }
    }

    var results = []

    // 1. Recepcao
    if (welcomeMsg && receptionDevice) {
      var r1 = await _fetchWithRetry(config.webhook_url, {
        method: 'POST', headers: headers,
        body: JSON.stringify({ device: receptionDevice, message: welcomeMsg, type: 'announce' }),
      })
      results.push({ device: 'Recepcao', ok: r1.ok, error: r1.error, code: r1.code })
      _logAnnounce(receptionDevice, welcomeMsg, 'notifyArrival:recepcao', vars.nome, r1.ok ? 'sent' : 'failed', r1.error)
      console.log('[Alexa] Recepcao:', r1.ok ? 'OK' : 'FALHOU — ' + r1.error)
    }

    // Delay entre devices (rate limit)
    if (welcomeMsg && receptionDevice && roomMsg && roomDeviceName) await _delay(2000)

    // 2. Sala
    if (roomMsg && roomDeviceName) {
      var r2 = await _fetchWithRetry(config.webhook_url, {
        method: 'POST', headers: headers,
        body: JSON.stringify({ device: roomDeviceName, message: roomMsg, type: 'announce' }),
      })
      results.push({ device: roomNome, ok: r2.ok, error: r2.error, code: r2.code })
      _logAnnounce(roomDeviceName, roomMsg, 'notifyArrival:sala', vars.nome, r2.ok ? 'sent' : (r2.code === 'COOKIE_EXPIRED' ? 'failed' : 'pending'), r2.error)
      console.log('[Alexa] Sala:', r2.ok ? 'OK' : 'FALHOU — ' + r2.error)
    }

    // Toast honesto
    if (window._showToast) {
      var ok = results.filter(function(r) { return r.ok })
      var fail = results.filter(function(r) { return !r.ok })
      var cookieExpired = fail.some(function(r) { return r.code === 'COOKIE_EXPIRED' })

      if (cookieExpired) {
        _showToast('Alexa', 'Cookie expirado! Necessario re-autenticar no bridge.', 'error')
      } else if (fail.length === 0 && ok.length > 0) {
        _showToast('Alexa', 'Enviado para ' + vars.nome + ' (' + ok.length + ' device' + (ok.length > 1 ? 's' : '') + ')', 'success')
      } else if (ok.length > 0 && fail.length > 0) {
        _showToast('Alexa', ok.length + ' OK, ' + fail.length + ' falhou: ' + fail.map(function(r) { return r.device }).join(', '), 'warning')
      } else if (fail.length > 0) {
        _showToast('Alexa', 'Falhou: ' + fail.map(function(r) { return r.device + ' (' + r.error + ')' }).join(', '), 'error')
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONFIG MANAGEMENT
  // ══════════════════════════════════════════════════════════

  async function saveConfig(webhookUrl, receptionDevice, welcomeTemplate, roomTemplate, isActive, authToken) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }
    try {
      var res = await window._sbShared.rpc('upsert_alexa_config', {
        p_webhook_url:           webhookUrl,
        p_reception_device_name: receptionDevice || 'Recepcao',
        p_welcome_template:      welcomeTemplate || null,
        p_room_template:         roomTemplate || null,
        p_is_active:             isActive !== false,
        p_auth_token:            authToken || null,
      })
      if (res.error) return { ok: false, error: res.error.message }
      _configLoaded = false
      await _ensureConfig()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  async function getConfig() { return _ensureConfig() }

  function invalidateCache() { _configLoaded = false; _config = null }

  // ── Health check do bridge ─────────────────────────────────
  async function checkBridgeHealth() {
    var config = await _ensureConfig()
    if (!config || !config.webhook_url) return { ok: false, error: 'Sem config' }
    try {
      var healthUrl = config.webhook_url.replace('/api/announce', '/health')
      var r = await fetch(healthUrl, { method: 'GET' })
      if (!r.ok) return { ok: false, error: 'HTTP ' + r.status }
      return await r.json()
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // ── Audit log ───────────────────────────────────────────────
  function _logAnnounce(device, message, ruleName, patient, status, error) {
    if (!window._sbShared) return
    window._sbShared.rpc('alexa_log_announce', {
      p_device: device, p_message: message,
      p_rule_name: ruleName || null, p_patient: patient || null,
      p_status: status, p_error: error || null,
    }).catch(function() {})
  }

  // ── Fila offline — retry pendentes ─────────────────────────
  async function retryPending() {
    if (!window._sbShared) return { processed: 0 }
    var config = await _ensureConfig()
    if (!config || !config.webhook_url || !config.auth_token) return { processed: 0 }

    var res = await window._sbShared.rpc('alexa_pending_queue', {})
    var items = (res.data && res.data.ok) ? res.data.data : []
    if (!items || !items.length) return { processed: 0 }

    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.auth_token }
    var sent = 0

    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      try {
        var r = await fetch(config.webhook_url, {
          method: 'POST', headers: headers,
          body: JSON.stringify({ device: item.device, message: item.message, type: 'announce' }),
        })
        if (r.ok) {
          await window._sbShared.rpc('alexa_log_update', { p_id: item.id, p_status: 'sent' })
          sent++
        } else {
          var body = null; try { body = await r.json() } catch (e) {}
          await window._sbShared.rpc('alexa_log_update', { p_id: item.id, p_status: r.status >= 500 ? 'pending' : 'failed', p_error: body ? body.error : 'HTTP ' + r.status })
        }
      } catch (e) {
        await window._sbShared.rpc('alexa_log_update', { p_id: item.id, p_status: 'pending', p_error: e.message })
      }
      await _delay(2000)
    }
    return { processed: items.length, sent: sent }
  }

  // ── Metricas ───────────────────────────────────────────────
  async function getMetrics(days) {
    if (!window._sbShared) return null
    var res = await window._sbShared.rpc('alexa_metrics', { p_days: days || 7 })
    return res.data
  }

  // ── Public API ─────────────────────────────────────────────
  window.AlexaNotificationService = Object.freeze({
    notifyArrival:      notifyArrival,
    saveConfig:         saveConfig,
    getConfig:          getConfig,
    invalidateCache:    invalidateCache,
    checkBridgeHealth:  checkBridgeHealth,
    retryPending:       retryPending,
    getMetrics:         getMetrics,
    _logAnnounce:       _logAnnounce,
  })
})()
