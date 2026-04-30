/* ============================================================
   ClinicAI — LeadsContext
   Duplicata independente da página de Leads para cada funil.

   Uso (chamado pelo sidebar.js ao navegar):
     LeadsContext.init('fullface')    → renderiza em #leadsFullFaceRoot
     LeadsContext.init('protocolos')  → renderiza em #leadsProtocolosRoot

   leads.js e page-leads-all intactos — zero acoplamento.
   Cada contexto tem estado próprio: período, view, kanban, filtros.
   ============================================================ */

;(function () {
  'use strict'

  if (window._clinicaiLeadsContextLoaded) return
  window._clinicaiLeadsContextLoaded = true

  // ── Configuração por contexto ─────────────────────────────────

  var CONFIGS = {
    fullface: {
      key:      'fullface',
      rootId:   'leadsFullFaceRoot',
      prefix:   'lcFF_',
      title:    'Leads Full Face',
      subtitle: 'Leads do funil Full Face — Lifting 5D e protocolos completos',
      color:    '#6366f1',
    },
    protocolos: {
      key:      'protocolos',
      rootId:   'leadsProtocolosRoot',
      prefix:   'lcProc_',
      title:    'Leads Procedimentos',
      subtitle: 'Leads do funil de procedimentos isolados — injetáveis e estética',
      color:    '#f59e0b',
    },
  }

  // ── Instâncias ────────────────────────────────────────────────
  // Cada init() cria (ou recria) uma instância isolada.

  var _instances = {}

  function init(key) {
    var cfg = CONFIGS[key]
    if (!cfg) return
    // Destrói kanban anterior se existir
    if (_instances[key]) _instances[key].destroy()
    _instances[key] = _createInstance(cfg)
    _instances[key].mount()
  }

  // ── Factory de instância ──────────────────────────────────────

  function _createInstance(cfg) {
    var P = cfg.prefix  // prefixo para todos os IDs desta instância

    // Estado local
    var _period        = { type: 'all', from: null, to: null }
    var _filteredAll   = []
    var _PAGE_SIZE     = window.LeadsFilter ? LeadsFilter.PAGE_SIZE : 50
    var _currentView   = 'table'
    var _kanbanBoard   = null
    var _kbTempFilter  = null
    var _tagsLoading   = false
    var _sortField     = 'date'
    var _sortDir       = 'desc'
    var _selectedIds   = new Set()
    var _queixaFilter  = []   // array de slugs canonicos ativos
    var _allLeadsCache = []   // leads carregados sem filtro — pra agregar queixas no popover

    // Atalho getElementById com prefixo
    function _$(id) { return document.getElementById(P + id) }

    // ── Mount: injeta HTML e inicializa ───────────────────────

    function mount() {
      var root = document.getElementById(cfg.rootId)
      if (!root) return
      root.innerHTML = _buildHTML()
      _bindEvents()
      _load()
    }

    function destroy() {
      if (_kanbanBoard) { _kanbanBoard.destroy(); _kanbanBoard = null }
    }

    // ── HTML da página ────────────────────────────────────────

    function _buildHTML() {
      var p = P
      return (
        '<div style="padding:20px 24px;height:100%;display:flex;flex-direction:column;min-height:0">' +

        /* Cabeçalho */
        '<div class="page-title-row" style="margin-bottom:16px">' +
          '<div class="page-title-left">' +
            '<h1 class="page-title">' + cfg.title + '</h1>' +
            '<p class="page-subtitle">' + cfg.subtitle + '</p>' +
          '</div>' +
          '<div class="page-title-right" style="display:flex;gap:8px;align-items:center">' +
            (cfg.key === 'fullface'
              ? '<button id="' + P + 'ImportSheetBtn" style="' +
                  'display:flex;align-items:center;gap:8px;' +
                  'background:#fff;color:#16a34a;border:1.5px solid #16a34a;padding:9px 16px;border-radius:10px;' +
                  'font-size:13px;font-weight:600;cursor:pointer">' +
                  '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                  'Importar Planilha' +
                '</button>'
              : '') +
            '<div style="position:relative;display:inline-block">' +
              '<button id="' + P + 'ExportBtn" style="display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1.5px solid #E5E7EB;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                'Exportar' +
              '</button>' +
              '<div id="' + P + 'ExportMenu" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);overflow:hidden;z-index:20;min-width:160px">' +
                '<button class="lc-export-opt" data-format="csv" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;font-size:13px;font-weight:500;color:#111;cursor:pointer;text-align:left">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                  'Exportar CSV' +
                '</button>' +
                '<button class="lc-export-opt" data-format="pdf" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;font-size:13px;font-weight:500;color:#111;cursor:pointer;text-align:left;border-top:1px solid #F3F4F6">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                  'Exportar PDF' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<button onclick="showNewPatientModal && showNewPatientModal()" style="' +
              'display:flex;align-items:center;gap:8px;' +
              'background:linear-gradient(135deg,#7C3AED,#5B21B6);' +
              'color:#fff;border:none;padding:10px 20px;border-radius:10px;' +
              'font-size:13px;font-weight:600;cursor:pointer;' +
              'box-shadow:0 4px 12px rgba(124,58,237,0.3)">' +
              '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' +
              'Novo Lead' +
            '</button>' +
          '</div>' +
        '</div>' +

        /* Toggle Tabela / 7 Dias / Evolução */
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
          '<div class="sdr-pipeline-toggle" id="' + p + 'ViewToggle">' +
            '<button class="sdr-pipeline-btn active" data-view="table" id="' + p + 'BtnTable">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' +
              ' Tabela' +
            '</button>' +
            '<button class="sdr-pipeline-btn" data-view="seven_days" id="' + p + 'BtnSevenDays">7 Dias</button>' +
            '<button class="sdr-pipeline-btn" data-view="evolution"  id="' + p + 'BtnEvolution">Evolução</button>' +
          '</div>' +

          /* Badge de contagem */
          '<div id="' + p + 'CountBadge" style="display:none;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:6px 14px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">' +
            '<div style="display:flex;align-items:baseline;gap:4px">' +
              '<span id="' + p + 'Stat_total" style="font-size:18px;font-weight:800;color:#111;line-height:1">0</span>' +
              '<span style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em">leads</span>' +
            '</div>' +
            '<div style="width:1px;height:20px;background:#f3f4f6;flex-shrink:0"></div>' +
            '<div style="display:flex;align-items:center;gap:4px" title="Quente">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>' +
              '<span id="' + p + 'Stat_hot"  style="font-size:13px;font-weight:700;color:#ef4444">0</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:4px" title="Morno">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>' +
              '<span id="' + p + 'Stat_warm" style="font-size:13px;font-weight:700;color:#f59e0b">0</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:4px" title="Frio">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>' +
              '<span id="' + p + 'Stat_cold" style="font-size:13px;font-weight:700;color:#60a5fa">0</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Barra de filtros */
        '<div id="' + p + 'FiltersBar" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +

          /* Linha 1: Período + Busca */
          '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap">' +
              '<div class="ao-period-bar" id="' + p + 'PeriodBar">' +
                '<button class="ao-period-btn active" data-period="all">Todos</button>' +
                '<button class="ao-period-btn" data-period="today">Hoje</button>' +
                '<button class="ao-period-btn" data-period="week">Semana</button>' +
                '<button class="ao-period-btn" data-period="month">Mês</button>' +
                '<button class="ao-period-btn" data-period="custom">Período</button>' +
              '</div>' +
              '<div id="' + p + 'DateRange" class="ao-date-range" style="display:none">' +
                '<input id="' + p + 'DateFrom" type="date" class="ao-date-input">' +
                '<span style="font-size:12px;color:#9ca3af">até</span>' +
                '<input id="' + p + 'DateTo"   type="date" class="ao-date-input">' +
                '<button class="ao-date-apply" id="' + p + 'DateApply">Aplicar</button>' +
              '</div>' +
            '</div>' +
            '<input id="' + p + 'SearchInput" type="text" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')"' +
              ' placeholder="Buscar por nome ou telefone..."' +
              ' style="padding:7px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;width:200px">' +
          '</div>' +

          /* Linha 2: Temperatura × Tags */
          '<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#faf5ff;border:1px solid #ede9fe;border-radius:10px;flex-wrap:wrap">' +
            '<div style="display:flex;align-items:center;gap:5px;margin-right:4px">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
              '<span style="font-size:11px;font-weight:700;color:#7c3aed;letter-spacing:0.04em;white-space:nowrap">ESTRATÉGICO</span>' +
            '</div>' +
            '<div style="width:1px;height:18px;background:#ddd6fe;flex-shrink:0"></div>' +
            '<select id="' + p + 'TempFilter"' +
              ' style="padding:5px 10px;border:1.5px solid #ddd6fe;border-radius:8px;font-size:12px;font-family:inherit;outline:none;background:#fff;cursor:pointer;color:#374151">' +
              '<option value="">Todas as temperaturas</option>' +
              '<option value="hot">Quente</option>' +
              '<option value="warm">Morno</option>' +
              '<option value="cold">Frio</option>' +
            '</select>' +
            '<select id="' + p + 'TagFilter"' +
              ' style="padding:5px 10px;border:1.5px solid #ddd6fe;border-radius:8px;font-size:12px;font-family:inherit;outline:none;background:#fff;cursor:pointer;color:#374151">' +
              '<option value="">Todas as tags</option>' +
            '</select>' +
            '<button id="' + p + 'QueixaBtn" type="button" style="padding:5px 10px;border:1.5px solid #ddd6fe;border-radius:8px;font-size:12px;font-family:inherit;outline:none;background:#fff;cursor:pointer;color:#374151;display:inline-flex;align-items:center;gap:6px">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>' +
              '<span id="' + p + 'QueixaBtnLabel">Todas as queixas</span>' +
            '</button>' +
            '<div id="' + p + 'QueixaPanel" style="display:none;position:absolute;margin-top:4px;z-index:50;background:#fff;border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.08);padding:10px;min-width:260px;max-height:340px;overflow-y:auto"></div>' +
          '</div>' +
        '</div>' +

        /* View: Tabela */
        '<div id="' + p + 'ViewTable" style="flex:1;min-height:0;overflow-y:auto">' +
          '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
              '<colgroup>' +
                '<col style="width:44px"><col style="width:220px"><col style="width:110px">' +
                '<col style="width:180px"><col><col style="width:90px"><col style="width:100px">' +
              '</colgroup>' +
              '<thead>' +
                '<tr style="background:#F9FAFB;border-bottom:1px solid #F3F4F6">' +
                  '<th style="padding:12px 8px 12px 16px;width:32px"><input type="checkbox" id="' + p + 'SelectAll" style="width:14px;height:14px;accent-color:#7C3AED;cursor:pointer"></th>' +
                  '<th class="lc-sort-th" data-sort="name" style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">Nome</th>' +
                  '<th class="lc-sort-th" data-sort="temperature" style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">Temperatura</th>' +
                  '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Tags</th>' +
                  '<th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Queixas</th>' +
                  '<th class="lc-sort-th" data-sort="date" style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">Data</th>' +
                  '<th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Acoes</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="' + p + 'TableBody">' +
                '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Carregando leads...</td></tr>' +
              '</tbody>' +
            '</table>' +
          '</div>' +
          /* Load more */
          '<div id="' + p + 'LoadMoreCont" style="padding:16px 0;text-align:center">' +
            '<button id="' + p + 'LoadMoreBtn" style="display:none;background:#fff;border:1px solid #e5e7eb;padding:8px 20px;border-radius:8px;font-size:13px;color:#6b7280;cursor:pointer;font-weight:500">' +
              'Carregar mais leads' +
            '</button>' +
          '</div>' +
        '</div>' +

        /* View: Kanban */
        '<div id="' + p + 'ViewKanban" style="display:none;flex:1;min-height:0;overflow-x:auto;padding:0 4px">' +
          '<div id="' + p + 'KanbanContainer"></div>' +
        '</div>' +

        '</div>'
      )
    }

    // ── Bind eventos ──────────────────────────────────────────

    function _bindEvents() {
      // Toggle de view
      var toggle = _$('ViewToggle')
      if (toggle) {
        toggle.querySelectorAll('.sdr-pipeline-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { _setView(btn.dataset.view, btn) })
        })
      }

      // Período
      var periodBar = _$('PeriodBar')
      if (periodBar) {
        periodBar.querySelectorAll('.ao-period-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { _setPeriod(btn.dataset.period, btn) })
        })
      }

      // Aplicar período customizado
      var dateApply = _$('DateApply')
      if (dateApply) dateApply.addEventListener('click', _applyCustomPeriod)

      // Busca
      var search = _$('SearchInput')
      if (search) search.addEventListener('input', function() { _load() })

      // Temperatura
      var temp = _$('TempFilter')
      if (temp) temp.addEventListener('change', function() { _load() })

      // Tags
      var tag = _$('TagFilter')
      if (tag) tag.addEventListener('change', function() { _load() })

      // Queixas (popover multi-select)
      var qBtn = _$('QueixaBtn')
      if (qBtn) {
        qBtn.addEventListener('click', function(ev) {
          ev.stopPropagation()
          _toggleQueixaPanel()
        })
      }
      document.addEventListener('click', function(ev) {
        var panel = _$('QueixaPanel')
        if (panel && panel.style.display !== 'none' && !panel.contains(ev.target) && ev.target !== _$('QueixaBtn')) {
          panel.style.display = 'none'
        }
      })

      // Load more
      var loadMoreBtn = _$('LoadMoreBtn')
      if (loadMoreBtn) loadMoreBtn.addEventListener('click', _loadMore)

      // Sort por coluna (click no header)
      var root = document.getElementById(cfg.rootId)
      if (root) {
        root.querySelectorAll('.lc-sort-th').forEach(function(th) {
          th.addEventListener('click', function() {
            var field = th.dataset.sort
            if (_sortField === field) {
              _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'
            } else {
              _sortField = field
              _sortDir = field === 'date' ? 'desc' : 'asc'
            }
            // Indicador visual
            root.querySelectorAll('.lc-sort-th').forEach(function(h) { h.style.color = '#6B7280' })
            th.style.color = '#111'
            _load()
          })
        })

        // Select all checkbox
        var selectAll = _$('SelectAll')
        if (selectAll) {
          selectAll.addEventListener('change', function() {
            _selectedIds = selectAll.checked ? new Set(_filteredAll.map(function(l){return l.id})) : new Set()
            _updateCheckboxes()
            _updateBulkBar()
          })
        }
      }

      // Export dropdown
      var exportBtn = _$('ExportBtn')
      var exportMenu = _$('ExportMenu')
      if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', function(e) {
          e.stopPropagation()
          exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none'
        })
        document.addEventListener('click', function() { exportMenu.style.display = 'none' })
        exportMenu.querySelectorAll('.lc-export-opt').forEach(function(opt) {
          opt.addEventListener('click', function() {
            exportMenu.style.display = 'none'
            _exportLeads(opt.dataset.format)
          })
          opt.addEventListener('mouseenter', function() { opt.style.background = '#F9FAFB' })
          opt.addEventListener('mouseleave', function() { opt.style.background = '' })
        })
      }

      // Importar planilha (Full Face only)
      var importBtn = _$('ImportSheetBtn')
      if (importBtn) {
        importBtn.addEventListener('click', function () {
          if (window.SheetsImportService) {
            _showSheetsImportModal(function () { _load() })
          } else {
            _toastErr('SheetsImportService não disponível.')
          }
        })
      }
    }

    function _showSheetsImportModal(onSuccess) {
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
              '<input id="sheetsImportUrl" type="url" value="' + (currentUrl || '').replace(/"/g,'&quot;') + '" placeholder="https://script.google.com/macros/s/..." ' +
                'style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;color:#111827;outline:none;box-sizing:border-box" />' +
              '<div style="margin-top:6px;font-size:11px;color:#9ca3af">Cole a URL gerada após implantar o Apps Script na planilha.</div>' +
            '</div>' +
            '<div id="sheetsImportStatus" style="min-height:36px;margin-bottom:16px"></div>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end">' +
              '<button id="sheetsImportCancel" style="padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
              '<button id="sheetsImportRun" style="padding:9px 18px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Importar Agora</button>' +
            '</div>' +
          '</div>' +
        '</div>'

      document.body.appendChild(m)

      document.getElementById('sheetsImportClose').onclick  = function () { m.remove() }
      document.getElementById('sheetsImportCancel').onclick = function () { m.remove() }
      document.getElementById('sheetsImportRun').onclick    = function () { _runImport(m, onSuccess) }
    }

    async function _runImport(modal, onSuccess) {
      var svc = window.SheetsImportService
      var urlEl = document.getElementById('sheetsImportUrl')
      var url   = urlEl ? urlEl.value.trim() : ''

      if (!url) { _setImportStatus('error', 'Informe a URL do Apps Script.'); return }

      svc.setUrl(url)

      var btn = document.getElementById('sheetsImportRun')
      if (btn) { btn.disabled = true; btn.textContent = 'Importando...' }
      _setImportStatus('loading', 'Buscando dados da planilha...')

      var result = await svc.importFullFace({ url: url })

      if (btn) { btn.disabled = false; btn.textContent = 'Importar Agora' }

      if (!result.ok) {
        _setImportStatus('error', result.error || 'Erro desconhecido.')
        return
      }

      _setImportStatus('success',
        result.imported + ' leads importados · ' + result.skipped + ' ignorados (já existiam)'
      )

      setTimeout(function () {
        modal.remove()
        if (typeof onSuccess === 'function') onSuccess()
      }, 1800)
    }

    function _setImportStatus(type, msg) {
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

    // ── Período ───────────────────────────────────────────────

    function _setPeriod(type, btn) {
      _period = { type: type, from: null, to: null }
      var bar = _$('PeriodBar')
      if (bar) bar.querySelectorAll('.ao-period-btn').forEach(function(b) {
        b.classList.toggle('active', b === btn)
      })
      var dr = _$('DateRange')
      if (dr) dr.style.display = (type === 'custom') ? 'flex' : 'none'
      if (type !== 'custom') _load()
    }

    function _applyCustomPeriod() {
      var fromEl = _$('DateFrom')
      var toEl   = _$('DateTo')
      if (!fromEl || !toEl) return
      _period = { type: 'custom', from: fromEl.value || null, to: toEl.value || null }
      _load()
    }

    // ── View ─────────────────────────────────────────────────

    function _setView(view, btn) {
      _currentView = view
      var toggle = _$('ViewToggle')
      if (toggle) toggle.querySelectorAll('.sdr-pipeline-btn').forEach(function(b) {
        b.classList.toggle('active', b === btn)
      })
      var tableEl    = _$('ViewTable')
      var kanbanEl   = _$('ViewKanban')
      var filtersEl  = _$('FiltersBar')
      var badgeEl    = _$('CountBadge')
      var loadMoreEl = _$('LoadMoreCont')
      if (view === 'table') {
        if (tableEl)    tableEl.style.display    = ''
        if (kanbanEl)   kanbanEl.style.display   = 'none'
        if (filtersEl)  filtersEl.style.display  = ''
        if (badgeEl)    badgeEl.style.display     = 'flex'
        if (loadMoreEl) loadMoreEl.style.display  = ''
        _load()
      } else {
        if (tableEl)    tableEl.style.display    = 'none'
        if (kanbanEl)   kanbanEl.style.display   = ''
        if (filtersEl)  filtersEl.style.display  = 'none'
        if (badgeEl)    badgeEl.style.display     = 'none'
        if (loadMoreEl) loadMoreEl.style.display  = 'none'
        _loadKanban(view)
      }
    }

    // ── Carregar e filtrar leads ──────────────────────────────

    async function _load() {
      var LF = window.LeadsFilter
      var all
      try {
        all = window.ClinicLeadsCache ? await ClinicLeadsCache.readAsync() : []
        _allLeadsCache = all
        window._clinicaiAllLeadsCache = all   // exposicao pra broadcast ler
      } catch(e) {
        all = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      }

      var search  = (_$('SearchInput')?.value || '').toLowerCase().trim()
      var tempVal = (_$('TempFilter')?.value  || '')
      var tagSlug = (_$('TagFilter')?.value   || '')

      // Lazy-load tags
      if (!_tagsLoading) _loadTagsFilter()

      // Buscar IDs de leads com a tag selecionada
      var tagLeadIds = LF ? await LF.loadTagLeadIds(tagSlug) : null

      // Filtrar e ordenar via modulo compartilhado
      var result = LF
        ? LF.filter(all, { period: _period, search: search, tempVal: tempVal, tagLeadIds: tagLeadIds, queixaSlugs: _queixaFilter, funnelSlug: (cfg.key === 'protocolos' ? 'procedimentos' : 'fullface'), excludePhases: ['agendado', 'reagendado', 'compareceu', 'perdido', 'paciente', 'orcamento'] })
        : { filtered: all, stats: { total: all.length, hot: 0, warm: 0, cold: 0 } }

      var filtered = LF ? LF.sort(result.filtered, _sortField, _sortDir) : result.filtered

      // Estatisticas
      var badge = _$('CountBadge')
      if (badge) {
        var elTot  = _$('Stat_total')
        var elHot  = _$('Stat_hot')
        var elWarm = _$('Stat_warm')
        var elCold = _$('Stat_cold')
        if (elTot)  elTot.textContent  = result.stats.total
        if (elHot)  elHot.textContent  = result.stats.hot
        if (elWarm) elWarm.textContent = result.stats.warm
        if (elCold) elCold.textContent = result.stats.cold
        badge.style.display = 'flex'
      }

      _filteredAll = filtered

      // Restaurar paginacao salva (se usuario voltou da navegacao)
      var savedPage = 0
      try { savedPage = parseInt(sessionStorage.getItem('lc_page_' + cfg.key)) || 0 } catch {}
      var showCount = Math.max(_PAGE_SIZE, savedPage)

      _renderTable(filtered.slice(0, showCount), 0, false)
      _updateLoadMore()
    }

    // ── Popover de filtro por queixa ──────────────────────────

    function _updateQueixaLabel() {
      var lbl = _$('QueixaBtnLabel')
      var btn = _$('QueixaBtn')
      if (!lbl || !btn) return
      if (!_queixaFilter.length) {
        lbl.textContent = 'Todas as queixas'
        btn.style.borderColor = '#ddd6fe'
        btn.style.background = '#fff'
        btn.style.color = '#374151'
      } else if (_queixaFilter.length === 1) {
        lbl.textContent = (window.LeadsQueixa ? window.LeadsQueixa.label(_queixaFilter[0]) : _queixaFilter[0])
        btn.style.borderColor = '#7c3aed'
        btn.style.background = '#f5f3ff'
        btn.style.color = '#6d28d9'
      } else {
        lbl.textContent = _queixaFilter.length + ' queixas'
        btn.style.borderColor = '#7c3aed'
        btn.style.background = '#f5f3ff'
        btn.style.color = '#6d28d9'
      }
    }

    function _toggleQueixaPanel() {
      var panel = _$('QueixaPanel')
      if (!panel || !window.LeadsQueixa) return
      if (panel.style.display === 'block') { panel.style.display = 'none'; return }
      // Agrega a partir da base COMPLETA atual (não da filtrada, pra não sumir opções ao selecionar)
      var base = _allLeadsCache.length ? _allLeadsCache : _filteredAll
      var agg = window.LeadsQueixa.aggregate(base)
      var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
                   '<span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Filtrar por queixa</span>' +
                   '<button id="' + P + 'QueixaClear" type="button" style="font-size:11px;border:none;background:none;color:#6b7280;cursor:pointer;text-decoration:underline">Limpar</button>' +
                 '</div>'
      if (!agg.length) {
        html += '<div style="font-size:12px;color:#9ca3af;padding:12px;text-align:center">Nenhuma queixa encontrada nos leads.</div>'
      } else {
        agg.forEach(function (it) {
          var checked = _queixaFilter.indexOf(it.slug) !== -1
          html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;font-size:13px;color:#374151;border-radius:4px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
                    '<input type="checkbox" data-queixa-slug="' + it.slug + '"' + (checked ? ' checked' : '') + ' style="accent-color:#7c3aed;cursor:pointer">' +
                    '<span style="flex:1">' + it.label + '</span>' +
                    '<span style="font-size:11px;color:#9ca3af;background:#f3f4f6;padding:1px 7px;border-radius:10px">' + it.count + '</span>' +
                  '</label>'
        })
      }
      panel.innerHTML = html
      panel.style.display = 'block'

      panel.querySelectorAll('input[data-queixa-slug]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var slug = cb.getAttribute('data-queixa-slug')
          if (cb.checked) {
            if (_queixaFilter.indexOf(slug) === -1) _queixaFilter.push(slug)
          } else {
            _queixaFilter = _queixaFilter.filter(function (s) { return s !== slug })
          }
          _updateQueixaLabel()
          _load()
        })
      })
      var clr = _$('QueixaClear')
      if (clr) clr.addEventListener('click', function () {
        _queixaFilter = []
        _updateQueixaLabel()
        panel.style.display = 'none'
        _load()
      })
    }

    // ── Renderização da tabela ────────────────────────────────

    var _TEMP_CFG = {
      cold: { label: 'Frio',   color: '#93c5fd', bg: '#eff6ff' },
      warm: { label: 'Morno',  color: '#f59e0b', bg: '#fffbeb' },
      hot:  { label: 'Quente', color: '#f87171', bg: '#fef2f2' },
    }

    function _renderTable(leads, offset, append) {
      var tbody = _$('TableBody')
      if (!tbody) return
      offset = offset || 0

      if (!append && !leads.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum lead encontrado.</td></tr>'
        return
      }
      if (!append) tbody.innerHTML = ''

      leads.forEach(function(l, i) {
        var temp    = l.temperature || 'cold'
        var tCfg    = _TEMP_CFG[temp] || _TEMP_CFG.cold
        var nome    = l.name || l.nome || '—'
        var phone   = l.phone || l.whatsapp || l.telefone || '—'
        var tags    = Array.isArray(l.tags) ? l.tags.slice(0, 3).map(function(t) {
          return '<span style="font-size:11px;background:#f3f4f6;border-radius:4px;padding:2px 7px;color:#374151">' + _esc(t) + '</span>'
        }).join(' ') : ''
        var _cf = l.customFields || l.data || {}
        var _nd = (l.data && l.data.data) || _cf.data || {}
        var qfData = l.queixas_faciais || _cf.queixas_faciais || _nd.queixas_faciais || l.complaints || []
        var queixas = ''
        if (Array.isArray(qfData) && qfData.length) {
          queixas = qfData.slice(0, 3).map(function(x){ return typeof x === 'string' ? x : (x && (x.label || x.nome || x.name)) || '' }).filter(Boolean).join(', ')
        }
        if (!queixas) {
          queixas = _cf.queixaPrincipal || _cf.queixa || _cf.queixas || _nd.queixa || _nd.queixas || l.queixa || l.queixas || ''
        }
        var ativo   = (l.is_active !== undefined ? l.is_active : l.active) !== false

        var tr = document.createElement('tr')
        tr.dataset.leadRow = '1'
        tr.style.cssText = 'border-bottom:1px solid #F9FAFB;cursor:pointer;transition:background .1s'
        tr.onmouseenter = function() { tr.style.background = '#FAFAFA' }
        tr.onmouseleave = function() { tr.style.background = '' }
        tr.onclick = function(e) {
          if (e.target.closest('button,input,select,a')) return
          if (window.viewLead) viewLead(l.id)
          else if (window.showLeadModal) showLeadModal(l)
        }

        var dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '—'
        var checked = _selectedIds.has(l.id) ? ' checked' : ''

        tr.innerHTML =
          '<td style="padding:12px 8px 12px 16px"><input type="checkbox" class="lc-row-cb" data-id="' + _esc(l.id) + '"' + checked + ' style="width:14px;height:14px;accent-color:#7C3AED;cursor:pointer" onclick="event.stopPropagation()"></td>' +
          '<td style="padding:12px 16px">' +
            '<div style="font-size:13px;font-weight:600;color:#111827">' + _esc(nome) + '</div>' +
            '<div style="font-size:12px;color:#6B7280">' + _esc(phone) + '</div>' +
          '</td>' +
          '<td style="padding:12px 16px">' +
            '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;' +
              'color:' + tCfg.color + ';background:' + tCfg.bg + ';' +
              'border-radius:6px;padding:3px 10px">' +
              tCfg.label +
            '</span>' +
          '</td>' +
          '<td style="padding:12px 16px;font-size:12px">' + (tags || '<span style="color:#D1D5DB">—</span>') + '</td>' +
          '<td style="padding:12px 16px;font-size:12px;color:#374151;line-height:1.4">' + (queixas ? _esc(queixas) : '<span style="color:#D1D5DB">—</span>') + '</td>' +
          '<td style="padding:12px 16px;font-size:12px;color:#6B7280;white-space:nowrap">' + dateStr + '</td>' +
          '<td style="padding:12px 16px;text-align:center">' +
            '<button onclick="event.stopPropagation();(window.viewLead?viewLead(\'' + _esc(l.id) + '\'):void 0)"' +
              ' style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;color:#374151">Ver</button>' +
          '</td>'

        tbody.appendChild(tr)

        // Bind checkbox individual
        var cb = tr.querySelector('.lc-row-cb')
        if (cb) cb.addEventListener('change', function() {
          if (cb.checked) _selectedIds.add(l.id); else _selectedIds.delete(l.id)
          _updateBulkBar()
        })
      })
    }

    function _loadMore() {
      var tbody   = _$('TableBody')
      var offset  = tbody ? tbody.querySelectorAll('tr[data-lead-row]').length : 0
      var next    = _filteredAll.slice(offset, offset + _PAGE_SIZE)
      if (!next.length) return
      _renderTable(next, offset, true)
      _updateLoadMore()
      // Salva estado de paginacao
      try { sessionStorage.setItem('lc_page_' + cfg.key, String(offset + next.length)) } catch {}
    }

    function _updateLoadMore() {
      var btn      = _$('LoadMoreBtn')
      if (!btn) return
      var tbody    = _$('TableBody')
      var rendered = tbody ? tbody.querySelectorAll('tr[data-lead-row]').length : 0
      var rem      = _filteredAll.length - rendered
      if (rem > 0) {
        btn.textContent = 'Carregar mais ' + rem + (rem === 1 ? ' lead' : ' leads')
        btn.style.display = ''
      } else {
        btn.style.display = 'none'
      }
    }

    // ── Kanban ────────────────────────────────────────────────

    function _loadKanban(pipeline) {
      var outer = _$('KanbanContainer')
      if (!outer) return

      if (!window.KanbanBoard) {
        outer.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px">KanbanBoard não carregado.</div>'
        return
      }

      if (_kanbanBoard) { _kanbanBoard.destroy(); _kanbanBoard = null }
      _kbTempFilter = null
      outer.innerHTML = ''

      // Barra de temperatura
      var tempBar = document.createElement('div')
      tempBar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 4px 10px'
      tempBar.innerHTML =
        '<span style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-right:2px">Temperatura:</span>' +
        '<button id="' + P + 'kbTf_hot"  title="Quente" style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#EF4444"/></svg></button>' +
        '<button id="' + P + 'kbTf_warm" title="Morno"  style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#F59E0B"/></svg></button>' +
        '<button id="' + P + 'kbTf_cold" title="Frio"   style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#3B82F6"/></svg></button>' +
        '<span style="font-size:11px;color:#D1D5DB;margin-left:4px">Toque para filtrar</span>'

      ;['hot','warm','cold'].forEach(function(t) {
        var btn = document.getElementById(P + 'kbTf_' + t)
        if (btn) btn.addEventListener('click', function() { _toggleKbTemp(t) })
      })

      // Scroll wrapper
      var wrapper    = document.createElement('div')
      wrapper.className = 'kanban-scroll-wrapper'
      var btnLeft    = document.createElement('button')
      btnLeft.className = 'kanban-scroll-btn left hidden'
      btnLeft.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>'
      var btnRight   = document.createElement('button')
      btnRight.className = 'kanban-scroll-btn right hidden'
      btnRight.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      var scrollArea = document.createElement('div')
      scrollArea.className = 'kanban-scroll-area'
      var boardCont  = document.createElement('div')
      boardCont.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px">Carregando kanban...</div>'

      scrollArea.appendChild(boardCont)
      wrapper.appendChild(btnLeft)
      wrapper.appendChild(scrollArea)
      wrapper.appendChild(btnRight)

      outer.appendChild(tempBar)
      outer.appendChild(wrapper)

      var STEP = 260
      btnLeft.onclick  = function() { scrollArea.scrollLeft -= STEP }
      btnRight.onclick = function() { scrollArea.scrollLeft += STEP }

      function _upBtns() {
        btnLeft.classList.toggle('hidden',  scrollArea.scrollLeft <= 4)
        btnRight.classList.toggle('hidden', scrollArea.scrollLeft >= scrollArea.scrollWidth - scrollArea.clientWidth - 4)
      }
      scrollArea.addEventListener('scroll', _upBtns)

      _kanbanBoard = window.KanbanBoard.create(boardCont, {
        pipeline:    pipeline,
        phase:       pipeline === 'evolution' ? 'lead' : null,
        temperature: _kbTempFilter,
        onLeadMoved: function() { requestAnimationFrame(_upBtns) },
        onTagClick: function(leadId, lead, anchorEl) {
          if (window.TagPopover && anchorEl) TagPopover.open(anchorEl, leadId)
        },
      })

      _kanbanBoard.load().then(function() {
        requestAnimationFrame(function() { requestAnimationFrame(_upBtns) })
      })
    }

    function _toggleKbTemp(temp) {
      _kbTempFilter = (_kbTempFilter === temp) ? null : temp
      var colors = { hot: '#EF4444', warm: '#F59E0B', cold: '#3B82F6' }
      var bgs    = { hot: '#FEF2F2', warm: '#FFFBEB', cold: '#EFF6FF' }
      ;['hot','warm','cold'].forEach(function(t) {
        var btn = document.getElementById(P + 'kbTf_' + t)
        if (!btn) return
        var active = _kbTempFilter === t
        btn.style.background  = active ? bgs[t]    : 'transparent'
        btn.style.borderColor = active ? colors[t] : 'transparent'
      })
      if (_kanbanBoard) _kanbanBoard.setTemperature(_kbTempFilter)
    }

    // ── Tags filter ───────────────────────────────────────────

    // ── Bulk actions ──────────────────────────────────────────

    function _updateCheckboxes() {
      var root = document.getElementById(cfg.rootId)
      if (!root) return
      root.querySelectorAll('.lc-row-cb').forEach(function(cb) {
        cb.checked = _selectedIds.has(cb.dataset.id)
      })
    }

    function _updateBulkBar() {
      var bar = _$('BulkBar')
      if (!bar) {
        // Criar toolbar se nao existe
        var table = _$('TableWrap') || _$('TableBody')?.closest('div')
        if (!table) return
        bar = document.createElement('div')
        bar.id = P + 'BulkBar'
        bar.style.cssText = 'display:none;align-items:center;gap:8px;padding:8px 16px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:8px;margin-bottom:8px'
        table.parentNode.insertBefore(bar, table)
      }

      var count = _selectedIds.size
      if (count === 0) { bar.style.display = 'none'; return }

      bar.style.display = 'flex'
      bar.innerHTML =
        '<span style="font-size:12px;font-weight:600;color:#4338CA">' + count + ' selecionado' + (count > 1 ? 's' : '') + '</span>' +
        '<button id="' + P + 'BulkTemp" style="font-size:11px;padding:4px 10px;border:1px solid #C7D2FE;border-radius:6px;background:#fff;color:#374151;cursor:pointer">Temperatura</button>' +
        '<button id="' + P + 'BulkTag" style="font-size:11px;padding:4px 10px;border:1px solid #C7D2FE;border-radius:6px;background:#fff;color:#374151;cursor:pointer">Tag</button>' +
        '<button id="' + P + 'BulkMovePaciente" style="font-size:11px;padding:4px 10px;border:1px solid #10B981;border-radius:6px;background:#ECFDF5;color:#059669;cursor:pointer;font-weight:600">Paciente</button>' +
        '<button id="' + P + 'BulkMoveOrcamento" style="font-size:11px;padding:4px 10px;border:1px solid #F59E0B;border-radius:6px;background:#FFFBEB;color:#D97706;cursor:pointer;font-weight:600">Orcamento</button>' +
        '<div style="width:1px;height:18px;background:#C7D2FE"></div>' +
        '<button id="' + P + 'BulkBroadcast" style="font-size:11px;padding:4px 10px;border:1px solid #7C3AED;border-radius:6px;background:#7C3AED;color:#fff;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:5px">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>' +
          'Broadcast' +
        '</button>' +
        '<button id="' + P + 'BulkDel" style="font-size:11px;padding:4px 10px;border:1px solid #FCA5A5;border-radius:6px;background:#fff;color:#EF4444;cursor:pointer">Desativar</button>' +
        '<button id="' + P + 'BulkClear" style="font-size:11px;padding:4px 10px;border:none;background:none;color:#6B7280;cursor:pointer;text-decoration:underline">Limpar</button>'

      _$('BulkClear').onclick = function() { _selectedIds = new Set(); _updateCheckboxes(); _updateBulkBar(); var sa = _$('SelectAll'); if (sa) sa.checked = false }

      // Mover pra Pacientes
      _$('BulkMovePaciente').onclick = function() {
        if (!confirm('Mover ' + count + ' leads para Pacientes?')) return
        var ids = Array.from(_selectedIds)
        _bulkChangePhase(ids, 'paciente')
      }

      // Mover pra Orcamentos
      _$('BulkMoveOrcamento').onclick = function() {
        if (!confirm('Mover ' + count + ' leads para Orcamentos?')) return
        var ids = Array.from(_selectedIds)
        _bulkChangePhase(ids, 'orcamento')
      }

      // Broadcast: leva IDs selecionados pra pagina de broadcast via sessionStorage.
      // Se >1 queixa selecionada, avisa que a tag [queixa] nao eh permitida (server rejeita).
      var bcBtn = _$('BulkBroadcast')
      if (bcBtn) bcBtn.onclick = function () {
        var ids = Array.from(_selectedIds)
        if (!ids.length) return
        if (_queixaFilter.length > 1) {
          _toastWarn('Mais de 1 queixa filtrada. A tag [queixa] nao sera aceita no broadcast (selecione 1 para personalizar).')
        }
        try {
          sessionStorage.setItem('clinicai_broadcast_prefill', JSON.stringify({
            lead_ids: ids,
            source:   'leads-context',
            queixas:  _queixaFilter.slice(),
            ts:       Date.now(),
          }))
        } catch (e) {}
        if (window.navigateTo) window.navigateTo('wa-disparos')
        else if (window.location) window.location.hash = '#page-wa-disparos'
      }

      _$('BulkTemp').onclick = function() {
        var temp = prompt('Temperatura para ' + count + ' leads (hot/warm/cold):')
        if (!temp || ['hot','warm','cold'].indexOf(temp) === -1) return
        _selectedIds.forEach(function(id) {
          if (window.SdrService) SdrService.setTemperature(id, temp)
          var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
          var idx = leads.findIndex(function(l) { return l.id === id })
          if (idx >= 0) {
            leads[idx].temperature = temp
            if (window.store && typeof window.store.set === 'function') window.store.set('clinicai_leads', leads)
            else localStorage.setItem('clinicai_leads', JSON.stringify(leads))
          }
        })
        _selectedIds = new Set(); _load()
      }

      _$('BulkTag').onclick = function() {
        var tag = prompt('Slug da tag para atribuir a ' + count + ' leads:')
        if (!tag) return
        _selectedIds.forEach(function(id) {
          if (window.SdrService) SdrService.assignTag(tag, 'lead', id, 'bulk')
        })
        _toastWarn(count + ' leads tagueados com: ' + tag)
      }

      _$('BulkDel').onclick = function() {
        if (!confirm('Desativar ' + count + ' leads selecionados?')) return
        _selectedIds.forEach(function(id) {
          if (window.LeadsService) LeadsService.softDelete(id)
          var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
          leads = leads.filter(function(l) { return l.id !== id })
          if (window.store && typeof window.store.set === 'function') window.store.set('clinicai_leads', leads)
          else localStorage.setItem('clinicai_leads', JSON.stringify(leads))
        })
        _selectedIds = new Set(); _load()
      }
    }

    // ── Mover leads em massa (phase change) ─────────────────────

    // CORRIGIDO (19/04): await Supabase ANTES de escrever localStorage.
    // Se a RPC falha, localStorage nao eh modificado e o toast sinaliza erro.
    // Isso elimina race de mostrar "movidos" enquanto Supabase ainda nao persistiu.
    async function _bulkChangePhase(ids, newPhase) {
      var sb = window._sbShared
      var labels = { paciente: 'Pacientes', orcamento: 'Orcamentos', lead: 'Leads' }

      var rpcOk = false
      var rpcErr = null

      if (sb) {
        try {
          console.log('[LeadsContext] bulk phase change:', ids.length, '->', newPhase)
          var res = await sb.rpc('leads_bulk_change_phase', { p_ids: ids, p_phase: newPhase })
          if (res.error) {
            console.warn('[LeadsContext] bulk RPC indisponivel, usando fallback:', res.error.message)
            rpcErr = res.error.message || 'erro na RPC'
            // Tenta fallback RPC individual (sdr_change_phase)
            try {
              await _bulkChangePhaseFallback(ids, newPhase)
              rpcOk = true
              rpcErr = null
            } catch (e2) {
              rpcErr = (e2 && e2.message) || 'falha no fallback'
            }
          } else {
            rpcOk = true
          }
        } catch (e) {
          console.warn('[LeadsContext] bulk exception, usando fallback:', e)
          try {
            await _bulkChangePhaseFallback(ids, newPhase)
            rpcOk = true
          } catch (e2) {
            rpcErr = (e2 && e2.message) || 'exception'
          }
        }
      } else {
        // Sem Supabase: fallback client-side (que tb delega pra SdrService)
        try { await _bulkChangePhaseFallback(ids, newPhase); rpcOk = true } catch (e) { rpcErr = e && e.message }
      }

      if (!rpcOk) {
        if (window._showToast) _showToast('Nao foi possivel mover leads', rpcErr || 'Tente novamente', 'error')
        return
      }

      // Apos persistir no server, atualiza localStorage (via store.set para manter _ts LWW).
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      var moved = 0
      ids.forEach(function(id) {
        var idx = leads.findIndex(function(l) { return l.id === id })
        if (idx >= 0) { leads[idx].phase = newPhase; moved++ }
      })
      if (window.store && typeof window.store.set === 'function') window.store.set('clinicai_leads', leads)
      else localStorage.setItem('clinicai_leads', JSON.stringify(leads))

      _selectedIds = new Set()

      // Re-sync via LeadsService pra garantir consistencia com triggers server-side.
      if (window.LeadsService && LeadsService.loadAll) {
        LeadsService.loadAll().then(function() { _load() }).catch(function() { _load() })
      } else {
        _load()
      }

      if (window._showToast) _showToast(moved + ' leads movidos', 'Movidos para ' + (labels[newPhase] || newPhase), 'info')
    }

    // Fallback: usa sdr_change_phase individual para cada lead
    function _bulkChangePhaseFallback(ids, newPhase) {
      var promises = ids.map(function(id) {
        if (window.SdrService) {
          return SdrService.changePhase(id, newPhase, 'bulk_move')
        }
        return Promise.resolve()
      })
      return Promise.all(promises).then(function(results) {
        var ok = results.filter(function(r) { return r && (r.ok !== false) }).length
        console.log('[LeadsContext] fallback concluido:', ok + '/' + ids.length + ' atualizados')
      }).catch(function(e) {
        console.error('[LeadsContext] fallback falhou:', e)
      })
    }

    // ── Export leads (CSV / PDF) ────────────────────────────────

    function _exportLeads(format) {
      var leads = _filteredAll
      if (!leads.length) { _toastWarn('Nenhum lead para exportar'); return }

      // Fallback escape completo: se ClinicEsc nao disponivel, nunca volta a identity
      var esc = (window.ClinicEsc && window.ClinicEsc.html) || window.escHtml || function(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      }
      var PHASE_LABELS = { lead:'Lead', agendado:'Agendado', reagendado:'Reagendado', compareceu:'Compareceu', paciente:'Paciente', orcamento:'Orcamento', perdido:'Perdido' }
      var TEMP_LABELS  = { hot:'Quente', warm:'Morno', cold:'Frio' }

      if (format === 'csv') {
        var sep = ';'
        var header = ['Nome','Telefone','Email','Temperatura','Fase','Origem','Data de Cadastro']
        var rows = leads.map(function(l) {
          return [
            '"' + (l.name || '').replace(/"/g, '""') + '"',
            '"' + (l.phone || '') + '"',
            '"' + (l.email || '') + '"',
            TEMP_LABELS[l.temperature] || l.temperature || '',
            PHASE_LABELS[l.phase] || l.phase || '',
            l.source_type || 'manual',
            l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '',
          ].join(sep)
        })
        var csv = '\uFEFF' + header.join(sep) + '\n' + rows.join('\n')
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        var url = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = 'leads_' + cfg.key + '_' + new Date().toISOString().slice(0,10) + '.csv'
        a.click()
        URL.revokeObjectURL(url)
        return
      }

      if (format === 'pdf') {
        // Gera PDF via HTML → print
        var dateStr = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
        var stats = { total: leads.length, hot: 0, warm: 0, cold: 0 }
        leads.forEach(function(l) { var t = l.temperature || 'cold'; if (stats[t] !== undefined) stats[t]++ })

        var tableRows = leads.map(function(l, i) {
          var tempColor = l.temperature === 'hot' ? '#EF4444' : l.temperature === 'warm' ? '#F59E0B' : '#3B82F6'
          return '<tr style="border-bottom:1px solid #F3F4F6">' +
            '<td style="padding:6px 8px;font-size:11px;color:#6B7280">' + (i+1) + '</td>' +
            '<td style="padding:6px 8px;font-size:11px;font-weight:600;color:#111">' + esc(l.name || '—') + '</td>' +
            '<td style="padding:6px 8px;font-size:11px;color:#374151">' + esc(l.phone || '—') + '</td>' +
            '<td style="padding:6px 8px;font-size:11px;color:#374151">' + esc(l.email || '—') + '</td>' +
            '<td style="padding:6px 8px"><span style="font-size:10px;font-weight:600;color:' + tempColor + '">' + (TEMP_LABELS[l.temperature] || '—') + '</span></td>' +
            '<td style="padding:6px 8px;font-size:11px;color:#374151">' + (PHASE_LABELS[l.phase] || '—') + '</td>' +
            '<td style="padding:6px 8px;font-size:11px;color:#6B7280">' + (l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '—') + '</td>' +
          '</tr>'
        }).join('')

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
          '<title>Leads — ' + esc(cfg.title) + '</title>' +
          '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;padding:32px;color:#111}' +
          '@media print{body{padding:16px}button{display:none!important}}</style></head><body>' +

          // Header
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #111">' +
            '<div>' +
              '<h1 style="font-size:20px;font-weight:700;color:#111">' + esc(cfg.title) + '</h1>' +
              '<p style="font-size:12px;color:#6B7280;margin-top:4px">Exportado em ' + dateStr + '</p>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:28px;font-weight:800;color:#7C3AED">' + stats.total + '</div>' +
              '<div style="font-size:10px;color:#6B7280">leads totais</div>' +
            '</div>' +
          '</div>' +

          // KPIs
          '<div style="display:flex;gap:12px;margin-bottom:24px">' +
            '<div style="flex:1;padding:12px;background:#FEF2F2;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:#EF4444">' + stats.hot + '</div><div style="font-size:10px;color:#6B7280">Quentes</div></div>' +
            '<div style="flex:1;padding:12px;background:#FFFBEB;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:#F59E0B">' + stats.warm + '</div><div style="font-size:10px;color:#6B7280">Mornos</div></div>' +
            '<div style="flex:1;padding:12px;background:#EFF6FF;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:#3B82F6">' + stats.cold + '</div><div style="font-size:10px;color:#6B7280">Frios</div></div>' +
          '</div>' +

          // Tabela
          '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
            '<thead><tr style="background:#F9FAFB;border-bottom:2px solid #E5E7EB">' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">#</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Nome</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Telefone</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Email</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Temp.</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Fase</th>' +
              '<th style="padding:8px;text-align:left;font-weight:700;color:#6B7280;font-size:10px;text-transform:uppercase">Data</th>' +
            '</tr></thead><tbody>' +
            tableRows +
          '</tbody></table>' +

          // Footer
          '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #E5E7EB;text-align:center">' +
            '<p style="font-size:10px;color:#9CA3AF">ClinicAI — Relatorio gerado automaticamente</p>' +
          '</div>' +

          // Print button (hidden on print)
          '<div style="text-align:center;margin-top:20px">' +
            '<button onclick="window.print()" style="padding:10px 24px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Imprimir / Salvar PDF</button>' +
          '</div>' +

        '</body></html>'

        var win = window.open('', '_blank')
        win.document.write(html)
        win.document.close()
      }
    }

    async function _loadTagsFilter() {
      _tagsLoading = true
      var sel = _$('TagFilter')
      if (!sel) return
      try {
        var items = window.LeadsFilter ? await LeadsFilter.loadTagOptions() : []
        while (sel.options.length > 1) sel.remove(1)
        var seen = new Set()
        items.forEach(function(t) {
          if (seen.has(t.slug)) return
          seen.add(t.slug)
          var opt = document.createElement('option')
          opt.value = t.slug
          opt.textContent = t.label
          sel.appendChild(opt)
        })
      } catch {}
    }

    // ── Helpers ───────────────────────────────────────────────

    function _esc(str) {
      return window.escHtml ? escHtml(str) : String(str || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    return { mount: mount, destroy: destroy }
  }

  // ── API pública ───────────────────────────────────────────────

  window.LeadsContext = Object.freeze({ init: init })

})()
