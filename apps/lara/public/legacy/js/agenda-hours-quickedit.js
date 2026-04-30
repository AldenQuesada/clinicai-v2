/**
 * ClinicAI — Agenda Hours Quick-Edit
 *
 * Painel flutuante para editar horarios de funcionamento sem sair da agenda.
 * Le/grava em clinicai_clinic_settings (mesmo storage da pagina Dados da Clinica).
 * Apos salvar, re-deriva clinic_config e dispara renderAgenda.
 */
;(function () {
  'use strict'
  if (window._clinicaiAgendaHoursQuickEditLoaded) return
  window._clinicaiAgendaHoursQuickEditLoaded = true

  var DIAS = [
    { key: 'seg', label: 'Segunda' },
    { key: 'ter', label: 'Terça'   },
    { key: 'qua', label: 'Quarta'  },
    { key: 'qui', label: 'Quinta'  },
    { key: 'sex', label: 'Sexta'   },
    { key: 'sab', label: 'Sábado'  },
    { key: 'dom', label: 'Domingo' },
  ]
  var STORAGE_KEY = 'clinicai_clinic_settings'

  function _defaultDay(key) {
    return {
      aberto: key !== 'dom',
      manha:  { ativo: true, inicio: '08:30', fim: '12:00' },
      tarde:  { ativo: true, inicio: '13:30', fim: '18:00' },
    }
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return { horarios: {} }
      var data = JSON.parse(raw)
      if (data && data.data && data.data.horarios && !data.horarios) return data.data
      return data || { horarios: {} }
    } catch (e) { return { horarios: {} } }
  }

  function _save(data) {
    // 1. Salva settings completos
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch (e) {}
    // 2. Deriva clinic_config (range global usado como fallback)
    var diasAbertos = Object.values(data.horarios || {}).filter(function (h) { return h && h.aberto })
    if (diasAbertos.length) {
      var inicios = diasAbertos.map(function (h) {
        return h.manha && h.manha.ativo !== false ? (h.manha.inicio || '08:00') : (h.tarde && h.tarde.inicio) || '13:30'
      }).sort()
      var fins = diasAbertos.map(function (h) {
        return h.tarde && h.tarde.ativo !== false ? (h.tarde.fim || '18:00') : (h.manha && h.manha.fim) || '12:00'
      }).sort().reverse()
      try {
        localStorage.setItem('clinic_config', JSON.stringify({ horarioInicio: inicios[0], horarioFim: fins[0] }))
      } catch (e) {}
    }
    // 3. Sync Supabase se houver service
    if (window.ClinicSettingsService && window.ClinicSettingsService.save) {
      try { window.ClinicSettingsService.save(data) } catch (e) { console.warn('[agenda-hours] sync supabase:', e) }
    }
  }

  function _render() {
    var existing = document.getElementById('agendaHoursQuickEditModal')
    if (existing) existing.remove()

    var data = _load()
    var horarios = data.horarios || {}

    var overlay = document.createElement('div')
    overlay.id = 'agendaHoursQuickEditModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9600;display:flex;align-items:center;justify-content:center;padding:16px'
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove() }

    var rows = DIAS.map(function (d) {
      var h = horarios[d.key] || _defaultDay(d.key)
      if (!h.manha) h.manha = { ativo: true, inicio: '08:30', fim: '12:00' }
      if (!h.tarde) h.tarde = { ativo: true, inicio: '13:30', fim: '18:00' }
      var aberto = !!h.aberto
      var mAtivo = h.manha.ativo !== false
      var tAtivo = h.tarde.ativo !== false
      return ''
        + '<div data-dia="' + d.key + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #F3F4F6;border-radius:9px;background:' + (aberto ? '#fff' : '#F9FAFB') + '">'
        + '  <label style="display:flex;align-items:center;gap:7px;cursor:pointer;min-width:100px">'
        + '    <input type="checkbox" data-field="aberto" ' + (aberto ? 'checked' : '') + ' style="width:15px;height:15px;accent-color:#7C3AED;cursor:pointer">'
        + '    <span style="font-size:13px;font-weight:' + (aberto ? '600' : '400') + ';color:' + (aberto ? '#111' : '#9CA3AF') + '">' + d.label + '</span>'
        + '  </label>'
        + '  <div class="aqe-periods" style="display:' + (aberto ? 'flex' : 'none') + ';gap:8px;flex-wrap:wrap;flex:1">'
        +     '<div style="display:flex;align-items:center;gap:5px">'
        +       '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#D97706;font-weight:600"><input type="checkbox" data-field="manha-ativo" ' + (mAtivo ? 'checked' : '') + ' style="accent-color:#F59E0B">Manhã</label>'
        +       '<input type="time" data-field="manha-ini" value="' + h.manha.inicio + '" ' + (mAtivo ? '' : 'disabled') + ' style="padding:4px 6px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;width:96px">'
        +       '<span style="color:#9CA3AF">–</span>'
        +       '<input type="time" data-field="manha-fim" value="' + h.manha.fim + '" ' + (mAtivo ? '' : 'disabled') + ' style="padding:4px 6px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;width:96px">'
        +     '</div>'
        +     '<div style="display:flex;align-items:center;gap:5px">'
        +       '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#2563EB;font-weight:600"><input type="checkbox" data-field="tarde-ativo" ' + (tAtivo ? 'checked' : '') + ' style="accent-color:#3B82F6">Tarde</label>'
        +       '<input type="time" data-field="tarde-ini" value="' + h.tarde.inicio + '" ' + (tAtivo ? '' : 'disabled') + ' style="padding:4px 6px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;width:96px">'
        +       '<span style="color:#9CA3AF">–</span>'
        +       '<input type="time" data-field="tarde-fim" value="' + h.tarde.fim + '" ' + (tAtivo ? '' : 'disabled') + ' style="padding:4px 6px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;width:96px">'
        +     '</div>'
        + '  </div>'
        + '</div>'
    }).join('')

    overlay.innerHTML = ''
      + '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:680px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25)">'
      + '  <div style="padding:16px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">'
      + '    <div>'
      + '      <div style="font-size:15px;font-weight:800;color:#111">Horários de funcionamento</div>'
      + '      <div style="font-size:11px;color:#6B7280;margin-top:2px">Configure por dia. Manhã e tarde separados definem o intervalo de almoço.</div>'
      + '    </div>'
      + '    <button id="aqe-close" style="background:none;border:none;color:#6B7280;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:18px">×</button>'
      + '  </div>'
      + '  <div style="padding:14px 20px;display:flex;flex-direction:column;gap:8px">' + rows + '</div>'
      + '  <div style="padding:12px 20px;border-top:1px solid #F3F4F6;display:flex;gap:8px;justify-content:flex-end;background:#FAFAFA">'
      + '    <button id="aqe-cancel" style="padding:9px 16px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Cancelar</button>'
      + '    <button id="aqe-save" style="padding:9px 16px;border:none;background:#7C3AED;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Salvar e aplicar</button>'
      + '  </div>'
      + '</div>'

    document.body.appendChild(overlay)

    // Events: checkboxes toggle state
    overlay.querySelectorAll('[data-dia]').forEach(function (row) {
      var abertoCb = row.querySelector('[data-field="aberto"]')
      var periods  = row.querySelector('.aqe-periods')
      abertoCb.addEventListener('change', function () {
        periods.style.display = abertoCb.checked ? 'flex' : 'none'
        row.style.background = abertoCb.checked ? '#fff' : '#F9FAFB'
      })
      ;[['manha-ativo','manha-ini','manha-fim'], ['tarde-ativo','tarde-ini','tarde-fim']].forEach(function (triplet) {
        var cb = row.querySelector('[data-field="' + triplet[0] + '"]')
        var ini = row.querySelector('[data-field="' + triplet[1] + '"]')
        var fim = row.querySelector('[data-field="' + triplet[2] + '"]')
        cb.addEventListener('change', function () {
          ini.disabled = !cb.checked
          fim.disabled = !cb.checked
        })
      })
    })

    document.getElementById('aqe-close').onclick  = function () { overlay.remove() }
    document.getElementById('aqe-cancel').onclick = function () { overlay.remove() }
    document.getElementById('aqe-save').onclick   = function () {
      var novo = { horarios: {} }
      overlay.querySelectorAll('[data-dia]').forEach(function (row) {
        var key = row.getAttribute('data-dia')
        var q = function (sel) { return row.querySelector('[data-field="' + sel + '"]') }
        novo.horarios[key] = {
          aberto: q('aberto').checked,
          manha:  { ativo: q('manha-ativo').checked, inicio: q('manha-ini').value || '08:30', fim: q('manha-fim').value || '12:00' },
          tarde:  { ativo: q('tarde-ativo').checked, inicio: q('tarde-ini').value || '13:30', fim: q('tarde-fim').value || '18:00' },
        }
      })
      // Merge com settings existentes (preserva outros campos como nome da clinica, etc)
      var cur = _load()
      cur.horarios = novo.horarios
      _save(cur)
      overlay.remove()
      if (window.renderAgenda) try { window.renderAgenda() } catch (e) {}
      if (window.showErrorToast) showErrorToast('Horários atualizados')
    }
  }

  window.openAgendaHoursQuickEdit = _render

  // ── Aviso de dia fechado e sugestao de slot no modal de agendamento ──
  function _updateApptModalHint() {
    var dateEl = document.getElementById('appt_data')
    if (!dateEl || !window.AgendaValidator) return
    var dateStr = dateEl.value
    var hintId = '_apptClinicHourHint'
    var existing = document.getElementById(hintId)
    if (!dateStr) { if (existing) existing.remove(); return }

    var day = AgendaValidator.getClinicDay(dateStr)
    if (!existing) {
      existing = document.createElement('div')
      existing.id = hintId
      existing.style.cssText = 'margin-top:6px;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px'
      dateEl.parentNode.appendChild(existing)
    }

    if (!day.aberto) {
      existing.style.background = '#FEF2F2'
      existing.style.color = '#991B1B'
      existing.style.border = '1px solid #FECACA'
      existing.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Clínica fechada neste dia'
    } else {
      var periods = day.periods.map(function (p) { return p.ini + '-' + p.fim }).join(' / ')
      existing.style.background = '#EEF2FF'
      existing.style.color = '#3730A3'
      existing.style.border = '1px solid #C7D2FE'
      existing.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Funciona ' + periods
    }
  }

  function _maybeSuggestSlot() {
    var dateEl = document.getElementById('appt_data')
    var iniEl  = document.getElementById('appt_inicio')
    var durEl  = document.getElementById('appt_duracao')
    var profEl = document.getElementById('appt_profissional') || document.querySelector('[name="appt_profissional"]')
    if (!dateEl || !iniEl || !window.AgendaValidator) return
    // Só sugere se inicio estiver vazio e data preenchida
    if (iniEl.value) return
    if (!dateEl.value) return
    var dur = durEl ? (parseInt(durEl.value) || 60) : 60
    var profIdx = profEl ? profEl.value : null
    var slot = AgendaValidator.suggestNextSlot(dateEl.value, profIdx, dur)
    if (slot) {
      iniEl.value = slot.horaInicio
      // Dispara change pra triggerar cálculo de horaFim se houver
      iniEl.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  document.addEventListener('change', function (ev) {
    var id = ev.target && ev.target.id
    if (id === 'appt_data') {
      _updateApptModalHint()
      _maybeSuggestSlot()
    } else if (id === 'appt_duracao' || id === 'appt_profissional') {
      _maybeSuggestSlot()
    }
  })

  // Também rodar ao abrir o modal (que cria o campo)
  var _origOpen = window.openApptModal
  if (_origOpen && !_origOpen._clinicHoursWrapped) {
    window.openApptModal = function () {
      var r = _origOpen.apply(this, arguments)
      setTimeout(function () {
        _updateApptModalHint()
        _maybeSuggestSlot()
      }, 100)
      return r
    }
    window.openApptModal._clinicHoursWrapped = true
  }

  // ── Namespace agregador congelado (contrato canonico do projeto) ─
  // Os window.openAgendaHoursQuickEdit permanece para compatibilidade.
  window.AgendaHoursQuickEdit = Object.freeze({
    open: _render
  })
})()
