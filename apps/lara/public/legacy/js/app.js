/**
 * ClinicAI — Premium Dashboard
 * Main JavaScript Application
 *
 * Modules:
 * 1. Initialization & Feather Icons
 * 2. Sidebar Navigation (accordion expand/collapse)
 * 3. Active State & Breadcrumb Updates
 * 4. Dropdown Menus (period, notifications, tasks, new, avatar)
 * 5. Page Switching
 * 6. Chart.js Initialization (sparklines, funnel, donut)
 * 7. Activity Feed Filters
 * 8. Global Click Handler (close dropdowns on outside click)
 */

'use strict';

/* ============================================================
   1. INITIALIZATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Guard de autenticação — redireciona para login.html se não há sessão
  if (window.requireAuth) {
    const ok = await window.requireAuth()
    if (!ok) return
  }

  // Setup contenteditable search input (immune to browser autofill)
  var _gsi = document.getElementById('globalSearchInput')
  if (_gsi) {
    _gsi.textContent = ''
    _gsi.addEventListener('input', function() { globalSearch(_gsi.textContent.trim()) })
    _gsi.addEventListener('keydown', function(e) { globalSearchKeydown(e) })
    _gsi.addEventListener('paste', function(e) {
      e.preventDefault()
      var text = (e.clipboardData || window.clipboardData).getData('text')
      document.execCommand('insertText', false, text)
    })
  }

  // Garante seeds de tags no localStorage (antes do Supabase carregar)
  if (window.TagEngine) window.TagEngine.ensureSeeds()
  // Sincroniza config de Tags do Supabase → localStorage (fire-and-forget)
  if (window.TagEngine) window.TagEngine.loadConfigFromSupabase()

  initFeatherIcons();
  // Sidebar navigation e navigateTo são gerenciados por sidebar.js
  initDropdowns();
  initCharts();
  initActivityFilters();
  initGlobalClickHandler();
  initGlobalSearch();

  // Monta painel de notificações no header
  if (window.NotificationsPanelUI) {
    window.NotificationsPanelUI.mount('notificationsBell')
  }
});

/** Replace all [data-feather] elements with SVG icons */
function initFeatherIcons() {
  if (typeof feather !== 'undefined') {
    feather.replace({
      'stroke-width': 1.8,
      width: 16,
      height: 16
    });
  }
}

/* ============================================================
   2. SIDEBAR NAVIGATION
   ============================================================ */
// ⚠ Movido para sidebar.js — não reimplementar aqui.
// Funções exportadas pelo sidebar.js:
//   navigateTo(pageId), handleSubItemClick(el),
//   closeNavFlyout(), buildSidebar(user)

/* ============================================================
   3. DROPDOWN MENUS
   ============================================================ */

/**
 * All dropdowns follow this pattern:
 * - .dropdown-wrapper contains the trigger (.dropdown-trigger) and the menu (.dropdown-menu)
 * - data-dropdown attribute on trigger identifies which menu to open
 * - Clicking the trigger toggles the dropdown
 * - Clicking outside closes all dropdowns
 */
function initDropdowns() {
  const triggers = document.querySelectorAll('.dropdown-trigger');

  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdownId = trigger.dataset.dropdown;
      const menu = document.getElementById(`${dropdownId}Menu`);

      if (!menu) return;

      const isOpen = menu.classList.contains('open');

      // Close all dropdowns first
      closeAllDropdowns();

      // If it wasn't open, open it now
      if (!isOpen) {
        menu.classList.add('open');
        trigger.classList.add('active-dropdown');

        // Rotate the arrow icon if present within the trigger
        const arrow = trigger.querySelector('.dropdown-arrow');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });
  });

  // Period selector item clicks (apenas dropdowns genéricos, não afeta leadsPeriodBar)
  document.querySelectorAll('.dropdown-item[data-period]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();

      // Update active state
      document.querySelectorAll('.dropdown-item[data-period]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update button text
      const periodBtn = document.querySelector('.period-btn span');
      if (periodBtn) {
        periodBtn.textContent = item.textContent;
      }

      closeAllDropdowns();
    });
  });

  // Activity filter buttons inside notifications/tasks menus
  setupTaskCheckboxes();
}

/** Close all open dropdown menus */
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu.open').forEach(menu => {
    menu.classList.remove('open');
  });
  document.querySelectorAll('.dropdown-trigger.active-dropdown').forEach(trigger => {
    trigger.classList.remove('active-dropdown');
    const arrow = trigger.querySelector('.dropdown-arrow');
    if (arrow) arrow.style.transform = '';
  });
}

/** Simulate task checkbox toggle in tasks dropdown */
function setupTaskCheckboxes() {
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskItem = checkbox.closest('.task-item');
      if (taskItem) {
        taskItem.style.opacity = taskItem.style.opacity === '0.4' ? '1' : '0.4';
        checkbox.style.background = checkbox.style.background ? '' : 'var(--accent-emerald)';
        checkbox.style.borderColor = checkbox.style.borderColor ? '' : 'var(--accent-emerald)';
      }
    });
  });
}

/* ============================================================
   6. GLOBAL CLICK HANDLER
   ============================================================ */
function initGlobalClickHandler() {
  document.addEventListener('click', (e) => {
    closeAllDropdowns();
    // Close flyout when clicking outside sidebar/flyout
    if (!e.target.closest('#navFlyout') && !e.target.closest('.sidebar')) {
      closeNavFlyout();
    }
  });
}

/* ============================================================
   7. ACTIVITY FEED FILTERS
   ============================================================ */
function initActivityFilters() {
  const filters = document.querySelectorAll('.activity-filter');
  filters.forEach(filter => {
    filter.addEventListener('click', () => {
      filters.forEach(f => f.classList.remove('active'));
      filter.classList.add('active');
      // In a real app, this would filter the table rows
      // Here we just toggle the active state as UI feedback
    });
  });
}

/* ============================================================
   8. CHART.JS INITIALIZATION
   ============================================================ */
function initCharts() {
  initSparklines();
  initSdhDonutChart();
  initFunnelBarAnimation();
}

/* ── Sparkline helper ───────────────────────────────────────── */

/**
 * Creates a mini sparkline chart inside a canvas element.
 * @param {string} canvasId - The ID of the canvas element
 * @param {number[]} data   - Array of data points
 * @param {string} color    - Stroke color (CSS color)
 */
function createSparkline(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Create gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 36);
  gradient.addColorStop(0, color.replace(')', ', 0.25)').replace('rgb', 'rgba'));
  gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.8,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      animation: { duration: 600 }
    }
  });
}

/** Initialize all 6 sparkline charts on the KPI cards */
function initSparklines() {
  // Leads Hoje — blue
  createSparkline('sparkline1',
    [28, 34, 31, 40, 38, 35, 42, 39, 44, 47],
    'rgb(59, 130, 246)'
  );

  // Consultas Agendadas — emerald
  createSparkline('sparkline2',
    [18, 20, 17, 22, 19, 21, 24, 20, 22, 23],
    'rgb(16, 185, 129)'
  );

  // Taxa de Conversão — purple
  createSparkline('sparkline3',
    [29.1, 30.5, 31.0, 32.1, 31.8, 33.0, 32.5, 33.8, 34.0, 34.2],
    'rgb(124, 58, 237)'
  );

  // Receita do Mês — gold
  createSparkline('sparkline4',
    [68000, 75000, 82000, 90000, 95000, 102000, 108000, 115000, 121000, 127840],
    'rgb(201, 169, 110)'
  );

  // NPS Score — emerald
  createSparkline('sparkline5',
    [88, 89, 91, 90, 92, 91, 93, 93, 94, 94],
    'rgb(16, 185, 129)'
  );

  // Análises IA Hoje — purple
  createSparkline('sparkline6',
    [8, 10, 12, 9, 14, 11, 15, 13, 16, 18],
    'rgb(124, 58, 237)'
  );
}

/* ── SDH Donut Chart ────────────────────────────────────────── */
function initSdhDonutChart() {
  const canvas = document.getElementById('sdhDonutChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['SDH Full Face', 'SDH Protocolos', 'SDH Geral'],
      datasets: [{
        data: [45, 32, 23],
        backgroundColor: [
          '#7C3AED',
          '#3B82F6',
          '#C9A96E'
        ],
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverBorderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              return ` ${context.label}: ${context.parsed}%`;
            }
          },
          backgroundColor: '#1A1B2E',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.75)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8
        }
      },
      animation: {
        animateRotate: true,
        duration: 800
      }
    },
    plugins: [{
      // Center text plugin — shows total inside the donut
      id: 'centerText',
      beforeDraw(chart) {
        const { ctx: c, chartArea: { width, height, left, top } } = chart;
        const centerX = left + width / 2;
        const centerY = top + height / 2;

        c.save();

        // Main number
        c.font = '700 22px Inter, sans-serif';
        c.fillStyle = '#1A1B2E';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('100%', centerX, centerY - 8);

        // Sub label
        c.font = '500 11px Inter, sans-serif';
        c.fillStyle = '#9CA3AF';
        c.fillText('de leads', centerX, centerY + 12);

        c.restore();
      }
    }]
  });
}

/* ── Funnel Bar Animation ───────────────────────────────────── */
/**
 * The funnel bars are CSS-based.
 * This function triggers a delayed entrance animation on load.
 */
function initFunnelBarAnimation() {
  const bars = document.querySelectorAll('.funnel-bar');
  bars.forEach((bar, index) => {
    const targetWidth = bar.style.width;
    bar.style.width = '0%';
    setTimeout(() => {
      bar.style.width = targetWidth;
    }, 200 + index * 120);
  });
}

// navigateTo é exportado por sidebar.js — não redeclarar aqui

/* ============================================================
   8. GLOBAL SEARCH
   ============================================================ */

// Status de LEADS/CRM — prefixo LEAD_ para não colidir com STATUS_LABELS da agenda (agenda-smart.js)
// ⚠ NÃO renomear para STATUS_LABELS — esse nome pertence ao módulo de consultas (agenda-smart.js)
const LEAD_STATUS_LABELS = {
  new: 'Novo', qualified: 'Qualificado', scheduled: 'Agendado',
  attending: 'Em atendimento', patient: 'Paciente', lost: 'Perdido', archived: 'Arquivado'
}
const LEAD_STATUS_COLORS = {
  new: '#4F46E5', qualified: '#16A34A', scheduled: '#EA580C',
  attending: '#2563EB', patient: '#7C3AED', lost: '#DC2626', archived: '#9CA3AF'
}

let _gsDebounce = null
let _gsSelected = -1
let _gsResults  = []

function initGlobalSearch() {
  // Atalho ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      const input = document.getElementById('globalSearchInput')
      if (input) { input.focus() }
    }
    if (e.key === 'Escape') closeGlobalSearch()
  })

  // Fecha ao clicar fora
  document.addEventListener('click', e => {
    const wrap = document.querySelector('.header-search')
    if (wrap && !wrap.contains(e.target)) closeGlobalSearch()
  })
}

function globalSearch(query) {
  clearTimeout(_gsDebounce)
  const drop = document.getElementById('globalSearchDrop')
  const shortcut = document.getElementById('globalSearchShortcut')
  if (!drop) return

  if (!query.trim()) {
    closeGlobalSearch()
    if (shortcut) shortcut.style.display = ''
    return
  }
  if (shortcut) shortcut.style.display = 'none'

  _gsDebounce = setTimeout(() => _runGlobalSearch(query.trim()), 180)
}

function _runGlobalSearch(q) {
  const drop = document.getElementById('globalSearchDrop')
  if (!drop) return

  const ql = q.toLowerCase()

  // ── Leads — via LeadsService (single-source — feedback_leads_data_source) ──
  const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
  const leadMatches = leads.filter(l => {
    const nome   = (l.nome || l.name || '').toLowerCase()
    const phone  = (l.phone || l.telefone || l.whatsapp || '').toLowerCase()
    const email  = (l.email || '').toLowerCase()
    const source = (l.source || l.canal || '').toLowerCase()
    return nome.includes(ql) || phone.includes(ql) || email.includes(ql) || source.includes(ql)
  }).slice(0, 6)

  // ── Pacientes (localStorage clinicai_patients, se existir) ──
  const patients = JSON.parse(localStorage.getItem('clinicai_patients') || '[]')
  const patMatches = patients.filter(p => {
    const nome  = (p.nome || p.name || '').toLowerCase()
    const phone = (p.phone || p.telefone || '').toLowerCase()
    const email = (p.email || '').toLowerCase()
    return nome.includes(ql) || phone.includes(ql) || email.includes(ql)
  }).slice(0, 3)

  _gsResults = [
    ...leadMatches.map(l => ({ type: 'lead',    data: l })),
    ...patMatches.map(p  => ({ type: 'patient', data: p })),
  ]
  _gsSelected = -1

  _renderGlobalSearchDrop(q)
}

function _renderGlobalSearchDrop(q) {
  const drop = document.getElementById('globalSearchDrop')
  if (!drop) return

  if (!_gsResults.length) {
    drop.style.display = 'block'
    drop.innerHTML = `<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:13px">
      Nenhum resultado para "<strong>${q}</strong>"
    </div>`
    return
  }

  const leadItems  = _gsResults.filter(r => r.type === 'lead')
  const patItems   = _gsResults.filter(r => r.type === 'patient')

  let html = ''

  if (leadItems.length) {
    html += `<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:6px">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      Leads
    </div>`
    leadItems.forEach((r, i) => {
      const l      = r.data
      const nome   = l.nome || l.name || '—'
      const phone  = l.phone || l.telefone || l.whatsapp || ''
      const status = l.status || ''
      const cor    = LEAD_STATUS_COLORS[status] || '#9CA3AF'
      const label  = LEAD_STATUS_LABELS[status] || status
      const initials = nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
      html += `<div class="gs-item" data-idx="${i}" onclick="globalSearchSelect(${i})"
        style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .12s"
        onmouseenter="this.style.background='#F9FAFB';_gsSelected=${i};_highlightGsItem(document.querySelectorAll('.gs-item'))"
        onmouseleave="this.style.background=''"
      >
        <div style="width:32px;height:32px;border-radius:50%;background:${cor}22;color:${cor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_highlight(nome, q)}</div>
          <div style="font-size:11px;color:#9CA3AF">${phone ? _highlight(phone, q) : '—'}</div>
        </div>
        <span style="flex-shrink:0;background:${cor}18;color:${cor};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">${label}</span>
      </div>`
    })
  }

  if (patItems.length) {
    html += `<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #F3F4F6;margin-top:4px;display:flex;align-items:center;gap:6px">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      Pacientes
    </div>`
    const offset = leadItems.length
    patItems.forEach((r, i) => {
      const p     = r.data
      const nome  = p.nome || p.name || '—'
      const phone = p.phone || p.telefone || ''
      const initials = nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
      html += `<div class="gs-item" data-idx="${offset + i}" onclick="globalSearchSelect(${offset + i})"
        style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .12s"
        onmouseenter="this.style.background='#F9FAFB';_gsSelected=${offset + i}"
        onmouseleave="this.style.background=''"
      >
        <div style="width:32px;height:32px;border-radius:50%;background:#7C3AED22;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_highlight(nome, q)}</div>
          <div style="font-size:11px;color:#9CA3AF">${phone ? _highlight(phone, q) : '—'}</div>
        </div>
      </div>`
    })
  }

  // Rodapé — ver todos os leads
  html += `<div onclick="globalSearchViewAll()" style="
    padding:10px 14px;border-top:1px solid #F3F4F6;font-size:12px;color:#7C3AED;
    font-weight:600;cursor:pointer;text-align:center;
    display:flex;align-items:center;justify-content:center;gap:5px
  " onmouseenter="this.style.background='#F5F3FF'" onmouseleave="this.style.background=''">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    Ver todos os leads
  </div>`

  drop.innerHTML = html
  drop.style.display = 'block'
}

function _highlight(text, query) {
  if (!query) return text
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(re, '<mark style="background:#FEF08A;padding:0 1px;border-radius:2px">$1</mark>')
}

function globalSearchKeydown(e) {
  const items = document.querySelectorAll('.gs-item')
  if (!items.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    _gsSelected = Math.min(_gsSelected + 1, items.length - 1)
    _highlightGsItem(items)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    _gsSelected = Math.max(_gsSelected - 1, 0)
    _highlightGsItem(items)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (_gsSelected >= 0) globalSearchSelect(_gsSelected)
    else if (_gsResults.length > 0) globalSearchSelect(0)
  } else if (e.key === 'Escape') {
    closeGlobalSearch()
  }
}

function _highlightGsItem(items) {
  items.forEach((el, i) => {
    el.style.background = i === _gsSelected ? '#F5F3FF' : ''
  })
  if (items[_gsSelected]) items[_gsSelected].scrollIntoView({ block: 'nearest' })
}

function globalSearchSelect(idx) {
  const result = _gsResults[idx]
  if (!result) return

  closeGlobalSearch()

  if (result.type === 'lead') {
    // Navega para Todos os Leads e abre o modal do lead
    const sub = document.querySelector('.nav-subitem[data-page="leads-all"]')
    if (sub) handleSubItemClick(sub)
    setTimeout(() => {
      if (typeof viewLead === 'function') viewLead(result.data.id)
    }, 300)

  } else if (result.type === 'patient') {
    // Navega para Pacientes
    const sub = document.querySelector('.nav-subitem[data-page="patients"]') ||
                document.querySelector('.nav-subitem[data-page="pacientes"]')
    if (sub) handleSubItemClick(sub)
  }
}

function globalSearchViewAll() {
  closeGlobalSearch()
  // Transfere a query para o campo de busca da página de leads e recarrega
  const sub = document.querySelector('.nav-subitem[data-page="leads-all"]')
  if (sub) handleSubItemClick(sub)
  const q = document.getElementById('globalSearchInput')?.textContent?.trim() || ''
  setTimeout(() => {
    const leadsInput = document.getElementById('leadsSearchInput')
    if (leadsInput && q) {
      leadsInput.value = q
      if (typeof loadLeads === 'function') loadLeads()
    }
  }, 300)
}

function closeGlobalSearch() {
  const drop = document.getElementById('globalSearchDrop')
  if (drop) drop.style.display = 'none'
  const shortcut = document.getElementById('globalSearchShortcut')
  if (shortcut) shortcut.style.display = ''
  _gsSelected = -1
}

window.globalSearch        = globalSearch
window.globalSearchKeydown = globalSearchKeydown
window.globalSearchSelect  = globalSearchSelect
window.globalSearchViewAll = globalSearchViewAll
window.closeGlobalSearch   = closeGlobalSearch
