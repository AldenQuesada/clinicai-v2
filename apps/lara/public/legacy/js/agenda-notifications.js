/**
 * ClinicAI — Agenda Notifications
 *
 * Extraído de api.js. Gerencia o sistema de toast de notificação
 * e o sino (bell) de alertas do header.
 *
 * Funções públicas (window.*):
 *   _showToast(title, subtitle, type)
 *   _dismissToast(el)
 *   _renderNotificationBell()
 *
 * Depende de (globals de api.js):
 *   window._apptGetAll        — acessa lista de agendamentos
 *   window.openFinalizarModal — abre modal de finalização ao clicar no item
 *   window.aprovarUsuario     — aprovação de usuário (auth.js / users-admin.js)
 *   window.rejeitarUsuario    — rejeição de usuário (auth.js / users-admin.js)
 *   window.featherIn          — renderiza ícones feather
 *
 * NOTA: Este arquivo é carregado APÓS api.js.
 */

;(function () {
  'use strict'

  // ── Helper local ──────────────────────────────────────────────
  function _getAppts() {
    if (window._apptGetAll) return window._apptGetAll()
    var k = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
    try { return JSON.parse(localStorage.getItem(k) || '[]') } catch (e) { return [] }
  }

  function _fmtDate(iso) {
    return window._apptFmtDate ? window._apptFmtDate(iso) : iso
  }

  // ── _showToast ────────────────────────────────────────────────
  function _showToast(title, subtitle, type) {
    type = type || 'info'
    const icons = {
      success: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
      warning: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error:   `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    }

    const toast = document.createElement('div')
    toast.className = 'clinic-toast toast-' + type
    toast.innerHTML = `
      <span class="clinic-toast-icon">${icons[type] || icons.info}</span>
      <div class="clinic-toast-body">
        <div class="clinic-toast-title">${title}</div>
        ${subtitle ? '<div class="clinic-toast-sub">' + subtitle + '</div>' : ''}
      </div>
      <button class="clinic-toast-close" onclick="_dismissToast(this.closest('.clinic-toast'))">&times;</button>`
    document.body.appendChild(toast)

    // Auto-remover após 5 s
    const timer = setTimeout(function () { _dismissToast(toast) }, 5000)
    toast._timer = timer
  }

  // ── _dismissToast ─────────────────────────────────────────────
  function _dismissToast(el) {
    if (!el || !document.body.contains(el)) return
    clearTimeout(el._timer)
    el.classList.add('hiding')
    setTimeout(function () { el.remove() }, 300)
  }

  // ── _renderNotificationBell ───────────────────────────────────
  function _renderNotificationBell() {
    const appts      = _getAppts()
    const pending    = appts.filter(function (a) { return a.pendente_finalizar && a.status !== 'finalizado' })
    const pendingReg = JSON.parse(localStorage.getItem('clinic_pending_users') || '[]')
    const totalBadge = pending.length + pendingReg.length

    const wrapper = document.getElementById('notifDropdown')
    if (!wrapper) return

    const btn = wrapper.querySelector('button')

    // Badge de contagem
    let badge = wrapper.querySelector('.badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'badge badge-danger'
      if (btn) btn.appendChild(badge)
    }
    if (totalBadge > 0) {
      badge.textContent = totalBadge > 9 ? '9+' : totalBadge
      badge.style.display = ''
    } else {
      badge.style.display = 'none'
    }

    // Animação do sino
    const bellIcon = wrapper.querySelector('svg, i[data-feather="bell"]')
    const bellEl   = bellIcon || btn
    if (bellEl) {
      if (totalBadge > 0) bellEl.classList.add('bell-ringing')
      else                 bellEl.classList.remove('bell-ringing')
    }

    // Itens no menu
    const menu = document.getElementById('notifMenu')
    if (!menu) return
    menu.querySelectorAll('.notif-finalizar-alert,.notif-reg-alert').forEach(function (el) { el.remove() })

    // Cadastros pendentes de aprovação
    pendingReg.forEach(function (u) {
      const item = document.createElement('div')
      item.className = 'notif-item notif-unread notif-reg-alert'
      item.innerHTML = `
        <div class="notif-icon" style="background:#FEF3C7;color:#D97706;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="user-plus" style="width:15px;height:15px"></i>
        </div>
        <div class="notif-content" style="flex:1;min-width:0">
          <p class="notif-title" style="margin:0;font-size:12px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Cadastro: ${u.name}</p>
          <p class="notif-desc" style="margin:2px 0 0;font-size:11px;color:#6B7280">${u.email} &middot; ${u.role || '—'}</p>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button onclick="event.stopPropagation();aprovarUsuario('${u.id}')"
              style="padding:3px 10px;background:#10B981;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
              &#10003; Aprovar
            </button>
            <button onclick="event.stopPropagation();rejeitarUsuario('${u.id}')"
              style="padding:3px 10px;background:#EF4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
              &#10007; Rejeitar
            </button>
          </div>
        </div>`
      const header = menu.querySelector('.dropdown-header')
      if (header) header.after(item)
      else menu.prepend(item)
    })

    // Finalizações pendentes
    pending.forEach(function (a) {
      const item = document.createElement('div')
      item.className = 'notif-item notif-unread notif-finalizar-alert'
      item.style.cursor = 'pointer'
      item.innerHTML = `
        <div class="notif-icon notif-icon-danger"><i data-feather="alert-circle"></i></div>
        <div class="notif-content">
          <p class="notif-title">Finalizar: ${a.pacienteNome || 'Paciente'}</p>
          <p class="notif-desc">${_fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento || 'Sem procedimento'}</p>
          <p class="notif-time">Atendimento pendente de finalização</p>
        </div>`
      item.addEventListener('click', function () {
        menu.classList.remove('show')
        if (typeof openFinalizarModal === 'function') openFinalizarModal(a.id)
      })
      const header = menu.querySelector('.dropdown-header')
      if (header) header.after(item)
      else menu.prepend(item)
    })

    if (typeof featherIn === 'function') featherIn(wrapper)

    // Re-anima o sino com feather substituído
    setTimeout(function () {
      const svg = wrapper.querySelector('svg')
      if (svg) {
        if (pending.length > 0) svg.classList.add('bell-ringing')
        else                     svg.classList.remove('bell-ringing')
      }
    }, 50)
  }

  // ── Sistema de Double-Check — alertas persistentes com acknowledge ──
  var DCHECK_KEY = 'clinicai_double_checks'

  function _getDoubleChecks() {
    return JSON.parse(localStorage.getItem(DCHECK_KEY) || '[]')
  }

  function _saveDoubleChecks(arr) {
    localStorage.setItem(DCHECK_KEY, JSON.stringify(arr))
  }

  /**
   * Criar alerta de double-check
   * @param {string} tipo - 'multi_proc' | 'tempo_curto' | 'custom'
   * @param {string} titulo - Titulo do alerta
   * @param {string} mensagem - Descricao detalhada
   * @param {string} targetPhone - Telefone do responsavel (WhatsApp)
   * @param {string} targetName - Nome do responsavel
   */
  function createDoubleCheck(tipo, titulo, mensagem, targetPhone, targetName) {
    var checks = _getDoubleChecks()
    var id = 'dck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)

    checks.push({
      id: id,
      tipo: tipo,
      titulo: titulo,
      mensagem: mensagem,
      targetName: targetName || '',
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: new Date().toISOString(),
      createdBy: 'secretaria',
    })
    _saveDoubleChecks(checks)

    // Enviar WhatsApp via Evolution (por baixo)
    if (targetPhone && window.AppointmentsService) {
      window.AppointmentsService.enqueueWAReminder({
        p_phone: targetPhone.replace(/\D/g, ''),
        p_content: 'ALERTA CLINICA:\n\n' + titulo + '\n\n' + mensagem,
        p_lead_name: 'Sistema ClinicAI'
      }).catch(function() {})
    }

    // Mostrar imediatamente na tela
    _showDoubleCheckAlert(checks[checks.length - 1])

    // Atualizar sino
    _renderNotificationBell()

    return id
  }

  function _showDoubleCheckAlert(check) {
    // Som de alerta
    _playDoubleCheckSound()

    // Modal central que nao pode ser ignorado
    var existing = document.getElementById('dcheckAlert_' + check.id)
    if (existing) return

    var overlay = document.createElement('div')
    overlay.id = 'dcheckAlert_' + check.id
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px'

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:16px 20px;display:flex;align-items:center;gap:10px">' +
          '<div style="width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:10px;display:flex;align-items:center;justify-content:center">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:800;color:#fff">Double-Check Necessario</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.8)">' + (check.targetName || 'Responsavel') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:18px 20px">' +
          '<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:8px">' + (check.titulo || '').replace(/</g, '&lt;') + '</div>' +
          '<div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:16px;padding:10px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px">' + (check.mensagem || '').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div>' +
          '<div style="font-size:11px;color:#9CA3AF;margin-bottom:12px">WhatsApp enviado automaticamente para ' + (check.targetName || 'o responsavel') + '</div>' +
          '<button onclick="acknowledgeDoubleCheck(\'' + check.id + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Confirmo que recebi e estou ciente' +
          '</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)
  }

  function acknowledgeDoubleCheck(id) {
    var checks = _getDoubleChecks()
    var idx = checks.findIndex(function(c) { return c.id === id })
    if (idx >= 0) {
      checks[idx].acknowledged = true
      checks[idx].acknowledgedAt = new Date().toISOString()
      checks[idx].acknowledgedBy = 'usuario'
      _saveDoubleChecks(checks)
    }

    var el = document.getElementById('dcheckAlert_' + id)
    if (el) el.remove()

    _renderNotificationBell()

    if (window._showToast) _showToast('Double-check confirmado', 'Alerta registrado como recebido', 'success')
  }

  function _playDoubleCheckSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)()
      // Dois beeps curtos
      for (var i = 0; i < 2; i++) {
        var osc = ctx.createOscillator()
        var gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.value = 0.2
        osc.start(ctx.currentTime + i * 0.25)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2)
        osc.stop(ctx.currentTime + i * 0.25 + 0.2)
      }
    } catch(e) {}
  }

  // Mostrar double-checks pendentes ao carregar a pagina
  function _showPendingDoubleChecks() {
    var checks = _getDoubleChecks()
    checks.filter(function(c) { return !c.acknowledged }).forEach(function(c) {
      _showDoubleCheckAlert(c)
    })
  }

  // Iniciar ao carregar
  setTimeout(_showPendingDoubleChecks, 2000)

  // ── Exposição global ──────────────────────────────────────────
  window._showToast              = _showToast
  window._dismissToast           = _dismissToast
  window._renderNotificationBell = _renderNotificationBell
  window.createDoubleCheck       = createDoubleCheck
  window.acknowledgeDoubleCheck  = acknowledgeDoubleCheck

  // ── Namespace agregador congelado (contrato canonico do projeto) ─
  // Os window.<fn> acima permanecem para compatibilidade com onclick inline.
  window.AgendaNotifications = Object.freeze({
    showToast: _showToast,
    dismissToast: _dismissToast,
    renderNotificationBell: _renderNotificationBell,
    createDoubleCheck: createDoubleCheck,
    acknowledgeDoubleCheck: acknowledgeDoubleCheck
  })

})()
