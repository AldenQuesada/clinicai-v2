/**
 * ClinicAI — Agenda Modal · Recurrence (séries recorrentes)
 * Extraido de agenda-modal.js (seam 3 · 2026-04-24) pra reduzir o
 * monolito de 3287 LOC. Bloco bem isolado — series de appointments
 * com transacao RPC atomica via appt_create_series.
 *
 * Funcoes publicas:
 *   apptToggleRecurrence(checkbox)
 *   apptSaveWithSeries()
 *   apptCreateNextSessionOnly()
 *   _apptUpdateRecurrenceVisibility()
 *
 * Dependencias (expostas por agenda-modal.js via window._apptInternal):
 *   getAppts, saveAppts, genId, addMins, refresh, warn, checkConflict,
 *   saveAppt (async ref), getProcs (getter de _apptProcs)
 * Externas ja globais:
 *   window._showToast, window.AppointmentsService, window.AutomationsEngine
 */
;(function () {
  'use strict'

  // Internal bus — carrega no primeiro uso (ordem de carregamento
  // no index garante que agenda-modal.js rode antes).
  var _I = null
  function I() { return (_I = _I || window._apptInternal || {}) }

  function _recUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  function _recFmtShort(iso) {
    try {
      var d = new Date(iso + 'T12:00:00')
      var dn = ['dom','seg','ter','qua','qui','sex','sab'][d.getDay()]
      return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + ' (' + dn + ')'
    } catch(e) { return iso }
  }

  // Gera cronograma da serie.
  // - Se fases esta preenchido (array com sessoes+intervalo_dias por fase),
  //   respeita a cadencia mista (ex: 8 semanais + 2 quinzenais).
  function _recGenerateDates(baseDateStr, intervalDays, total, fases) {
    var dates = []
    var cursor = new Date(baseDateStr + 'T12:00:00')
    dates.push(cursor.toISOString().slice(0, 10))

    if (fases && fases.length) {
      fases.forEach(function(fase, fIdx) {
        var n = parseInt(fase.sessoes) || 0
        var gap = parseInt(fase.intervalo_dias) || 7
        var count = (fIdx === 0) ? Math.max(0, n - 1) : n
        for (var i = 0; i < count; i++) {
          cursor.setDate(cursor.getDate() + gap)
          dates.push(cursor.toISOString().slice(0, 10))
        }
      })
      return dates
    }

    for (var i = 1; i < total; i++) {
      cursor.setDate(cursor.getDate() + intervalDays)
      dates.push(cursor.toISOString().slice(0, 10))
    }
    return dates
  }

  function _recFasesLabel(fases) {
    if (!fases || !fases.length) return ''
    return fases.map(function(f) {
      var lbl = f.nome || 'Fase'
      return lbl + ' ' + (f.sessoes || 0) + 'x/' + (f.intervalo_dias || 0) + 'd'
    }).join(' → ')
  }

  function _apptUpdateRecurrenceVisibility() {
    var block = document.getElementById('apptRecurrenceBlock')
    if (!block) return
    var procs = I().getProcs ? I().getProcs() : []
    var hasProcs = procs && procs.length > 0
    block.style.display = hasProcs ? '' : 'none'
    var editId = (document.getElementById('appt_id') || {}).value
    if (editId) { block.style.display = 'none'; return }
    var procSel = document.getElementById('appt_rec_proc')
    var procWrap = document.getElementById('apptRecurrenceProcWrap')
    if (procSel && hasProcs) {
      procSel.innerHTML = procs.map(function(p, i) {
        return '<option value="' + i + '">' + (p.nome || 'Procedimento ' + (i+1)) + '</option>'
      }).join('')
    }
    if (procWrap) procWrap.style.display = procs.length > 1 ? '' : 'none'
    _apptRecurrenceUpdatePreview()
  }

  function apptToggleRecurrence(cb) {
    var fields = document.getElementById('apptRecurrenceFields')
    if (fields) fields.style.display = cb.checked ? '' : 'none'
    _apptRecurrenceUpdatePreview()
  }

  function _apptRecurrenceUpdatePreview() {
    var previewEl = document.getElementById('apptRecurrencePreview')
    if (!previewEl) return
    var check = document.getElementById('appt_rec_check')
    var baseDate = (document.getElementById('appt_data') || {}).value || ''
    if (!check || !check.checked || !baseDate) { previewEl.innerHTML = ''; return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var total = parseInt((document.getElementById('appt_rec_total') || {}).value) || 8
    if (total < 2) total = 2
    if (total > 52) total = 52

    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var procs = I().getProcs ? I().getProcs() : []
    var selectedProc = procs[procIdx]
    var fases = (selectedProc && Array.isArray(selectedProc.fases) && selectedProc.fases.length)
      ? selectedProc.fases : null

    var dates = _recGenerateDates(baseDate, interval, total, fases)
    var shown = dates.slice(0, 5).map(function(d, i) {
      return '<b>' + (i+1) + '.</b> ' + _recFmtShort(d)
    }).join(' &nbsp;&middot;&nbsp; ')
    if (dates.length > 5) shown += ' &nbsp;&middot;&nbsp; <i>(+' + (dates.length - 5) + ' mais)</i>'
    var prefixo = fases
      ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-right:6px">MULTI-FASE</span>' +
        '<span style="color:#6B7280;font-size:11px">' + _recFasesLabel(fases) + '</span><br/>'
      : ''
    previewEl.innerHTML = prefixo + 'Serie: ' + shown
  }

  // Bind change events pra recalcular preview
  document.addEventListener('DOMContentLoaded', function() {
    ['appt_data', 'appt_rec_interval', 'appt_rec_total', 'appt_rec_proc'].forEach(function(id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('change', _apptRecurrenceUpdatePreview)
      if (el) el.addEventListener('input', _apptRecurrenceUpdatePreview)
    })
  })

  function _apptCheckSeriesConflicts(datesArray, inicio, duracao, profIdx, salaIdx, excludeId) {
    var all = I().getAppts ? I().getAppts() : []
    var fim = I().addMins ? I().addMins(inicio, duracao) : inicio
    var conflicts = []
    datesArray.forEach(function(dateIso, idx) {
      var test = {
        id: 'rec_test_' + idx, data: dateIso, horaInicio: inicio, horaFim: fim,
        profissionalIdx: profIdx, salaIdx: salaIdx, status: 'agendado',
      }
      var check = I().checkConflict
        ? I().checkConflict(test, all.filter(function(a) { return a.id !== excludeId }))
        : { conflict: false }
      if (check && check.conflict) {
        conflicts.push({ index: idx, date: dateIso, reason: check.message || check.reason || 'Conflito de horario' })
      }
    })
    return conflicts
  }

  function _apptShowConflictModal(conflicts, onResolve) {
    var existing = document.getElementById('apptConflictModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'apptConflictModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.7);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px'
    var rows = conflicts.map(function(c) {
      return '<tr data-c-row="' + c.index + '">'
        + '<td style="padding:8px 10px;font-size:12px;color:#0F172A">Sessao <b>' + (c.index+1) + '</b></td>'
        + '<td style="padding:8px 10px;font-size:12px">' + _recFmtShort(c.date) + '</td>'
        + '<td style="padding:8px 10px;font-size:11px;color:#DC2626">' + c.reason + '</td>'
        + '<td style="padding:8px 10px">'
        +   '<select data-c-action="' + c.index + '" style="padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:11px;background:#fff">'
        +     '<option value="skip">Pular essa sessao</option>'
        +     '<option value="next">Tentar +1 dia</option>'
        +     '<option value="keep">Manter (resolver depois)</option>'
        +   '</select>'
        + '</td>'
        + '</tr>'
    }).join('')
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:80vh;display:flex;flex-direction:column">'
      + '<div style="padding:16px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:8px">'
      +   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      +   '<div style="font-size:14px;font-weight:700;color:#0F172A">'+conflicts.length+' conflito(s) de horario na serie</div>'
      + '</div>'
      + '<div style="padding:16px 20px;overflow-y:auto;flex:1">'
      +   '<div style="font-size:12px;color:#475569;margin-bottom:12px;line-height:1.5">Escolha como resolver cada sessao conflitada. Sessoes sem conflito sao criadas normalmente.</div>'
      +   '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +     '<thead><tr style="background:#F8FAFC">'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Sessao</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Data</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Motivo</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Acao</th>'
      +     '</tr></thead>'
      +     '<tbody>' + rows + '</tbody>'
      +   '</table>'
      + '</div>'
      + '<div style="padding:12px 20px;border-top:1px solid #F1F5F9;display:flex;gap:8px;justify-content:flex-end">'
      +   '<button type="button" data-c-cancel style="padding:8px 16px;background:#fff;color:#64748B;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Cancelar tudo</button>'
      +   '<button type="button" data-c-confirm style="padding:8px 20px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">Continuar</button>'
      + '</div>'
      + '</div>'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { overlay.remove(); if (onResolve) onResolve(null); return }
      if (e.target.closest('[data-c-cancel]')) { overlay.remove(); if (onResolve) onResolve(null); return }
      if (e.target.closest('[data-c-confirm]')) {
        var decisions = {}
        conflicts.forEach(function(c) {
          var sel = overlay.querySelector('[data-c-action="' + c.index + '"]')
          decisions[c.index] = sel ? sel.value : 'skip'
        })
        overlay.remove()
        if (onResolve) onResolve(decisions)
      }
    })
  }

  function _apptCloneForSeries(base, newDateIso, indexInSeries, total, groupId, interval, procName) {
    var child = Object.assign({}, base)
    child.id = I().genId ? I().genId() : _recUuid()
    child.data = newDateIso
    child.status = 'agendado'
    child.recurrenceGroupId = groupId
    child.recurrenceIndex = indexInSeries
    child.recurrenceTotal = total
    child.recurrenceProcedure = procName
    child.recurrenceIntervalDays = interval
    child.confirmacaoEnviada = false
    child.consentimentoImagem = 'pendente'
    child.presenca = null
    child.chegadaEm = null
    child.canceladoEm = null
    child.motivoCancelamento = null
    child.noShowEm = null
    child.motivoNoShow = null
    child.historicoStatus = []
    child.historicoAlteracoes = []
    child.obsFinal = ''
    child.pagamentos = []
    child.valor = 0
    child.formaPagamento = ''
    child.statusPagamento = 'pendente'
    return child
  }

  async function apptSaveWithSeries() {
    var _warn = I().warn || function(m) { alert(m) }
    var check = document.getElementById('appt_rec_check')
    if (!check || !check.checked) { _warn('Marque "Agendar sessoes recorrentes" primeiro'); return }
    var baseDateStr = (document.getElementById('appt_data') || {}).value
    if (!baseDateStr) { _warn('Informe a data'); return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var total = parseInt((document.getElementById('appt_rec_total') || {}).value) || 8
    if (total < 2 || total > 52) { _warn('Total de sessoes deve estar entre 2 e 52'); return }
    if (interval < 1 || interval > 365) { _warn('Intervalo deve estar entre 1 e 365 dias'); return }
    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var procs = I().getProcs ? I().getProcs() : []
    var procRef = procs[procIdx] || {}
    var procName = procRef.nome || ''
    if (!procName) { _warn('Selecione o procedimento recorrente'); return }
    var inicio = (document.getElementById('appt_inicio') || {}).value
    var duracao = parseInt((document.getElementById('appt_duracao') || {}).value) || 60
    var profIdx = parseInt((document.getElementById('appt_prof') || {}).value || '0') || 0
    var salaIdx = parseInt((document.getElementById('appt_sala') || {}).value)

    var fasesProc = Array.isArray(procRef.fases) && procRef.fases.length ? procRef.fases : null
    var dates = _recGenerateDates(baseDateStr, interval, total, fasesProc)
    if (fasesProc) total = dates.length
    var childrenDates = dates.slice(1)
    var conflicts = _apptCheckSeriesConflicts(childrenDates, inicio, duracao, profIdx, isNaN(salaIdx) ? null : salaIdx, null)

    async function proceed(decisions) {
      await _apptPersistSeries({
        dates: dates, interval: interval, total: total, procName: procName,
        decisions: decisions || {}, inicio: inicio, duracao: duracao,
      })
    }

    if (conflicts.length) {
      _apptShowConflictModal(conflicts, function(decisions) {
        if (!decisions) return
        proceed(decisions)
      })
    } else {
      await proceed({})
    }
  }

  async function _apptPersistSeries(opts) {
    var dates = opts.dates, interval = opts.interval, total = opts.total, procName = opts.procName
    var decisions = opts.decisions || {}

    var _getAppts  = I().getAppts  || function() { return [] }
    var _saveAppts = I().saveAppts || function() {}
    var _saveAppt  = I().saveAppt  || async function() {}
    var _refresh   = I().refresh   || function() {}

    var prevAppts = JSON.parse(JSON.stringify(_getAppts()))

    var groupId = _recUuid()
    window.__apptPendingRecurrence = {
      groupId: groupId, index: 1, total: total, procName: procName, interval: interval,
    }
    try {
      await _saveAppt()
    } finally {
      window.__apptPendingRecurrence = null
    }

    var all = _getAppts()
    var base = all.filter(function(a) { return a.recurrenceGroupId === groupId && a.recurrenceIndex === 1 })[0]
    if (!base) {
      if (window._showToast) window._showToast('Serie cancelada', 'Falha ao salvar primeira sessao — reverta manualmente se necessario.', 'error')
      return
    }

    var created = [{ iso: dates[0], appt: base }]
    var skipped = []
    var childrenOnly = []
    for (var i = 1; i < dates.length; i++) {
      var decision = decisions[i - 1] || 'create'
      if (decision === 'skip') { skipped.push(dates[i]); continue }
      var childDate = dates[i]
      if (decision === 'next') {
        var d = new Date(childDate + 'T12:00:00'); d.setDate(d.getDate() + 1)
        childDate = d.toISOString().slice(0, 10)
      }
      var child = _apptCloneForSeries(base, childDate, i + 1, total, groupId, interval, procName)
      all.push(child)
      created.push({ iso: childDate, appt: child })
      childrenOnly.push(child)
    }
    _saveAppts(all)

    if (childrenOnly.length && window.AppointmentsService) {
      var syncFn = window.AppointmentsService.syncSeriesAwait ||
                   (window.AppointmentsService.syncOneAwait && function (arr) {
                     return Promise.all(arr.map(function(c) { return window.AppointmentsService.syncOneAwait(c) }))
                       .then(function(results) {
                         var hardFailure = results.find(function(r) { return !r.ok && !r.queued })
                         return hardFailure ? { ok: false, error: hardFailure.error } : { ok: true }
                       })
                   })
      if (syncFn) {
        try {
          var res = await syncFn(childrenOnly)
          if (!res || !res.ok) {
            _saveAppts(prevAppts)
            if (window.AppointmentsService) {
              try { await window.AppointmentsService.deleteSeries(groupId) } catch (_) {}
            }
            _refresh()
            if (window._showToast) window._showToast('Falha ao sincronizar serie', (res && res.error) || 'Servidor rejeitou uma das sessoes.', 'error')
            return
          }
        } catch (err) {
          _saveAppts(prevAppts)
          if (window.AppointmentsService) {
            try { await window.AppointmentsService.deleteSeries(groupId) } catch (_) {}
          }
          _refresh()
          if (window._showToast) window._showToast('Falha ao sincronizar serie', (err && err.message) || 'Erro inesperado.', 'error')
          return
        }
      }
    }

    if (window.__apptLastAutomationsPromise) {
      try { await window.__apptLastAutomationsPromise } catch (_) { /* best-effort */ }
      window.__apptLastAutomationsPromise = null
    }

    if (window.AutomationsEngine && window.AutomationsEngine.processRecurrenceCreated) {
      try {
        window.AutomationsEngine.processRecurrenceCreated({
          appt: base,
          procedureName: procName,
          intervalDays: interval,
          totalSessions: created.length,
          dates: created.map(function(c) { return c.iso }),
          inicio: opts.inicio,
        })
      } catch (e) { console.warn('[recurrence] processRecurrenceCreated falhou:', e) }
    }

    if (window._showToast) {
      var msg = created.length + ' sessoes agendadas'
      if (skipped.length) msg += ' (' + skipped.length + ' pulada(s))'
      window._showToast('Serie criada', msg, 'success')
    }
    _refresh()
  }

  async function apptCreateNextSessionOnly() {
    var _warn     = I().warn     || function(m) { alert(m) }
    var _getAppts = I().getAppts || function() { return [] }
    var _saveAppts = I().saveAppts || function() {}
    var _saveAppt  = I().saveAppt  || async function() {}
    var _refresh   = I().refresh   || function() {}

    var baseDateStr = (document.getElementById('appt_data') || {}).value
    if (!baseDateStr) { _warn('Informe a data'); return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var procs = I().getProcs ? I().getProcs() : []
    var procName = (procs[procIdx] || {}).nome || ''
    if (!procName) { _warn('Selecione o procedimento recorrente'); return }
    var inicio = (document.getElementById('appt_inicio') || {}).value
    var duracao = parseInt((document.getElementById('appt_duracao') || {}).value) || 60
    var profIdx = parseInt((document.getElementById('appt_prof') || {}).value || '0') || 0
    var salaIdx = parseInt((document.getElementById('appt_sala') || {}).value)

    var nextDate = new Date(baseDateStr + 'T12:00:00')
    nextDate.setDate(nextDate.getDate() + interval)
    var nextIso = nextDate.toISOString().slice(0, 10)

    var conflicts = _apptCheckSeriesConflicts([nextIso], inicio, duracao, profIdx, isNaN(salaIdx) ? null : salaIdx, null)

    async function proceed() {
      var prevAppts = JSON.parse(JSON.stringify(_getAppts()))
      var groupId = _recUuid()
      window.__apptPendingRecurrence = { groupId: groupId, index: 1, total: 2, procName: procName, interval: interval }
      try {
        await _saveAppt()
      } finally {
        window.__apptPendingRecurrence = null
      }

      var all = _getAppts()
      var base = all.filter(function(a) { return a.recurrenceGroupId === groupId && a.recurrenceIndex === 1 })[0]
      if (!base) {
        if (window._showToast) window._showToast('Erro', 'Falha ao criar proxima sessao', 'error')
        return
      }
      var child = _apptCloneForSeries(base, nextIso, 2, 2, groupId, interval, procName)
      all.push(child)
      _saveAppts(all)

      if (window.AppointmentsService && window.AppointmentsService.syncOneAwait) {
        try {
          var r = await window.AppointmentsService.syncOneAwait(child)
          if (!r.ok && !r.queued) {
            _saveAppts(prevAppts)
            if (window.AppointmentsService) {
              try { await window.AppointmentsService.deleteSeries(groupId) } catch (_) {}
            }
            _refresh()
            if (window._showToast) window._showToast('Falha ao sincronizar', (r.error || 'Proxima sessao revertida.') + ' Tente novamente.', 'error')
            return
          }
        } catch (err) {
          _saveAppts(prevAppts)
          if (window.AppointmentsService) {
            try { await window.AppointmentsService.deleteSeries(groupId) } catch (_) {}
          }
          _refresh()
          if (window._showToast) window._showToast('Falha ao sincronizar', (err && err.message) || 'Erro inesperado.', 'error')
          return
        }
      }

      if (window.__apptLastAutomationsPromise) {
        try { await window.__apptLastAutomationsPromise } catch (_) { /* best-effort */ }
        window.__apptLastAutomationsPromise = null
      }

      if (window.AutomationsEngine && window.AutomationsEngine.processRecurrenceCreated) {
        try {
          window.AutomationsEngine.processRecurrenceCreated({
            appt: base, procedureName: procName, intervalDays: interval, totalSessions: 2,
            dates: [baseDateStr, nextIso], inicio: inicio,
          })
        } catch(e) { console.warn('[recurrence] processRecurrenceCreated falhou:', e) }
      }
      if (window._showToast) window._showToast('Proxima sessao agendada', _recFmtShort(nextIso), 'success')
      _refresh()
    }

    if (conflicts.length) {
      _apptShowConflictModal(conflicts, function(decisions) {
        if (!decisions) return
        if (decisions[0] === 'skip') return
        if (decisions[0] === 'next') {
          var d = new Date(nextIso + 'T12:00:00'); d.setDate(d.getDate() + 1)
          nextIso = d.toISOString().slice(0, 10)
        }
        proceed()
      })
    } else {
      await proceed()
    }
  }

  // Expose
  window.apptToggleRecurrence            = apptToggleRecurrence
  window.apptSaveWithSeries              = apptSaveWithSeries
  window.apptCreateNextSessionOnly       = apptCreateNextSessionOnly
  window._apptUpdateRecurrenceVisibility = _apptUpdateRecurrenceVisibility

  window.AgendaModalRecurrence = Object.freeze({
    toggleRecurrence:           apptToggleRecurrence,
    saveWithSeries:             apptSaveWithSeries,
    createNextSessionOnly:      apptCreateNextSessionOnly,
    updateRecurrenceVisibility: _apptUpdateRecurrenceVisibility
  })

})()
