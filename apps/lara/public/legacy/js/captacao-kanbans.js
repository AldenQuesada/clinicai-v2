// ── ClinicAI — CaptacaoKanbans ──
//
// Gerencia as páginas de kanban de captação segmentadas por produto:
//   - Full Face Premium (lifting 5D + protocolos completos)
//   - Procedimentos Isolados (injetáveis unitários)
//
// Expõe: window.CaptacaoKanbans = { initFullFace, initProtocolos }
//
// Depende de:
//   window.KanbanBoard  (components/kanban-board.js)
//   window.SdrService   (services/sdr.service.js)

;(function () {
  'use strict'

  if (window._clinicaiCaptacaoKanbansLoaded) return
  window._clinicaiCaptacaoKanbansLoaded = true

  // ── Estado interno ────────────────────────────────────────────

  var _boardFullFace   = null
  var _boardProtocolos = null
  var _tempFullFace    = null
  var _tempProtocolos  = null

  // ── SVG icons (Feather style) ─────────────────────────────────

  var ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  var ICON_PLUS   = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  var ICON_SHEET  = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>'

  // ── Configurações por kanban ──────────────────────────────────

  var CONFIGS = {
    fullface: {
      rootId:      'kanbanFullFaceRoot',
      title:       'SDR Full Face Premium',
      description: 'Leads de alto valor — Lifting 5D e protocolos completos',
      badgeLabel:  'evolution',
      badgeColor:  '#6366f1',
      badgeBg:     '#ede9fe',
      activeBg:    '#ede9fe',
      activeColor: '#5b21b6',
      activeBorder:'#a78bfa',
    },
    protocolos: {
      rootId:      'kanbanProtocolosRoot',
      title:       'SDR Procedimentos Isolados',
      description: 'Preenchimento de olheiras, lábios, rinomodelação e demais injetáveis',
      badgeLabel:  'evolution',
      badgeColor:  '#f59e0b',
      badgeBg:     '#fef3c7',
      activeBg:    '#fef3c7',
      activeColor: '#92400e',
      activeBorder:'#fcd34d',
    },
  }

  // ── Render de layout ──────────────────────────────────────────

  function _renderLayout(key, currentTemp) {
    var cfg = CONFIGS[key]

    var tempButtons = [
      { value: null,  label: 'Todos' },
      { value: 'hot',  label: 'Quente' },
      { value: 'warm', label: 'Morno' },
      { value: 'cold', label: 'Frio' },
    ]

    var tempBtns = tempButtons.map(function (t) {
      var isActive = (currentTemp === t.value)
      var style = isActive
        ? 'padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid ' + cfg.activeBorder + ';background:' + cfg.activeBg + ';color:' + cfg.activeColor + ';cursor:pointer'
        : 'padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer'
      return '<button data-kb-temp="' + (t.value === null ? '' : t.value) + '" data-kb-key="' + key + '" style="' + style + '">' + t.label + '</button>'
    }).join('')

    return (
      '<div style="display:flex;flex-direction:column;height:100%;padding:20px 24px 0">' +
        // Header
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-shrink:0">' +
          '<div>' +
            '<h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;line-height:1.2">' + cfg.title + '</h2>' +
            '<p style="margin:0;font-size:13px;color:#6b7280">' + cfg.description + '</p>' +
          '</div>' +
          '<span style="margin-left:16px;margin-top:2px;display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:' + cfg.badgeBg + ';color:' + cfg.badgeColor + ';white-space:nowrap">' + cfg.badgeLabel + '</span>' +
        '</div>' +
        // Toolbar
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;flex-shrink:0">' +
          '<div style="display:flex;gap:6px">' + tempBtns + '</div>' +
          '<div style="position:relative;flex:1;min-width:160px;max-width:260px">' +
            '<span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none;display:flex;align-items:center">' + ICON_SEARCH + '</span>' +
            '<input data-kb-search="' + key + '" type="text" placeholder="Buscar por nome..." style="width:100%;padding:6px 10px 6px 30px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#374151;outline:none;box-sizing:border-box" />' +
          '</div>' +
          (key === 'fullface'
            ? '<button data-kb-import="fullface" style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:500;background:#16a34a;color:#fff;border:none;cursor:pointer;white-space:nowrap">' +
                ICON_SHEET + ' Importar Planilha' +
              '</button>'
            : '') +
          '<button data-kb-add="' + key + '" style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:500;background:#111827;color:#fff;border:none;cursor:pointer;white-space:nowrap">' +
            ICON_PLUS + ' Novo Lead' +
          '</button>' +
        '</div>' +
        // Kanban container
        '<div class="kb-container" style="flex:1;min-height:0;overflow-x:auto;padding:0 0 16px"></div>' +
      '</div>'
    )
  }

  // ── Erro elegante ─────────────────────────────────────────────

  function _renderError(root, msg) {
    root.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:40px">' +
        '<div style="text-align:center;max-width:340px">' +
          '<div style="width:44px;height:44px;margin:0 auto 16px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '</div>' +
          '<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#111827">Componente indisponível</p>' +
          '<p style="margin:0;font-size:13px;color:#6b7280">' + msg + '</p>' +
        '</div>' +
      '</div>'
  }

  // ── Filtro de busca por nome (DOM) ────────────────────────────

  function _filterByName(rootId, query) {
    var q = query.toLowerCase().trim()
    document.querySelectorAll('#' + rootId + ' .lead-card').forEach(function (card) {
      var name = (card.dataset.nome || card.textContent || '').toLowerCase()
      card.style.display = (!q || name.includes(q)) ? '' : 'none'
    })
  }

  // ── Bind de eventos de toolbar ────────────────────────────────

  function _bindToolbar(root, key) {
    // Botões de temperatura
    root.querySelectorAll('[data-kb-temp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-kb-temp')
        var temp = (val === '') ? null : val
        if (key === 'fullface') {
          _tempFullFace = temp
          initFullFace()
        } else {
          _tempProtocolos = temp
          initProtocolos()
        }
      })
    })

    // Busca por nome
    var searchEl = root.querySelector('[data-kb-search]')
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        _filterByName(CONFIGS[key].rootId, searchEl.value)
      })
    }

    // Botão importar planilha (Full Face only)
    var importBtn = root.querySelector('[data-kb-import]')
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        _showSheetsImportModal()
      })
    }

    // Botão novo lead
    var addBtn = root.querySelector('[data-kb-add]')
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (typeof window.showLeadModal === 'function') {
          window.showLeadModal({})
        } else {
          if (window._showToast) _showToast('Erro', 'Modal de novo lead nao disponivel.', 'error')
        }
      })
    }
  }

  // ── Modal de importação Google Sheets ─────────────────────────

  function _showSheetsImportModal() {
    document.getElementById('sheetsImportModal')?.remove()

    var svc        = window.SheetsImportService
    var currentUrl = svc ? svc.getUrl() : ''
    var lastImport = svc ? svc.getLastImport() : null
    var lastFmt    = lastImport
      ? new Date(lastImport).toLocaleString('pt-BR')
      : 'Nunca importado'

    var m = document.createElement('div')
    m.id  = 'sheetsImportModal'
    m.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">' +
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:480px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.2)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<div>' +
              '<div style="font-size:16px;font-weight:700;color:#111827">Importar Planilha Google</div>' +
              '<div style="font-size:12px;color:#6b7280;margin-top:2px">Última importação: ' + lastFmt + '</div>' +
            '</div>' +
            '<button id="sheetsImportClose" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">&#x2715;</button>' +
          '</div>' +
          '<div style="margin-bottom:16px">' +
            '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">URL do Apps Script</label>' +
            '<input id="sheetsImportUrl" type="url" value="' + _esc(currentUrl) + '" placeholder="https://script.google.com/macros/s/..." ' +
              'style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;color:#111827;outline:none;box-sizing:border-box" />' +
            '<div style="margin-top:6px;font-size:11px;color:#9ca3af">Cole aqui a URL gerada após implantar o Apps Script na planilha.</div>' +
          '</div>' +
          '<div id="sheetsImportStatus" style="min-height:36px;margin-bottom:16px"></div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end">' +
            '<button id="sheetsImportCancel" style="padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
            '<button id="sheetsImportRun" style="padding:9px 18px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Importar Agora</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(m)

    document.getElementById('sheetsImportClose').onclick  = function() { m.remove() }
    document.getElementById('sheetsImportCancel').onclick = function() { m.remove() }
    document.getElementById('sheetsImportRun').onclick    = function() { _runImport(m) }
  }

  function _esc(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }

  async function _runImport(modal) {
    var svc = window.SheetsImportService
    if (!svc) {
      _setImportStatus(modal, 'error', 'SheetsImportService não disponível.')
      return
    }

    var urlEl = document.getElementById('sheetsImportUrl')
    var url   = (urlEl ? urlEl.value.trim() : '') || svc.getUrl()

    if (!url) {
      _setImportStatus(modal, 'error', 'Informe a URL do Apps Script.')
      return
    }

    svc.setUrl(url)

    var btn = document.getElementById('sheetsImportRun')
    if (btn) { btn.disabled = true; btn.textContent = 'Importando...' }
    _setImportStatus(modal, 'loading', 'Buscando dados da planilha...')

    var result = await svc.importFullFace({ url: url })

    if (btn) { btn.disabled = false; btn.textContent = 'Importar Agora' }

    if (!result.ok) {
      _setImportStatus(modal, 'error', result.error || 'Erro desconhecido.')
      return
    }

    _setImportStatus(modal, 'success',
      result.imported + ' leads importados · ' + result.skipped + ' ignorados (já existiam)'
    )

    // Recarrega o kanban com os novos leads
    setTimeout(function () {
      modal.remove()
      if (window.CaptacaoKanbans) window.CaptacaoKanbans.initFullFace()
    }, 1800)
  }

  function _setImportStatus(modal, type, msg) {
    var el = document.getElementById('sheetsImportStatus')
    if (!el) return
    var colors = {
      loading: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
      success: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
      error:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    }
    var c = colors[type] || colors.loading
    el.innerHTML =
      '<div style="padding:10px 14px;background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:8px;font-size:13px;color:' + c.color + '">' +
        msg +
      '</div>'
  }

  // ── initFullFace ──────────────────────────────────────────────

  function initFullFace() {
    var cfg  = CONFIGS.fullface
    var root = document.getElementById(cfg.rootId)
    if (!root) return

    if (!window.KanbanBoard || !window.SdrService) {
      _renderError(root, 'KanbanBoard ou SdrService não foram carregados. Verifique a ordem dos scripts.')
      return
    }

    if (_boardFullFace) {
      try { _boardFullFace.destroy() } catch (e) { /* silencioso */ }
      _boardFullFace = null
    }

    root.innerHTML = _renderLayout('fullface', _tempFullFace)
    _bindToolbar(root, 'fullface')

    var container = root.querySelector('.kb-container')
    _boardFullFace = window.KanbanBoard.create(container, {
      pipeline:    'evolution',
      phase:       null,
      temperature: _tempFullFace,
      funnel:      'fullface',
    })
    _boardFullFace.load()
  }

  // ── initProtocolos ────────────────────────────────────────────

  function initProtocolos() {
    var cfg  = CONFIGS.protocolos
    var root = document.getElementById(cfg.rootId)
    if (!root) return

    if (!window.KanbanBoard || !window.SdrService) {
      _renderError(root, 'KanbanBoard ou SdrService não foram carregados. Verifique a ordem dos scripts.')
      return
    }

    if (_boardProtocolos) {
      try { _boardProtocolos.destroy() } catch (e) { /* silencioso */ }
      _boardProtocolos = null
    }

    root.innerHTML = _renderLayout('protocolos', _tempProtocolos)
    _bindToolbar(root, 'protocolos')

    var container = root.querySelector('.kb-container')
    _boardProtocolos = window.KanbanBoard.create(container, {
      pipeline:    'evolution',
      phase:       null,
      temperature: _tempProtocolos,
      funnel:      'procedimentos',
    })
    _boardProtocolos.load()
  }

  // ── Exposição pública ─────────────────────────────────────────

  window.CaptacaoKanbans = Object.freeze({
    initFullFace:   initFullFace,
    initProtocolos: initProtocolos,
  })

})()
