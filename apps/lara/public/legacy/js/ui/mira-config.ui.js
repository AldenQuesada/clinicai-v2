/**
 * ClinicAI — Mira Config UI v2 (Premium)
 * Pagina de configuracao da Mira dentro do dashboard.
 *
 * Tabs:
 *   1. Visao Geral (KPIs, graficos de uso)
 *   2. Profissionais (numeros autorizados, permissoes)
 *   3. Logs (auditoria de queries)
 *
 * Renderiza em #miraConfigRoot
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraConfigLoaded) return
  window._clinicaiMiraConfigLoaded = true

  var _root = null
  var _tab = 'overview'
  var _loading = false

  var _stats = null
  var _numbers = []
  var _profOptions = []
  var _logs = { rows: [], total: 0 }
  var _logPage = 0
  var _logFilter = { phone: '', intent: '' }
  var LOG_PAGE_SIZE = 30

  // ── Helpers ───────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  function _money(n) {
    if (n == null || isNaN(n)) return '0'
    return Number(n).toLocaleString('pt-BR')
  }

  function _feather(name, size) {
    size = size || 16
    return '<i data-feather="' + name + '" style="width:' + size + 'px;height:' + size + 'px"></i>'
  }

  function _replaceIcons() {
    if (_root && window.feather) feather.replace({ root: _root })
  }

  function _timeAgo(iso) {
    if (!iso) return '--'
    var d = new Date(iso)
    var now = new Date()
    var diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return Math.floor(diff / 60) + 'min atras'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h atras'
    if (diff < 172800) return 'ontem ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function _badge(text, color, bg) {
    return '<span class="mc-badge" style="color:' + color + ';background:' + bg + '">' + _esc(text) + '</span>'
  }

  // ── Skeleton Loader ───────────────────────────────────────────

  function _skeleton(w, h) {
    return '<div class="mc-skeleton" style="width:' + (w || '100%') + ';height:' + (h || '20px') + '"></div>'
  }

  function _renderSkeleton() {
    var kpis = ''
    for (var i = 0; i < 6; i++) {
      kpis += '<div class="mc-card mc-kpi">' + _skeleton('40px', '32px') + '<div style="margin-top:8px">' + _skeleton('80px', '12px') + '</div></div>'
    }
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">' + kpis + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
        + '<div class="mc-card">' + _skeleton('120px', '14px') + '<div style="margin-top:16px">' + _skeleton('100%', '120px') + '</div></div>'
        + '<div class="mc-card">' + _skeleton('120px', '14px') + '<div style="margin-top:16px">' + _skeleton('100%', '120px') + '</div></div>'
      + '</div>'
  }

  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    _root = document.getElementById('miraConfigRoot')
    if (!_root) return
    _loading = true
    _render()
    await _loadTab()
    _loading = false
    _render()
  }

  async function _loadTab() {
    if (_tab === 'overview') await _loadStats()
    else if (_tab === 'professionals') await _loadNumbers()
    else if (_tab === 'logs') await _loadLogs()
  }

  async function _loadStats() {
    var repo = window.MiraRepository
    if (!repo) return
    var r = await repo.dashboardStats()
    if (r.ok) _stats = r.data
  }

  async function _loadNumbers() {
    var repo = window.MiraRepository
    if (!repo) return
    var results = await Promise.all([repo.listNumbers(), repo.listProfessionals()])
    if (results[0].ok) _numbers = (results[0].data || []).filter(function (n) { return n.number_type === 'professional_private' })
    if (results[1].ok) _profOptions = (results[1].data || []).filter(function (p) {
      var phone = (p.whatsapp || p.telefone || p.phone || '').toString().trim()
      return phone && phone.replace(/\D/g, '').length >= 10
    })
  }

  async function _loadLogs() {
    var repo = window.MiraRepository
    if (!repo) return
    var r = await repo.auditList(LOG_PAGE_SIZE, _logPage * LOG_PAGE_SIZE, _logFilter.phone || null, _logFilter.intent || null)
    if (r.ok) _logs = r.data
  }

  // ── Main render ───────────────────────────────────────────────

  function _render() {
    if (!_root) return

    var tabs = [
      { id: 'overview', icon: 'bar-chart-2', label: 'Visao Geral' },
      { id: 'professionals', icon: 'users', label: 'Profissionais' },
      { id: 'channels', icon: 'git-branch', label: 'Canais' },
      { id: 'logs', icon: 'file-text', label: 'Logs de Uso' },
    ]

    var tabsHtml = tabs.map(function (t) {
      var active = t.id === _tab
      return '<button class="mc-tab' + (active ? ' mc-tab-active' : '') + '" data-tab="' + t.id + '">'
        + _feather(t.icon, 15) + '<span>' + t.label + '</span>'
        + '</button>'
    }).join('')

    var body = ''
    if (_loading) {
      body = _renderSkeleton()
    } else if (_tab === 'overview') {
      body = _renderOverview()
    } else if (_tab === 'professionals') {
      body = _renderProfessionals()
    } else if (_tab === 'channels') {
      body = (window.MiraConfigChannels && window.MiraConfigChannels.render(_root))
        || '<div class="mc-empty">Modulo de canais indisponivel.</div>'
    } else if (_tab === 'logs') {
      body = _renderLogs()
    }

    _root.innerHTML = ''
      + '<div class="mc-page">'

        // Header
        + '<div class="mc-header">'
          + '<div>'
            + '<h2 class="mc-title">' + _feather('cpu', 22) + ' Mira</h2>'
            + '<p class="mc-subtitle">Assistente interna via WhatsApp para profissionais da clinica</p>'
          + '</div>'
          + '<div style="display:flex;gap:8px">'
            + '<button id="mcBtnConsole" class="mc-btn-gold">'
              + _feather('terminal', 15) + ' Abrir Console'
            + '</button>'
          + '</div>'
        + '</div>'

        // Tabs
        + '<div class="mc-tabs">' + tabsHtml + '</div>'

        // Body (animated)
        + '<div class="mc-body">' + body + '</div>'

      + '</div>'

      + _renderStyles()

    // Events
    _root.querySelectorAll('.mc-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _tab = btn.getAttribute('data-tab')
        _loading = true
        _render()
        _loadTab().then(function () { _loading = false; _render() })
      })
    })

    var btnConsole = document.getElementById('mcBtnConsole')
    if (btnConsole) btnConsole.addEventListener('click', function () { if (window.navigateTo) window.navigateTo('mira-console') })

    _replaceIcons()
    _bindEvents()
  }

  // ── Tab: Overview ─────────────────────────────────────────────

  function _renderOverview() {
    if (!_stats) return _renderEmptyState('bar-chart-2', 'Sem dados de uso', 'A Mira ainda nao recebeu queries. Envie uma mensagem pelo WhatsApp para comecar.')

    var s = _stats

    var kpis = [
      { icon: 'users',          value: s.numbers_active || 0,                   label: 'Profissionais',  color: '#C9A96E', glow: 'rgba(201,169,110,.12)' },
      { icon: 'message-circle', value: s.queries_today || 0,                    label: 'Queries Hoje',   color: '#10b981', glow: 'rgba(16,185,129,.12)' },
      { icon: 'trending-up',    value: s.queries_week || 0,                     label: 'Semana',         color: '#3b82f6', glow: 'rgba(59,130,246,.12)' },
      { icon: 'calendar',       value: s.queries_month || 0,                    label: 'Mes',            color: '#8b5cf6', glow: 'rgba(139,92,246,.12)' },
      { icon: 'zap',            value: (s.avg_response_ms || 0) + 'ms',         label: 'Tempo Medio',    color: '#f59e0b', glow: 'rgba(245,158,11,.12)' },
      { icon: 'shield',         value: (s.error_rate || 0) + '%',               label: 'Taxa de Erro',   color: s.error_rate > 5 ? '#DC2626' : '#059669', glow: s.error_rate > 5 ? 'rgba(220,38,38,.12)' : 'rgba(5,150,105,.12)' },
    ]

    var kpiHtml = kpis.map(function (k, idx) {
      return '<div class="mc-kpi-card mc-fade" style="animation-delay:' + (idx * 60) + 'ms">'
        + '<div class="mc-kpi-icon" style="background:' + k.glow + ';color:' + k.color + '">' + _feather(k.icon, 20) + '</div>'
        + '<div class="mc-kpi-value" style="color:' + k.color + '">' + k.value + '</div>'
        + '<div class="mc-kpi-label">' + k.label + '</div>'
        + '</div>'
    }).join('')

    // Top intents
    var intents = s.top_intents || []
    var maxIntent = intents.length > 0 ? intents[0].total : 1
    var intentsHtml = intents.length > 0 ? intents.map(function (i, idx) {
      var pct = Math.round((i.total / maxIntent) * 100)
      return '<div class="mc-intent-row mc-fade" style="animation-delay:' + (idx * 40 + 200) + 'ms">'
        + '<div class="mc-intent-name">' + _esc(i.intent.replace(/_/g, ' ')) + '</div>'
        + '<div class="mc-intent-bar"><div class="mc-intent-fill" style="width:' + pct + '%"></div></div>'
        + '<div class="mc-intent-count">' + i.total + '</div>'
        + '</div>'
    }).join('') : _renderEmptyMini('target', 'Sem queries ainda')

    // Sparkline
    var days = s.queries_by_day || []
    var maxDay = 1
    days.forEach(function (d) { if (d.total > maxDay) maxDay = d.total })
    var sparkHtml = days.length > 0 ? days.map(function (d, idx) {
      var h = Math.max(6, Math.round((d.total / maxDay) * 80))
      var dayLabel = new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      return '<div class="mc-spark-col mc-fade" style="animation-delay:' + (idx * 30 + 300) + 'ms" title="' + dayLabel + ': ' + d.total + ' queries">'
        + '<div class="mc-spark-count">' + d.total + '</div>'
        + '<div class="mc-spark-bar" style="height:' + h + 'px"></div>'
        + '<div class="mc-spark-label">' + dayLabel + '</div>'
        + '</div>'
    }).join('') : '<div style="flex:1;text-align:center;color:#9ca3af;font-size:12px;padding:30px 0">Sem dados</div>'

    // Voice
    var voiceHtml = ''
    if (s.voice_count_month != null) {
      voiceHtml = '<div class="mc-card mc-fade" style="margin-top:16px;animation-delay:500ms;display:flex;align-items:center;gap:16px">'
        + '<div class="mc-kpi-icon" style="background:rgba(139,92,246,.12);color:#8b5cf6">' + _feather('mic', 20) + '</div>'
        + '<div>'
          + '<div style="font-size:20px;font-weight:800;color:#111827">' + s.voice_count_month + '</div>'
          + '<div style="font-size:12px;color:#6b7280">transcricoes de audio este mes</div>'
        + '</div>'
        + '</div>'
    }

    return ''
      + '<div class="mc-kpi-grid">' + kpiHtml + '</div>'
      + '<div class="mc-charts-grid">'
        + '<div class="mc-card mc-fade" style="animation-delay:200ms">'
          + '<div class="mc-section-title">' + _feather('target', 15) + ' Top Intents <span style="font-weight:400;color:#9ca3af">30 dias</span></div>'
          + intentsHtml
        + '</div>'
        + '<div class="mc-card mc-fade" style="animation-delay:250ms">'
          + '<div class="mc-section-title">' + _feather('bar-chart-2', 15) + ' Queries por Dia <span style="font-weight:400;color:#9ca3af">14 dias</span></div>'
          + '<div class="mc-spark-wrap">' + sparkHtml + '</div>'
        + '</div>'
      + '</div>'
      + voiceHtml
  }

  function _renderEmptyState(icon, title, desc) {
    return '<div class="mc-empty mc-fade">'
      + '<div class="mc-empty-icon">' + _feather(icon, 40) + '</div>'
      + '<div class="mc-empty-title">' + title + '</div>'
      + '<div class="mc-empty-desc">' + desc + '</div>'
      + '</div>'
  }

  function _renderEmptyMini(icon, text) {
    return '<div style="text-align:center;padding:24px 0;color:#9ca3af">'
      + '<div style="margin-bottom:6px;opacity:.5">' + _feather(icon, 24) + '</div>'
      + '<div style="font-size:12px">' + text + '</div>'
      + '</div>'
  }

  // ── Tab: Professionals ────────────────────────────────────────

  function _renderProfessionals() {
    var addBtn = '<button id="mcBtnAddProf" class="mc-btn-gold">' + _feather('user-plus', 15) + ' Cadastrar</button>'

    var header = '<div class="mc-section-header">'
      + '<div class="mc-section-title" style="margin:0">' + _numbers.length + ' profissional(is) autorizado(s)</div>'
      + addBtn
      + '</div>'

    if (_numbers.length === 0) {
      return header + _renderEmptyState('users', 'Nenhum profissional cadastrado', 'Clique em "Cadastrar" para autorizar um profissional a usar a Mira via WhatsApp.')
    }

    var rows = _numbers.map(function (n, idx) {
      var perms = n.permissions || {}
      var permBadges = ''
      if (perms.agenda !== false)    permBadges += _badge('Agenda', '#059669', '#D1FAE5') + ' '
      if (perms.pacientes !== false) permBadges += _badge('Pacientes', '#3b82f6', '#DBEAFE') + ' '
      if (perms.financeiro !== false)permBadges += _badge('Financeiro', '#8b5cf6', '#EDE9FE') + ' '

      var scopeBadge = n.access_scope === 'full'
        ? _badge('FULL', '#92400e', 'linear-gradient(135deg,#FEF3C7,#FDE68A)')
        : _badge('OWN', '#6b7280', '#F3F4F6')

      return '<tr class="mc-fade" style="animation-delay:' + (idx * 40) + 'ms">'
        + '<td><div style="display:flex;align-items:center;gap:8px"><span class="mc-dot-active"></span><strong>' + _esc(n.professional_name || n.label || '--') + '</strong></div></td>'
        + '<td><code class="mc-phone">' + _esc(n.phone || '--') + '</code></td>'
        + '<td>' + scopeBadge + '</td>'
        + '<td>' + permBadges + '</td>'
        + '<td style="white-space:nowrap">'
          + '<button class="mc-btn-icon mc-prof-edit" data-id="' + n.id + '" title="Editar">' + _feather('edit-2', 14) + '</button>'
          + '<button class="mc-btn-icon mc-prof-reset-quota" data-prof-id="' + (n.professional_id || '') + '" data-name="' + _esc(n.professional_name || n.label || '') + '" title="Resetar quota do dia" style="color:#F59E0B">' + _feather('refresh-cw', 14) + '</button>'
          + '<button class="mc-btn-icon mc-btn-icon-danger mc-prof-remove" data-id="' + n.id + '" data-name="' + _esc(n.professional_name || n.label || '') + '" title="Remover">' + _feather('trash-2', 14) + '</button>'
        + '</td>'
        + '</tr>'
    }).join('')

    return header
      + '<div class="mc-card mc-fade" style="padding:0;overflow:hidden">'
        + '<table class="mc-table">'
          + '<thead><tr><th>Profissional</th><th>Telefone</th><th>Escopo</th><th>Permissoes</th><th style="width:80px">Acoes</th></tr></thead>'
          + '<tbody>' + rows + '</tbody>'
        + '</table>'
      + '</div>'
  }

  // ── Tab: Logs ─────────────────────────────────────────────────

  function _renderLogs() {
    var rows = (_logs.rows || [])
    var total = _logs.total || 0
    var totalPages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE))

    var filterHtml = '<div class="mc-filter-bar">'
      + '<input type="text" id="mcLogPhone" class="mc-input" placeholder="Telefone..." value="' + _esc(_logFilter.phone) + '" style="width:160px">'
      + '<input type="text" id="mcLogIntent" class="mc-input" placeholder="Intent..." value="' + _esc(_logFilter.intent) + '" style="width:140px">'
      + '<button id="mcLogSearch" class="mc-btn">' + _feather('search', 14) + ' Buscar</button>'
      + '<div style="flex:1"></div>'
      + '<div class="mc-filter-count">' + _money(total) + ' registros</div>'
      + '</div>'

    if (rows.length === 0) {
      return filterHtml + _renderEmptyState('file-text', 'Nenhum log encontrado', 'Ajuste os filtros ou aguarde novas queries da Mira.')
    }

    var rowsHtml = rows.map(function (r, idx) {
      var intentColor = r.success ? '#059669' : '#DC2626'
      var intentBg = r.success ? '#D1FAE5' : '#FEE2E2'
      return '<tr class="mc-fade" style="animation-delay:' + (idx * 20) + 'ms">'
        + '<td class="mc-log-time">' + _timeAgo(r.created_at) + '</td>'
        + '<td>' + _esc(r.professional_name || '--') + '</td>'
        + '<td>' + _badge(r.intent || 'unknown', intentColor, intentBg) + '</td>'
        + '<td class="mc-log-query" title="' + _esc(r.query) + '">' + _esc(r.query) + '</td>'
        + '<td class="mc-log-ms">' + (r.response_ms || '--') + 'ms</td>'
        + '</tr>'
    }).join('')

    var pagHtml = '<div class="mc-pagination">'
      + '<button id="mcLogPrev" class="mc-btn-icon"' + (_logPage === 0 ? ' disabled' : '') + '>' + _feather('chevron-left', 16) + '</button>'
      + '<span class="mc-page-info">Pagina ' + (_logPage + 1) + ' de ' + totalPages + '</span>'
      + '<button id="mcLogNext" class="mc-btn-icon"' + (_logPage >= totalPages - 1 ? ' disabled' : '') + '>' + _feather('chevron-right', 16) + '</button>'
      + '</div>'

    return filterHtml
      + '<div class="mc-card mc-fade" style="padding:0;overflow:hidden">'
        + '<table class="mc-table"><thead><tr><th>Quando</th><th>Profissional</th><th>Intent</th><th>Query</th><th>Tempo</th></tr></thead>'
        + '<tbody>' + rowsHtml + '</tbody></table>'
      + '</div>'
      + pagHtml
  }

  // ── Event binding ─────────────────────────────────────────────

  function _bindEvents() {
    if (!_root) return

    var addBtn = document.getElementById('mcBtnAddProf')
    if (addBtn) addBtn.addEventListener('click', _openRegisterModal)

    _root.querySelectorAll('.mc-prof-edit').forEach(function (btn) {
      btn.addEventListener('click', function () { _openEditModal(btn.getAttribute('data-id')) })
    })
    _root.querySelectorAll('.mc-prof-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { _confirmRemove(btn.getAttribute('data-id'), btn.getAttribute('data-name')) })
    })
    _root.querySelectorAll('.mc-prof-reset-quota').forEach(function (btn) {
      btn.addEventListener('click', function () { _resetQuota(btn.getAttribute('data-prof-id'), btn.getAttribute('data-name')) })
    })

    var logSearch = document.getElementById('mcLogSearch')
    if (logSearch) {
      logSearch.addEventListener('click', function () {
        _logFilter.phone = (document.getElementById('mcLogPhone') || {}).value || ''
        _logFilter.intent = (document.getElementById('mcLogIntent') || {}).value || ''
        _logPage = 0
        _reloadLogs()
      })
    }

    var prev = document.getElementById('mcLogPrev')
    var next = document.getElementById('mcLogNext')
    if (prev) prev.addEventListener('click', function () { _logPage--; _reloadLogs() })
    if (next) next.addEventListener('click', function () { _logPage++; _reloadLogs() })

    ;['mcLogPhone', 'mcLogIntent'].forEach(function (id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && logSearch) logSearch.click() })
    })
  }

  async function _resetQuota(profId, name) {
    if (!profId) return
    if (!confirm('Resetar a quota diaria de ' + name + '?')) return
    try {
      var sb = window._sbShared
      if (!sb) throw new Error('Supabase indisponivel')
      var today = new Date().toISOString().slice(0, 10)
      await sb.from('wa_pro_rate_limit')
        .update({ query_count: 0, minute_count: 0 })
        .eq('professional_id', profId)
        .eq('date', today)
      if (typeof window.showToast === 'function') window.showToast('Quota de ' + name + ' resetada', 'success')
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Erro: ' + e.message, 'error')
    }
  }

  async function _reloadLogs() { _loading = true; _render(); await _loadLogs(); _loading = false; _render() }

  // ── Modal helpers ─────────────────────────────────────────────

  function _openModal(html) {
    var existing = document.getElementById('mcModalBackdrop')
    if (existing) existing.remove()
    document.body.insertAdjacentHTML('beforeend',
      '<div id="mcModalBackdrop" class="mc-modal-backdrop">'
        + '<div class="mc-modal mc-modal-enter">' + html + '</div>'
      + '</div>')
    if (window.feather) feather.replace({ root: document.getElementById('mcModalBackdrop') })

    // Close handlers
    document.querySelectorAll('.mc-modal-close').forEach(function (b) {
      b.addEventListener('click', _closeModal)
    })
    document.getElementById('mcModalBackdrop')?.addEventListener('click', function (e) {
      if (e.target.id === 'mcModalBackdrop') _closeModal()
    })
    document.addEventListener('keydown', _escHandler)
  }

  function _closeModal() {
    var m = document.getElementById('mcModalBackdrop')
    if (m) { m.style.opacity = '0'; setTimeout(function () { m.remove() }, 200) }
    document.removeEventListener('keydown', _escHandler)
  }

  function _escHandler(e) { if (e.key === 'Escape') _closeModal() }

  // ── Modal: Register ───────────────────────────────────────────

  function _openRegisterModal() {
    var profOpts = _profOptions.map(function (p, i) {
      var phone = (p.whatsapp || p.telefone || p.phone || '').toString().trim()
      return '<option value="' + i + '">' + _esc((p.display_name || 'Sem nome') + ' — ' + phone + (p.specialty ? ' · ' + p.specialty : '')) + '</option>'
    }).join('')

    _openModal(''
      + '<div class="mc-modal-header">'
        + '<div><h3 class="mc-modal-title">Cadastrar Profissional</h3><p class="mc-modal-desc">Autorize acesso a Mira via WhatsApp</p></div>'
        + '<button class="mc-modal-close mc-btn-icon">' + _feather('x', 18) + '</button>'
      + '</div>'
      + '<div class="mc-modal-body">'
        + _formField('Profissional', '<select id="mcRegProf" class="mc-input" style="width:100%"><option value="">-- escolha --</option>' + profOpts + '</select>')
        + _formField('Telefone', '<input type="text" id="mcRegPhone" class="mc-input" style="width:100%;background:#f9fafb" readonly placeholder="Auto ao selecionar profissional">')
        + _formField('Escopo de acesso', '<select id="mcRegScope" class="mc-input" style="width:100%"><option value="own">Proprio (so dados do profissional)</option><option value="full">Completo (todos os dados)</option></select>')
        + '<div><label class="mc-form-label">Permissoes</label>'
          + '<div class="mc-perm-grid">'
            + _permCheckbox('agenda', 'Agenda', 'Agenda, horarios livres')
            + _permCheckbox('pacientes', 'Pacientes', 'Busca, saldo, historico')
            + _permCheckbox('financeiro', 'Financeiro', 'Receita, comissao, meta')
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="mc-modal-footer">'
        + '<button class="mc-modal-close mc-btn">Cancelar</button>'
        + '<button id="mcRegSave" class="mc-btn-gold">Cadastrar</button>'
      + '</div>')

    document.getElementById('mcRegProf')?.addEventListener('change', function (e) {
      var idx = parseInt(e.target.value, 10)
      var phoneEl = document.getElementById('mcRegPhone')
      if (isNaN(idx) || !_profOptions[idx]) { if (phoneEl) phoneEl.value = ''; return }
      if (phoneEl) phoneEl.value = (_profOptions[idx].whatsapp || _profOptions[idx].telefone || _profOptions[idx].phone || '').toString().replace(/\D/g, '')
    })
    document.getElementById('mcRegSave')?.addEventListener('click', _handleRegister)
  }

  function _formField(label, input) {
    return '<div><label class="mc-form-label">' + label + '</label>' + input + '</div>'
  }

  function _permCheckbox(value, label, hint) {
    return '<label class="mc-perm-item">'
      + '<input type="checkbox" class="mc-perm mc-checkbox" data-area="' + value + '" checked>'
      + '<div><div style="font-size:13px;font-weight:600;color:#111827">' + label + '</div><div style="font-size:11px;color:#6b7280">' + hint + '</div></div>'
      + '</label>'
  }

  async function _handleRegister() {
    var profIdx = parseInt((document.getElementById('mcRegProf') || {}).value, 10)
    if (isNaN(profIdx) || !_profOptions[profIdx]) { _toast('Selecione um profissional', 'warn'); return }
    var p = _profOptions[profIdx]
    var phone = ((document.getElementById('mcRegPhone') || {}).value || '').replace(/\D/g, '')
    if (phone.length < 10) { _toast('Telefone invalido', 'warn'); return }
    var scope = (document.getElementById('mcRegScope') || {}).value || 'own'
    var perms = { agenda: false, pacientes: false, financeiro: false }
    document.querySelectorAll('.mc-perm').forEach(function (cb) { perms[cb.getAttribute('data-area')] = cb.checked })
    if (!perms.agenda && !perms.pacientes && !perms.financeiro) { _toast('Marque ao menos uma permissao', 'warn'); return }

    var saveBtn = document.getElementById('mcRegSave')
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = _feather('loader', 14) + ' Salvando...' }

    var r = await window.MiraRepository.registerNumber({
      phone: phone, professional_id: p.id, label: 'Mira ' + (p.display_name || '').split(' ')[0], access_scope: scope, permissions: perms,
    })
    if (r.ok) { _toast('Profissional cadastrado!', 'ok'); _closeModal(); await _loadNumbers(); _render() }
    else { _toast('Erro: ' + (r.error || 'desconhecido'), 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Cadastrar' } }
  }

  // ── Modal: Edit ───────────────────────────────────────────────

  function _openEditModal(numberId) {
    var num = _numbers.find(function (n) { return n.id === numberId })
    if (!num) return

    var perms = num.permissions || {}
    _openModal(''
      + '<div class="mc-modal-header">'
        + '<div><h3 class="mc-modal-title">Editar — ' + _esc(num.professional_name || num.label) + '</h3><p class="mc-modal-desc"><code>' + _esc(num.phone) + '</code></p></div>'
        + '<button class="mc-modal-close mc-btn-icon">' + _feather('x', 18) + '</button>'
      + '</div>'
      + '<div class="mc-modal-body">'
        + _formField('Escopo', '<select id="mcEditScope" class="mc-input" style="width:100%"><option value="own"' + (num.access_scope !== 'full' ? ' selected' : '') + '>Proprio</option><option value="full"' + (num.access_scope === 'full' ? ' selected' : '') + '>Completo</option></select>')
        + '<div><label class="mc-form-label">Permissoes</label><div class="mc-perm-grid">'
          + _permCheckboxEdit('agenda', 'Agenda', perms.agenda !== false)
          + _permCheckboxEdit('pacientes', 'Pacientes', perms.pacientes !== false)
          + _permCheckboxEdit('financeiro', 'Financeiro', perms.financeiro !== false)
        + '</div></div>'
      + '</div>'
      + '<div class="mc-modal-footer">'
        + '<button class="mc-modal-close mc-btn">Cancelar</button>'
        + '<button id="mcEditSave" class="mc-btn-gold">Salvar</button>'
      + '</div>')

    document.getElementById('mcEditSave')?.addEventListener('click', async function () {
      var scope = (document.getElementById('mcEditScope') || {}).value || 'own'
      var permsNew = { agenda: false, pacientes: false, financeiro: false }
      document.querySelectorAll('.mc-perm-edit').forEach(function (cb) { permsNew[cb.getAttribute('data-area')] = cb.checked })
      var btn = document.getElementById('mcEditSave')
      if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Salvando...' }
      var r = await window.MiraRepository.updateNumber(numberId, { phone: num.phone, professional_id: num.professional_id, label: num.label, access_scope: scope, permissions: permsNew })
      if (r.ok && r.data && r.data.ok) { _toast('Atualizado!', 'ok'); _closeModal(); await _loadNumbers(); _render() }
      else { _toast('Erro: ' + ((r.data && r.data.error) || r.error || 'desconhecido'), 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar' } }
    })
  }

  function _permCheckboxEdit(value, label, checked) {
    return '<label class="mc-perm-item"><input type="checkbox" class="mc-perm-edit mc-checkbox" data-area="' + value + '"' + (checked ? ' checked' : '') + '><span style="font-size:13px;font-weight:600;color:#111827">' + label + '</span></label>'
  }

  // ── Modal: Confirm Remove ─────────────────────────────────────

  function _confirmRemove(numberId, name) {
    _openModal(''
      + '<div style="padding:32px;text-align:center">'
        + '<div class="mc-remove-icon">' + _feather('alert-triangle', 28) + '</div>'
        + '<h3 class="mc-modal-title" style="margin-top:16px">Remover Acesso</h3>'
        + '<p style="margin:8px 0 0;font-size:13px;color:#6b7280">Desativar o acesso de <strong>' + _esc(name) + '</strong> a Mira?</p>'
      + '</div>'
      + '<div class="mc-modal-footer" style="justify-content:center">'
        + '<button class="mc-modal-close mc-btn">Cancelar</button>'
        + '<button id="mcConfirmRemove" class="mc-btn-danger">Remover</button>'
      + '</div>')

    document.getElementById('mcConfirmRemove')?.addEventListener('click', async function () {
      var btn = document.getElementById('mcConfirmRemove')
      if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Removendo...' }
      var r = await window.MiraRepository.removeNumber(numberId)
      if (r.ok && r.data && r.data.ok) { _toast('Acesso removido', 'ok'); _closeModal(); await _loadNumbers(); _render() }
      else { _toast('Erro ao remover', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Remover' } }
    })
  }

  // ── Toast ─────────────────────────────────────────────────────

  function _toast(msg, type) {
    var colors = { ok: '#059669', warn: '#92400e', error: '#DC2626' }
    var bg = { ok: '#D1FAE5', warn: '#FEF3C7', error: '#FEE2E2' }
    var icons = { ok: 'check-circle', warn: 'alert-circle', error: 'x-circle' }
    var t = document.createElement('div')
    t.className = 'mc-toast mc-toast-enter'
    t.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' + _feather(icons[type] || 'info', 16) + ' ' + _esc(msg) + '</span>'
    t.style.color = colors[type] || '#374151'
    t.style.background = bg[type] || '#F3F4F6'
    document.body.appendChild(t)
    if (window.feather) feather.replace({ root: t })
    setTimeout(function () { t.classList.add('mc-toast-exit') }, 2500)
    setTimeout(function () { t.remove() }, 3000)
  }

  // ── Styles ────────────────────────────────────────────────────

  function _renderStyles() {
    return '<style>'
      // Animations
      + '@keyframes mcFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
      + '@keyframes mcShimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}'
      + '@keyframes mcPulse{0%,100%{opacity:1}50%{opacity:.5}}'
      + '@keyframes mcModalIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}'
      + '@keyframes mcToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}'

      // Layout
      + '.mc-page{padding:28px 32px;max-width:1100px;margin:0 auto}'
      + '.mc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap}'
      + '.mc-title{margin:0;font-size:22px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}'
      + '.mc-subtitle{margin:4px 0 0;font-size:13px;color:#6b7280}'
      + '.mc-body{min-height:300px}'

      // Fade animation class
      + '.mc-fade{animation:mcFadeUp .4s ease both}'

      // Skeleton
      + '.mc-skeleton{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200px 100%;animation:mcShimmer 1.5s infinite;border-radius:8px}'

      // Tabs
      + '.mc-tabs{display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid #e5e7eb;padding-bottom:0}'
      + '.mc-tab{background:none;border:none;padding:10px 18px;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-2px;display:flex;align-items:center;gap:7px;transition:all .2s ease}'
      + '.mc-tab:hover{color:#111827;background:rgba(201,169,110,.04);border-radius:8px 8px 0 0}'
      + '.mc-tab-active{color:#C9A96E;border-bottom-color:#C9A96E}'

      // Cards
      + '.mc-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:box-shadow .2s ease}'
      + '.mc-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.06)}'

      // KPI Grid premium
      + '.mc-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px}'
      + '.mc-kpi-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 16px;text-align:center;transition:all .25s ease;cursor:default}'
      + '.mc-kpi-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(201,169,110,.12);border-color:rgba(201,169,110,.3)}'
      + '.mc-kpi-icon{width:40px;height:40px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px}'
      + '.mc-kpi-value{font-size:28px;font-weight:800;line-height:1.1}'
      + '.mc-kpi-label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-top:4px}'

      // Charts grid
      + '.mc-charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}'
      + '@media(max-width:768px){.mc-charts-grid{grid-template-columns:1fr}}'

      // Section header/title
      + '.mc-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}'
      + '.mc-section-title{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:14px;display:flex;align-items:center;gap:6px}'

      // Intent bars
      + '.mc-intent-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}'
      + '.mc-intent-name{width:110px;font-size:12px;font-weight:600;color:#374151;text-align:right;flex-shrink:0;text-transform:capitalize}'
      + '.mc-intent-bar{flex:1;height:24px;background:#f3f4f6;border-radius:8px;overflow:hidden}'
      + '.mc-intent-fill{height:100%;background:linear-gradient(90deg,#C9A96E,#E8D5A3);border-radius:8px;transition:width .6s cubic-bezier(.4,0,.2,1)}'
      + '.mc-intent-count{width:36px;font-size:12px;font-weight:700;color:#111827}'

      // Sparkline
      + '.mc-spark-wrap{display:flex;align-items:flex-end;gap:4px;height:110px;padding-top:10px}'
      + '.mc-spark-col{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0;cursor:default;transition:transform .15s}'
      + '.mc-spark-col:hover{transform:scaleY(1.08)}'
      + '.mc-spark-col:hover .mc-spark-bar{background:linear-gradient(180deg,#a8894f,#C9A96E)}'
      + '.mc-spark-count{font-size:10px;font-weight:700;color:#374151}'
      + '.mc-spark-bar{width:100%;max-width:28px;background:linear-gradient(180deg,#C9A96E,#E8D5A3);border-radius:4px 4px 0 0;transition:background .2s}'
      + '.mc-spark-label{font-size:9px;color:#9ca3af}'

      // Table
      + '.mc-table{width:100%;border-collapse:collapse;font-size:13px}'
      + '.mc-table th{text-align:left;padding:11px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e5e7eb;background:#fafafa}'
      + '.mc-table td{padding:11px 14px;border-bottom:1px solid #f3f4f6;color:#374151;transition:background .15s}'
      + '.mc-table tr:hover td{background:#fefce8}'
      + '.mc-phone{font-family:ui-monospace,monospace;font-size:12px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:4px}'
      + '.mc-log-time{font-size:11px;color:#9ca3af;white-space:nowrap}'
      + '.mc-log-query{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.mc-log-ms{font-size:12px;color:#6b7280;font-family:ui-monospace,monospace}'

      // Badges
      + '.mc-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.2px}'

      // Active dot
      + '.mc-dot-active{width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;animation:mcPulse 2s ease infinite}'

      // Buttons
      + '.mc-btn{background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s ease;display:inline-flex;align-items:center;gap:6px}'
      + '.mc-btn:hover{border-color:#C9A96E;color:#C9A96E;transform:translateY(-1px);box-shadow:0 2px 8px rgba(201,169,110,.15)}'
      + '.mc-btn:disabled{opacity:.4;pointer-events:none;transform:none}'
      + '.mc-btn-gold{background:linear-gradient(135deg,#C9A96E,#a8894f);color:#fff;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .2s ease;box-shadow:0 2px 8px rgba(201,169,110,.3)}'
      + '.mc-btn-gold:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(201,169,110,.4)}'
      + '.mc-btn-gold:disabled{opacity:.6;pointer-events:none;transform:none}'
      + '.mc-btn-danger{background:#fff;color:#DC2626;border:1.5px solid #FCA5A5;padding:8px 18px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s ease;display:inline-flex;align-items:center;gap:6px}'
      + '.mc-btn-danger:hover{background:#FEE2E2;transform:translateY(-1px);box-shadow:0 2px 8px rgba(220,38,38,.15)}'
      + '.mc-btn-icon{background:none;border:1.5px solid #e5e7eb;color:#6b7280;width:34px;height:34px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s ease}'
      + '.mc-btn-icon:hover{border-color:#C9A96E;color:#C9A96E;background:rgba(201,169,110,.04)}'
      + '.mc-btn-icon:disabled{opacity:.3;pointer-events:none}'
      + '.mc-btn-icon-danger:hover{border-color:#FCA5A5;color:#DC2626;background:#FEF2F2}'

      // Input
      + '.mc-input{padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;background:#fff;transition:all .2s ease}'
      + '.mc-input:focus{border-color:#C9A96E;box-shadow:0 0 0 3px rgba(201,169,110,.1)}'

      // Checkbox
      + '.mc-checkbox{cursor:pointer;width:18px;height:18px;accent-color:#C9A96E;flex-shrink:0}'

      // Modal
      + '.mc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;transition:opacity .2s}'
      + '.mc-modal{background:#fff;border-radius:18px;width:100%;max-width:520px;box-shadow:0 25px 60px rgba(0,0,0,.2);overflow:hidden}'
      + '.mc-modal-enter{animation:mcModalIn .25s ease}'
      + '.mc-modal-header{padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between}'
      + '.mc-modal-title{margin:0;font-size:18px;font-weight:700;color:#111827}'
      + '.mc-modal-desc{margin:3px 0 0;font-size:12px;color:#6b7280}'
      + '.mc-modal-body{padding:24px;display:flex;flex-direction:column;gap:16px}'
      + '.mc-modal-footer{padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end}'
      + '.mc-form-label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px}'
      + '.mc-perm-grid{display:flex;flex-direction:column;gap:10px;background:#fafafa;padding:14px 16px;border:1px solid #f3f4f6;border-radius:10px}'
      + '.mc-perm-item{display:flex;align-items:flex-start;gap:10px;cursor:pointer}'

      // Remove icon
      + '.mc-remove-icon{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FEE2E2,#FECACA);display:inline-flex;align-items:center;justify-content:center;color:#DC2626}'

      // Empty state
      + '.mc-empty{text-align:center;padding:60px 20px}'
      + '.mc-empty-icon{color:#d1d5db;margin-bottom:12px}'
      + '.mc-empty-title{font-size:16px;font-weight:700;color:#374151;margin-bottom:6px}'
      + '.mc-empty-desc{font-size:13px;color:#9ca3af;max-width:360px;margin:0 auto;line-height:1.5}'

      // Filter bar
      + '.mc-filter-bar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}'
      + '.mc-filter-count{font-size:12px;color:#9ca3af;font-weight:600}'

      // Pagination
      + '.mc-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px}'
      + '.mc-page-info{font-size:12px;color:#6b7280;font-weight:600}'

      // Toast
      + '.mc-toast{position:fixed;bottom:24px;right:24px;z-index:10000;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);transition:all .3s ease}'
      + '.mc-toast-enter{animation:mcToastIn .3s ease}'
      + '.mc-toast-exit{opacity:0;transform:translateX(20px)}'

      + '</style>'
  }

  window.MiraConfigUI = Object.freeze({ init: init })
})()
