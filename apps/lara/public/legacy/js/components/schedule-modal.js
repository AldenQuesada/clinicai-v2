/**
 * ClinicAI — ScheduleModal (extraído de leads.js no Sprint 9)
 *
 * Modal para agendar consulta a partir da tabela de leads.
 * Expõe globalmente: leadsActionSchedule(leadId, leadName, phone, e)
 */

function leadsActionSchedule(leadId, leadName, phone, e) {
  if (e) e.stopPropagation()

  var professionals = window.AgendaAccessService ? window.AgendaAccessService.getAll() : []
  var today     = new Date().toISOString().slice(0, 10)
  var nextHour  = new Date(); nextHour.setMinutes(0, 0, 0); nextHour.setHours(nextHour.getHours() + 1)
  var startTime = nextHour.toTimeString().slice(0, 5)

  var profOptions = professionals.length
    ? professionals.map(function(p, i) {
        return '<option value="' + i + '" data-id="' + (p.id || '') + '" data-name="' + (p.name || p.nome || '').replace(/"/g, '') + '">' +
          (p.name || p.nome || 'Profissional ' + (i + 1)) + '</option>'
      }).join('')
    : '<option value="">Nenhum profissional cadastrado</option>'

  var modal = document.createElement('div')
  modal.className = 'lt-modal-overlay'
  modal.id = 'leadsScheduleModal'
  modal.innerHTML =
    '<div class="lt-modal lt-modal-wide">' +
      '<div class="lt-modal-title">Agendar — ' + leadName + '</div>' +
      '<div class="lt-modal-lead-info">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.09z"/></svg>' +
        (phone || 'Sem telefone') +
      '</div>' +
      '<div class="lt-modal-grid">' +
        '<div class="lt-modal-field">' +
          '<label class="lt-modal-label">Profissional</label>' +
          '<select id="lsProf" class="lt-modal-input">' + profOptions + '</select>' +
        '</div>' +
        '<div class="lt-modal-field">' +
          '<label class="lt-modal-label">Procedimento</label>' +
          '<input id="lsProc" class="lt-modal-input" type="text" placeholder="Ex: Consulta, Limpeza de pele...">' +
        '</div>' +
        '<div class="lt-modal-field">' +
          '<label class="lt-modal-label">Data</label>' +
          '<input id="lsDate" class="lt-modal-input" type="date" value="' + today + '">' +
        '</div>' +
        '<div class="lt-modal-field">' +
          '<label class="lt-modal-label">Hora inicio</label>' +
          '<input id="lsStart" class="lt-modal-input" type="time" value="' + startTime + '">' +
        '</div>' +
        '<div class="lt-modal-field">' +
          '<label class="lt-modal-label">Duracao</label>' +
          '<select id="lsDur" class="lt-modal-input">' +
            '<option value="30">30 min</option>' +
            '<option value="45">45 min</option>' +
            '<option value="60" selected>1 hora</option>' +
            '<option value="90">1h30</option>' +
            '<option value="120">2 horas</option>' +
          '</select>' +
        '</div>' +
        '<div class="lt-modal-field lt-modal-field-full">' +
          '<label class="lt-modal-label">Observacoes</label>' +
          '<textarea id="lsObs" class="lt-modal-input lt-modal-textarea" placeholder="Observacoes opcionais..."></textarea>' +
        '</div>' +
      '</div>' +
      '<div id="lsError" style="color:#ef4444;font-size:12px;margin-bottom:8px;display:none"></div>' +
      '<div class="lt-modal-btns">' +
        '<button class="lt-modal-btn-cancel">Cancelar</button>' +
        '<button class="lt-modal-btn-confirm" id="lsConfirmBtn" style="background:#6366f1">Agendar</button>' +
      '</div>' +
    '</div>'

  document.body.appendChild(modal)

  modal.querySelector('.lt-modal-btn-cancel').onclick = function() { modal.remove() }

  modal.querySelector('#lsConfirmBtn').onclick = async function() {
    var profSel  = modal.querySelector('#lsProf')
    var proc     = modal.querySelector('#lsProc').value.trim()
    var date     = modal.querySelector('#lsDate').value
    var start    = modal.querySelector('#lsStart').value
    var dur      = parseInt(modal.querySelector('#lsDur').value, 10)
    var obs      = modal.querySelector('#lsObs').value.trim()
    var errEl    = modal.querySelector('#lsError')

    if (!date)  { errEl.textContent = 'Selecione uma data.';        errEl.style.display = ''; return }
    if (!start) { errEl.textContent = 'Informe a hora de inicio.';  errEl.style.display = ''; return }
    if (!proc)  { errEl.textContent = 'Informe o procedimento.';    errEl.style.display = ''; return }

    errEl.style.display = 'none'
    var btn = modal.querySelector('#lsConfirmBtn')
    btn.disabled = true; btn.textContent = 'Agendando...'

    var parts  = start.split(':').map(Number)
    var endMin = parts[0] * 60 + parts[1] + dur
    var endTime = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0')

    var profIdx  = profSel.selectedIndex
    var profOpt  = profSel.options[profIdx]
    var profId   = profOpt?.dataset?.id   || ''
    var profName = profOpt?.dataset?.name || profOpt?.text || ''

    // 2026-04-23: appointments.id virou uuid (mig 809+811). Servidor exige UUID puro.
    var apptId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        })

    var payload = {
      id:              apptId,
      pacienteId:      leadId,
      pacienteNome:    leadName,
      _professionalId: profId,
      profissionalIdx: profIdx,
      profissionalNome: profName,
      data:            date,
      horaInicio:      start,
      horaFim:         endTime,
      procedimento:    proc,
      status:          'agendado',
      obs:             obs || null,
      origem:          'sdr_table',
    }

    var result = await window._sbShared.rpc('appt_upsert', { p_data: payload })
    if (result.error) {
      errEl.textContent = 'Erro: ' + result.error.message
      errEl.style.display = ''
      btn.disabled = false; btn.textContent = 'Agendar'
      return
    }

    modal.remove()
  }
}
