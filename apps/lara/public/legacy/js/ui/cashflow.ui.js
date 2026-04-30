/**
 * ClinicAI — Cashflow UI
 * Pagina "Fluxo de Caixa" dentro de Relatorios Financeiros
 *
 * Renderiza em #finCashflowRoot
 */
;(function () {
  'use strict'
  if (window._clinicaiCashflowUiLoaded) return
  window._clinicaiCashflowUiLoaded = true

  var _state = {
    period:    'month',  // month | last30 | custom
    startDate: null,
    endDate:   null,
    direction: '',       // '' | credit | debit
    method:    '',
    onlyUnreconciled: false,
    entries:   [],
    summary:   {},
    loading:   false,
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    var root = document.getElementById('finCashflowRoot')
    if (!root) return

    // Periodo default: mes atual
    var range = window.CashflowService.monthRange()
    _state.startDate = range.start
    _state.endDate   = range.end

    _renderShell()
    _loadData()
  }

  // ── Carregamento ──────────────────────────────────────────

  async function _loadData() {
    _state.loading = true
    _renderBody()

    try {
      // Determina ano/mes do periodo (se mes atual)
      var d = new Date(_state.startDate + 'T00:00:00')
      var year  = d.getFullYear()
      var month = d.getMonth() + 1

      var [sumRes, listRes, intelRes, dreRes, segRes, trendsRes, fcRes] = await Promise.all([
        window.CashflowService.getSummary(_state.startDate, _state.endDate),
        window.CashflowService.listEntries({
          startDate: _state.startDate,
          endDate:   _state.endDate,
          direction: _state.direction || null,
          method:    _state.method    || null,
          onlyUnreconciled: _state.onlyUnreconciled,
        }),
        window.CashflowService.getIntelligence(year, month),
        window.CashflowService.getDre(year, month),
        window.CashflowService.getSegments(year, month),
        window.CashflowService.getTrends(year, month),
        window.CashflowService.getForecast(6),
      ])

      _state.summary      = (sumRes  && sumRes.ok)  ? sumRes.data  : {}
      _state.entries      = (listRes && listRes.ok) ? listRes.data : []
      _state.intelligence = (intelRes && intelRes.ok) ? intelRes.data : {}
      _state.dre          = (dreRes && dreRes.ok)    ? dreRes.data  : {}
      _state.segments     = (segRes && segRes.ok)    ? segRes.data  : {}
      _state.trends       = (trendsRes && trendsRes.ok) ? trendsRes.data : {}
      _state.forecast     = (fcRes && fcRes.ok)      ? fcRes.data   : {}
    } catch (e) {
      console.error('[CashflowUI] load error:', e)
      _state.summary = {}
      _state.entries = []
      _state.intelligence = {}
      _state.dre = {}
      _state.segments = {}
      _state.trends = {}
      _state.forecast = {}
    }

    _state.loading = false
    _renderBody()
  }

  // ── Render shell (cabecalho fixo) ─────────────────────────

  function _renderShell() {
    var root = document.getElementById('finCashflowRoot')
    if (!root) return

    root.innerHTML = ''
      + '<div style="padding:28px 32px;max-width:1200px;margin:0 auto">'

      // Breadcrumb
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">'
        + '<button onclick="navigateTo(\'fin-reports\')" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:13px;color:#6b7280">'
          + _icon('chevron-left', 14) + ' Relatorios'
        + '</button>'
        + '<span style="color:#d1d5db">/</span>'
        + '<span style="color:#10b981">' + _icon('dollar-sign', 14) + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:#111827">Fluxo de Caixa</span>'
      + '</div>'

      // Titulo + acoes
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap">'
        + '<div>'
          + '<h2 style="margin:0;font-size:22px;font-weight:700;color:#111827">Fluxo de Caixa</h2>'
          + '<p style="margin:4px 0 0;font-size:13px;color:#6b7280">Movimentos financeiros do periodo, vinculados a agendamentos quando possivel</p>'
        + '</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
          + _periodSelect()
          + '<div style="position:relative;display:inline-block">'
            + '<button id="cfExportBtn" title="Exportar / DAS / PDF" style="display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
              + _icon('download', 14) + ' Exportar'
            + '</button>'
            + '<div id="cfExportMenu" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);overflow:hidden;z-index:50;min-width:200px">'
              + '<button class="cf-export-opt" data-fmt="csv" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:12px 16px;font-size:13px;color:#111827">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                + 'Exportar CSV'
              + '</button>'
              + '<button class="cf-export-opt" data-fmt="pdf" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:12px 16px;font-size:13px;color:#111827;border-top:1px solid #f3f4f6">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                + 'Relatorio PDF mensal'
              + '</button>'
              + '<button class="cf-export-opt" data-fmt="das" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:12px 16px;font-size:13px;color:#111827;border-top:1px solid #f3f4f6">'
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>'
                + 'DAS estimado'
              + '</button>'
            + '</div>'
          + '</div>'
          + '<button id="cfConfigBtn" title="Configurar taxas e comissoes" style="display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('settings', 14) + ' Custos'
          + '</button>'
          + '<button id="cfBankBtn" title="Gerenciar bancos conectados (Pluggy)" style="display:flex;align-items:center;gap:6px;background:#fff;color:#8b5cf6;border:1.5px solid #ddd6fe;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('link', 14) + ' Bancos'
          + '</button>'
          + '<button id="cfReconcileBtn" title="Casar movimentos com agendamentos" style="display:flex;align-items:center;gap:6px;background:#fff;color:#6366f1;border:1.5px solid #c7d2fe;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('zap', 14) + ' Reconciliar'
          + '</button>'
          + '<button id="cfNewBtn" style="display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,.3)">'
            + _icon('plus', 14) + ' Novo Lancamento'
          + '</button>'
          + '<button id="cfImportBtn" title="Importar extrato OFX (Sicredi)" style="display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('upload', 14) + ' Importar OFX'
          + '</button>'
        + '</div>'
      + '</div>'

      // Body container (re-renderizado por _renderBody)
      + '<div id="cfBody"></div>'
    + '</div>'

    document.getElementById('cfNewBtn').addEventListener('click', function() { _openNewModal() })
    document.getElementById('cfImportBtn').addEventListener('click', function() {
      if (window.OfxImportUI && window.OfxImportUI.open) {
        window.OfxImportUI.open()
      } else {
        _toastWarn('Modulo de importacao OFX nao carregado. Recarregue a pagina (Ctrl+Shift+R).')
      }
    })
    document.getElementById('cfReconcileBtn').addEventListener('click', _runReconcile)
    document.getElementById('cfBankBtn').addEventListener('click', function() {
      if (window.PluggyConnectUI && window.PluggyConnectUI.open) {
        window.PluggyConnectUI.open()
      } else {
        _toastWarn('Modulo de conexao bancaria ainda nao carregado. Recarregue a pagina.')
      }
    })
    document.getElementById('cfConfigBtn').addEventListener('click', _openConfigModal)

    // Export menu (CSV / PDF / DAS)
    var exportBtn = document.getElementById('cfExportBtn')
    var exportMenu = document.getElementById('cfExportMenu')
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block'
      })
      document.addEventListener('click', function() { exportMenu.style.display = 'none' })
      document.querySelectorAll('.cf-export-opt').forEach(function(b) {
        b.addEventListener('click', async function(e) {
          e.stopPropagation()
          exportMenu.style.display = 'none'
          var fmt = b.getAttribute('data-fmt')
          var d = new Date(_state.startDate + 'T00:00:00')
          var y = d.getFullYear(), m = d.getMonth() + 1
          if (!window.CashflowExportUI) { _toastWarn('Modulo de export nao carregado'); return }
          if (fmt === 'csv') await window.CashflowExportUI.exportCsv(y, m)
          else if (fmt === 'pdf') await window.CashflowExportUI.exportPdfMensal(y, m)
          else if (fmt === 'das') await window.CashflowExportUI.showDasModal(y, m)
        })
        b.addEventListener('mouseenter', function() { b.style.background = '#f9fafb' })
        b.addEventListener('mouseleave', function() { b.style.background = '#fff' })
      })
    }
    _bindPeriodButtons()
  }

  function _periodSelect() {
    var p = _state.period || 'month'
    function btn(value, label) {
      var active = p === value
      return '<button class="cf-period-btn" data-period="' + value + '" style="all:unset;cursor:pointer;padding:9px 14px;font-size:12px;font-weight:600;color:' + (active ? '#fff' : '#6b7280') + ';background:' + (active ? '#10b981' : 'transparent') + ';border-radius:8px;transition:all .15s">' + label + '</button>'
    }
    return ''
      + '<div style="display:inline-flex;align-items:center;gap:2px;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:10px;padding:3px">'
        + btn('today',  'Hoje')
        + btn('week',   'Semana')
        + btn('month',  'Mes')
        + btn('custom', 'Periodo')
      + '</div>'
      + '<div id="cfCustomRange" style="display:' + (p === 'custom' ? 'inline-flex' : 'none') + ';align-items:center;gap:6px;margin-left:6px;background:#fff;border:1.5px solid #c7d2fe;border-radius:10px;padding:6px 10px">'
        + '<input type="date" id="cfCustomStart" value="' + (_state.startDate || '') + '" style="border:none;outline:none;font-size:12px;color:#374151;background:transparent">'
        + '<span style="color:#9ca3af;font-size:11px">ate</span>'
        + '<input type="date" id="cfCustomEnd" value="' + (_state.endDate || '') + '" style="border:none;outline:none;font-size:12px;color:#374151;background:transparent">'
        + '<button id="cfCustomApply" style="background:#6366f1;color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;margin-left:4px">Aplicar</button>'
      + '</div>'
  }

  function _bindPeriodButtons() {
    document.querySelectorAll('.cf-period-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        var p = b.getAttribute('data-period')
        if (p === 'custom') {
          // toggle do painel custom sem disparar load (espera o user clicar Aplicar)
          _state.period = 'custom'
          // Atualiza estilo dos botoes
          document.querySelectorAll('.cf-period-btn').forEach(function(x) {
            var active = x.getAttribute('data-period') === 'custom'
            x.style.color = active ? '#fff' : '#6b7280'
            x.style.background = active ? '#10b981' : 'transparent'
          })
          var range = document.getElementById('cfCustomRange')
          if (range) range.style.display = 'inline-flex'
          return
        }
        _onPeriodChange(p)
      })
    })
    var apply = document.getElementById('cfCustomApply')
    if (apply) {
      apply.addEventListener('click', function() {
        var s = document.getElementById('cfCustomStart').value
        var e = document.getElementById('cfCustomEnd').value
        if (!s || !e) { _toastWarn('Selecione data inicial e final'); return }
        if (s > e) { _toastWarn('Data inicial deve ser anterior a data final'); return }
        _state.period = 'custom'
        _state.startDate = s
        _state.endDate = e
        _loadData()
      })
    }
  }

  function _onPeriodChange(value) {
    _state.period = value
    var today = new Date()
    if (value === 'today') {
      var iso = _isoDate(today)
      _state.startDate = iso
      _state.endDate   = iso
    } else if (value === 'week') {
      // Segunda a Domingo da semana atual (BR padrao)
      var dow = today.getDay() // 0=Dom, 1=Seg, ..., 6=Sab
      var diffToMon = dow === 0 ? -6 : (1 - dow)
      var monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon)
      var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
      _state.startDate = _isoDate(monday)
      _state.endDate   = _isoDate(sunday)
    } else if (value === 'month') {
      var r = window.CashflowService.monthRange()
      _state.startDate = r.start
      _state.endDate   = r.end
    }
    _loadData()
  }

  function _isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  // ── Render body (KPIs + tabela) ───────────────────────────

  function _renderBody() {
    var body = document.getElementById('cfBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:13px">Carregando...</div>'
      return
    }

    var s   = _state.summary || {}
    var fmt = window.CashflowService.fmtCurrency
    var intel = _state.intelligence || {}
    var dre   = _state.dre || {}
    var seg   = _state.segments || {}
    var trends = _state.trends || {}
    var fc  = _state.forecast || {}

    body.innerHTML = ''
      // Painel Inteligencia
      + _intelligencePanel(intel)

      // DRE Liquido
      + _drePanel(dre)

      // Forecast / Cobertura de Despesas
      + _forecastPanel(fc)

      // Graficos / Visualizacao
      + _chartsPanel(trends)

      // Segmentacao Estrategica
      + _segmentsPanel(seg)

      // KPIs
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">'
        + _kpi('Entradas',     fmt(s.credits || 0),   '#10b981', _icon('arrow-down-circle', 16))
        + _kpi('Saidas',       fmt(s.debits  || 0),   '#ef4444', _icon('arrow-up-circle', 16))
        + _kpi('Saldo',        fmt(s.balance || 0),   (s.balance || 0) >= 0 ? '#10b981' : '#ef4444', _icon('dollar-sign', 16))
        + _kpi('Pendentes',    String(s.unreconciled || 0), '#f59e0b', _icon('alert-circle', 16), 'sem vinculo')
      + '</div>'

      // Quebra por metodo
      + _byMethod(s.by_method || {})

      // Filtros
      + _filters()

      // Tabela de movimentos
      + _table()
  }

  // ── Painel Inteligencia ───────────────────────────────────

  function _intelligencePanel(intel) {
    if (!intel || !intel.period) return ''

    var fmt = window.CashflowService.fmtCurrency
    var current     = intel.current     || {}
    var previous    = intel.previous    || {}
    var delta       = intel.delta       || {}
    var projection  = intel.projection  || {}
    var goal        = intel.goal        || {}
    var receivables = intel.receivables || {}
    var debtors     = intel.debtors     || {}
    var alerts      = intel.alerts      || []

    var html = ''
      // Header (light, premium, gold accent)
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-top:3px solid #c9a96e;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
          + '<span style="color:#c9a96e">' + _icon('zap', 18) + '</span>'
          + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">Inteligencia do Mes</div>'
          + '<span style="font-size:11px;color:#9ca3af;margin-left:auto">Dia ' + (intel.period.days_passed || 0) + ' de ' + (intel.period.days_in_month || 0) + '</span>'
        + '</div>'

        // Cards inteligencia (4 colunas)
        + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">'

          // Card 1: vs Mes anterior
          + _intelCard(
              'vs Mes Anterior',
              delta.credits_pct !== null && delta.credits_pct !== undefined
                ? (delta.credits_pct >= 0 ? '+' : '') + delta.credits_pct + '%'
                : '—',
              previous.credits ? 'Antes: ' + fmt(previous.credits) : 'Sem historico',
              delta.credits_pct >= 0 ? '#10b981' : '#ef4444',
              delta.credits_pct >= 0 ? 'trending-up' : 'trending-down'
            )

          // Card 2: Projecao fim do mes
          + _intelCard(
              'Projecao Fim do Mes',
              fmt(projection.projected_credits || 0),
              'Media diaria: ' + fmt(projection.daily_avg || 0),
              '#c9a96e',
              'target'
            )

          // Card 3: Meta
          + _intelCard(
              'Meta do Mes',
              goal.has_goal ? (goal.pct || 0) + '%' : '—',
              goal.has_goal
                ? fmt(goal.realized || 0) + ' / ' + fmt(goal.meta || 0)
                : 'Configurar em Metas',
              goal.has_goal && goal.pct >= 100 ? '#10b981' : goal.has_goal && goal.pct >= 50 ? '#f59e0b' : '#9ca3af',
              'flag'
            )

          // Card 4: Recebiveis 30d
          + _intelCard(
              'A Receber (30d)',
              fmt(receivables.total_30d || 0),
              (receivables.count || 0) + ' parcela(s) pendente(s)',
              '#3b82f6',
              'inbox'
            )

        + '</div>'

        // Linha 2 (sub-grid): Cobertura proximo mes
        + _coverageRow()

        // Linha 2: Inadimplentes (se houver)
        + (debtors.total > 0
          ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">'
            + '<div style="display:flex;align-items:center;gap:10px">'
              + '<span style="color:#ef4444">' + _icon('alert-circle', 16) + '</span>'
              + '<div>'
                + '<div style="font-size:12px;font-weight:600;color:#991b1b">Pacientes em aberto</div>'
                + '<div style="font-size:11px;color:#b91c1c">' + (debtors.count || 0) + ' paciente(s) devem total de <strong>' + fmt(debtors.total) + '</strong></div>'
              + '</div>'
            + '</div>'
            + '<button id="cfDebtorsBtn" style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">Ver lista</button>'
          + '</div>'
          : '')

        // Alertas
        + (alerts.length > 0
          ? '<div style="display:flex;flex-direction:column;gap:6px">'
            + alerts.map(function(a) {
                var bg = a.severity === 'success' ? '#f0fdf4' : a.severity === 'warning' ? '#fffbeb' : '#fef2f2'
                var bd = a.severity === 'success' ? '#bbf7d0' : a.severity === 'warning' ? '#fde68a' : '#fecaca'
                var col = a.severity === 'success' ? '#10b981' : a.severity === 'warning' ? '#f59e0b' : '#ef4444'
                var titleCol = a.severity === 'success' ? '#065f46' : a.severity === 'warning' ? '#92400e' : '#991b1b'
                return '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:10px">'
                  + '<span style="color:' + col + '">' + _icon(a.icon || 'alert-circle', 14) + '</span>'
                  + '<div style="font-size:11px"><strong style="color:' + titleCol + '">' + a.title + ':</strong> <span style="color:#6b7280">' + a.message + '</span></div>'
                  + '</div>'
              }).join('')
          + '</div>'
          : '')

      + '</div>'

    setTimeout(function() {
      var d = document.getElementById('cfDebtorsBtn')
      if (d) d.addEventListener('click', function() { _showDebtorsList(debtors.list || []) })
    }, 0)

    return html
  }

  // ── Painel DRE / Lucro Real ───────────────────────────────

  function _drePanel(dreData) {
    if (!dreData || !dreData.dre) return ''

    var d = dreData.dre
    var fmt = window.CashflowService.fmtCurrency
    var marginColor = d.margem_pct >= 30 ? '#10b981' : d.margem_pct >= 15 ? '#f59e0b' : '#ef4444'
    var marginLabel = d.margem_pct >= 30 ? 'Saudavel' : d.margem_pct >= 15 ? 'Atencao' : 'Critica'

    return ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
          + '<span style="color:#10b981">' + _icon('dollar-sign', 18) + '</span>'
          + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">DRE — Lucro Real</div>'
          + '<span style="background:' + marginColor + '22;color:' + marginColor + ';font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;margin-left:8px">' + marginLabel.toUpperCase() + ' • ' + (d.margem_pct || 0) + '%</span>'
          + '<button id="cfDreDetailsBtn" style="margin-left:auto;all:unset;cursor:pointer;font-size:11px;color:#6b7280;text-decoration:underline">Ver detalhes</button>'
        + '</div>'

        + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:center">'
          + _dreStep('Bruto',     fmt(d.bruto || 0),     '#10b981', false)
          + _dreOp('−')
          + _dreStep('Taxas',     fmt(d.taxa || 0),      '#f59e0b', true, 'cartao + boleto')
          + _dreOp('−')
          + _dreStep('Custos',    fmt(d.custo || 0),     '#f59e0b', true, 'procedimentos')
          + _dreOp('−')
          + _dreStep('Comissao',  fmt(d.comissao || 0),  '#f59e0b', true, 'especialistas')
          + _dreOp('−')
          + _dreStep('Despesas',  fmt(d.despesas || 0),  '#ef4444', true, 'operacionais')
          + _dreOp('=')
          + _dreStep('Liquido',   fmt(d.liquido || 0),   marginColor, false, 'no bolso')
        + '</div>'

        + (d.taxa === 0 && d.custo === 0 && d.comissao === 0
          ? '<div style="margin-top:12px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:11px;color:#92400e">'
            + _icon('alert-circle', 12) + ' <strong>Calculo aproximado:</strong> taxas, custos e comissoes ainda nao configurados. Clique em <strong>Custos</strong> no topo para ativar.'
          + '</div>'
          : '')
      + '</div>'
  }

  function _dreStep(label, value, color, dim, sub) {
    return ''
      + '<div style="text-align:center;padding:10px 6px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px">'
        + '<div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">' + label + '</div>'
        + '<div style="font-size:14px;font-weight:700;color:' + color + ';' + (dim ? 'opacity:.85' : '') + '">' + value + '</div>'
        + (sub ? '<div style="font-size:9px;color:#9ca3af;margin-top:2px">' + sub + '</div>' : '')
      + '</div>'
  }

  function _dreOp(op) {
    return '<div style="text-align:center;font-size:18px;font-weight:700;color:#9ca3af">' + op + '</div>'
  }

  // ── Painel Forecast / Cobertura de Despesas ───────────────

  function _forecastPanel(fc) {
    if (!fc || !fc.months) return ''

    var fmt = window.CashflowService.fmtCurrency
    var cfg = fc.config || {}
    var months = fc.months || []
    var summary = fc.summary || {}

    // Aviso quando faltam fixos cadastrados
    if ((cfg.fixos_count || 0) === 0) {
      return ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-top:3px solid #f59e0b;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
            + '<span style="color:#f59e0b">' + _icon('alert-circle', 18) + '</span>'
            + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">Forecast / Cobertura de Despesas</div>'
          + '</div>'
          + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e">'
            + '<strong>Cadastre seus gastos fixos primeiro</strong> em <a onclick="navigateTo(\'fin-goals\')" style="color:#92400e;text-decoration:underline;cursor:pointer">Financeiro &rsaquo; Metas Financeiras &rsaquo; Gastos</a>. '
            + 'Sem isso, nao da pra calcular se sua receita futura cobre o break-even.'
          + '</div>'
        + '</div>'
    }

    var monthLabel = function(m) {
      var months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
      var dt = new Date(m + 'T00:00:00')
      return months[dt.getMonth()] + '/' + String(dt.getFullYear()).slice(-2)
    }

    var html = ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-top:3px solid #6366f1;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
          + '<span style="color:#6366f1">' + _icon('target', 18) + '</span>'
          + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">Forecast — Cobertura de Despesas</div>'
          + '<span style="font-size:11px;color:#9ca3af;margin-left:auto">Fixos: <strong>' + fmt(cfg.total_fixos || 0) + '</strong>/mes &middot; ' + (cfg.fixos_count || 0) + ' itens</span>'
        + '</div>'

        // Aviso critico se houver
        + (summary.has_critical
          ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#991b1b">'
            + '<strong>' + _icon('alert-circle', 12) + ' ' + summary.critical_count + ' mes(es) critico(s):</strong> '
            + 'receita comprometida nao cobre os fixos. Vendas precisam acontecer pra fechar o mes.'
            + '</div>'
          : '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#065f46">'
            + '<strong>' + _icon('check-circle', 12) + ' Saudavel:</strong> '
            + 'todos os proximos meses tem receita comprometida suficiente pra cobrir os fixos.'
            + '</div>')

        // Tabela 6 meses
        + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Mes</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Comprometida</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Projetada</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Total Receita</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">(−) Fixos</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">(−) Variaveis</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">= Sobra</th>'
        + '<th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Cobertura</th>'
        + '</tr></thead><tbody>'

    months.forEach(function(m) {
      var statusColor = m.status === 'cobre' ? '#10b981' : m.status === 'risco' ? '#f59e0b' : '#ef4444'
      var statusBg    = m.status === 'cobre' ? '#f0fdf4' : m.status === 'risco' ? '#fffbeb' : '#fef2f2'
      var sobraColor  = m.sobra >= 0 ? '#10b981' : '#ef4444'
      var seasonalIcon = m.seasonal ? ' <span title="Mes critico (Jan-Carnaval)" style="color:#f59e0b">⚠</span>' : ''

      html += '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:10px 12px;color:#111827;font-weight:600">' + monthLabel(m.month) + seasonalIcon + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600">' + fmt(m.committed) + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:#9ca3af">' + fmt(m.projected) + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:#374151;font-weight:600">' + fmt(m.total_revenue) + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:#ef4444">' + fmt(m.fixos) + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:#ef4444">' + fmt(m.variaveis) + '</td>'
        + '<td style="padding:10px 12px;text-align:right;color:' + sobraColor + ';font-weight:700">' + fmt(m.sobra) + '</td>'
        + '<td style="padding:10px 12px;text-align:center"><span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px">' + m.cobertura_pct + '%</span></td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'

      // Legenda
      + '<div style="display:flex;gap:14px;margin-top:12px;font-size:10px;color:#9ca3af;flex-wrap:wrap">'
      + '<div><strong style="color:#10b981">Comprometida</strong> = parcelas ja vendidas</div>'
      + '<div><strong style="color:#9ca3af">Projetada</strong> = media historica 3m</div>'
      + '<div><strong style="color:#10b981">Cobertura ≥ 100%</strong> = ja paga fixos sem vender mais</div>'
      + '<div><strong style="color:#f59e0b">⚠ Mes critico</strong> = sazonalidade Jan/Fev/Mar (pos-Carnaval)</div>'
      + '</div>'

      + '</div>'

    return html
  }

  // ── Painel Graficos / Visualizacao ────────────────────────

  var _chartInstances = {}

  function _chartsPanel(trends) {
    if (!trends || !trends.daily) return ''

    var html = ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
          + '<span style="color:#3b82f6">' + _icon('bar-chart-2', 18) + '</span>'
          + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">Visualizacao</div>'
          + '<span style="font-size:11px;color:#9ca3af;margin-left:auto">Mes atual + historico</span>'
        + '</div>'

        // Grafico 1: linha receita do mes (full width)
        + '<div style="margin-bottom:18px">'
          + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Receita diaria do mes</div>'
          + '<div style="height:200px;position:relative"><canvas id="cfChartDaily"></canvas></div>'
        + '</div>'

        // Linha 2: 2 graficos lado a lado
        + '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:18px">'
          + '<div>'
            + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Ultimos 12 meses</div>'
            + '<div style="height:200px;position:relative"><canvas id="cfChartMonthly"></canvas></div>'
          + '</div>'
          + '<div>'
            + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por metodo de pagamento</div>'
            + '<div style="height:200px;position:relative"><canvas id="cfChartMethod"></canvas></div>'
          + '</div>'
        + '</div>'
      + '</div>'

    setTimeout(function() { _renderCharts(trends) }, 50)

    return html
  }

  function _renderCharts(trends) {
    if (typeof Chart === 'undefined') {
      console.warn('[CashflowUI] Chart.js nao carregado')
      return
    }

    // Destroi instancias antigas (re-render)
    Object.keys(_chartInstances).forEach(function(k) {
      try { _chartInstances[k].destroy() } catch (e) {}
    })
    _chartInstances = {}

    var fmt = window.CashflowService.fmtCurrency

    // Daily line
    var dailyCanvas = document.getElementById('cfChartDaily')
    if (dailyCanvas && trends.daily && trends.daily.length > 0) {
      var labels = trends.daily.map(function(d) {
        var dt = new Date(d.date + 'T00:00:00')
        return dt.getDate() + '/' + (dt.getMonth() + 1)
      })
      var credits = trends.daily.map(function(d) { return d.credits })
      var debits  = trends.daily.map(function(d) { return d.debits })
      var balance = trends.daily.map(function(d) { return d.balance })

      _chartInstances.daily = new Chart(dailyCanvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Entradas',
              data: credits,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16,185,129,.1)',
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 5,
            },
            {
              label: 'Saidas',
              data: debits,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239,68,68,.05)',
              fill: false,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { font: { size: 11 }, boxWidth: 12, padding: 12 },
            },
            tooltip: {
              callbacks: {
                label: function(ctx) { return ctx.dataset.label + ': ' + fmt(ctx.parsed.y) },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
              grid: { color: '#f3f4f6' },
              ticks: {
                font: { size: 10 },
                callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k' },
              },
            },
          },
        },
      })
    }

    // Monthly bar
    var monthlyCanvas = document.getElementById('cfChartMonthly')
    if (monthlyCanvas && trends.monthly && trends.monthly.length > 0) {
      var monthLabels = trends.monthly.map(function(m) {
        var dt = new Date(m.month + 'T00:00:00')
        var months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        return months[dt.getMonth()] + '/' + String(dt.getFullYear()).slice(-2)
      })
      var monthCredits = trends.monthly.map(function(m) { return m.credits })

      _chartInstances.monthly = new Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            label: 'Receita',
            data: monthCredits,
            backgroundColor: monthCredits.map(function(_, i) {
              return i === monthCredits.length - 1 ? '#10b981' : 'rgba(16,185,129,.4)'
            }),
            borderRadius: 4,
            barThickness: 18,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(ctx) { return fmt(ctx.parsed.y) },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
              grid: { color: '#f3f4f6' },
              ticks: {
                font: { size: 10 },
                callback: function(v) { return 'R$ ' + (v / 1000).toFixed(0) + 'k' },
              },
            },
          },
        },
      })
    }

    // Method pie
    var methodCanvas = document.getElementById('cfChartMethod')
    if (methodCanvas && trends.by_method && trends.by_method.length > 0) {
      var labelMap = window.CashflowService.methodLabel
      var pieLabels = trends.by_method.map(function(m) { return labelMap(m.method) })
      var pieValues = trends.by_method.map(function(m) { return m.amount })
      var palette = ['#10b981','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#ef4444','#84cc16','#6366f1','#f97316','#14b8a6','#a855f7']

      _chartInstances.method = new Chart(methodCanvas, {
        type: 'doughnut',
        data: {
          labels: pieLabels,
          datasets: [{
            data: pieValues,
            backgroundColor: palette.slice(0, pieLabels.length),
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                font: { size: 10 },
                boxWidth: 10,
                padding: 8,
              },
            },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  var total = ctx.dataset.data.reduce(function(s, v) { return s + v }, 0)
                  var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0
                  return ctx.label + ': ' + fmt(ctx.parsed) + ' (' + pct + '%)'
                },
              },
            },
          },
        },
      })
    }
  }

  // ── Painel Segmentacao Estrategica ────────────────────────

  var _segTab = 'procedure'

  function _segmentsPanel(seg) {
    if (!seg || (!seg.by_procedure && !seg.by_professional)) return ''

    var html = ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
          + '<span style="color:#8b5cf6">' + _icon('pie-chart', 18) + '</span>'
          + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111827">Segmentacao Estrategica</div>'
        + '</div>'

        + '<div style="display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #e5e7eb;padding-bottom:0;flex-wrap:wrap">'
          + _segTabBtn('procedure',    'Procedimentos', (seg.by_procedure || []).length)
          + _segTabBtn('professional', 'Especialistas', (seg.by_professional || []).length)
          + _segTabBtn('origem',       'Origem',        (seg.by_origem || []).length)
          + _segTabBtn('patients',     'Pacientes LTV', '')
          + _segTabBtn('heatmap',      'Dia x Hora',    (seg.heatmap || []).length)
        + '</div>'

        + '<div id="cfSegContent">' + _renderSegContent(seg, _segTab) + '</div>'
      + '</div>'

    setTimeout(function() {
      document.querySelectorAll('.cf-seg-tab').forEach(function(b) {
        b.addEventListener('click', function() {
          _segTab = b.getAttribute('data-tab')
          document.querySelectorAll('.cf-seg-tab').forEach(function(x) {
            var active = x.getAttribute('data-tab') === _segTab
            x.style.color = active ? '#111827' : '#9ca3af'
            x.style.borderBottom = active ? '2px solid #c9a96e' : '2px solid transparent'
          })
          var c = document.getElementById('cfSegContent')
          if (c) c.innerHTML = _renderSegContent(seg, _segTab)
        })
      })
    }, 0)

    return html
  }

  function _segTabBtn(id, label, count) {
    var active = id === _segTab
    return '<button class="cf-seg-tab" data-tab="' + id + '" style="all:unset;cursor:pointer;padding:8px 14px 10px;font-size:12px;font-weight:600;color:' + (active ? '#111827' : '#9ca3af') + ';border-bottom:2px solid ' + (active ? '#c9a96e' : 'transparent') + ';margin-bottom:-1px">'
      + label + '<span style="font-size:10px;color:#9ca3af;margin-left:6px">' + count + '</span>'
      + '</button>'
  }

  function _renderSegContent(seg, tab) {
    var fmt = window.CashflowService.fmtCurrency

    if (tab === 'procedure') {
      var data = seg.by_procedure || []
      if (data.length === 0) return _segEmpty('Nenhum dado de procedimento neste periodo')
      var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Procedimento</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Qtd</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Bruto</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Custo</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Taxa</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Comissao</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Liquido</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Margem</th>'
        + '</tr></thead><tbody>'

      data.forEach(function(p) {
        var marginColor = p.margem_pct >= 30 ? '#10b981' : p.margem_pct >= 15 ? '#f59e0b' : '#ef4444'
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:10px 12px;color:#111827"><strong>' + p.name + '</strong></td>'
          + '<td style="padding:10px 12px;text-align:right;color:#6b7280">' + p.qtd + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600">' + fmt(p.bruto) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#9ca3af">' + (p.custo > 0 ? fmt(p.custo) : '—') + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#9ca3af">' + (p.taxa > 0 ? fmt(p.taxa) : '—') + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#9ca3af">' + (p.comissao > 0 ? fmt(p.comissao) : '—') + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:' + marginColor + ';font-weight:700">' + fmt(p.liquido) + '</td>'
          + '<td style="padding:10px 12px;text-align:right"><span style="background:' + marginColor + '22;color:' + marginColor + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">' + p.margem_pct + '%</span></td>'
          + '</tr>'
      })
      html += '</tbody></table>'
      return html
    }

    if (tab === 'professional') {
      var data = seg.by_professional || []
      if (data.length === 0) return _segEmpty('Nenhum dado de especialista neste periodo')
      var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Especialista</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Atendimentos</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Ticket Medio</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Bruto</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Comissao</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Liquido</th>'
        + '</tr></thead><tbody>'

      data.forEach(function(p) {
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:10px 12px;color:#111827"><strong>' + p.name + '</strong></td>'
          + '<td style="padding:10px 12px;text-align:right;color:#6b7280">' + p.qtd + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#374151">' + fmt(p.ticket_medio) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600">' + fmt(p.bruto) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#f59e0b">' + (p.comissao > 0 ? fmt(p.comissao) : '—') + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:700">' + fmt(p.liquido) + '</td>'
          + '</tr>'
      })
      html += '</tbody></table>'
      return html
    }

    if (tab === 'origem') {
      var data = seg.by_origem || []
      if (data.length === 0) return _segEmpty('Nenhum dado de origem neste periodo')
      var total = data.reduce(function(s, x) { return s + Number(x.bruto || 0) }, 0)
      var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Origem</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Pacientes</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Atendimentos</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Ticket Medio</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Bruto</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">% Total</th>'
        + '</tr></thead><tbody>'

      data.forEach(function(o) {
        var pct = total > 0 ? ((o.bruto / total) * 100).toFixed(1) : 0
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:10px 12px;color:#111827"><strong>' + o.origem + '</strong></td>'
          + '<td style="padding:10px 12px;text-align:right;color:#6b7280">' + o.pacientes + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#6b7280">' + o.qtd + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#374151">' + fmt(o.ticket_medio_paciente) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600">' + fmt(o.bruto) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#8b5cf6;font-weight:600">' + pct + '%</td>'
          + '</tr>'
      })
      html += '</tbody></table>'
      return html
    }

    if (tab === 'heatmap') {
      var data = seg.heatmap || []
      if (data.length === 0) return _segEmpty('Nenhum dado de movimento neste periodo')
      return _renderHeatmap(data)
    }

    if (tab === 'patients') {
      // Carrega async via getPatientsLtv
      _loadPatientsTab()
      return '<div id="cfPatTabContent" style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">Carregando pacientes...</div>'
    }

    return ''
  }

  async function _loadPatientsTab() {
    try {
      var res = await window.CashflowService.getPatientsLtv(20, false)
      var div = document.getElementById('cfPatTabContent')
      if (!div) return
      if (!res || !res.ok) {
        div.innerHTML = _segEmpty('Erro ao carregar pacientes')
        return
      }
      var data = res.data || {}
      var pats = data.patients || []
      var stats = data.stats || {}
      var fmt = window.CashflowService.fmtCurrency

      if (pats.length === 0) {
        div.innerHTML = _segEmpty('Nenhum paciente com receita ainda. Vincule pacientes nas transacoes via botao verde +pessoa.')
        return
      }

      var rfmColors = {
        vip:      { bg: '#f0fdf4', col: '#10b981', label: 'VIP' },
        regular:  { bg: '#eff6ff', col: '#3b82f6', label: 'Regular' },
        novo:     { bg: '#f5f3ff', col: '#8b5cf6', label: 'Novo' },
        em_risco: { bg: '#fffbeb', col: '#f59e0b', label: 'Em Risco' },
        inativo:  { bg: '#fef2f2', col: '#ef4444', label: 'Inativo' },
        distante: { bg: '#f3f4f6', col: '#9ca3af', label: 'Distante' },
      }

      var html = '<div style="margin-bottom:12px;font-size:11px;color:#6b7280">Total: <strong>' + (stats.total_patients || 0) + '</strong> pacientes | LTV medio: <strong>' + fmt(stats.avg_ltv || 0) + '</strong> | Top 10% concentra <strong>' + (stats.top10_pct || 0) + '%</strong> da receita</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">#</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Paciente</th>'
        + '<th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Classe</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Visitas</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">LTV</th>'
        + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase">Recencia</th>'
        + '</tr></thead><tbody>'

      pats.forEach(function(p, i) {
        var c = rfmColors[p.rfm_class] || rfmColors.distante
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:10px 12px;color:#9ca3af">' + (i + 1) + '</td>'
          + '<td style="padding:10px 12px;color:#111827"><strong>' + p.name + '</strong></td>'
          + '<td style="padding:10px 12px;text-align:center"><span style="background:' + c.bg + ';color:' + c.col + ';font-size:9px;font-weight:700;padding:2px 8px;border-radius:5px">' + c.label.toUpperCase() + '</span></td>'
          + '<td style="padding:10px 12px;text-align:right;color:#6b7280">' + p.visit_days + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:700">' + fmt(p.monetary) + '</td>'
          + '<td style="padding:10px 12px;text-align:right;color:#9ca3af">' + (p.recency_days === 0 ? 'hoje' : p.recency_days + 'd') + '</td>'
          + '</tr>'
      })

      html += '</tbody></table>'
      div.innerHTML = html
    } catch (e) {
      console.warn('[CashflowUI] _loadPatientsTab:', e)
    }
  }

  function _renderHeatmap(data) {
    // Mapeia dados em uma matriz dow x hour
    var matrix = {}
    var maxValue = 0
    data.forEach(function(d) {
      if (!matrix[d.dow]) matrix[d.dow] = {}
      matrix[d.dow][d.hour] = d.total
      if (d.total > maxValue) maxValue = d.total
    })

    var dowLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    var hours = []
    for (var h = 6; h <= 22; h++) hours.push(h)

    var fmt = window.CashflowService.fmtCurrency

    var html = '<div style="overflow-x:auto"><table style="border-collapse:separate;border-spacing:3px;font-size:10px;margin:0 auto">'
      + '<thead><tr><th></th>'
    hours.forEach(function(h) {
      html += '<th style="padding:4px 0;color:#9ca3af;font-weight:600;width:32px">' + h + 'h</th>'
    })
    html += '</tr></thead><tbody>'

    for (var dow = 0; dow < 7; dow++) {
      html += '<tr><td style="padding:4px 8px;color:#6b7280;font-weight:600;text-align:right">' + dowLabels[dow] + '</td>'
      hours.forEach(function(h) {
        var v = matrix[dow] && matrix[dow][h] || 0
        var intensity = maxValue > 0 ? v / maxValue : 0
        var bg = v > 0
          ? 'rgba(16,185,129,' + (0.15 + intensity * 0.75) + ')'
          : '#f3f4f6'
        html += '<td title="' + dowLabels[dow] + ' ' + h + 'h: ' + fmt(v) + '" style="width:32px;height:24px;background:' + bg + ';border-radius:4px;text-align:center;color:' + (intensity > 0.5 ? '#fff' : '#374151') + ';font-weight:600">' + (v > 0 ? Math.round(v / 1000) + 'k' : '') + '</td>'
      })
      html += '</tr>'
    }
    html += '</tbody></table>'
      + '<div style="margin-top:12px;font-size:11px;color:#6b7280;text-align:center">Verde mais intenso = mais receita. Numeros em milhares.</div>'
      + '</div>'
    return html
  }

  function _segEmpty(msg) {
    return '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">' + msg + '</div>'
  }

  // ── Modal de Configuracao (Custos / Taxas / Comissoes) ────

  function _openConfigModal() {
    var existing = document.getElementById('cfConfigBackdrop')
    if (existing) existing.remove()

    var html = ''
      + '<div id="cfConfigBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Configurar Custos</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Taxas por metodo de pagamento e comissao por especialista</p>'
            + '</div>'
            + '<button id="cfCfgClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'
          + '<div id="cfCfgBody" style="padding:24px;overflow:auto;flex:1">Carregando...</div>'
          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button id="cfCfgCancel" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
            + '<button id="cfCfgSave" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>'
          + '</div>'
        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    document.getElementById('cfCfgClose').addEventListener('click', _closeConfigModal)
    document.getElementById('cfCfgCancel').addEventListener('click', _closeConfigModal)
    document.getElementById('cfConfigBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'cfConfigBackdrop') _closeConfigModal()
    })
    document.getElementById('cfCfgSave').addEventListener('click', _saveConfig)

    _loadConfigInModal()
  }

  function _closeConfigModal() {
    var b = document.getElementById('cfConfigBackdrop')
    if (b) b.remove()
  }

  async function _loadConfigInModal() {
    var res = await window.CashflowService.getConfig()
    var cfg = (res && res.ok) ? res.data : { fees: {}, commissions: {} }
    var fees = cfg.fees || {}
    var comm = cfg.commissions || {}

    var methods = window.CashflowService.PAYMENT_METHODS
    var label = window.CashflowService.methodLabel

    var html = ''
      + '<div style="margin-bottom:20px">'
        + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Taxa por metodo de pagamento (%)</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'

    methods.forEach(function(m) {
      var v = fees[m.id] !== undefined ? fees[m.id] : 0
      html += '<div style="display:flex;align-items:center;gap:8px">'
        + '<div style="flex:1;font-size:12px;color:#374151">' + m.label + '</div>'
        + '<input type="number" step="0.01" min="0" max="100" data-fee="' + m.id + '" value="' + v + '" style="width:70px;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:right">'
        + '<span style="font-size:11px;color:#9ca3af">%</span>'
        + '</div>'
    })

    html += '</div></div>'

      + '<div>'
        + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Comissao especialistas (%)</div>'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<div style="flex:1;font-size:12px;color:#374151">Comissao padrao (todos)</div>'
          + '<input type="number" step="0.5" min="0" max="100" id="cfCfgDefaultComm" value="' + (comm.default_pct || 0) + '" style="width:70px;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:right">'
          + '<span style="font-size:11px;color:#9ca3af">%</span>'
        + '</div>'
        + '<div style="margin-top:8px;padding:8px 10px;background:#f9fafb;border-radius:6px;font-size:11px;color:#6b7280">Comissao individual por especialista pode ser configurada via SQL ate a tela dedicada ser feita.</div>'
      + '</div>'

    document.getElementById('cfCfgBody').innerHTML = html
  }

  async function _saveConfig() {
    var fees = {}
    document.querySelectorAll('[data-fee]').forEach(function(input) {
      fees[input.getAttribute('data-fee')] = parseFloat(input.value || 0)
    })
    var defaultComm = parseFloat(document.getElementById('cfCfgDefaultComm').value || 0)

    var res = await window.CashflowService.saveConfig({
      fees: fees,
      commissions: { default_pct: defaultComm, by_professional: {} },
    })

    if (res && res.ok) {
      _closeConfigModal()
      _loadData()
    } else {
      _toastErr('Erro ao salvar config: ' + (res && res.error || 'desconhecido'))
    }
  }

  function _coverageRow() {
    var fc = _state.forecast || {}
    var months = fc.months || []
    if (months.length === 0) return ''
    var fmt = window.CashflowService.fmtCurrency
    // Pega o mes ATUAL (i=0) e o PROXIMO (i=1)
    var curr = months[0]
    var next = months[1]
    if (!curr) return ''

    function _mini(label, m) {
      if (!m) return ''
      var statusColor = m.status === 'cobre' ? '#10b981' : m.status === 'risco' ? '#f59e0b' : '#ef4444'
      var statusBg    = m.status === 'cobre' ? '#f0fdf4' : m.status === 'risco' ? '#fffbeb' : '#fef2f2'
      var statusLabel = m.status === 'cobre' ? 'Coberto' : m.status === 'risco' ? 'Em risco' : 'Critico'
      return ''
        + '<div style="background:' + statusBg + ';border:1px solid ' + statusColor + '40;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">'
          + '<div style="flex-shrink:0;width:42px;height:42px;border-radius:8px;background:' + statusColor + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">' + m.cobertura_pct + '%</div>'
          + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
            + '<div style="font-size:13px;font-weight:700;color:' + statusColor + ';margin:2px 0">' + statusLabel + '</div>'
            + '<div style="font-size:10px;color:#6b7280">Comprometido: ' + fmt(m.committed) + ' &middot; Fixos: ' + fmt(m.fixos) + '</div>'
          + '</div>'
        + '</div>'
    }

    return '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px">'
      + _mini('Mes Atual', curr)
      + (next ? _mini('Proximo Mes', next) : '')
      + '</div>'
  }

  function _intelCard(label, value, sub, color, iconName) {
    return ''
      + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
          + '<span style="color:' + color + '">' + _icon(iconName, 14) + '</span>'
          + '<div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">' + label + '</div>'
        + '</div>'
        + '<div style="font-size:20px;font-weight:700;color:' + color + ';margin-bottom:2px">' + value + '</div>'
        + '<div style="font-size:10px;color:#9ca3af">' + sub + '</div>'
      + '</div>'
  }

  function _showDebtorsList(list) {
    var existing = document.getElementById('cfDebtorsModal')
    if (existing) existing.remove()
    if (!list || list.length === 0) {
      _toastWarn('Nenhum paciente em aberto.')
      return
    }
    var fmt  = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate

    var html = '<div id="cfDebtorsModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
      + '<div style="background:#fff;border-radius:16px;width:100%;max-width:680px;max-height:80vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
        + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
          + '<div>'
            + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Pacientes em Aberto</h3>'
            + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">' + list.length + ' paciente(s) com saldo pendente</p>'
          + '</div>'
          + '<button onclick="document.getElementById(\'cfDebtorsModal\').remove()" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
        + '</div>'
        + '<div style="padding:0">'
          + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
            + '<thead><tr style="background:#f9fafb">'
              + '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Paciente</th>'
              + '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Data</th>'
              + '<th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Total</th>'
              + '<th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Pago</th>'
              + '<th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Saldo</th>'
            + '</tr></thead><tbody>'

    list.forEach(function(d) {
      html += '<tr style="border-top:1px solid #f3f4f6">'
        + '<td style="padding:12px 14px;color:#111827"><strong>' + (d.patient_name || 'Sem nome') + '</strong></td>'
        + '<td style="padding:12px 14px;color:#6b7280">' + fmtD(d.date) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#374151">' + fmt(d.valor) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#10b981">' + fmt(d.valor_pago) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#ef4444;font-weight:700">' + fmt(d.saldo) + '</td>'
        + '</tr>'
    })

    html += '</tbody></table></div></div></div>'
    document.body.insertAdjacentHTML('beforeend', html)
  }

  function _kpi(label, value, color, iconHtml, suffix) {
    return ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
          + '<span style="color:' + color + '">' + iconHtml + '</span>'
          + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
        + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + color + ';margin-bottom:2px">' + value + '</div>'
        + (suffix ? '<div style="font-size:11px;color:#9ca3af">' + suffix + '</div>' : '')
      + '</div>'
  }

  function _byMethod(byMethod) {
    var entries = Object.entries(byMethod || {})
    if (entries.length === 0) {
      return ''
    }
    var fmt = window.CashflowService.fmtCurrency
    var label = window.CashflowService.methodLabel
    var total = entries.reduce(function(s, e) { return s + Number(e[1] || 0) }, 0)

    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:24px">'
      + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Entradas por metodo</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:10px">'

    entries.sort(function(a, b) { return Number(b[1]) - Number(a[1]) }).forEach(function(e) {
      var pct = total > 0 ? ((Number(e[1]) / total) * 100).toFixed(1) : '0'
      html += ''
        + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;min-width:140px">'
          + '<div style="font-size:11px;color:#6b7280;font-weight:500;margin-bottom:2px">' + label(e[0]) + '</div>'
          + '<div style="font-size:15px;font-weight:700;color:#111827">' + fmt(e[1]) + '</div>'
          + '<div style="font-size:10px;color:#9ca3af">' + pct + '% do total</div>'
        + '</div>'
    })

    html += '</div></div>'
    return html
  }

  function _filters() {
    var methods = window.CashflowService.PAYMENT_METHODS
    var html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'
      + '<select id="cfFilterDir" style="background:#fff;border:1.5px solid #e5e7eb;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500">'
        + '<option value="">Todos</option>'
        + '<option value="credit"' + (_state.direction === 'credit' ? ' selected' : '') + '>Entradas</option>'
        + '<option value="debit"'  + (_state.direction === 'debit'  ? ' selected' : '') + '>Saidas</option>'
      + '</select>'
      + '<select id="cfFilterMethod" style="background:#fff;border:1.5px solid #e5e7eb;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500">'
        + '<option value="">Todos metodos</option>'

    methods.forEach(function(m) {
      html += '<option value="' + m.id + '"' + (_state.method === m.id ? ' selected' : '') + '>' + m.label + '</option>'
    })

    html += '</select>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer">'
        + '<input type="checkbox" id="cfFilterUnrec"' + (_state.onlyUnreconciled ? ' checked' : '') + ' style="cursor:pointer"> So nao reconciliados'
      + '</label>'
      + '<div style="margin-left:auto;font-size:12px;color:#6b7280">' + _state.entries.length + ' movimentos</div>'
    + '</div>'

    setTimeout(function() {
      var d = document.getElementById('cfFilterDir')
      var m = document.getElementById('cfFilterMethod')
      var u = document.getElementById('cfFilterUnrec')
      if (d) d.addEventListener('change', function(e) { _state.direction = e.target.value; _loadData() })
      if (m) m.addEventListener('change', function(e) { _state.method = e.target.value; _loadData() })
      if (u) u.addEventListener('change', function(e) { _state.onlyUnreconciled = e.target.checked; _loadData() })
    }, 0)

    return html
  }

  function _table() {
    if (_state.entries.length === 0) {
      return ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:48px;text-align:center">'
          + '<div style="color:#9ca3af;margin-bottom:8px">' + _icon('inbox', 36) + '</div>'
          + '<div style="font-size:14px;color:#6b7280">Nenhum movimento no periodo</div>'
          + '<div style="font-size:12px;color:#9ca3af;margin-top:4px">Clique em "Novo Lancamento" para comecar</div>'
        + '</div>'
    }

    var fmt   = window.CashflowService.fmtCurrency
    var fmtD  = window.CashflowService.fmtDate
    var label = window.CashflowService.methodLabel

    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead>'
          + '<tr style="background:#f9fafb">'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Data</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Descricao</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Metodo</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Paciente</th>'
            + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Valor</th>'
            + '<th style="padding:12px 14px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Status</th>'
            + '<th style="padding:12px 14px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb"></th>'
          + '</tr>'
        + '</thead>'
        + '<tbody>'

    _state.entries.forEach(function(e) {
      var isCredit = e.direction === 'credit'
      var color = isCredit ? '#10b981' : '#ef4444'
      var sign  = isCredit ? '+' : '-'
      var statusBadge = _statusBadge(e)

      html += ''
        + '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:12px 14px;color:#374151;white-space:nowrap">' + fmtD(e.transaction_date) + '</td>'
          + '<td style="padding:12px 14px;color:#111827">'
            + (e.description || '<span style="color:#9ca3af">(sem descricao)</span>')
            + (e.installment_number ? '<span style="font-size:11px;color:#6b7280;margin-left:6px">[' + e.installment_number + '/' + e.installment_total + ']</span>' : '')
          + '</td>'
          + '<td style="padding:12px 14px;color:#6b7280">' + label(e.payment_method) + '</td>'
          + '<td style="padding:12px 14px;color:#374151">' + (e.patient_name || '<span style="color:#9ca3af">—</span>') + '</td>'
          + '<td style="padding:12px 14px;text-align:right;font-weight:700;color:' + color + '">' + sign + ' ' + fmt(e.amount) + '</td>'
          + '<td style="padding:12px 14px;text-align:center">' + statusBadge + '</td>'
          + '<td style="padding:12px 14px;text-align:center;white-space:nowrap">'
            + (!e.patient_id
              ? '<button data-id="' + e.id + '" data-amount="' + e.amount + '" data-date="' + e.transaction_date + '" data-desc="' + (e.description || '').replace(/"/g, '&quot;') + '" class="cf-link-btn" style="all:unset;cursor:pointer;color:#10b981;padding:4px;margin-right:8px" title="Vincular paciente">' + _icon('user-plus', 14) + '</button>'
              : '')
            + '<button data-id="' + e.id + '" class="cf-del-btn" style="all:unset;cursor:pointer;color:#9ca3af;padding:4px" title="Excluir">' + _icon('trash-2', 14) + '</button>'
          + '</td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'

    setTimeout(function() {
      var btns = document.querySelectorAll('.cf-del-btn')
      btns.forEach(function(b) {
        b.addEventListener('click', function() {
          var id = b.getAttribute('data-id')
          if (confirm('Excluir este lancamento?')) _delete(id)
        })
      })
      var linkBtns = document.querySelectorAll('.cf-link-btn')
      linkBtns.forEach(function(b) {
        b.addEventListener('click', function() {
          _openLinkModal({
            id:     b.getAttribute('data-id'),
            amount: parseFloat(b.getAttribute('data-amount') || 0),
            date:   b.getAttribute('data-date'),
            desc:   b.getAttribute('data-desc'),
          })
        })
      })
    }, 0)

    return html
  }

  // ── Modal de Vinculacao Manual ────────────────────────────

  function _openLinkModal(entry) {
    var existing = document.getElementById('cfLinkModalBackdrop')
    if (existing) existing.remove()

    var fmt  = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate

    var html = ''
      + '<div id="cfLinkModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Vincular Paciente</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">' + fmtD(entry.date) + ' | ' + fmt(entry.amount) + (entry.desc ? ' | ' + entry.desc : '') + '</p>'
            + '</div>'
            + '<button id="cfLinkClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'

          + '<div style="padding:24px;display:flex;flex-direction:column;gap:14px">'

            // Sugestao automatica baseada em valor+data
            + '<div id="cfLinkAutoSuggest" style="display:none"></div>'

            // Busca de paciente
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Buscar paciente por nome</label>'
              + '<input type="text" id="cfLinkPatientSearch" placeholder="Digite pelo menos 2 letras..." style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '<div id="cfLinkPatientResults" style="display:none;max-height:200px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;margin-top:4px"></div>'
              + '<input type="hidden" id="cfLinkPatientId">'
              + '<input type="hidden" id="cfLinkAppointmentId">'
              + '<div id="cfLinkChosen" style="display:none;margin-top:8px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;color:#065f46"></div>'
            + '</div>'

          + '</div>'

          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button id="cfLinkCancel" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
            + '<button id="cfLinkSave" disabled style="background:#e5e7eb;color:#9ca3af;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:not-allowed">Vincular</button>'
          + '</div>'
        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    document.getElementById('cfLinkClose').addEventListener('click', _closeLinkModal)
    document.getElementById('cfLinkCancel').addEventListener('click', _closeLinkModal)
    document.getElementById('cfLinkModalBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'cfLinkModalBackdrop') _closeLinkModal()
    })

    var searchInput = document.getElementById('cfLinkPatientSearch')
    var debounceTimer
    searchInput.addEventListener('input', function() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function() { _linkSearchPatients(searchInput.value) }, 250)
    })

    document.getElementById('cfLinkSave').addEventListener('click', function() { _linkSave(entry.id) })

    // Busca candidatos automaticos por valor+data
    _loadAutoCandidates(entry)
  }

  function _closeLinkModal() {
    var b = document.getElementById('cfLinkModalBackdrop')
    if (b) b.remove()
  }

  async function _loadAutoCandidates(entry) {
    var res = await window.CashflowService.searchCandidates(entry.amount, entry.date, 3)
    if (!res || !res.ok || !res.data || res.data.length === 0) return

    var fmt  = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate
    var div = document.getElementById('cfLinkAutoSuggest')
    if (!div) return

    var html = '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px">'
      + '<div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Sugestoes (mesmo valor + data proxima)</div>'

    res.data.slice(0, 5).forEach(function(c) {
      html += '<button class="cf-link-cand" data-appt="' + c.id + '" data-patient="' + (c.patient_id || '') + '" data-name="' + (c.patient_name || '').replace(/"/g, '&quot;') + '" '
        + 'style="all:unset;cursor:pointer;display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px">'
        + '<div style="font-size:12px;color:#374151"><strong>' + (c.patient_name || 'Sem nome') + '</strong> | ' + fmtD(c.date) + ' | ' + fmt(c.valor || c.valor_pago || 0) + '</div>'
        + '<span style="font-size:11px;color:#10b981;font-weight:700">VINCULAR</span>'
        + '</button>'
    })

    html += '</div>'
    div.innerHTML = html
    div.style.display = 'block'

    document.querySelectorAll('.cf-link-cand').forEach(function(b) {
      b.addEventListener('click', function() {
        document.getElementById('cfLinkPatientId').value     = b.getAttribute('data-patient')
        document.getElementById('cfLinkAppointmentId').value = b.getAttribute('data-appt')
        var chosen = document.getElementById('cfLinkChosen')
        chosen.innerHTML = '✓ ' + b.getAttribute('data-name') + ' (com agendamento)'
        chosen.style.display = 'block'
        _enableLinkSave()
      })
    })
  }

  function _linkSearchPatients(q) {
    var resultsDiv = document.getElementById('cfLinkPatientResults')
    if (!q || q.length < 2) {
      resultsDiv.style.display = 'none'
      return
    }

    var leads = window.LeadsService && window.LeadsService.getLocal ? window.LeadsService.getLocal() : []
    var qLow = q.toLowerCase()
    var matches = leads.filter(function(l) {
      return (l.name || '').toLowerCase().indexOf(qLow) >= 0
    }).slice(0, 10)

    if (matches.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#9ca3af">Nenhum paciente encontrado</div>'
      resultsDiv.style.display = 'block'
      return
    }

    resultsDiv.innerHTML = matches.map(function(p) {
      return '<div class="cf-link-pat" data-id="' + p.id + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" style="padding:10px 12px;font-size:13px;color:#111827;cursor:pointer;border-bottom:1px solid #f3f4f6">'
        + '<strong>' + (p.name || 'Sem nome') + '</strong>'
        + '<span style="color:#9ca3af;margin-left:8px;font-size:11px">' + (p.phone || '') + '</span>'
        + '</div>'
    }).join('')
    resultsDiv.style.display = 'block'

    document.querySelectorAll('.cf-link-pat').forEach(function(it) {
      it.addEventListener('click', function() {
        var id   = it.getAttribute('data-id')
        var name = it.getAttribute('data-name')
        document.getElementById('cfLinkPatientId').value     = id
        document.getElementById('cfLinkAppointmentId').value = ''
        var chosen = document.getElementById('cfLinkChosen')
        chosen.innerHTML = '✓ ' + name + ' (sem agendamento vinculado)'
        chosen.style.display = 'block'
        document.getElementById('cfLinkPatientResults').style.display = 'none'
        document.getElementById('cfLinkPatientSearch').value = name
        _enableLinkSave()
      })
    })
  }

  function _enableLinkSave() {
    var btn = document.getElementById('cfLinkSave')
    btn.disabled = false
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)'
    btn.style.color = '#fff'
    btn.style.cursor = 'pointer'
  }

  async function _linkSave(entryId) {
    var patientId     = document.getElementById('cfLinkPatientId').value
    var appointmentId = document.getElementById('cfLinkAppointmentId').value

    if (!patientId) {
      _toastWarn('Selecione um paciente primeiro')
      return
    }

    var res
    if (appointmentId) {
      // Vincula appointment + paciente (com sinaliza manual + reconciled)
      res = await window.CashflowService.linkAppointment(entryId, appointmentId, patientId)
    } else {
      // So paciente, sem appointment → usa update_entry
      res = await window.CashflowService.updateEntry(entryId, {
        patient_id: patientId,
        match_confidence: 'manual',
      })
    }

    if (res && res.ok) {
      _closeLinkModal()
      _loadData()
    } else {
      _toastErr('Erro ao vincular: ' + (res && res.error || 'desconhecido'))
    }
  }

  function _statusBadge(e) {
    if (e.match_confidence === 'manual' || e.match_confidence === 'auto_high') {
      return '<span style="background:rgba(16,185,129,.12);color:#10b981;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">VINCULADO</span>'
    }
    if (e.match_confidence === 'pending_bank_confirmation') {
      return '<span style="background:rgba(245,158,11,.12);color:#f59e0b;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">AGUARDANDO</span>'
    }
    if (e.match_confidence === 'auto_low') {
      return '<span style="background:rgba(99,102,241,.12);color:#6366f1;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">SUGERIDO</span>'
    }
    return '<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">SEM VINCULO</span>'
  }

  // ── Auto-reconcile ────────────────────────────────────────

  async function _runReconcile(opts) {
    opts = opts || {}
    var btn = document.getElementById('cfReconcileBtn')
    if (btn) {
      btn.disabled = true
      btn.style.opacity = '0.6'
      btn.innerHTML = _icon('zap', 14) + ' Reconciliando...'
    }

    var res = await window.CashflowService.autoReconcile(_state.startDate, _state.endDate)
    var d = (res && res.ok) ? res.data : {}

    if (btn) {
      btn.disabled = false
      btn.style.opacity = '1'
      btn.innerHTML = _icon('zap', 14) + ' Reconciliar'
    }

    if (!opts.silent) {
      var msg = 'Reconciliacao concluida\n\n'
        + 'Processados: ' + (d.processed || 0) + '\n'
        + 'Vinculados automaticamente: ' + (d.auto_high || 0) + '\n'
        + 'Sugestoes (review): ' + (d.auto_low || 0) + '\n'
        + 'Sem match: ' + (d.no_match || 0) + '\n'
        + 'Confirmados pelo banco: ' + (d.pending_confirmed || 0)
      _toastWarn(msg)
    }

    await _loadData()
    if ((d.auto_low || 0) > 0) await _loadAndShowSuggestions()
  }

  async function _loadAndShowSuggestions() {
    var res = await window.CashflowService.getSuggestions(_state.startDate, _state.endDate)
    if (!res || !res.ok || !res.data || res.data.length === 0) return
    _renderSuggestionsPanel(res.data)
  }

  function _renderSuggestionsPanel(suggestions) {
    var existing = document.getElementById('cfSuggestionsPanel')
    if (existing) existing.remove()

    var fmt = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate

    var html = '<div id="cfSuggestionsPanel" style="background:#fff;border:1px solid #c7d2fe;border-radius:12px;padding:18px;margin-bottom:20px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
        + '<div style="display:flex;align-items:center;gap:10px">'
          + '<span style="color:#6366f1">' + _icon('zap', 18) + '</span>'
          + '<div>'
            + '<div style="font-size:14px;font-weight:700;color:#111827">Sugestoes de reconciliacao</div>'
            + '<div style="font-size:11px;color:#6b7280">' + suggestions.length + ' movimentos com mais de um agendamento candidato</div>'
          + '</div>'
        + '</div>'
        + '<button id="cfSuggClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:4px">' + _icon('x', 16) + '</button>'
      + '</div>'

    suggestions.forEach(function(s) {
      html += '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
          + '<div>'
            + '<div style="font-size:13px;font-weight:600;color:#111827">' + (s.description || 'Sem descricao') + '</div>'
            + '<div style="font-size:11px;color:#6b7280">' + fmtD(s.transaction_date) + ' | ' + fmt(s.amount) + '</div>'
          + '</div>'
          + '<button data-entry="' + s.entry_id + '" class="cf-sugg-reject" style="all:unset;cursor:pointer;color:#9ca3af;font-size:11px;text-decoration:underline">Ignorar</button>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'

      ;(s.candidates || []).forEach(function(c) {
        html += '<button class="cf-sugg-link" data-entry="' + s.entry_id + '" data-appt="' + c.appointment_id + '" data-patient="' + (c.patient_id || '') + '" '
          + 'style="all:unset;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">'
          + '<div style="font-size:12px;color:#374151">'
            + '<strong>' + (c.patient_name || 'Sem nome') + '</strong>'
            + ' | ' + fmtD(c.date)
            + (c.start_time ? ' ' + c.start_time.substring(0, 5) : '')
            + ' | ' + fmt(c.valor || c.valor_pago || 0)
          + '</div>'
          + '<span style="font-size:11px;color:#10b981;font-weight:600">VINCULAR ' + _icon('check-circle', 12) + '</span>'
          + '</button>'
      })

      html += '</div></div>'
    })

    html += '</div>'

    var body = document.getElementById('cfBody')
    if (body) body.insertAdjacentHTML('afterbegin', html)

    document.getElementById('cfSuggClose').addEventListener('click', function() {
      var p = document.getElementById('cfSuggestionsPanel')
      if (p) p.remove()
    })

    document.querySelectorAll('.cf-sugg-link').forEach(function(b) {
      b.addEventListener('click', async function() {
        var entryId = b.getAttribute('data-entry')
        var apptId  = b.getAttribute('data-appt')
        var patId   = b.getAttribute('data-patient') || null
        await window.CashflowService.linkAppointment(entryId, apptId, patId)
        _loadData()
        var p = document.getElementById('cfSuggestionsPanel')
        if (p) p.remove()
        setTimeout(_loadAndShowSuggestions, 300)
      })
    })

    document.querySelectorAll('.cf-sugg-reject').forEach(function(b) {
      b.addEventListener('click', async function() {
        var entryId = b.getAttribute('data-entry')
        await window.CashflowService.rejectSuggestion(entryId)
        _loadData()
        var p = document.getElementById('cfSuggestionsPanel')
        if (p) p.remove()
        setTimeout(_loadAndShowSuggestions, 300)
      })
    })
  }

  // ── Delete ────────────────────────────────────────────────

  async function _delete(id) {
    var res = await window.CashflowService.deleteEntry(id)
    if (res && res.ok) _loadData()
    else _toastErr('Erro ao excluir: ' + (res && res.error || 'desconhecido'))
  }

  // ── Modal Novo Lancamento ─────────────────────────────────

  function _openNewModal() {
    var existing = document.getElementById('cfModalBackdrop')
    if (existing) existing.remove()

    var methods = window.CashflowService.PAYMENT_METHODS
    var cats    = window.CashflowService.CATEGORIES
    var today   = window.CashflowService.todayISO()

    var html = ''
      + '<div id="cfModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
          // Header
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Novo Lancamento</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Registre uma entrada ou saida no fluxo de caixa</p>'
            + '</div>'
            + '<button id="cfModalClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'

          // Body
          + '<div style="padding:24px;display:flex;flex-direction:column;gap:14px">'
            // Tipo
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Tipo</label>'
              + '<div style="display:flex;gap:8px">'
                + '<button type="button" data-dir="credit" class="cf-dir-btn" style="flex:1;padding:10px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Entrada</button>'
                + '<button type="button" data-dir="debit" class="cf-dir-btn" style="flex:1;padding:10px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Saida</button>'
              + '</div>'
            + '</div>'
            // Data + Valor
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Data</label>'
                + '<input type="date" id="cfDate" value="' + today + '" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '</div>'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Valor (R$)</label>'
                + '<input type="number" id="cfAmount" step="0.01" min="0" placeholder="0,00" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '</div>'
            + '</div>'
            // Metodo + Categoria
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Metodo</label>'
                + '<select id="cfMethod" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
                  + methods.map(function(m) { return '<option value="' + m.id + '">' + m.label + '</option>' }).join('')
                + '</select>'
              + '</div>'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Categoria</label>'
                + '<select id="cfCategory" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
                  + cats.map(function(c) { return '<option value="' + c.id + '">' + c.label + '</option>' }).join('')
                + '</select>'
              + '</div>'
            + '</div>'
            // Descricao
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Descricao</label>'
              + '<input type="text" id="cfDesc" placeholder="Ex: Consulta paciente Maria Silva" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
            + '</div>'
            // Vincular paciente (opcional)
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Vincular paciente <span style="color:#9ca3af;font-weight:400">(opcional)</span></label>'
              + '<input type="text" id="cfPatientSearch" placeholder="Buscar paciente por nome..." style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '<div id="cfPatientResults" style="display:none;max-height:140px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;margin-top:4px"></div>'
              + '<input type="hidden" id="cfPatientId">'
              + '<input type="hidden" id="cfAppointmentId">'
              + '<div id="cfPatientChosen" style="display:none;margin-top:6px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;color:#065f46"></div>'
            + '</div>'
          + '</div>'

          // Footer
          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button id="cfModalCancel" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
            + '<button id="cfModalSave" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    var dir = 'credit'
    document.querySelectorAll('.cf-dir-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        dir = b.getAttribute('data-dir')
        document.querySelectorAll('.cf-dir-btn').forEach(function(x) {
          var isActive = x.getAttribute('data-dir') === dir
          var color = dir === 'credit' ? '#10b981' : '#ef4444'
          x.style.background = isActive ? color : '#fff'
          x.style.color      = isActive ? '#fff'  : '#6b7280'
          x.style.border     = isActive ? 'none'  : '1.5px solid #e5e7eb'
        })
      })
    })

    document.getElementById('cfModalClose').addEventListener('click', _closeModal)
    document.getElementById('cfModalCancel').addEventListener('click', _closeModal)
    document.getElementById('cfModalBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'cfModalBackdrop') _closeModal()
    })

    // Patient search
    var patSearch = document.getElementById('cfPatientSearch')
    var debounceTimer
    patSearch.addEventListener('input', function() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function() { _searchPatients(patSearch.value) }, 300)
    })

    document.getElementById('cfModalSave').addEventListener('click', function() { _save(dir) })
  }

  function _closeModal() {
    var b = document.getElementById('cfModalBackdrop')
    if (b) b.remove()
  }

  function _searchPatients(q) {
    var resultsDiv = document.getElementById('cfPatientResults')
    if (!q || q.length < 2) {
      resultsDiv.style.display = 'none'
      return
    }

    var leads = window.LeadsService ? (window.LeadsService.getLocal ? window.LeadsService.getLocal() : []) : []
    var qLow = q.toLowerCase()
    var matches = leads.filter(function(l) {
      return (l.name || '').toLowerCase().indexOf(qLow) >= 0
    }).slice(0, 8)

    if (matches.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#9ca3af">Nenhum paciente encontrado</div>'
      resultsDiv.style.display = 'block'
      return
    }

    resultsDiv.innerHTML = matches.map(function(p) {
      return '<div class="cf-pat-item" data-id="' + p.id + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" style="padding:10px 12px;font-size:13px;color:#111827;cursor:pointer;border-bottom:1px solid #f3f4f6">'
        + (p.name || 'Sem nome') + '<span style="color:#9ca3af;margin-left:8px">' + (p.phone || '') + '</span>'
        + '</div>'
    }).join('')
    resultsDiv.style.display = 'block'

    document.querySelectorAll('.cf-pat-item').forEach(function(it) {
      it.addEventListener('click', function() {
        var id   = it.getAttribute('data-id')
        var name = it.getAttribute('data-name')
        document.getElementById('cfPatientId').value = id
        var chosen = document.getElementById('cfPatientChosen')
        chosen.innerHTML = '✓ ' + name
        chosen.style.display = 'block'
        document.getElementById('cfPatientResults').style.display = 'none'
        document.getElementById('cfPatientSearch').value = name
      })
    })
  }

  async function _save(direction) {
    var data = {
      transaction_date: document.getElementById('cfDate').value,
      direction:        direction,
      amount:           parseFloat(document.getElementById('cfAmount').value || 0),
      payment_method:   document.getElementById('cfMethod').value,
      category:         document.getElementById('cfCategory').value,
      description:      document.getElementById('cfDesc').value || null,
      patient_id:       document.getElementById('cfPatientId').value || null,
      source:           'manual',
    }

    if (!data.transaction_date || !data.amount || data.amount <= 0) {
      _toastWarn('Preencha data e valor (maior que zero)')
      return
    }

    var res = await window.CashflowService.createEntry(data)
    if (res && res.ok) {
      _closeModal()
      _loadData()
    } else {
      _toastErr('Erro ao salvar: ' + (res && res.error || 'desconhecido'))
    }
  }

  // ── Icons ─────────────────────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    var icons = {
      'plus':              '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      'upload':            '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      'download':          '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      'dollar-sign':       '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      'arrow-down-circle': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>',
      'arrow-up-circle':   '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>',
      'alert-circle':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      'chevron-left':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'trash-2':           '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      'x':                 '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'inbox':             '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
      'zap':               '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      'link':              '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      'user-plus':         '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
      'trending-up':       '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
      'trending-down':     '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>',
      'target':            '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      'flag':              '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
      'settings':          '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      'check-circle':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    }
    return icons[name] || ''
  }

  // ── Expose ────────────────────────────────────────────────

  function setCustomRange(startDate, endDate) {
    _state.period = 'custom'
    _state.startDate = startDate
    _state.endDate = endDate
    _renderShell()  // re-renderiza header com botoes ja no estado custom
    _loadData()
  }

  window.CashflowUI = Object.freeze({
    init:           init,
    reload:         _loadData,
    runReconcile:   _runReconcile,
    showSuggestions: _loadAndShowSuggestions,
    setCustomRange: setCustomRange,
  })
})()
