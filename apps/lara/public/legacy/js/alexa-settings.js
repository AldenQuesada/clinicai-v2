/**
 * ClinicAI — Alexa Settings UI + Device Management
 *
 * Gerencia configuracao global Alexa e registro centralizado de dispositivos.
 * Dispositivos sao vinculados a salas (BD) e/ou funcionarios (BD).
 *
 * Depende de:
 *   AlexaNotificationService   — config global
 *   AlexaDevicesRepository     — CRUD dispositivos
 *   getRooms()                 — cache de salas
 *   getProfessionals()         — cache de profissionais
 *   clinicSection()            — troca de aba
 */
;(function () {
  'use strict'

  if (window._clinicaiAlexaSettingsLoaded) return
  window._clinicaiAlexaSettingsLoaded = true

  window._alexaConfigDirty = false
  var _devices = []

  // ══════════════════════════════════════════════════════════════
  //  CONFIG GLOBAL
  // ══════════════════════════════════════════════════════════════

  async function loadAlexaConfig() {
    if (!window.AlexaNotificationService) return
    var cfg = await AlexaNotificationService.getConfig()
    if (!cfg) return

    var el = function (id) { return document.getElementById(id) }
    if (el('sc_alexa_active'))     el('sc_alexa_active').checked = cfg.is_active !== false
    if (el('sc_alexa_webhook'))    el('sc_alexa_webhook').value  = cfg.webhook_url || ''
    if (el('sc_alexa_auth_token')) el('sc_alexa_auth_token').value = cfg.auth_token || ''
    if (el('sc_alexa_welcome'))    el('sc_alexa_welcome').value  = cfg.welcome_template || ''
    if (el('sc_alexa_room_msg'))   el('sc_alexa_room_msg').value = cfg.room_template || ''
    window._alexaConfigDirty = false

    // Health check + metricas
    _loadHealthStatus()
    _loadMetrics()
  }

  async function _loadHealthStatus() {
    var panel = document.getElementById('alexa_health_panel')
    if (!panel || !window.AlexaNotificationService) return

    try {
      var health = await AlexaNotificationService.checkBridgeHealth()
      var connected = health && health.alexa_connected
      var cookieWarning = health && health.cookie_warning
      var cookieDays = health && health.cookie_age_days

      var statusColor = connected ? '#10B981' : '#EF4444'
      var statusText = connected ? 'Online' : 'Offline'
      var cookieHtml = ''

      if (cookieWarning) {
        cookieHtml = '<div style="margin-top:6px;padding:6px 10px;background:#FEF3C7;border-radius:6px;font-size:11px;color:#92400E">'
          + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
          + 'Cookie com ' + cookieDays + ' dias. Renove em breve.</div>'
      }

      var metricsHtml = ''
      if (health && health.metrics) {
        var m = health.metrics
        metricsHtml = '<div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:#6B7280">'
          + '<span>Enviados: <b style="color:#10B981">' + (m.sent || 0) + '</b></span>'
          + '<span>Falhos: <b style="color:#EF4444">' + (m.failed || 0) + '</b></span>'
          + (m.lastSentAt ? '<span>Ultimo: ' + new Date(m.lastSentAt).toLocaleTimeString('pt-BR') + '</span>' : '')
          + '</div>'
      }

      panel.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
        + '<div style="width:8px;height:8px;border-radius:50%;background:' + statusColor + '"></div>'
        + '<span style="font-size:12px;font-weight:600;color:' + statusColor + '">' + statusText + '</span>'
        + '</div>'
        + cookieHtml + metricsHtml
    } catch (e) {
      panel.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
        + '<div style="width:8px;height:8px;border-radius:50%;background:#EF4444"></div>'
        + '<span style="font-size:12px;font-weight:600;color:#EF4444">Bridge inacessivel</span>'
        + '</div>'
    }
  }

  async function _loadMetrics() {
    var panel = document.getElementById('alexa_metrics_panel')
    if (!panel || !window.AlexaNotificationService) return

    try {
      var data = await AlexaNotificationService.getMetrics(7)
      if (!data || !data.ok) { panel.innerHTML = ''; return }

      var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'
        + '<div style="text-align:center;padding:10px;background:#F0FDF4;border-radius:8px"><div style="font-size:20px;font-weight:700;color:#10B981">' + (data.sent || 0) + '</div><div style="font-size:10px;color:#6B7280">Enviados (7d)</div></div>'
        + '<div style="text-align:center;padding:10px;background:#FEF2F2;border-radius:8px"><div style="font-size:20px;font-weight:700;color:#EF4444">' + (data.failed || 0) + '</div><div style="font-size:10px;color:#6B7280">Falhos (7d)</div></div>'
        + '<div style="text-align:center;padding:10px;background:#ECFEFF;border-radius:8px"><div style="font-size:20px;font-weight:700;color:#06B6D4">' + (data.total || 0) + '</div><div style="font-size:10px;color:#6B7280">Total (7d)</div></div>'
        + '</div>'

      if (data.pending && data.pending > 0) {
        html += '<div style="margin-top:8px;padding:8px 12px;background:#FEF3C7;border-radius:8px;font-size:11px;color:#92400E;display:flex;align-items:center;justify-content:space-between">'
          + '<span>' + data.pending + ' announce(s) pendente(s)</span>'
          + '<button onclick="retryAlexaPending()" style="padding:4px 10px;background:#F59E0B;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Retentar</button>'
          + '</div>'
      }

      panel.innerHTML = html
    } catch (e) {
      panel.innerHTML = ''
    }
  }

  async function retryAlexaPending() {
    if (!window.AlexaNotificationService) return
    var res = await AlexaNotificationService.retryPending()
    if (window._showToast) _showToast('Alexa', 'Retry: ' + (res.sent || 0) + ' de ' + (res.processed || 0) + ' enviados', res.sent > 0 ? 'success' : 'warning')
    _loadMetrics()
  }

  async function saveAlexaConfig() {
    if (!window.AlexaNotificationService) {
      if (window._showToast) _showToast('Alexa', 'Servico Alexa nao carregado', 'error')
      return
    }

    var webhookUrl      = (document.getElementById('sc_alexa_webhook')?.value || '').trim()
    var authToken       = (document.getElementById('sc_alexa_auth_token')?.value || '').trim()
    var welcomeTemplate = (document.getElementById('sc_alexa_welcome')?.value || '').trim()
    var roomTemplate    = (document.getElementById('sc_alexa_room_msg')?.value || '').trim()
    var isActive        = document.getElementById('sc_alexa_active')?.checked !== false

    // Pega o primeiro dispositivo marcado como recepcao (location_label contém "recepcao")
    var receptionDevice = 'Recepcao'
    for (var i = 0; i < _devices.length; i++) {
      var loc = (_devices[i].location_label || '').toLowerCase()
      if (loc.indexOf('recepc') >= 0 || loc.indexOf('recepç') >= 0) {
        receptionDevice = _devices[i].device_name
        break
      }
    }

    if (!webhookUrl) {
      if (window._showToast) _showToast('Alexa', 'Informe a URL do webhook n8n', 'warning')
      return
    }

    var res = await AlexaNotificationService.saveConfig(
      webhookUrl, receptionDevice, welcomeTemplate, roomTemplate, isActive, authToken
    )

    if (res.ok) {
      if (window._showToast) _showToast('Alexa', 'Configuracao salva com sucesso', 'success')
      window._alexaConfigDirty = false
    } else {
      if (window._showToast) _showToast('Alexa', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  async function testAlexaNotification() {
    var config = await (window.AlexaNotificationService ? AlexaNotificationService.getConfig() : null)
    if (!config || !config.webhook_url) {
      if (window._showToast) _showToast('Alexa', 'Salve a configuracao primeiro', 'warning')
      return
    }

    var headers = { 'Content-Type': 'application/json' }
    if (config.auth_token) headers['Authorization'] = 'Bearer ' + config.auth_token

    // Buscar todos os devices cadastrados
    var devices = []
    if (window.AlexaDevicesRepository) {
      var devRes = await AlexaDevicesRepository.getAll()
      if (devRes.ok && devRes.data) devices = devRes.data.filter(function(d) { return d.is_active && d.device_name })
    }

    // Fallback: pegar devices das salas
    if (!devices.length) {
      var rooms = typeof getRooms === 'function' ? getRooms() : []
      rooms.forEach(function(r) {
        if (r.alexa_device_name) devices.push({ device_name: r.alexa_device_name, location_label: r.nome })
      })
    }

    if (!devices.length) {
      if (window._showToast) _showToast('Alexa', 'Nenhum dispositivo cadastrado', 'warning')
      return
    }

    var sent = 0
    for (var i = 0; i < devices.length; i++) {
      try {
        var r = await fetch(config.webhook_url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ device: devices[i].device_name, message: 'Teste ClinicAI. Dispositivo ' + devices[i].device_name + ' funcionando.', type: 'announce' }),
        })
        if (r.ok) { sent++; console.log('[Alexa] Teste OK:', devices[i].device_name) }
        else { console.error('[Alexa] Teste falhou:', devices[i].device_name, r.status) }
      } catch (e) {
        console.error('[Alexa] Teste erro:', devices[i].device_name, e)
      }
    }

    if (window._showToast) _showToast('Alexa', 'Teste enviado para ' + sent + ' de ' + devices.length + ' dispositivo(s)', sent > 0 ? 'success' : 'error')
  }

  // ══════════════════════════════════════════════════════════════
  //  DEVICE MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  function _buildRoomOptions(selectedId) {
    var rooms = typeof getRooms === 'function' ? getRooms() : []
    var html = '<option value="">— Nenhuma —</option>'
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i]
      var sel = (r.id === selectedId) ? ' selected' : ''
      html += '<option value="' + r.id + '"' + sel + '>' + (r.nome || 'Sala ' + (i+1)) + '</option>'
    }
    return html
  }

  function _buildProfOptions(selectedId) {
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var html = '<option value="">— Nenhum —</option>'
    for (var i = 0; i < profs.length; i++) {
      var p = profs[i]
      var sel = (p.id === selectedId) ? ' selected' : ''
      var label = p.display_name || p.nome || 'Prof ' + (i+1)
      if (p.cargo) label += ' (' + p.cargo + ')'
      html += '<option value="' + p.id + '"' + sel + '>' + label + '</option>'
    }
    return html
  }

  function _renderDeviceRow(device) {
    var id = device.id || 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2,4)
    var isNew = !device.id
    var activeIcon = device.is_active !== false
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="#10B981" stroke="none"><circle cx="12" cy="12" r="6"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="#9CA3AF" stroke="none"><circle cx="12" cy="12" r="6"/></svg>'

    return '<div data-device-id="' + id + '" style="display:grid;grid-template-columns:1.2fr 1fr 1fr 60px;gap:10px;padding:10px 12px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;align-items:center;transition:border-color .15s" onmouseenter="this.style.borderColor=\'#06B6D4\'" onmouseleave="this.style.borderColor=\'#E5E7EB\'">' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        activeIcon +
        '<input type="text" value="' + (device.device_name || '') + '" placeholder="Ex: Echo Pop de MyClinic" data-field="device_name" onchange="markAlexaDeviceDirty(this)" style="flex:1;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none;box-sizing:border-box;min-width:0"/>' +
      '</div>' +
      '<select data-field="room_id" onchange="markAlexaDeviceDirty(this)" style="padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none;box-sizing:border-box;background:#fff;cursor:pointer">' +
        _buildRoomOptions(device.room_id) +
      '</select>' +
      '<select data-field="professional_id" onchange="markAlexaDeviceDirty(this)" style="padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none;box-sizing:border-box;background:#fff;cursor:pointer">' +
        _buildProfOptions(device.professional_id) +
      '</select>' +
      '<div style="display:flex;gap:4px;justify-content:center">' +
        '<button onclick="saveAlexaDevice(this)" title="Salvar" style="display:none;padding:5px 8px;background:#10B981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px" data-save-btn>' +
          '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</button>' +
        '<button onclick="removeAlexaDevice(\'' + id + '\')" title="Excluir" style="padding:5px 8px;background:none;border:1px solid #FECACA;color:#EF4444;border-radius:6px;cursor:pointer">' +
          '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>'
  }

  function _updateDeviceCount() {
    var el = document.getElementById('alexa_devices_count')
    if (el) el.textContent = _devices.length + ' dispositivo' + (_devices.length !== 1 ? 's' : '') + ' registrado' + (_devices.length !== 1 ? 's' : '')
  }

  async function loadAlexaDevices() {
    var list = document.getElementById('alexa_devices_list')
    if (!list) return

    if (!window.AlexaDevicesRepository) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#EF4444;font-size:12px">Repository nao carregado</div>'
      return
    }

    var res = await AlexaDevicesRepository.getAll()
    if (!res.ok) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#EF4444;font-size:12px">Erro: ' + (res.error || 'desconhecido') + '</div>'
      return
    }

    _devices = res.data || []

    if (!_devices.length) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px;background:#F9FAFB;border-radius:10px">Nenhum dispositivo registrado. Clique em "Adicionar Dispositivo" para comecar.</div>'
      _updateDeviceCount()
      return
    }

    var html = ''
    for (var i = 0; i < _devices.length; i++) {
      html += _renderDeviceRow(_devices[i])
    }
    list.innerHTML = html
    _updateDeviceCount()
  }

  function addAlexaDeviceRow() {
    var list = document.getElementById('alexa_devices_list')
    if (!list) return

    // Se esta vazio com placeholder, limpar
    if (!_devices.length) list.innerHTML = ''

    var tempDevice = { id: null, device_name: '', room_id: null, professional_id: null, location_label: '', is_active: true }
    var tempDiv = document.createElement('div')
    tempDiv.innerHTML = _renderDeviceRow(tempDevice)
    var row = tempDiv.firstChild

    // Mostrar botao salvar automaticamente para novo
    var saveBtn = row.querySelector('[data-save-btn]')
    if (saveBtn) saveBtn.style.display = 'inline-flex'

    list.appendChild(row)

    // Focus no campo nome
    var nameInput = row.querySelector('[data-field="device_name"]')
    if (nameInput) nameInput.focus()
  }

  function markAlexaDeviceDirty(el) {
    var row = el.closest('[data-device-id]')
    if (!row) return
    var saveBtn = row.querySelector('[data-save-btn]')
    if (saveBtn) saveBtn.style.display = 'inline-flex'
  }

  async function saveAlexaDevice(btnEl) {
    var row = btnEl.closest('[data-device-id]')
    if (!row) return

    var deviceId = row.getAttribute('data-device-id')
    var isNew = deviceId.startsWith('new_')

    var deviceName = (row.querySelector('[data-field="device_name"]')?.value || '').trim()
    if (!deviceName) {
      if (window._showToast) _showToast('Alexa', 'Informe o nome do dispositivo', 'warning')
      return
    }

    var roomId = row.querySelector('[data-field="room_id"]')?.value || null
    var profId = row.querySelector('[data-field="professional_id"]')?.value || null
    var locationLabel = (row.querySelector('[data-field="location_label"]')?.value || '').trim()

    var device = {
      id:              isNew ? null : deviceId,
      device_name:     deviceName,
      room_id:         roomId || null,
      professional_id: profId || null,
      location_label:  locationLabel || null,
      is_active:       true,
    }

    btnEl.disabled = true
    var res = await AlexaDevicesRepository.upsert(device)

    if (res.ok) {
      if (window._showToast) _showToast('Alexa', 'Dispositivo "' + deviceName + '" salvo', 'success')
      await loadAlexaDevices()
    } else {
      if (window._showToast) _showToast('Alexa', 'Erro: ' + (res.error || 'desconhecido'), 'error')
      btnEl.disabled = false
    }
  }

  async function removeAlexaDevice(deviceId) {
    if (!deviceId) return

    // Novo nao salvo — remover do DOM
    if (deviceId.startsWith('new_')) {
      var row = document.querySelector('[data-device-id="' + deviceId + '"]')
      if (row) row.remove()
      return
    }

    var device = _devices.find(function(d) { return d.id === deviceId })
    var nome = device ? device.device_name : 'este dispositivo'

    if (!confirm('Excluir "' + nome + '"?')) return

    var res = await AlexaDevicesRepository.remove(deviceId)
    if (res.ok) {
      if (window._showToast) _showToast('Alexa', '"' + nome + '" excluido', 'success')
      await loadAlexaDevices()
    } else {
      if (window._showToast) _showToast('Alexa', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  AUTO-LOAD
  // ══════════════════════════════════════════════════════════════

  var _origClinicSection = window.clinicSection
  if (_origClinicSection) {
    window.clinicSection = function (sec) {
      _origClinicSection(sec)
      if (sec === 'alexa') {
        loadAlexaConfig()
        loadAlexaDevices()
      }
    }
  }

  // ── Expose ─────────────────────────────────────────────────
  window.saveAlexaConfig        = saveAlexaConfig
  window.testAlexaNotification  = testAlexaNotification
  window.loadAlexaConfig        = loadAlexaConfig
  window.loadAlexaDevices       = loadAlexaDevices
  window.addAlexaDeviceRow      = addAlexaDeviceRow
  window.saveAlexaDevice        = saveAlexaDevice
  window.removeAlexaDevice      = removeAlexaDevice
  window.markAlexaDeviceDirty   = markAlexaDeviceDirty
  window.retryAlexaPending      = retryAlexaPending
})()
