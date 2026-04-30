/**
 * ClinicAI — Pluggy Connect UI
 * Modal para gerenciar conexoes bancarias via Pluggy
 */
;(function () {
  'use strict'
  if (window._clinicaiPluggyUiLoaded) return
  window._clinicaiPluggyUiLoaded = true

  var _state = { connections: [], loading: false }

  async function open() {
    var existing = document.getElementById('pluggyModalBackdrop')
    if (existing) existing.remove()

    var html = ''
      + '<div id="pluggyModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'

          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Bancos Conectados</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Sincronizacao automatica via Pluggy (Open Finance)</p>'
            + '</div>'
            + '<button id="pgClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'

          + '<div id="pgBody" style="padding:24px;overflow:auto;flex:1"></div>'

          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button id="pgClose2" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Fechar</button>'
            + '<button id="pgConnectBtn" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">'
              + _icon('plus', 14) + ' Conectar novo banco'
            + '</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    document.getElementById('pgClose').addEventListener('click', close)
    document.getElementById('pgClose2').addEventListener('click', close)
    document.getElementById('pgConnectBtn').addEventListener('click', _handleConnect)
    document.getElementById('pluggyModalBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'pluggyModalBackdrop') close()
    })

    await _loadConnections()
  }

  function close() {
    var b = document.getElementById('pluggyModalBackdrop')
    if (b) b.remove()
  }

  async function _loadConnections() {
    _state.loading = true
    _renderBody()
    var res = await window.PluggyService.listConnections()
    _state.connections = (res && res.ok) ? res.data : []
    _state.loading = false
    _renderBody()
  }

  function _renderBody() {
    var body = document.getElementById('pgBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">Carregando...</div>'
      return
    }

    if (_state.connections.length === 0) {
      body.innerHTML = ''
        + '<div style="text-align:center;padding:32px 20px">'
          + '<div style="color:#9ca3af;margin-bottom:12px">' + _icon('link', 48) + '</div>'
          + '<div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px">Nenhum banco conectado</div>'
          + '<div style="font-size:12px;color:#6b7280;margin-bottom:20px">Conecte o Sicredi (ou outro banco) para sincronizar transacoes automaticamente</div>'

          + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;text-align:left;max-width:420px;margin:0 auto">'
            + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Como funciona</div>'
            + '<ol style="margin:0;padding-left:18px;font-size:12px;color:#374151;line-height:1.7">'
              + '<li>Clica em <strong>Conectar novo banco</strong></li>'
              + '<li>Escolhe o Sicredi na lista</li>'
              + '<li>Autoriza via Internet Banking (ou app Sicredi)</li>'
              + '<li>Pronto — novas transacoes cairao automaticamente no Fluxo de Caixa</li>'
            + '</ol>'
          + '</div>'
        + '</div>'
      return
    }

    var html = ''
    _state.connections.forEach(function(c) {
      var statusColor = c.status === 'active' ? '#10b981' : c.status === 'error' ? '#ef4444' : '#9ca3af'
      var statusLabel = c.status === 'active' ? 'Ativo' : c.status === 'error' ? 'Erro' : 'Desconectado'
      var lastSync = c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('pt-BR') : 'Nunca'

      html += '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
          + '<div style="display:flex;align-items:center;gap:12px">'
            + '<div style="width:40px;height:40px;border-radius:8px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;color:#10b981">' + _icon('building', 20) + '</div>'
            + '<div>'
              + '<div style="font-size:14px;font-weight:700;color:#111827">' + (c.institution_name || 'Banco') + '</div>'
              + '<div style="font-size:11px;color:#6b7280">' + (c.account_name || '—') + '</div>'
            + '</div>'
          + '</div>'
          + '<span style="background:' + statusColor + '22;color:' + statusColor + ';font-size:10px;font-weight:700;padding:4px 10px;border-radius:6px">' + statusLabel + '</span>'
        + '</div>'

        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;color:#6b7280;margin-bottom:10px">'
          + '<div>Ultima sync: <strong style="color:#374151">' + lastSync + '</strong></div>'
          + '<div>Total sincronizado: <strong style="color:#374151">' + (c.total_synced || 0) + '</strong></div>'
        + '</div>'

        + (c.last_sync_error ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;font-size:11px;color:#991b1b;margin-bottom:10px">' + c.last_sync_error + '</div>' : '')

        + '<div style="display:flex;gap:6px">'
          + '<button data-item="' + c.item_id + '" class="pg-sync" style="flex:1;background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Sincronizar agora</button>'
          + '<button data-id="' + c.id + '" class="pg-disc" style="background:#fff;color:#ef4444;border:1.5px solid #fecaca;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Desconectar</button>'
        + '</div>'
      + '</div>'
    })

    body.innerHTML = html

    document.querySelectorAll('.pg-sync').forEach(function(b) {
      b.addEventListener('click', async function() {
        b.disabled = true
        b.textContent = 'Sincronizando...'
        var res = await window.PluggyService.syncNow(b.getAttribute('data-item'))
        b.disabled = false
        b.textContent = 'Sincronizar agora'
        if (res && res.ok) {
          _toastWarn('Sync solicitado. Novas transacoes vao aparecer em breve.')
          _loadConnections()
          if (window.CashflowUI && window.CashflowUI.reload) window.CashflowUI.reload()
        } else {
          _toastErr('Falha ao sincronizar. Verifique se o n8n esta configurado.')
        }
      })
    })

    document.querySelectorAll('.pg-disc').forEach(function(b) {
      b.addEventListener('click', async function() {
        if (!confirm('Desconectar este banco? Novas transacoes nao serao mais importadas automaticamente.')) return
        await window.PluggyService.disconnect(b.getAttribute('data-id'))
        _loadConnections()
      })
    })
  }

  async function _handleConnect() {
    try {
      await window.PluggyService.openConnectWidget({
        clientUserId: 'clinic-' + (window.ClinicEnv && window.ClinicEnv.CLINIC_ID || 'default'),
        onSuccess: function(itemData) {
          _toastWarn('Banco conectado com sucesso! Transacoes serao sincronizadas em alguns minutos.')
          _loadConnections()
        },
        onError: function(err) {
          _toastErr('Erro ao conectar: ' + (err && err.message || 'desconhecido'))
        },
      })
    } catch (e) {
      _toastErr('Erro: ' + e.message + '\n\nVerifique se o proxy n8n esta configurado e se as credenciais Pluggy estao definidas nas variaveis de ambiente.')
    }
  }

  function _icon(name, size) {
    size = size || 16
    var icons = {
      'x':        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'plus':     '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      'link':     '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      'building': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10"/><path d="M3 9h18"/></svg>',
    }
    return icons[name] || ''
  }

  window.PluggyConnectUI = Object.freeze({ open: open, close: close })
})()
