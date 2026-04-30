/**
 * ClinicAI — Agenda Leads (Agendados + Cancelados)
 *
 * Clone visual de leads-context adaptado pra agenda.
 * Usa LeadsFilter compartilhado pra periodo, busca e tags.
 *
 * Agendados: includePhases ['agendado','reagendado']
 * Cancelados: appointments com status cancelado/no_show
 */
;(function () {
  'use strict'

  var APPT_KEY_BASE = 'clinicai_appointments'
  function _apptKey() {
    return window.ClinicStorage ? window.ClinicStorage.nsKey(APPT_KEY_BASE) : APPT_KEY_BASE
  }
  var APPT_KEY = APPT_KEY_BASE  // backward compat — alguns callers le a const
  var P_AG = 'agLead_'
  var P_CA = 'caLead_'
  var _PAGE_SIZE = 50

  var STATUS_CFG = {
    agendado:   { label: 'Agendado',   color: '#7C3AED', bg: '#F5F3FF' },
    reagendado: { label: 'Reagendado', color: '#F59E0B', bg: '#FFFBEB' },
    confirmado: { label: 'Confirmado', color: '#10B981', bg: '#ECFDF5' },
    aguardando_confirmacao: { label: 'Aguardando', color: '#6366F1', bg: '#EEF2FF' },
    cancelado:  { label: 'Cancelado',  color: '#EF4444', bg: '#FEF2F2' },
    no_show:    { label: 'No-show',    color: '#6B7280', bg: '#F3F4F6' },
  }

  function _esc(s) {
    if (window.ClinicEsc && window.ClinicEsc.html) return window.ClinicEsc.html(s)
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _fmtPhone(p) {
    if (!p) return ''
    var d = p.replace(/\D/g, '')
    if (d.length === 13) return '(' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9)
    if (d.length === 12) return '(' + d.slice(2,4) + ') ' + d.slice(4,8) + '-' + d.slice(8)
    return p
  }

  function _getAppts() {
    try { return JSON.parse(localStorage.getItem(_apptKey()) || '[]') } catch { return [] }
  }

  // ══════════════════════════════════════════════════
  // AGENDADOS
  // ══════════════════════════════════════════════════

  var _ag = {
    period: { type: 'all' },
    sortField: 'date',
    sortDir: 'asc',
    filteredAll: [],
    tagsLoading: false,
  }

  function _ag$(id) { return document.getElementById(P_AG + id) }

  function renderAgendados() {
    var root = document.getElementById('agendadosRoot')
    if (!root) return

    if (root.dataset.init) { _agLoad(); return }
    root.dataset.init = '1'

    var p = P_AG
    root.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;padding:20px">' +

      // Header (titulo + subtitulo)
      '<div style="margin-bottom:16px">' +
        '<h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Agendados</h1>' +
        '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Leads com consulta agendada ou reagendada</p>' +
      '</div>' +

      // Linha 1: Periodo + Busca
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
        '<div class="ao-period-bar" id="' + p + 'PeriodBar">' +
          '<button class="ao-period-btn active" data-period="all">Todos</button>' +
          '<button class="ao-period-btn" data-period="today">Hoje</button>' +
          '<button class="ao-period-btn" data-period="week">Semana</button>' +
          '<button class="ao-period-btn" data-period="month">Mes</button>' +
          '<button class="ao-period-btn" data-period="custom">Periodo</button>' +
        '</div>' +
        '<div id="' + p + 'DateRange" class="ao-date-range" style="display:none">' +
          '<input id="' + p + 'DateFrom" type="date" class="ao-date-input">' +
          '<span style="font-size:12px;color:#9ca3af">ate</span>' +
          '<input id="' + p + 'DateTo" type="date" class="ao-date-input">' +
          '<button class="ao-date-apply" id="' + p + 'DateApply">Aplicar</button>' +
        '</div>' +
        '<input id="' + p + 'SearchInput" type="text" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" placeholder="Buscar por nome ou telefone..." style="padding:7px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;width:230px">' +
      '</div>' +

      // Linha 2: Badge Agendados + Tags + Exportar
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
        '<div id="' + p + 'CountBadge" style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:5px 12px">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          '<span id="' + p + 'Stat_total" style="font-size:15px;font-weight:800;color:#111">0</span>' +
        '</div>' +
        '<select id="' + p + 'TagFilter" style="padding:5px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;font-family:inherit;outline:none;background:#fff;cursor:pointer;color:#374151">' +
          '<option value="">Todas as tags</option>' +
        '</select>' +
        '<div style="flex:1"></div>' +
        '<button id="' + p + 'ExportBtn" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;font-size:13px;font-weight:500;color:#374151;cursor:pointer">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          'Exportar' +
        '</button>' +
      '</div>' +

      // Tabela
      '<div id="' + p + 'ViewTable" style="flex:1;min-height:0;overflow-y:auto">' +
        '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden">' +
          '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
            '<colgroup>' +
              '<col style="width:44px"><col style="width:200px"><col style="width:100px">' +
              '<col style="width:140px"><col style="width:100px"><col style="width:80px">' +
              '<col style="width:140px"><col style="width:80px">' +
            '</colgroup>' +
            '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #F3F4F6">' +
              '<th style="padding:12px 8px 12px 16px;width:32px"><input type="checkbox" id="' + p + 'SelectAll" style="width:14px;height:14px;accent-color:#7C3AED;cursor:pointer"></th>' +
              '<th class="ag-sort-th" data-sort="name" style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">Nome</th>' +
              '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Status</th>' +
              '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Tags</th>' +
              '<th class="ag-sort-th" data-sort="date" style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">Data</th>' +
              '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Horario</th>' +
              '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Procedimento</th>' +
              '<th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Acoes</th>' +
            '</tr></thead>' +
            '<tbody id="' + p + 'TableBody">' + (window.Skeleton ? Skeleton.tableRows(4, 8) : '<tr><td colspan="8"><div class="sk sk-line sk-w60" style="margin:16px auto"></div></td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div style="padding:16px 0;text-align:center">' +
          '<button id="' + p + 'LoadMore" style="display:none;background:#fff;border:1px solid #e5e7eb;padding:8px 20px;border-radius:8px;font-size:13px;color:#6b7280;cursor:pointer;font-weight:500">Carregar mais</button>' +
        '</div>' +
      '</div>' +

      '</div>'

    // Bind eventos
    _agBindEvents()
    _agLoad()
  }

  function _agBindEvents() {
    var p = P_AG

    // Periodo
    var periodBar = _ag$(p.replace(P_AG,'') + 'PeriodBar') || document.getElementById(P_AG + 'PeriodBar')
    if (periodBar) periodBar.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-period]')
      if (!btn) return
      periodBar.querySelectorAll('.ao-period-btn').forEach(function(b) { b.classList.remove('active') })
      btn.classList.add('active')
      var type = btn.dataset.period
      var dateRange = _ag$('DateRange')
      if (type === 'custom') {
        if (dateRange) dateRange.style.display = 'flex'
        return
      }
      if (dateRange) dateRange.style.display = 'none'
      _ag.period = { type: type }
      _agLoad()
    })

    // Custom date apply
    var dateApply = _ag$('DateApply')
    if (dateApply) dateApply.addEventListener('click', function() {
      var from = _ag$('DateFrom')?.value
      var to = _ag$('DateTo')?.value
      if (from && to) { _ag.period = { type: 'custom', from: from, to: to }; _agLoad() }
    })

    // Busca
    var searchEl = _ag$('SearchInput')
    if (searchEl) {
      var timer
      searchEl.addEventListener('input', function() {
        clearTimeout(timer)
        timer = setTimeout(_agLoad, 200)
      })
    }

    // Tags
    var tagSel = _ag$('TagFilter')
    if (tagSel) tagSel.addEventListener('change', _agLoad)

    // Sort
    document.querySelectorAll('.ag-sort-th').forEach(function(th) {
      th.addEventListener('click', function() {
        var field = th.dataset.sort
        if (_ag.sortField === field) _ag.sortDir = _ag.sortDir === 'asc' ? 'desc' : 'asc'
        else { _ag.sortField = field; _ag.sortDir = 'asc' }
        _agLoad()
      })
    })

    // Load more
    var loadBtn = _ag$('LoadMore')
    if (loadBtn) loadBtn.addEventListener('click', function() {
      var tbody = _ag$('TableBody')
      var offset = tbody ? tbody.querySelectorAll('tr[data-lr]').length : 0
      var next = _ag.filteredAll.slice(offset, offset + _PAGE_SIZE)
      if (next.length) _agRenderRows(next, true)
      if (offset + next.length >= _ag.filteredAll.length) loadBtn.style.display = 'none'
    })

    // Exportar CSV
    var exportBtn = _ag$('ExportBtn')
    if (exportBtn) exportBtn.addEventListener('click', function() {
      var rows = [['Nome', 'Telefone', 'Status', 'Data', 'Horario', 'Procedimento']]
      _ag.filteredAll.forEach(function(l) {
        rows.push([
          l.name || l.nome || '',
          l.phone || '',
          l._apptStatus || l.phase || '',
          l._apptDate || '',
          l._apptTime || '',
          l._apptProc || ''
        ])
      })
      var csv = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"' }).join(',') }).join('\n')
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
      var a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'agendados_' + new Date().toISOString().slice(0, 10) + '.csv'
      a.click()
    })

    // Tags lazy load
    _agLoadTags()
  }

  async function _agLoadTags() {
    if (_ag.tagsLoading) return
    _ag.tagsLoading = true
    var sel = _ag$('TagFilter')
    if (!sel || !window.LeadsFilter) return
    try {
      var tags = await LeadsFilter.loadAvailableTags()
      if (Array.isArray(tags)) tags.forEach(function(t) {
        var opt = document.createElement('option')
        opt.value = t.slug || t
        opt.textContent = t.name || t.slug || t
        sel.appendChild(opt)
      })
    } catch(e) {}
  }

  async function _agLoad() {
    var LF = window.LeadsFilter
    var all
    try {
      all = window.ClinicLeadsCache ? await ClinicLeadsCache.readAsync() : []
    } catch(e) {
      all = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    }

    var search = (_ag$('SearchInput')?.value || '').toLowerCase().trim()
    var tagSlug = _ag$('TagFilter')?.value || ''
    var tagLeadIds = LF ? await LF.loadTagLeadIds(tagSlug) : null

    var result = LF
      ? LF.filter(all, { period: _ag.period, search: search, tagLeadIds: tagLeadIds, includePhases: ['agendado', 'reagendado'] })
      : { filtered: all.filter(function(l) { return l.phase === 'agendado' || l.phase === 'reagendado' }), stats: { total: 0 } }

    var filtered = result.filtered

    // Enriquecer com dados do appointment
    var appts = _getAppts()
    filtered.forEach(function(l) {
      var appt = appts.find(function(a) {
        return (a.pacienteId === l.id || (a.pacienteNome || '').toLowerCase() === (l.nome || l.name || '').toLowerCase())
          && a.status !== 'cancelado' && a.status !== 'no_show'
      })
      if (appt) {
        l._apptDate = appt.data; l._apptTime = appt.horaInicio
        l._apptProc = appt.procedimento; l._apptStatus = appt.status; l._apptId = appt.id
      }
    })

    // Sort
    if (_ag.sortField === 'name') {
      filtered.sort(function(a, b) {
        var na = (a.name || a.nome || '').toLowerCase(), nb = (b.name || b.nome || '').toLowerCase()
        return _ag.sortDir === 'asc' ? (na < nb ? -1 : 1) : (na > nb ? -1 : 1)
      })
    } else {
      filtered.sort(function(a, b) {
        var da = (a._apptDate || '') + (a._apptTime || ''), db = (b._apptDate || '') + (b._apptTime || '')
        return _ag.sortDir === 'asc' ? (da < db ? -1 : 1) : (da > db ? -1 : 1)
      })
    }

    // Stats
    var totalEl = _ag$('Stat_total')
    if (totalEl) totalEl.textContent = filtered.length

    _ag.filteredAll = filtered
    _agRenderRows(filtered.slice(0, _PAGE_SIZE), false)

    var loadBtn = _ag$('LoadMore')
    if (loadBtn) loadBtn.style.display = filtered.length > _PAGE_SIZE ? '' : 'none'
  }

  function _agRenderRows(leads, append) {
    var tbody = _ag$('TableBody')
    if (!tbody) return
    if (!append) tbody.innerHTML = ''

    if (!append && !leads.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum lead agendado</td></tr>'
      return
    }

    leads.forEach(function(l) {
      var nome = l.name || l.nome || '—'
      var phone = l.phone || l.whatsapp || ''
      var sCfg = STATUS_CFG[l._apptStatus || l.phase] || STATUS_CFG.agendado
      var tags = Array.isArray(l.tags) ? l.tags.slice(0, 3).map(function(t) {
        return '<span style="font-size:11px;background:#f3f4f6;border-radius:4px;padding:2px 7px;color:#374151">' + _esc(t) + '</span>'
      }).join(' ') : ''
      var dateStr = l._apptDate ? l._apptDate.split('-').reverse().join('/') : '—'

      var tr = document.createElement('tr')
      tr.dataset.lr = '1'
      tr.style.cssText = 'border-bottom:1px solid #F9FAFB;cursor:pointer;transition:background .1s'
      tr.onmouseenter = function() { tr.style.background = '#FAFAFA' }
      tr.onmouseleave = function() { tr.style.background = '' }
      tr.onclick = function(e) {
        if (e.target.closest('button,input,a')) return
        if (l._apptId && window.openApptDetail) openApptDetail(l._apptId)
        else if (window.viewLead) viewLead(l.id)
      }

      tr.innerHTML =
        '<td style="padding:12px 8px 12px 16px"><input type="checkbox" style="width:14px;height:14px;accent-color:#7C3AED;cursor:pointer" onclick="event.stopPropagation()"></td>' +
        '<td style="padding:12px 16px"><div style="font-size:13px;font-weight:600;color:#111827">' + _esc(nome) + '</div><div style="font-size:12px;color:#6B7280">' + _fmtPhone(phone) + '</div></td>' +
        '<td style="padding:12px 16px"><span style="display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:' + sCfg.color + ';background:' + sCfg.bg + ';border-radius:6px;padding:3px 10px">' + sCfg.label + '</span></td>' +
        '<td style="padding:12px 16px;font-size:12px">' + (tags || '<span style="color:#D1D5DB">—</span>') + '</td>' +
        '<td style="padding:12px 16px;font-size:12px;color:#6B7280">' + dateStr + '</td>' +
        '<td style="padding:12px 16px;font-size:12px;color:#6B7280">' + (l._apptTime || '—') + '</td>' +
        '<td style="padding:12px 16px;font-size:12px;color:#6B7280">' + _esc(l._apptProc || '—') + '</td>' +
        '<td style="padding:12px 16px;text-align:center"><button onclick="event.stopPropagation();' + (l._apptId ? 'openApptDetail(\'' + _esc(l._apptId) + '\')' : '') + '" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;color:#374151">Ver</button></td>'

      tbody.appendChild(tr)
    })
  }

  // ══════════════════════════════════════════════════
  // CANCELADOS (mantem simples — appointments, nao leads)
  // ══════════════════════════════════════════════════

  var _caSearch = ''

  function renderCancelados() {
    var root = document.getElementById('canceladosRoot')
    if (!root) return

    var appts = _getAppts().filter(function(a) {
      return a.status === 'cancelado' || a.status === 'no_show'
    })

    if (_caSearch) {
      var q = _caSearch.toLowerCase()
      appts = appts.filter(function(a) { return (a.pacienteNome || '').toLowerCase().includes(q) })
    }

    appts.sort(function(a, b) {
      var da = a.canceladoEm || a.noShowEm || a.data || ''
      var db = b.canceladoEm || b.noShowEm || b.data || ''
      return da > db ? -1 : 1
    })

    var p = P_CA
    var html = '<div style="display:flex;flex-direction:column;height:100%;padding:20px">'

    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    html += '<div><h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Cancelados / No-show</h1>'
    html += '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Historico de cancelamentos e faltas</p></div>'
    html += '<div style="display:flex;align-items:center;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:6px 14px">'
    html += '<span style="font-size:18px;font-weight:800;color:#EF4444">' + appts.length + '</span>'
    html += '<span style="font-size:11px;font-weight:500;color:#EF4444;text-transform:uppercase">registros</span></div></div>'

    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
    html += '<input id="' + p + 'Search" type="text" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" placeholder="Buscar por nome..." value="' + _esc(_caSearch) + '" style="padding:7px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;width:230px">'
    html += '</div>'

    html += '<div style="flex:1;min-height:0;overflow-y:auto"><div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden">'
    html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
    html += '<colgroup><col style="width:220px"><col style="width:100px"><col style="width:130px"><col style="width:160px"><col><col style="width:100px"></colgroup>'
    html += '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #F3F4F6">'
    var th = 'padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em'
    html += '<th style="' + th + '">Paciente</th><th style="' + th + '">Status</th><th style="' + th + '">Data</th><th style="' + th + '">Procedimento</th><th style="' + th + '">Motivo</th><th style="' + th + ';text-align:center">Acoes</th>'
    html += '</tr></thead><tbody>'

    if (!appts.length) {
      html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">Nenhum cancelamento</td></tr>'
    } else {
      appts.forEach(function(a) {
        var sCfg = STATUS_CFG[a.status] || STATUS_CFG.cancelado
        html += '<tr style="border-bottom:1px solid #F3F4F6" onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">'
        html += '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111">' + _esc(a.pacienteNome || 'Paciente') + '</td>'
        html += '<td style="padding:10px 16px"><span style="display:inline-flex;font-size:12px;font-weight:600;color:' + sCfg.color + ';background:' + sCfg.bg + ';border-radius:6px;padding:3px 10px">' + sCfg.label + '</span></td>'
        html += '<td style="padding:10px 16px;font-size:13px;color:#374151">' + (a.data ? a.data.split('-').reverse().join('/') : '') + ' ' + (a.horaInicio || '') + '</td>'
        html += '<td style="padding:10px 16px;font-size:13px;color:#374151">' + _esc(a.procedimento || '') + '</td>'
        html += '<td style="padding:10px 16px;font-size:12px;color:#6B7280;font-style:italic">' + _esc(a.motivoCancelamento || a.motivoNoShow || '—') + '</td>'
        html += '<td style="padding:10px 16px;text-align:center"><button onclick="openApptModal(\'' + a.id + '\')" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;color:#374151">Remarcar</button></td>'
        html += '</tr>'
      })
    }
    html += '</tbody></table></div></div></div>'
    root.innerHTML = html

    var searchEl = document.getElementById(p + 'Search')
    if (searchEl) searchEl.addEventListener('input', function() { _caSearch = this.value; renderCancelados() })
  }

  window.AgendaLeads = Object.freeze({
    renderAgendados: renderAgendados,
    renderCancelados: renderCancelados,
  })

})()
