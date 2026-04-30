/**
 * ComplaintsPanel — Patient complaints tracking UI
 * Exposes window.ComplaintsPanel with renderCard, renderFullPanel,
 * loadComplaints, saveComplaint, resolveComplaint
 */
;(function() {
  'use strict'

  // ── SVG Icons (Feather-style, inline) ─────────────────────────
  var ICONS = {
    alert:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    activity: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    check:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    checkAll: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L7 17l-5-5"/><path d="M22 10l-11 11-1.5-1.5"/></svg>',
    plus:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    edit:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    clock:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    x:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    save:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  }

  // ── Status config ─────────────────────────────────────────────
  var STATUS_CFG = {
    pendente:       { bg: '#FFF7ED', color: '#EA580C', label: 'Pendente',       icon: ICONS.alert },
    em_tratamento:  { bg: '#EFF6FF', color: '#2563EB', label: 'Em tratamento',  icon: ICONS.activity },
    tratada:        { bg: '#F0FDF4', color: '#16A34A', label: 'Tratada',        icon: ICONS.check },
    resolvida:      { bg: '#F3F4F6', color: '#9CA3AF', label: 'Resolvida',      icon: ICONS.checkAll },
  }

  // ── Retouch intervals ────────────────────────────────────────
  var RETOUCH_INTERVALS = [
    { value: 7,   label: '1 semana' },
    { value: 15,  label: '15 dias' },
    { value: 30,  label: '1 m\u00eas' },
    { value: 60,  label: '2 meses' },
    { value: 90,  label: '3 meses' },
    { value: 120, label: '4 meses' },
    { value: 150, label: '5 meses' },
    { value: 180, label: '6 meses' },
    { value: 365, label: '1 ano' },
    { value: 0,   label: 'Personalizado...' },
  ]

  // ── Helpers ───────────────────────────────────────────────────
  function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

  function _uid() { return 'cp_' + Math.random().toString(36).substr(2, 9) }

  function _badge(status) {
    var c = STATUS_CFG[status] || STATUS_CFG.pendente
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;background:' + c.bg + ';color:' + c.color + ';border-radius:6px;font-size:11px;font-weight:600;line-height:1">'
      + c.icon + ' ' + _esc(c.label) + '</span>'
  }

  function _retouchLabel(days) {
    if (!days) return ''
    for (var i = 0; i < RETOUCH_INTERVALS.length; i++) {
      if (RETOUCH_INTERVALS[i].value === days) return RETOUCH_INTERVALS[i].label
    }
    return days + ' dias'
  }

  function _stratCard(color, title, content) {
    return '<div style="padding:10px 12px;background:' + color + '08;border:1px solid ' + color + '20;border-radius:10px;margin-bottom:8px">'
      + '<div style="font-size:9px;font-weight:700;color:' + color + ';text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">' + title + '</div>'
      + content + '</div>'
  }

  function _btn(label, icon, bgColor, textColor, onclick, extra) {
    return '<button onclick="' + _esc(onclick) + '" style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:' + bgColor + ';color:' + textColor + ';border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;' + (extra || '') + '">'
      + icon + ' ' + _esc(label) + '</button>'
  }

  // ── Supabase helpers ──────────────────────────────────────────
  function _sb() { return window._sbShared }

  // ── 1. renderCard ─────────────────────────────────────────────
  function renderCard(leadId, complaints) {
    if (!complaints || !complaints.length) {
      return _stratCard('#7C3AED', 'Queixas',
        '<span style="font-size:11px;color:#9CA3AF">Nenhuma queixa registrada</span>'
      )
    }

    var pendentes = complaints.filter(function(c) { return c.status === 'pendente' })
    var emTrat = complaints.filter(function(c) { return c.status === 'em_tratamento' })
    var tratadas = complaints.filter(function(c) { return c.status === 'tratada' })
    var resolvidas = complaints.filter(function(c) { return c.status === 'resolvida' })

    function _row(c) {
      var st = STATUS_CFG[c.status] || STATUS_CFG.pendente
      var clickable = c.status === 'pendente'
      var retouchTxt = c.retouch_interval_days ? _retouchLabel(c.retouch_interval_days) : ''

      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F3F4F620;gap:8px'
        + (clickable ? ';cursor:pointer' : '') + '"'
        + (clickable ? ' onclick="ComplaintsPanel._quickTreat(\'' + c.id + '\',\'' + _esc(leadId) + '\')" title="Clique para marcar como tratada"' : '') + '>'
        + '<div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">'
        + '<span style="color:' + st.color + ';flex-shrink:0">' + st.icon + '</span>'
        + '<span style="font-size:11px;font-weight:500;color:' + (c.status === 'resolvida' ? '#9CA3AF' : '#111') + ';' + (c.status === 'resolvida' ? 'text-decoration:line-through' : '') + '">' + _esc(c.complaint) + '</span>'
        + (c.treatment_procedure ? '<span style="font-size:9px;color:#6B7280">(' + _esc(c.treatment_procedure) + ')</span>' : '')
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0">'
        + (retouchTxt ? '<span style="font-size:9px;color:#6B7280;display:flex;align-items:center;gap:2px">' + ICONS.clock + retouchTxt + '</span>' : '')
        + '<span style="font-size:9px;padding:2px 6px;background:' + st.bg + ';color:' + st.color + ';border-radius:4px;font-weight:600">' + st.label + '</span>'
        + '</div></div>'
    }

    var html = ''

    // Pendentes (destacar)
    if (pendentes.length) {
      html += '<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:#EA580C;margin-bottom:3px">' + pendentes.length + ' PENDENTE' + (pendentes.length > 1 ? 'S' : '') + '</div>'
        + pendentes.map(_row).join('') + '</div>'
    }

    // Em tratamento
    if (emTrat.length) {
      html += '<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:#2563EB;margin-bottom:3px">' + emTrat.length + ' EM TRATAMENTO</div>'
        + emTrat.map(_row).join('') + '</div>'
    }

    // Tratadas
    if (tratadas.length) {
      html += '<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:#16A34A;margin-bottom:3px">' + tratadas.length + ' TRATADA' + (tratadas.length > 1 ? 'S' : '') + '</div>'
        + tratadas.map(_row).join('') + '</div>'
    }

    // Resolvidas (colapsado)
    if (resolvidas.length) {
      html += '<div><div style="font-size:9px;font-weight:700;color:#9CA3AF;margin-bottom:3px">' + resolvidas.length + ' RESOLVIDA' + (resolvidas.length > 1 ? 'S' : '') + '</div>'
        + resolvidas.map(_row).join('') + '</div>'
    }

    // Form inline para quick treat (hidden por default)
    html += '<div id="cpQuickTreatForm" style="display:none;margin-top:10px;padding:14px;background:#F5F3FF;border:1.5px solid #7C3AED30;border-radius:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" fill="none" stroke="#7C3AED" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase">Procedimento Realizado</span></div>'
      + '<button onclick="document.getElementById(\'cpQuickTreatForm\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:16px">&times;</button>'
      + '</div>'
      + '<div id="cpQtComplaintName" style="font-size:12px;font-weight:600;color:#111;margin-bottom:10px;padding:6px 10px;background:#fff;border-radius:6px;border:1px solid #E5E7EB"></div>'
      // Dropdown + Valor + Botao +
      + '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">'
      + '<select id="cpQtProc" onchange="ComplaintsPanel._onQtProcChange()" style="flex:2;padding:8px 10px;border:1.5px solid #7C3AED40;border-radius:8px;font-size:12px;background:#fff;outline:none;box-sizing:border-box"><option value="">Selecione...</option></select>'
      + '<input id="cpQtValor" type="text" placeholder="R$" readonly style="width:70px;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;text-align:right;background:#F9FAFB;box-sizing:border-box;color:#10B981;font-weight:600">'
      + '<datalist id="cpQtProcList"></datalist>'
      + '</div>'
      // Desconto checkbox
      + '<label id="cpQtDescontoLabel" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#F59E0B;cursor:pointer;margin-bottom:6px">'
      + '<input type="checkbox" id="cpQtDescontoCb" onchange="ComplaintsPanel._toggleDesconto()" style="accent-color:#F59E0B;width:13px;height:13px"> Aplicar desconto</label>'
      + '<div id="cpQtDescontoRow" style="display:none;margin-bottom:6px">'
      + '<input id="cpQtDescontoVal" type="number" placeholder="Valor do desconto (R$)" step="0.01" style="width:100%;padding:7px 10px;border:1px solid #F59E0B40;border-radius:6px;font-size:11px;box-sizing:border-box" oninput="ComplaintsPanel._calcDesconto()">'
      + '</div>'
      // Retoque
      + '<div style="margin-bottom:8px">'
      + '<div style="font-size:10px;font-weight:600;color:#6B7280;margin-bottom:4px">Retoque / Pr\u00f3xima Sess\u00e3o</div>'
      + '<select id="cpQtInterval" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;outline:none;box-sizing:border-box">'
      + RETOUCH_INTERVALS.map(function(r) { return '<option value="' + r.value + '">' + r.label + '</option>' }).join('')
      + '</select></div>'
      // Salvar
      + '<button onclick="ComplaintsPanel._submitQuickTreat()" style="width:100%;padding:10px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Registrar Tratamento</button>'
      + '</div>'

    return _stratCard('#7C3AED', 'Queixas (' + complaints.length + ')', html)
  }

  // Quick treat: abre form inline no card
  var _qtComplaintId = null, _qtLeadId = null, _procsLoaded = false, _procCatalog = {}
  var _qtDesconto = 0, _qtPreco = 0

  async function _quickTreat(complaintId, leadId) {
    _qtComplaintId = complaintId
    _qtLeadId = leadId
    _qtDesconto = 0
    _qtPreco = 0
    var form = document.getElementById('cpQuickTreatForm')
    if (form) form.style.display = 'block'

    // Mostrar nome da queixa
    var nameEl = document.getElementById('cpQtComplaintName')
    // Buscar complaint name
    try {
      var all = await loadComplaints(leadId)
      var c = all.find(function(x) { return x.id === complaintId })
      if (c && nameEl) nameEl.textContent = c.complaint
    } catch (e) {}

    // Carregar catalogo de procedimentos
    if (!_procsLoaded) {
      var procs = []
      try {
        if (window._sbShared) {
          var res = await window._sbShared.from('clinic_procedimentos').select('nome,categoria,preco').eq('ativo', true).order('categoria,nome')
          procs = res.data || []
        }
      } catch (e) {}
      if (!procs.length) try { procs = JSON.parse(localStorage.getItem('clinic_procedimentos') || '[]') } catch (e) {}

      // Select com optgroup por categoria
      var sel = document.getElementById('cpQtProc')
      if (sel) {
        var opts = '<option value="">Selecione o procedimento...</option>'
        var lastCat = ''
        procs.forEach(function(p) {
          var cat = p.categoria || 'outro'
          if (cat !== lastCat) { if (lastCat) opts += '</optgroup>'; opts += '<optgroup label="' + _esc(cat.charAt(0).toUpperCase() + cat.slice(1)) + '">'; lastCat = cat }
          opts += '<option value="' + _esc(p.nome) + '">' + _esc(p.nome) + '</option>'
        })
        if (lastCat) opts += '</optgroup>'
        sel.innerHTML = opts
      }
      procs.forEach(function(p) { _procCatalog[p.nome.toLowerCase()] = p })
      _procsLoaded = true
    }

    // Limpar form
    var selEl = document.getElementById('cpQtProc')
    if (selEl) { selEl.value = ''; selEl.focus() }
    var valEl = document.getElementById('cpQtValor')
    if (valEl) valEl.value = ''
    var dcb = document.getElementById('cpQtDescontoCb')
    if (dcb) dcb.checked = false
    var drow = document.getElementById('cpQtDescontoRow')
    if (drow) drow.style.display = 'none'
    var dval = document.getElementById('cpQtDescontoVal')
    if (dval) dval.value = ''
  }

  function _onQtProcChange() {
    var nome = (document.getElementById('cpQtProc') || {}).value || ''
    var info = _procCatalog[nome.toLowerCase()]
    var valEl = document.getElementById('cpQtValor')
    _qtDesconto = 0
    if (info && info.preco > 0) {
      _qtPreco = info.preco
      if (valEl) valEl.value = 'R$ ' + _fmtN(info.preco)
    } else {
      _qtPreco = 0
      if (valEl) valEl.value = ''
    }
  }

  function _toggleDesconto() {
    var cb = document.getElementById('cpQtDescontoCb')
    var row = document.getElementById('cpQtDescontoRow')
    if (cb && row) {
      row.style.display = cb.checked ? 'block' : 'none'
      if (!cb.checked) { _qtDesconto = 0; _calcDesconto() }
    }
  }

  function _calcDesconto() {
    var v = parseFloat((document.getElementById('cpQtDescontoVal') || {}).value || '0')
    _qtDesconto = Math.max(0, Math.min(v, _qtPreco))
    var valEl = document.getElementById('cpQtValor')
    if (valEl && _qtPreco > 0) {
      var final = _qtPreco - _qtDesconto
      valEl.value = 'R$ ' + _fmtN(final)
      valEl.style.color = _qtDesconto > 0 ? '#F59E0B' : '#10B981'
    }
  }

  function _fmtN(v) { return Number(v||0).toFixed(2).replace('.', ',') }

  async function _submitQuickTreat() {
    if (!_qtComplaintId) return
    var proc = (document.getElementById('cpQtProc') || {}).value || ''
    if (proc === '__outro__') proc = prompt('Digite o procedimento:') || ''
    var interval = parseInt((document.getElementById('cpQtInterval') || {}).value || '120')
    if (interval === 0) {
      var custom = prompt('Quantos dias entre sess\u00f5es?')
      if (!custom) return
      interval = parseInt(custom)
      if (isNaN(interval) || interval <= 0) { _toastWarn('Valor inv\u00e1lido'); return }
    }
    if (!proc.trim()) { _toastWarn('Selecione o procedimento'); return }

    try {
      await saveComplaint({
        p_id: _qtComplaintId,
        p_status: 'em_tratamento',
        p_treatment_procedure: proc.trim(),
        p_treatment_date: new Date().toISOString(),
        p_retouch_interval_days: interval,
      })
      document.getElementById('cpQuickTreatForm').style.display = 'none'
      // Recarregar card
      var complaints = await loadComplaints(_qtLeadId)
      var el = document.getElementById('lmComplaintsCard')
      if (el) el.innerHTML = renderCard(_qtLeadId, complaints)
    } catch (e) {
      _toastErr('Erro: ' + e.message)
    }
  }

  // ── 2. renderFullPanel ────────────────────────────────────────
  function renderFullPanel(lead) {
    var panelId = _uid()
    var leadId = lead.id || ''

    // Async load
    setTimeout(function() { _loadAndRenderFull(panelId, leadId) }, 50)

    return '<div id="' + panelId + '" style="padding:0">'
      + '<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px">Carregando queixas...</div>'
      + '</div>'
  }

  async function _loadAndRenderFull(panelId, leadId) {
    var wrap = document.getElementById(panelId)
    if (!wrap) return

    var complaints = []
    try {
      complaints = await loadComplaints(leadId)
    } catch (e) {
      console.warn('[ComplaintsPanel] Load error:', e.message)
    }

    // Fetch procedimentos for dropdown
    var procedimentos = []
    try {
      if (_sb()) {
        var res = await _sb().from('clinic_procedimentos').select('id,nome').order('nome')
        if (res.data) procedimentos = res.data
      }
    } catch (e) {}

    // Store in panel data attribute for forms
    wrap.dataset.leadId = leadId
    wrap.dataset.procs = JSON.stringify(procedimentos)

    _renderFullContent(wrap, complaints, leadId, procedimentos)
  }

  function _renderFullContent(wrap, complaints, leadId, procedimentos) {
    var html = ''

    // Header with add button
    html += '<div style="display:flex;align-items:center;justify-content:between;margin-bottom:12px">'
      + '<div style="flex:1;font-size:13px;font-weight:700;color:#374151">Queixas do Paciente</div>'
      + _btn('Adicionar queixa', ICONS.plus, '#7C3AED', '#fff', 'ComplaintsPanel._showAddForm(\'' + _esc(leadId) + '\',\'' + _esc(wrap.id) + '\')')
      + '</div>'

    // Add form placeholder
    html += '<div id="' + wrap.id + '_addForm"></div>'

    if (!complaints.length) {
      html += '<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px">Nenhuma queixa registrada</div>'
    } else {
      // Group by status
      var groups = [
        { key: 'pendente', items: [] },
        { key: 'em_tratamento', items: [] },
        { key: 'tratada', items: [] },
        { key: 'resolvida', items: [] },
      ]
      var groupMap = {}
      groups.forEach(function(g) { groupMap[g.key] = g })

      complaints.forEach(function(c) {
        var g = groupMap[c.status] || groupMap.pendente
        g.items.push(c)
      })

      groups.forEach(function(g) {
        if (!g.items.length) return
        var sc = STATUS_CFG[g.key]

        html += '<div style="margin-bottom:12px">'
          + '<div style="font-size:10px;font-weight:700;color:' + sc.color + ';text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:flex;align-items:center;gap:4px">'
          + sc.icon + ' ' + sc.label + ' (' + g.items.length + ')</div>'

        g.items.forEach(function(c) {
          var rowId = wrap.id + '_row_' + c.id
          html += '<div id="' + rowId + '" style="padding:8px 12px;background:' + sc.bg + ';border:1px solid ' + sc.color + '18;border-radius:8px;margin-bottom:6px">'

          // Main row
          html += '<div style="display:flex;align-items:center;gap:8px">'
            + '<div style="flex:1">'
            + '<div style="font-size:12px;font-weight:600;color:#111;' + (c.status === 'resolvida' ? 'text-decoration:line-through;color:#9CA3AF' : '') + '">' + _esc(c.complaint) + '</div>'

          if (c.treatment_procedure) {
            html += '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + _esc(c.treatment_procedure) + '</div>'
          }
          if (c.status === 'em_tratamento' && c.retouch_interval_days) {
            html += '<div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#6B7280;margin-top:2px">'
              + ICONS.clock + ' Retoque em ' + _esc(_retouchLabel(c.retouch_interval_days)) + '</div>'
          }
          if (c.nota) {
            html += '<div style="font-size:11px;color:#9CA3AF;margin-top:2px;font-style:italic">' + _esc(c.nota) + '</div>'
          }

          html += '</div>' // close flex:1

          // Action buttons
          html += '<div style="display:flex;gap:4px;flex-shrink:0">'
          if (c.status === 'pendente') {
            html += _btn('Marcar como tratada', ICONS.edit, '#EFF6FF', '#2563EB',
              'ComplaintsPanel._showTreatForm(\'' + _esc(c.id) + '\',\'' + _esc(wrap.id) + '\')')
          } else if (c.status === 'em_tratamento' || c.status === 'tratada') {
            html += _btn('Resolver', ICONS.check, '#F0FDF4', '#16A34A',
              'ComplaintsPanel._doResolve(\'' + _esc(c.id) + '\',\'' + _esc(wrap.id) + '\')')
          }
          html += '</div>'

          html += '</div>' // close main row

          // Inline treat form placeholder
          html += '<div id="' + rowId + '_treatForm"></div>'

          html += '</div>' // close card
        })

        html += '</div>' // close group
      })
    }

    wrap.innerHTML = html
  }

  // ── Inline forms ──────────────────────────────────────────────

  function _showAddForm(leadId, panelId) {
    var formEl = document.getElementById(panelId + '_addForm')
    if (!formEl) return
    if (formEl.innerHTML.trim()) { formEl.innerHTML = ''; return } // toggle

    var fid = _uid()
    formEl.innerHTML = '<div style="padding:10px 12px;background:#FAFAFA;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:10px">'
      + '<div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px">Nova Queixa</div>'
      + '<div style="margin-bottom:8px"><input id="' + fid + '_name" type="text" placeholder="Nome da queixa" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box" /></div>'
      + '<div style="margin-bottom:8px"><textarea id="' + fid + '_nota" placeholder="Observacao (opcional)" rows="2" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;resize:vertical;box-sizing:border-box"></textarea></div>'
      + '<div style="display:flex;gap:6px;justify-content:flex-end">'
      + _btn('Cancelar', ICONS.x, '#F3F4F6', '#6B7280', 'document.getElementById(\'' + panelId + '_addForm\').innerHTML=\'\'')
      + _btn('Salvar', ICONS.save, '#7C3AED', '#fff', 'ComplaintsPanel._doAdd(\'' + _esc(leadId) + '\',\'' + _esc(panelId) + '\',\'' + fid + '\')')
      + '</div></div>'

    var nameInput = document.getElementById(fid + '_name')
    if (nameInput) nameInput.focus()
  }

  function _showTreatForm(complaintId, panelId) {
    var wrap = document.getElementById(panelId)
    if (!wrap) return
    var rowFormEl = document.getElementById(panelId + '_row_' + complaintId + '_treatForm')
    if (!rowFormEl) return
    if (rowFormEl.innerHTML.trim()) { rowFormEl.innerHTML = ''; return } // toggle

    var procs = []
    try { procs = JSON.parse(wrap.dataset.procs || '[]') } catch (e) {}
    var fid = _uid()

    // Procedimento dropdown
    var procOptions = '<option value="">Selecione ou digite...</option>'
    procs.forEach(function(p) {
      procOptions += '<option value="' + _esc(p.nome) + '">' + _esc(p.nome) + '</option>'
    })
    procOptions += '<option value="__custom">Outro (digitar)</option>'

    // Retouch interval select
    var retouchOptions = '<option value="">Sem retoque</option>'
    RETOUCH_INTERVALS.forEach(function(r) {
      retouchOptions += '<option value="' + r.value + '">' + _esc(r.label) + '</option>'
    })

    rowFormEl.innerHTML = '<div style="padding:10px 12px;background:#fff;border:1px solid #D1D5DB;border-radius:8px;margin-top:8px">'
      + '<div style="font-size:11px;font-weight:700;color:#2563EB;margin-bottom:8px">Registrar Tratamento</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + '<div>'
      + '<div style="font-size:10px;font-weight:600;color:#6B7280;margin-bottom:3px">Procedimento</div>'
      + '<select id="' + fid + '_proc" onchange="ComplaintsPanel._onProcChange(\'' + fid + '\')" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">'
      + procOptions + '</select>'
      + '<input id="' + fid + '_procCustom" type="text" placeholder="Nome do procedimento" style="display:none;width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;margin-top:4px;box-sizing:border-box" />'
      + '</div>'
      + '<div>'
      + '<div style="font-size:10px;font-weight:600;color:#6B7280;margin-bottom:3px">Intervalo de retoque</div>'
      + '<select id="' + fid + '_retouch" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">'
      + retouchOptions + '</select>'
      + '</div></div>'
      + '<div style="margin-bottom:8px">'
      + '<div style="font-size:10px;font-weight:600;color:#6B7280;margin-bottom:3px">Nota</div>'
      + '<textarea id="' + fid + '_nota" placeholder="Observacao (opcional)" rows="2" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;outline:none;resize:vertical;box-sizing:border-box"></textarea>'
      + '</div>'
      + '<div style="display:flex;gap:6px;justify-content:flex-end">'
      + _btn('Cancelar', ICONS.x, '#F3F4F6', '#6B7280', 'document.getElementById(\'' + panelId + '_row_' + complaintId + '_treatForm\').innerHTML=\'\'')
      + _btn('Salvar tratamento', ICONS.save, '#2563EB', '#fff', 'ComplaintsPanel._doTreat(\'' + _esc(complaintId) + '\',\'' + _esc(panelId) + '\',\'' + fid + '\')')
      + '</div></div>'
  }

  function _onProcChange(fid) {
    var sel = document.getElementById(fid + '_proc')
    var customInput = document.getElementById(fid + '_procCustom')
    if (!sel || !customInput) return
    if (sel.value === '__custom') {
      customInput.style.display = 'block'
      customInput.focus()
    } else {
      customInput.style.display = 'none'
      customInput.value = ''
    }
  }

  // ── Action handlers ───────────────────────────────────────────

  async function _doAdd(leadId, panelId, fid) {
    var nameEl = document.getElementById(fid + '_name')
    var notaEl = document.getElementById(fid + '_nota')
    if (!nameEl) return
    var name = (nameEl.value || '').trim()
    if (!name) { nameEl.style.borderColor = '#EF4444'; return }

    try {
      await saveComplaint({
        patient_id: leadId,
        name: name,
        status: 'pendente',
        nota: (notaEl && notaEl.value) ? notaEl.value.trim() : null,
      })
      // Refresh panel
      _loadAndRenderFull(panelId, leadId)
    } catch (e) {
      console.error('[ComplaintsPanel] Add error:', e.message)
      _toastErr('Erro ao adicionar queixa: ' + e.message)
    }
  }

  async function _doTreat(complaintId, panelId, fid) {
    var wrap = document.getElementById(panelId)
    if (!wrap) return
    var leadId = wrap.dataset.leadId

    var procSel = document.getElementById(fid + '_proc')
    var procCustom = document.getElementById(fid + '_procCustom')
    var retouchSel = document.getElementById(fid + '_retouch')
    var notaEl = document.getElementById(fid + '_nota')

    var procedimento = ''
    if (procSel) {
      procedimento = procSel.value === '__custom'
        ? (procCustom ? procCustom.value.trim() : '')
        : procSel.value
    }
    if (!procedimento) {
      if (procSel) procSel.style.borderColor = '#EF4444'
      return
    }

    var retouchDays = retouchSel ? parseInt(retouchSel.value, 10) || null : null

    try {
      await saveComplaint({
        id: complaintId,
        status: 'em_tratamento',
        procedimento: procedimento,
        retouch_days: retouchDays,
        nota: (notaEl && notaEl.value) ? notaEl.value.trim() : null,
      })
      _loadAndRenderFull(panelId, leadId)
    } catch (e) {
      console.error('[ComplaintsPanel] Treat error:', e.message)
      _toastErr('Erro ao registrar tratamento: ' + e.message)
    }
  }

  async function _doResolve(complaintId, panelId) {
    var wrap = document.getElementById(panelId)
    if (!wrap) return
    var leadId = wrap.dataset.leadId

    try {
      await resolveComplaint(complaintId)
      _loadAndRenderFull(panelId, leadId)
    } catch (e) {
      console.error('[ComplaintsPanel] Resolve error:', e.message)
      _toastErr('Erro ao resolver queixa: ' + e.message)
    }
  }

  // ── 3. loadComplaints ─────────────────────────────────────────
  async function loadComplaints(patientId) {
    if (!_sb()) throw new Error('Supabase client not available')

    var res = await _sb().rpc('complaint_list', { p_patient_id: patientId })
    if (res.error) throw new Error(res.error.message)
    return res.data || []
  }

  // ── 4. saveComplaint ──────────────────────────────────────────
  async function saveComplaint(data) {
    if (!_sb()) throw new Error('Supabase client not available')

    var res = await _sb().rpc('complaint_upsert', { p_data: data })
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  // ── 5. resolveComplaint ───────────────────────────────────────
  async function resolveComplaint(id) {
    if (!_sb()) throw new Error('Supabase client not available')

    var res = await _sb().rpc('complaint_resolve', { p_complaint_id: id })
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  // ── Expose globally ───────────────────────────────────────────
  window.ComplaintsPanel = {
    renderCard:        renderCard,
    renderFullPanel:   renderFullPanel,
    loadComplaints:    loadComplaints,
    saveComplaint:     saveComplaint,
    resolveComplaint:  resolveComplaint,

    // Internal handlers (exposed for inline onclick)
    _showAddForm:   _showAddForm,
    _showTreatForm: _showTreatForm,
    _onProcChange:  _onProcChange,
    _doAdd:         _doAdd,
    _doTreat:       _doTreat,
    _doResolve:     _doResolve,
    _quickTreat:    _quickTreat,
    _submitQuickTreat: _submitQuickTreat,
    _onQtProcChange: _onQtProcChange,
    _toggleDesconto: _toggleDesconto,
    _calcDesconto: _calcDesconto,
  }

})()
