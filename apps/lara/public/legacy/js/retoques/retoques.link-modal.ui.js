/**
 * ClinicAI - Retoques Link Modal
 *
 * Modal que mostra agendamentos futuros do mesmo paciente para vincular a uma
 * sugestao de retoque. Usa retoque_link_appointment RPC ja existente.
 *
 * API:
 *   RetoquesLinkModal.open(campaignId, leadId, callback)
 *     callback(true|false) — true se vinculou
 *
 * Buscar agendamentos: usa window.getAppointments() (cache em memoria do
 * ClinicAI) filtrando por pacienteId === leadId e dataHora futura.
 */
;(function () {
  'use strict'

  if (window._retoquesLinkModalLoaded) return
  window._retoquesLinkModalLoaded = true

  var GOLD = '#C8A97E'
  var DARK = '#0A0A0A'
  var TEXT = '#F5F0E8'

  function _toast(msg, type) {
    if (window.toast) return window.toast(msg, type || 'info')
    if (window.showToast) return window.showToast(msg, type || 'info')
  }

  function _futureAppointmentsForLead(leadId) {
    if (typeof window.getAppointments !== 'function') return []
    var all = window.getAppointments() || []
    var now = new Date()
    return all.filter(function (a) {
      if ((a.pacienteId || a.paciente_id) !== leadId) return false
      var dt = a.dataHora || a.data_hora || a.start || a.inicio
      if (!dt) return false
      try { return new Date(dt) > now } catch (e) { return false }
    }).sort(function (a, b) {
      var da = new Date(a.dataHora || a.data_hora || a.start || a.inicio)
      var db = new Date(b.dataHora || b.data_hora || b.start || b.inicio)
      return da - db
    })
  }

  function _fmtDateTime(dt) {
    if (!dt) return '—'
    try {
      var d = new Date(dt)
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch (e) { return String(dt) }
  }

  function _close(overlay) {
    overlay.style.opacity = '0'
    setTimeout(function () { if (overlay.parentNode) overlay.remove() }, 200)
  }

  window.RetoquesLinkModal = {
    open: function (campaignId, leadId, callback) {
      var appts = _futureAppointmentsForLead(leadId)

      var overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px);opacity:0;transition:opacity .2s'

      var apptsHtml = appts.length ? appts.map(function (a) {
        var dt = a.dataHora || a.data_hora || a.start || a.inicio
        var label = (a.procedimento || a.tipo || a.titulo || 'Agendamento')
        return '<button data-appt-id="' + (a.id || a.appointment_id) + '" style="' +
          'display:flex;justify-content:space-between;align-items:center;width:100%;padding:14px 16px;' +
          'background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.2);border-radius:10px;' +
          'color:' + TEXT + ';cursor:pointer;margin-bottom:8px;font-family:Montserrat,sans-serif;' +
          'transition:all .15s;text-align:left">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700;margin-bottom:2px">' + _fmtDateTime(dt) + '</div>' +
            '<div style="font-size:11px;color:rgba(200,169,126,0.7)">' + String(label).replace(/[<>]/g, '') + '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:' + GOLD + ';letter-spacing:0.08em;font-weight:700">VINCULAR</div>' +
        '</button>'
      }).join('') : (
        '<div style="padding:32px;text-align:center;color:rgba(200,169,126,0.5);font-style:italic;font-size:13px;font-family:Cormorant Garamond,serif">' +
          'Nenhum agendamento futuro encontrado para este paciente.' +
          '<div style="margin-top:12px;font-family:Montserrat,sans-serif;font-size:11px;color:rgba(245,240,232,0.4);font-style:normal">' +
            'Crie o agendamento na agenda primeiro, depois volte aqui para vincular.' +
          '</div>' +
        '</div>'
      )

      overlay.innerHTML = '<div style="background:' + DARK + ';border:1px solid rgba(200,169,126,0.2);border-radius:16px;max-width:520px;width:100%;padding:28px;color:' + TEXT + ';font-family:Montserrat,sans-serif;box-shadow:0 32px 80px rgba(0,0,0,0.7);max-height:80vh;overflow-y:auto">' +
        '<div style="margin-bottom:20px">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-style:italic;color:' + GOLD + ';margin-bottom:6px">Vincular ao agendamento</div>' +
          '<div style="font-size:12px;color:rgba(245,240,232,0.6)">Selecione o agendamento que vai cumprir esta sugestao de retoque. Status muda para <strong>Agendado</strong>.</div>' +
        '</div>' +
        apptsHtml +
        '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
          '<button id="retLinkClose" style="padding:8px 16px;background:transparent;color:rgba(245,240,232,0.6);border:1px solid rgba(245,240,232,0.15);border-radius:8px;cursor:pointer;font-family:Montserrat,sans-serif;font-size:12px">Fechar</button>' +
        '</div>' +
      '</div>'

      document.body.appendChild(overlay)
      requestAnimationFrame(function () { overlay.style.opacity = '1' })

      overlay.querySelector('#retLinkClose').addEventListener('click', function () {
        _close(overlay)
        if (callback) callback(false)
      })

      overlay.querySelectorAll('[data-appt-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var apptId = b.getAttribute('data-appt-id')
          if (!window.RetoquesService) { _toast('Servico indisponivel', 'warn'); return }
          window.RetoquesService.linkAppointment(campaignId, apptId).then(function () {
            _toast('Retoque vinculado ao agendamento', 'success')
            _close(overlay)
            if (callback) callback(true)
          }).catch(function (e) {
            _toast('Falha ao vincular: ' + (e.message || ''), 'error')
          })
        })
      })

      function _esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', _esc); _close(overlay); if (callback) callback(false) } }
      document.addEventListener('keydown', _esc)
    },
  }
})()
