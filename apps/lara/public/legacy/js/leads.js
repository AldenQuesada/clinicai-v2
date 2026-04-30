// ── ClinicAI — Leads Core ──
//
// Responsabilidades:
//   - Cache sync helper (_syncLeadToCache)
//   - loadLeads: lê localStorage e chama renderLeadsTable
//   - Helpers de estado: _leadsRefreshKanban, _leadsUpdateCache
//   - Controle de período: _leadsPeriod, leadsSetPeriod, leadsApplyCustomPeriod
//   - Controle de view e carregamento do kanban
//
// Depende de (outros arquivos):
//   renderLeadsTable  → components/leads-table.js
//   viewLead          → components/lead-modal.js

// ── Helper: sincroniza lead atualizado em clinicai_leads → Supabase ──
function _syncLeadToCache(updatedLead) {
  if (!updatedLead?.id) return
  try {
    const leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
    const idx   = leads.findIndex(l => l.id === updatedLead.id)
    const isNew = idx < 0
    if (isNew) {
      if (!updatedLead.created_at) updatedLead = { ...updatedLead, created_at: new Date().toISOString() }
      if (window.normalizeLead) updatedLead = normalizeLead(updatedLead)
    }
    if (idx >= 0) {
      leads[idx] = { ...leads[idx], ...updatedLead }
    } else {
      leads.unshift(updatedLead)
    }
    store.set('clinicai_leads', leads)
    const synced = idx >= 0 ? leads[idx] : leads[0]
    window.LeadsService?.syncOne(synced)

    // Novo lead: inicializa pipelines (fire-and-forget).
    // IMPORTANTE: NAO disparar RulesService.evaluateRules aqui para novos leads.
    // O server-side trigger trg_lead_phase_insert / phase_history assume esse papel
    // e evita double-fire de campanhas WhatsApp quando o mesmo evento sobe de 2 lados.
    if (isNew) {
      const leadId = updatedLead.id
      if (window.SdrService) {
        window.SdrService.initLeadPipelines(leadId).catch(function(e) { console.warn("[leads]", e.message || e) })
      }
    }
  } catch { /* silencioso */ }
}

// ── Estado de período ─────────────────────────────────────────

var _leadsPeriod = { type: 'all', from: null, to: null }

function leadsSetPeriod(type, btn) {
  _leadsPeriod = { type: type, from: null, to: null }

  document.querySelectorAll('#leadsPeriodBar .ao-period-btn').forEach(function(b) {
    b.classList.toggle('active', b === btn)
  })

  var dateRange = document.getElementById('leadsDateRange')
  if (dateRange) dateRange.style.display = (type === 'custom') ? 'flex' : 'none'

  if (type !== 'custom') {
    loadLeads()
  }
}

function leadsApplyCustomPeriod() {
  var fromEl = document.getElementById('leadsDateFrom')
  var toEl   = document.getElementById('leadsDateTo')
  if (!fromEl || !toEl) return
  _leadsPeriod = {
    type: 'custom',
    from: fromEl.value || null,
    to:   toEl.value   || null,
  }
  loadLeads()
}

function leadsOnSearch() { loadLeads() }

// ── Paginação ─────────────────────────────────────────────────

var _leadsFilteredAll = []
var _LEADS_PAGE_SIZE  = 50

function leadsLoadMore() {
  var tbody   = document.getElementById('leadsTableBody')
  var offset  = tbody ? tbody.querySelectorAll('tr[data-lead-row]').length : 0
  var next    = _leadsFilteredAll.slice(offset, offset + _LEADS_PAGE_SIZE)
  if (!next.length) return
  renderLeadsTable(next, offset, true)
  _leadsUpdateLoadMore()
}

function _leadsUpdateLoadMore() {
  var btn = document.getElementById('leadsLoadMoreBtn')
  if (!btn) return
  var tbody    = document.getElementById('leadsTableBody')
  var rendered = tbody ? tbody.querySelectorAll('tr[data-lead-row]').length : 0
  var remaining = _leadsFilteredAll.length - rendered
  if (remaining > 0) {
    btn.textContent = 'Carregar mais ' + remaining + (remaining === 1 ? ' lead' : ' leads')
    btn.style.display = ''
  } else {
    btn.style.display = 'none'
  }
}

// ── loadLeads (usa LeadsFilter compartilhado) ────────────────

var _leadsTagsFilterLoading = false

async function loadLeads() {
  var LF = window.LeadsFilter
  var all
  try {
    all = window.ClinicLeadsCache ? await ClinicLeadsCache.readAsync() : []
  } catch(e) {
    console.warn('[loadLeads] fallback localStorage:', e)
    all = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
  }

  var search  = (document.getElementById('leadsSearchInput')?.value || '').toLowerCase().trim()
  var tagSlug = document.getElementById('leadsTagFilter')?.value || ''
  var tempVal = document.getElementById('leadsTempFilter')?.value || ''

  // Lazy init: popula filtro de tags
  var tagSel = document.getElementById('leadsTagFilter')
  if (tagSel && tagSel.options.length <= 1 && !_leadsTagsFilterLoading) {
    _leadsLoadTagsFilter()
  }

  // Buscar IDs de leads com a tag selecionada
  var tagLeadIds = LF ? await LF.loadTagLeadIds(tagSlug) : null

  // Filtrar e ordenar via modulo compartilhado
  var result = LF
    ? LF.filter(all, { period: _leadsPeriod, search: search, tempVal: tempVal, tagLeadIds: tagLeadIds, excludePhases: ['agendado', 'reagendado', 'compareceu', 'perdido', 'paciente', 'orcamento'] })
    : { filtered: all, stats: { total: all.length, hot: 0, warm: 0, cold: 0 } }

  var filtered = result.filtered

  // Atualiza estatisticas
  var badge = document.getElementById('leadsCountBadge')
  if (badge) {
    var elTotal = document.getElementById('leadsStat_total')
    var elHot   = document.getElementById('leadsStat_hot')
    var elWarm  = document.getElementById('leadsStat_warm')
    var elCold  = document.getElementById('leadsStat_cold')
    if (elTotal) elTotal.textContent = result.stats.total
    if (elHot)   elHot.textContent   = result.stats.hot
    if (elWarm)  elWarm.textContent  = result.stats.warm
    if (elCold)  elCold.textContent  = result.stats.cold
    badge.style.display = 'flex'
  }

  var pageSize = LF ? LF.PAGE_SIZE : 50
  _leadsFilteredAll = filtered
  renderLeadsTable(filtered.slice(0, pageSize), 0, false)
  _leadsUpdateLoadMore()
}

// ── Popula select de tags (usa LeadsFilter) ──────────────────

async function _leadsLoadTagsFilter() {
  if (_leadsTagsFilterLoading) return
  var sel = document.getElementById('leadsTagFilter')
  if (!sel) return
  _leadsTagsFilterLoading = true
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
  } catch {} finally {
    _leadsTagsFilterLoading = false
  }
}

// ── Helpers de estado (usados por components/leads-table e outros) ──

function _leadsRefreshKanban() {
  if (_leadsKanbanBoard && _leadsCurrentView !== 'table') {
    _leadsKanbanBoard.refresh()
  }
}

function _leadsUpdateCache(leadId, fields) {
  try {
    var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    var idx   = leads.findIndex(function(l) { return l.id === leadId })
    if (idx >= 0) {
      Object.assign(leads[idx], fields)
      // store.set mantem timestamp LWW coordenado com LeadsService
      if (window.store && typeof window.store.set === 'function') {
        window.store.set('clinicai_leads', leads)
      } else {
        localStorage.setItem('clinicai_leads', JSON.stringify(leads))
      }
    }
  } catch { /* silencioso */ }
}

// ── Controle de view ──────────────────────────────────────────

var _leadsCurrentView    = 'table'
var _leadsKanbanBoard    = null
var _leadsKanbanTempFilter = null  // null = todos, 'hot'|'warm'|'cold'

function leadsToggleTempFilter(temp) {
  _leadsKanbanTempFilter = (_leadsKanbanTempFilter === temp) ? null : temp

  var colors = { hot: '#EF4444', warm: '#F59E0B', cold: '#3B82F6' }
  var bgs    = { hot: '#FEF2F2', warm: '#FFFBEB', cold: '#EFF6FF' }
  ;['hot', 'warm', 'cold'].forEach(function(t) {
    var btn = document.getElementById('leads_kb_tf_' + t)
    if (!btn) return
    var active = _leadsKanbanTempFilter === t
    btn.style.background  = active ? bgs[t]    : 'transparent'
    btn.style.borderColor = active ? colors[t] : 'transparent'
  })

  if (_leadsKanbanBoard) _leadsKanbanBoard.setTemperature(_leadsKanbanTempFilter)
}
window.leadsToggleTempFilter = leadsToggleTempFilter

function leadsSetView(view, btn) {
  _leadsCurrentView = view

  document.querySelectorAll('#leadsViewToggle .sdr-pipeline-btn').forEach(function(b) {
    b.classList.toggle('active', b === btn)
  })

  var tableView    = document.getElementById('leadsViewTable')
  var kanbanView   = document.getElementById('leadsViewKanban')
  var filtersBar   = document.getElementById('leadsFiltersBar')
  var countBadge   = document.getElementById('leadsCountBadge')
  var loadMoreCont = document.getElementById('leadsLoadMoreContainer')

  if (view === 'table') {
    tableView.style.display  = ''
    kanbanView.style.display = 'none'
    if (filtersBar)   filtersBar.style.display   = ''
    if (countBadge)   countBadge.style.display   = ''
    if (loadMoreCont) loadMoreCont.style.display  = ''
    loadLeads()
  } else {
    tableView.style.display  = 'none'
    kanbanView.style.display = ''
    if (filtersBar)   filtersBar.style.display   = 'none'
    if (countBadge)   countBadge.style.display   = 'none'
    if (loadMoreCont) loadMoreCont.style.display  = 'none'
    if (countBadge) countBadge.style.display = 'none'
    _leadsLoadKanban(view, null)
  }
}

function _leadsLoadKanban(pipeline, phase) {
  var outer = document.getElementById('leadsKanbanContainer')
  if (!outer) return

  if (!window.KanbanBoard) {
    outer.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px">KanbanBoard não carregado.</div>'
    return
  }

  if (_leadsKanbanBoard) {
    _leadsKanbanBoard.destroy()
    _leadsKanbanBoard = null
  }

  // Reseta filtro de temperatura ao trocar de kanban
  _leadsKanbanTempFilter = null

  outer.innerHTML = ''

  // ── Barra de filtro temperatura ────────────────────────────────
  var tempBar = document.createElement('div')
  tempBar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 4px 10px;'
  tempBar.innerHTML =
    '<span style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-right:2px">Temperatura:</span>' +
    '<button id="leads_kb_tf_hot"  onclick="leadsToggleTempFilter(\'hot\')"  title="Quente" style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#EF4444"/></svg></button>' +
    '<button id="leads_kb_tf_warm" onclick="leadsToggleTempFilter(\'warm\')" title="Morno"  style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#F59E0B"/></svg></button>' +
    '<button id="leads_kb_tf_cold" onclick="leadsToggleTempFilter(\'cold\')" title="Frio"   style="width:26px;height:26px;border-radius:6px;border:1.5px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#3B82F6"/></svg></button>' +
    '<span style="font-size:11px;color:#D1D5DB;margin-left:4px">Toque para filtrar · toque novamente para ver todos</span>'
  outer.appendChild(tempBar)

  var wrapper = document.createElement('div')
  wrapper.className = 'kanban-scroll-wrapper'

  var btnLeft = document.createElement('button')
  btnLeft.className = 'kanban-scroll-btn left hidden'
  btnLeft.title = 'Rolar para esquerda'
  btnLeft.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>'

  var btnRight = document.createElement('button')
  btnRight.className = 'kanban-scroll-btn right hidden'
  btnRight.title = 'Rolar para direita'
  btnRight.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'

  var scrollArea = document.createElement('div')
  scrollArea.className = 'kanban-scroll-area'

  var boardContainer = document.createElement('div')
  boardContainer.innerHTML = '<div style="padding:24px;color:#9ca3af;font-size:13px">Carregando kanban...</div>'

  scrollArea.appendChild(boardContainer)
  wrapper.appendChild(btnLeft)
  wrapper.appendChild(scrollArea)
  wrapper.appendChild(btnRight)
  outer.appendChild(wrapper)

  var SCROLL_STEP = 260
  btnLeft.onclick  = function() { scrollArea.scrollLeft -= SCROLL_STEP }
  btnRight.onclick = function() { scrollArea.scrollLeft += SCROLL_STEP }

  function _updateBtns() {
    var atStart = scrollArea.scrollLeft <= 4
    var atEnd   = scrollArea.scrollLeft >= scrollArea.scrollWidth - scrollArea.clientWidth - 4
    btnLeft.classList.toggle('hidden', atStart)
    btnRight.classList.toggle('hidden', atEnd)
  }

  scrollArea.addEventListener('scroll', _updateBtns)

  _leadsKanbanBoard = window.KanbanBoard.create(boardContainer, {
    pipeline:    pipeline,
    phase:       phase,
    temperature: _leadsKanbanTempFilter,
    onLeadMoved: function(leadId, fromStage, toStage) {
      _updateBtns()
    },
    onTagClick: function(leadId, lead, anchorEl) {
      if (window.TagPopover) {
        var anchor = anchorEl || document.querySelector('.lead-card[data-lead-id="' + leadId + '"] [data-action="tag"]')
        if (anchor) TagPopover.open(anchor, leadId)
      }
    },
    onMoveStage: function(leadId) { },
  })

  _leadsKanbanBoard.load().then(function() {
    requestAnimationFrame(function() {
      requestAnimationFrame(_updateBtns)
    })
  })
}

// ── Exports globais ───────────────────────────────────────────

window.loadLeads              = loadLeads
window.leadsLoadMore          = leadsLoadMore
window.leadsSetView           = leadsSetView
window.leadsSetPeriod         = leadsSetPeriod
window.leadsApplyCustomPeriod = leadsApplyCustomPeriod
window.leadsOnSearch          = leadsOnSearch
window.leadsInitTagsFilter    = _leadsLoadTagsFilter
