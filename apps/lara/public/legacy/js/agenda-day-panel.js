// ── ClinicAI — Alertas da Agenda + Guard de Navegacao ────────────
// Alertas automaticos para secretaria + bloqueio de saida sem finalizar
// Depende: agenda-smart.js (STATUS_LABELS, STATUS_COLORS, apptTransition)

;(function () {
'use strict'

var ALERT_CHECK_INTERVAL = 30000 // 30s
var _alertTimer = null
var _activeAlerts = new Map()
var _dismissedAlerts = new Set()

// Thresholds para paciente travado em na_clinica
var NA_CLINICA_WARN_MS = 2 * 60 * 60 * 1000  // 2h — amarelo
var NA_CLINICA_CRIT_MS = 3 * 60 * 60 * 1000  // 3h — vermelho + bloqueia encerramento

// ── Tempo em na_clinica: lê historicoAlteracoes (última transição) ──
// Fallback: horaInicio do agendamento se não há histórico.
function _naClinicaSinceMs(a) {
  if (a.status !== 'na_clinica') return null
  if (Array.isArray(a.historicoAlteracoes)) {
    for (var i = a.historicoAlteracoes.length - 1; i >= 0; i--) {
      var h = a.historicoAlteracoes[i]
      if (h && (h.new_value === 'na_clinica' || h.new_value === 'attended') && h.changed_at) {
        var ts = new Date(h.changed_at).getTime()
        if (!isNaN(ts)) return Date.now() - ts
      }
    }
  }
  // Sem histórico: assume que entrou na hora do agendamento (pior caso — conservador).
  if (a.data && a.horaInicio) {
    var startTs = new Date(a.data + 'T' + a.horaInicio + ':00').getTime()
    if (!isNaN(startTs)) return Math.max(0, Date.now() - startTs)
  }
  return null
}

function _fmtDuration(ms) {
  if (ms == null) return ''
  var mins = Math.floor(ms / 60000)
  var h = Math.floor(mins / 60)
  var m = mins % 60
  return h > 0 ? h + 'h' + (m > 0 ? String(m).padStart(2,'0') + 'min' : '') : m + 'min'
}

// ── Renderizar Alertas do Dia ────────────────────────────────────
function renderDayAlerts() {
  // Renderizar no toolbar (inline) se disponivel, senao no container original
  var container = document.getElementById('agendaToolbarAlerts') || document.getElementById('dayAlertsRoot')
  if (!container) return

  var today = new Date().toISOString().slice(0, 10)
  var allAppts = window.getAppointments ? getAppointments() : []
  var appts = allAppts.filter(function(a) {
    return a.data === today && a.status !== 'cancelado' && a.status !== 'no_show' && a.status !== 'remarcado'
  })

  var alerts = _checkAlerts(appts)
  var visibleAlerts = alerts.filter(function(a) { return !_dismissedAlerts.has(a.id) })

  if (visibleAlerts.length === 0) {
    container.innerHTML = ''
    return
  }

  var isInline = container.id === 'agendaToolbarAlerts'

  var html = isInline ? '' : '<div id="dayPanelAlerts" style="margin-bottom:8px;display:flex;flex-direction:column;gap:4px">'
  visibleAlerts.slice(0, isInline ? 2 : 5).forEach(function(alert) {
    var colors = alert.type === 'danger' ? { bg:'#FEF2F2', border:'#FECACA', text:'#DC2626', icon:'#EF4444' }
               : alert.type === 'warning' ? { bg:'#FFFBEB', border:'#FDE68A', text:'#92400E', icon:'#F59E0B' }
               : { bg:'#ECFDF5', border:'#A7F3D0', text:'#065F46', icon:'#10B981' }

    if (isInline) {
      // Compact inline pill for toolbar
      html += '<div data-alert-id="' + alert.id + '" style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';border-radius:20px;font-size:11px;font-weight:700;color:' + colors.text + ';white-space:nowrap;cursor:pointer;animation:fadeIn .3s ease" ' + (alert.action ? 'onclick="' + alert.action + '"' : '') + '>'
      html += '<div style="width:6px;height:6px;border-radius:50%;background:' + colors.icon + ';flex-shrink:0;animation:' + (alert.type === 'danger' ? 'pulse 1.5s infinite' : 'none') + '"></div>'
      html += _escHtml(alert.title)
      html += '</div>'
    } else {
      // Full alert card
      html += '<div data-alert-id="' + alert.id + '" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';border-radius:8px;animation:fadeIn .3s ease">'
      html += '<div style="flex-shrink:0;width:6px;height:6px;border-radius:50%;background:' + colors.icon + ';animation:' + (alert.type === 'danger' ? 'pulse 1.5s infinite' : 'none') + '"></div>'
      html += '<div style="flex:1;min-width:0"><span style="font-size:11px;font-weight:700;color:' + colors.text + '">' + _escHtml(alert.title) + '</span></div>'
      if (alert.action) {
        html += '<button onclick="' + alert.action + '" style="flex-shrink:0;padding:3px 8px;background:#fff;border:1px solid ' + colors.border + ';border-radius:5px;font-size:9px;font-weight:700;color:' + colors.text + ';cursor:pointer">' + _escHtml(alert.actionLabel || 'Ver') + '</button>'
      }
      html += '<button onclick="dismissDayAlert(\'' + alert.id + '\')" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:' + colors.text + ';opacity:.5;font-size:14px;padding:0 3px">x</button>'
      html += '</div>'
    }
  })
  if (!isInline) html += '</div>'

  container.innerHTML = html

  // Notificacao sonora para alertas danger novos
  visibleAlerts.forEach(function(alert) {
    if (alert.type === 'danger' && !_activeAlerts.has(alert.id)) {
      _playAlertSound()
    }
    _activeAlerts.set(alert.id, true)
  })
}

// ── Verificar alertas ────────────────────────────────────────────
function _checkAlerts(appts) {
  var alerts = []
  var now = new Date()
  var nowMinutes = now.getHours() * 60 + now.getMinutes()

  appts.forEach(function(a) {
    if (!a.horaInicio || !a.horaFim) return
    var parts = a.horaInicio.split(':')
    var startMin = parseInt(parts[0]) * 60 + parseInt(parts[1])
    var endParts = a.horaFim.split(':')
    var endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1])

    // Alerta: tempo excedido (passou do horario final e nao finalizou)
    if (nowMinutes > endMin && ['em_consulta','na_clinica'].includes(a.status)) {
      var excedido = nowMinutes - endMin
      alerts.push({
        id: 'over_' + a.id, type: 'danger', priority: 0,
        title: 'Tempo excedido ' + excedido + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Deveria ter finalizado as ' + a.horaFim + '. Verificar com profissional.',
        action: "openFinalizeModal('" + a.id + "')", actionLabel: 'Finalizar',
      })
    }

    // Alerta: paciente em na_clinica ha muito tempo (travado)
    // 3h+ = crítico (bloqueia encerramento do dia); 2h+ = warning
    if (a.status === 'na_clinica') {
      var sinceMs = _naClinicaSinceMs(a)
      if (sinceMs != null && sinceMs >= NA_CLINICA_CRIT_MS) {
        alerts.push({
          id: 'stuck_crit_' + a.id, type: 'danger', priority: 0,
          title: 'Na clínica ha ' + _fmtDuration(sinceMs) + ' — ' + (a.pacienteNome || 'Paciente'),
          message: 'Paciente entrou ha mais de 3h sem finalização. Resolver antes de encerrar o dia.',
          action: "openFinalizeModal('" + a.id + "')", actionLabel: 'Finalizar',
        })
      } else if (sinceMs != null && sinceMs >= NA_CLINICA_WARN_MS) {
        alerts.push({
          id: 'stuck_warn_' + a.id, type: 'warning', priority: 1,
          title: 'Na clínica ha ' + _fmtDuration(sinceMs) + ' — ' + (a.pacienteNome || 'Paciente'),
          message: 'Paciente aguardando finalização. Atenção ao tempo.',
          action: "openFinalizeModal('" + a.id + "')", actionLabel: 'Finalizar',
        })
      }
    }

    // Alerta: 10 min antes de finalizar
    var minsToEnd = endMin - nowMinutes
    if (minsToEnd > 0 && minsToEnd <= 10 && ['em_consulta','na_clinica'].includes(a.status)) {
      alerts.push({
        id: 'end10_' + a.id, type: 'danger', priority: 1,
        title: 'Faltam ' + minsToEnd + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' com ' + (a.profissionalNome || '') + ' termina as ' + a.horaFim,
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Abrir',
      })
    }

    // Alerta: paciente atrasado (passou 15min do horario)
    if (nowMinutes > startMin + 15 && ['agendado','aguardando_confirmacao','confirmado','aguardando'].includes(a.status)) {
      var atraso = nowMinutes - startMin
      alerts.push({
        id: 'late_' + a.id, type: 'warning', priority: 2,
        title: 'Atrasado ' + atraso + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Agendado para ' + a.horaInicio + '. Confirmar presenca ou remarcar.',
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Ver',
      })
    }

    // Alerta: nao confirmou (30min antes do horario)
    var minsToStart = startMin - nowMinutes
    if (minsToStart > 0 && minsToStart <= 30 && ['agendado','aguardando_confirmacao'].includes(a.status)) {
      alerts.push({
        id: 'noconf_' + a.id, type: 'warning', priority: 3,
        title: 'Sem confirmacao — ' + (a.pacienteNome || 'Paciente'),
        message: 'Consulta as ' + a.horaInicio + '. Paciente nao confirmou presenca.',
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Contatar',
      })
    }

    // Alerta: proximo paciente (em 15 min)
    if (minsToStart > 0 && minsToStart <= 15 && ['confirmado','aguardando'].includes(a.status)) {
      alerts.push({
        id: 'next_' + a.id, type: 'info', priority: 4,
        title: 'Proximo em ' + minsToStart + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' as ' + a.horaInicio + ' com ' + (a.profissionalNome || ''),
      })
    }
  })

  alerts.sort(function(a, b) { return a.priority - b.priority })
  return alerts
}

// ── Timer de alertas ─────────────────────────────────────────────
function _startAlertTimer() {
  if (_alertTimer) clearInterval(_alertTimer)
  _alertTimer = setInterval(function() {
    var container = document.getElementById('dayAlertsRoot')
    if (container && container.offsetParent !== null) {
      renderDayAlerts()
    }
  }, ALERT_CHECK_INTERVAL)
}

function _playAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)()
    var osc = ctx.createOscillator()
    var gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.15
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.stop(ctx.currentTime + 0.3)
  } catch(e) {}
}

function _escHtml(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

// ── Dismiss alerta ───────────────────────────────────────────────
function dismissDayAlert(alertId) {
  _dismissedAlerts.add(alertId)
  var el = document.querySelector('[data-alert-id="' + alertId + '"]')
  if (el) el.style.display = 'none'
}


// ── CSS Animations ───────────────────────────────────────────────
if (!document.getElementById('dayPanelStyles')) {
  var style = document.createElement('style')
  style.id = 'dayPanelStyles'
  style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
  document.head.appendChild(style)
}

// ── Init ─────────────────────────────────────────────────────────
_startAlertTimer()
// Render alertas quando a agenda renderiza
var _origRenderAgenda = window.renderAgenda
if (_origRenderAgenda) {
  window.renderAgenda = function() {
    _origRenderAgenda.apply(this, arguments)
    renderDayAlerts()
  }
}

// ── Modal Finalizar Dia ──────────────────────────────────────────
// Valida que nao ha paciente em na_clinica ha mais de 3h e nao ha
// em_consulta aberta. Lista pendencias com destaque para criticos.
function openFinalizarDiaModal() {
  var today = new Date().toISOString().slice(0, 10)
  var appts = (window.getAppointments ? getAppointments() : [])
    .filter(function(a) { return a.data === today && a.status !== 'cancelado' && a.status !== 'no_show' && a.status !== 'remarcado' })

  // Separa pendentes (em_consulta / na_clinica) de finalizados
  var pendentes = appts.filter(function(a) { return ['em_consulta','na_clinica'].includes(a.status) })
  var finalizados = appts.filter(function(a) { return a.status === 'finalizado' || a.status === 'realizado' })

  // Anota info de tempo em na_clinica pra destacar criticos
  var pendentesInfo = pendentes.map(function(a) {
    var since = a.status === 'na_clinica' ? _naClinicaSinceMs(a) : null
    var isCrit = since != null && since >= NA_CLINICA_CRIT_MS
    var isWarn = since != null && since >= NA_CLINICA_WARN_MS && !isCrit
    return { appt: a, sinceMs: since, isCrit: isCrit, isWarn: isWarn }
  })

  var hasCritico = pendentesInfo.some(function(p) { return p.isCrit }) || pendentes.some(function(a) { return a.status === 'em_consulta' })

  var existing = document.getElementById('finalizarDiaModal')
  if (existing) existing.remove()

  var modal = document.createElement('div')
  modal.id = 'finalizarDiaModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9900;display:flex;align-items:center;justify-content:center;padding:16px'

  var headerBg = hasCritico ? '#DC2626' : (pendentes.length > 0 ? '#F59E0B' : '#10B981')
  var headerLabel = hasCritico ? 'Nao e possivel encerrar o dia' : (pendentes.length > 0 ? 'Pendencias no dia' : 'Tudo pronto para encerrar')
  var headerSub = hasCritico
    ? 'Resolva as pendencias criticas destacadas abaixo.'
    : (pendentes.length > 0 ? 'Ha pacientes aguardando finalizacao.' : finalizados.length + ' consulta(s) realizada(s) hoje.')

  var listHtml = ''
  if (pendentesInfo.length > 0) {
    listHtml = '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;max-height:280px;overflow-y:auto">'
    pendentesInfo.forEach(function(p) {
      var a = p.appt
      var bg = p.isCrit ? '#FEF2F2' : (p.isWarn || a.status === 'em_consulta' ? '#FFFBEB' : '#F9FAFB')
      var border = p.isCrit ? '#FECACA' : (p.isWarn || a.status === 'em_consulta' ? '#FDE68A' : '#E5E7EB')
      var dotColor = p.isCrit ? '#EF4444' : (p.isWarn || a.status === 'em_consulta' ? '#F59E0B' : '#9CA3AF')
      var pulse = p.isCrit ? 'animation:pulse 1.5s infinite;' : ''
      var statusLbl = a.status === 'em_consulta' ? 'Em consulta' : 'Na clinica'
      var timeLbl = p.sinceMs != null ? ' · ha ' + _fmtDuration(p.sinceMs) : (a.horaInicio ? ' · ' + a.horaInicio : '')
      var tag = p.isCrit ? ' <span style="font-size:10px;font-weight:800;color:#DC2626;background:#fff;border:1px solid #FECACA;padding:2px 6px;border-radius:10px;margin-left:4px">CRITICO</span>' : ''
      listHtml += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + bg + ';border:1px solid ' + border + ';border-radius:8px">'
      listHtml += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex-shrink:0;' + pulse + '"></div>'
      listHtml += '<div style="flex:1;min-width:0">'
      listHtml += '<div style="font-size:13px;font-weight:700;color:#111">' + _escHtml(a.pacienteNome || 'Paciente') + tag + '</div>'
      listHtml += '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + _escHtml(statusLbl) + _escHtml(timeLbl) + '</div>'
      listHtml += '</div>'
      listHtml += '<button onclick="document.getElementById(\'finalizarDiaModal\').remove();openFinalizeModal(\'' + a.id + '\')" style="padding:6px 12px;background:#7C3AED;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">Resolver</button>'
      listHtml += '</div>'
    })
    listHtml += '</div>'
  }

  // Quando nao ha pendentes: resumo de finalizados
  var summaryHtml = ''
  if (pendentes.length === 0) {
    var totalValor = finalizados.reduce(function(s, a) { return s + (parseFloat(a.valor) || 0) }, 0)
    summaryHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    summaryHtml += '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px"><div style="font-size:11px;color:#6B7280;font-weight:700">Consultas</div><div style="font-size:22px;font-weight:800;color:#111;margin-top:2px">' + finalizados.length + '</div></div>'
    summaryHtml += '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px"><div style="font-size:11px;color:#6B7280;font-weight:700">Faturamento</div><div style="font-size:22px;font-weight:800;color:#10B981;margin-top:2px">R$ ' + totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>'
    summaryHtml += '</div>'
  }

  var actionBtn
  if (hasCritico) {
    actionBtn = '<button disabled style="flex:2;padding:11px;background:#F3F4F6;color:#9CA3AF;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-weight:700;cursor:not-allowed">Resolva os itens criticos</button>'
  } else if (pendentes.length > 0) {
    actionBtn = '<button onclick="document.getElementById(\'finalizarDiaModal\').remove()" style="flex:2;padding:11px;background:#F59E0B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Voltar e resolver</button>'
  } else {
    actionBtn = '<button onclick="_confirmarEncerrarDia()" style="flex:2;padding:11px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Encerrar dia</button>'
  }

  modal.innerHTML =
    '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:520px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">' +
      '<div style="background:' + headerBg + ';padding:16px 20px">' +
        '<div style="font-size:15px;font-weight:800;color:#fff">' + _escHtml(headerLabel) + '</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,.9);margin-top:3px">' + _escHtml(headerSub) + '</div>' +
      '</div>' +
      '<div style="padding:18px 20px">' +
        listHtml + summaryHtml +
        '<div style="display:flex;gap:8px">' +
          actionBtn +
          '<button onclick="document.getElementById(\'finalizarDiaModal\').remove()" style="flex:1;padding:11px;border:1px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Fechar</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)
}

function _confirmarEncerrarDia() {
  var dlg = document.getElementById('finalizarDiaModal')
  if (dlg) dlg.remove()
  // Marca o fechamento manual do dia em localStorage (idempotente no dia)
  var today = new Date().toISOString().slice(0, 10)
  try { localStorage.setItem('clinicai_day_closed', today) } catch (_) {}
  if (window._showToast) _showToast('Dia encerrado. Bom descanso!', 'success')
}

// ── Guard estendido: bloqueia navegacao com em_consulta OU na_clinica > 3h ──
function _checkPendingConsulta(targetPageId) {
  if (targetPageId && targetPageId.startsWith('agenda')) return true

  var today = new Date().toISOString().slice(0, 10)
  var appts = window.getAppointments ? getAppointments() : []
  var emConsulta = appts.filter(function(a) {
    return a.data === today && a.status === 'em_consulta'
  })
  var stuck = appts.filter(function(a) {
    if (a.data !== today || a.status !== 'na_clinica') return false
    var since = _naClinicaSinceMs(a)
    return since != null && since >= NA_CLINICA_CRIT_MS
  })

  if (emConsulta.length === 0 && stuck.length === 0) return true

  var primeiroId = (emConsulta[0] || stuck[0]).id
  var nomes = emConsulta.concat(stuck).map(function(a) { return a.pacienteNome || 'Paciente' }).join(', ')
  var titulo = stuck.length > 0 && emConsulta.length === 0
    ? 'Paciente ha mais de 3h na clinica'
    : 'Consulta em andamento'

  var existing = document.getElementById('pendingConsultaModal')
  if (existing) existing.remove()

  var modal = document.createElement('div')
  modal.id = 'pendingConsultaModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;padding:16px'
  modal.innerHTML =
    '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">' +
      '<div style="background:#EF4444;padding:14px 18px">' +
        '<div style="font-size:14px;font-weight:800;color:#fff">' + _escHtml(titulo) + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">' + _escHtml(nomes) + '</div>' +
      '</div>' +
      '<div style="padding:16px 18px">' +
        '<div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px">' +
          'Existe(m) <strong>' + (emConsulta.length + stuck.length) + ' paciente(s)</strong> aguardando finalizacao. ' +
          'Resolva antes de sair da agenda.' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="document.getElementById(\'pendingConsultaModal\').remove();openFinalizeModal(\'' + primeiroId + '\')" style="flex:2;padding:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Finalizar Atendimento</button>' +
          '<button onclick="document.getElementById(\'pendingConsultaModal\').remove()" style="flex:1;padding:10px;border:1px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Voltar</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)

  return false
}

// ── Expose ───────────────────────────────────────────────────────
window.renderDayAlerts         = renderDayAlerts
window.dismissDayAlert         = dismissDayAlert
window._checkPendingConsulta   = _checkPendingConsulta
window.openFinalizarDiaModal   = openFinalizarDiaModal
window._confirmarEncerrarDia   = _confirmarEncerrarDia

// ── Namespace agregador congelado (contrato canonico do projeto) ─
// Os window.<fn> acima permanecem para compatibilidade com onclick inline.
window.AgendaDayPanel = Object.freeze({
  renderDayAlerts: renderDayAlerts,
  dismissDayAlert: dismissDayAlert,
  openFinalizarDiaModal: openFinalizarDiaModal
})

})()
