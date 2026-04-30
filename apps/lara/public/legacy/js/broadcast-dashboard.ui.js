/**
 * ClinicAI — Broadcast Dashboard (extracted from automations.ui.js)
 *
 * Dashboard analytics: KPIs, period filters, line chart.
 * Uses BroadcastUI.getState().broadcasts for data.
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastDashboardLoaded) return
  window._clinicaiBroadcastDashboardLoaded = true

  // ── Shared helper aliases ───────────────────────────────────
  var _esc = function(s) { return window._clinicaiHelpers.esc(s) }
  var _feather = function(n, s) { return window._clinicaiHelpers.feather(n, s) }

  // ── Dashboard state ─────────────────────────────────────────
  var _bcDashPeriod = '7d'
  var _bcDashSort = 'sent'
  var _bcDashMetric = 'sent' // sent | rate | failed | targets

  // ── Helpers ─────────────────────────────────────────────────

  function _filterBroadcastsByPeriod(period) {
    var broadcasts = window.BroadcastUI.getState().broadcasts
    if (period === 'all') return broadcasts.slice()
    var now = new Date()
    var cutoff
    if (period === 'today') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    } else if (period === '7d') {
      cutoff = now.getTime() - 7 * 86400000
    } else if (period === 'month') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    } else if (period === '90d') {
      cutoff = now.getTime() - 90 * 86400000
    } else {
      return broadcasts.slice()
    }
    return broadcasts.filter(function(b) {
      var ts = b.created_at ? new Date(b.created_at).getTime() : 0
      return ts >= cutoff
    })
  }

  function _renderBcLineChart(filtered) {
    // Sort by date
    var sorted = filtered.slice().sort(function(a, b) {
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
    if (sorted.length === 0) return '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Sem dados no periodo</div>'

    // Metric selector tabs
    var metrics = [
      { key: 'sent', label: 'Enviados', color: '#10B981' },
      { key: 'rate', label: 'Taxa envio', color: '#C9A96E' },
      { key: 'dlv', label: 'Entregues', color: '#0EA5E9' },
      { key: 'dlv_rate', label: 'Taxa entrega', color: '#0284C7' },
      { key: 'read', label: 'Lidos', color: '#8B5CF6' },
      { key: 'read_rate', label: 'Taxa leitura', color: '#7C3AED' },
      { key: 'resp', label: 'Responderam', color: '#2563EB' },
      { key: 'resp_rate', label: 'Taxa resposta', color: '#1D4ED8' },
      { key: 'failed', label: 'Falhas', color: '#EF4444' },
      { key: 'targets', label: 'Destinatarios', color: '#6B7280' }
    ]
    var metricTabs = '<div class="bc-dash-metric-tabs">'
    metrics.forEach(function(m) {
      metricTabs += '<button class="bc-dash-metric-tab' + (_bcDashMetric === m.key ? ' active' : '') + '" data-metric="' + m.key + '" style="' + (_bcDashMetric === m.key ? 'border-color:' + m.color + ';color:' + m.color : '') + '">' + m.label + '</button>'
    })
    metricTabs += '</div>'

    // Get values per broadcast for selected metric
    var activeMetric = metrics.find(function(m) { return m.key === _bcDashMetric }) || metrics[0]
    var isPercentMetric = ['rate','dlv_rate','read_rate','resp_rate'].indexOf(_bcDashMetric) >= 0
    var values = sorted.map(function(b) {
      var sent = b.sent_count || 0
      var targets = b.total_targets || 0
      var responded = b.responded || 0
      var delivered = b.delivered || 0
      var readCount = b.read || 0
      if (_bcDashMetric === 'sent') return sent
      if (_bcDashMetric === 'rate') return targets > 0 ? Math.round((sent / targets) * 100) : 0
      if (_bcDashMetric === 'dlv') return delivered
      if (_bcDashMetric === 'dlv_rate') return sent > 0 ? Math.round((delivered / sent) * 100) : 0
      if (_bcDashMetric === 'read') return readCount
      if (_bcDashMetric === 'read_rate') return sent > 0 ? Math.round((readCount / sent) * 100) : 0
      if (_bcDashMetric === 'resp') return responded
      if (_bcDashMetric === 'resp_rate') return sent > 0 ? Math.round((responded / sent) * 100) : 0
      if (_bcDashMetric === 'failed') return b.failed_count || 0
      if (_bcDashMetric === 'targets') return targets
      return 0
    })
    var labels = sorted.map(function(b) {
      var d = b.created_at ? new Date(b.created_at) : null
      return d ? (d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0')) : '-'
    })
    var names = sorted.map(function(b) { return b.name || '' })

    var maxVal = Math.max.apply(null, values)
    if (maxVal <= 0) maxVal = 1

    // SVG
    var W = 500, H = 180, PAD = 40, PADR = 15, PADT = 10, PADB = 40
    var chartW = W - PAD - PADR
    var chartH = H - PADT - PADB
    var n = values.length

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'

    // Y grid + labels
    for (var i = 0; i <= 4; i++) {
      var yVal = isPercentMetric ? (i * 25) : Math.round(maxVal * i / 4)
      var yPos = PADT + chartH - (i / 4) * chartH
      svg += '<text x="' + (PAD - 5) + '" y="' + (yPos + 3) + '" text-anchor="end" fill="#9CA3AF" font-size="9">' + yVal + (isPercentMetric ? '%' : '') + '</text>'
      svg += '<line x1="' + PAD + '" y1="' + yPos + '" x2="' + (W - PADR) + '" y2="' + yPos + '" stroke="#E5E7EB" stroke-dasharray="3,3"/>'
    }

    // X labels (broadcast names + dates)
    for (var j = 0; j < n; j++) {
      var x = PAD + (n > 1 ? (j / (n - 1)) * chartW : chartW / 2)
      svg += '<text x="' + x + '" y="' + (H - 18) + '" text-anchor="middle" fill="#6B7280" font-size="7" font-weight="600">' + _esc(names[j]).substring(0, 4) + '</text>'
      svg += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#9CA3AF" font-size="8">' + labels[j] + '</text>'
    }

    // Axis
    svg += '<line x1="' + PAD + '" y1="' + PADT + '" x2="' + PAD + '" y2="' + (PADT + chartH) + '" stroke="#E5E7EB"/>'

    // Line + area fill
    var yMaxChart = isPercentMetric ? 100 : maxVal
    var points = values.map(function(v, idx) {
      var px = PAD + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2)
      var py = PADT + chartH - (v / yMaxChart) * chartH
      return px.toFixed(1) + ',' + py.toFixed(1)
    })

    // Area fill
    var firstX = PAD + (n > 1 ? 0 : chartW / 2)
    var lastX = PAD + (n > 1 ? chartW : chartW / 2)
    var areaBottom = (PADT + chartH).toFixed(1)
    svg += '<polygon points="' + firstX.toFixed(1) + ',' + areaBottom + ' ' + points.join(' ') + ' ' + lastX.toFixed(1) + ',' + areaBottom + '" fill="' + activeMetric.color + '" opacity="0.08"/>'

    // Line
    svg += '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + activeMetric.color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'

    // Interactive dots with hover effect
    values.forEach(function(v, idx) {
      var px = PAD + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2)
      var py = PADT + chartH - (v / yMaxChart) * chartH
      var valLabel = v + (isPercentMetric ? '%' : '')
      var nameLabel = _esc(names[idx]).substring(0, 15)
      // Hover group
      svg += '<g class="bc-chart-dot">'
      // Vertical guide line (hidden, shows on hover)
      svg += '<line x1="' + px.toFixed(1) + '" y1="' + PADT + '" x2="' + px.toFixed(1) + '" y2="' + (PADT + chartH) + '" stroke="' + activeMetric.color + '" stroke-width="1" stroke-dasharray="3,3" class="bc-chart-guide"/>'
      // Hit area (invisible, larger for easier hover)
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="16" fill="transparent" class="bc-chart-hit"/>'
      // Dot
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4" fill="#fff" stroke="' + activeMetric.color + '" stroke-width="2" class="bc-chart-circle"/>'
      // Value label (always visible)
      svg += '<text x="' + px.toFixed(1) + '" y="' + (py - 10) + '" text-anchor="middle" fill="' + activeMetric.color + '" font-size="9" font-weight="700" class="bc-chart-val">' + valLabel + '</text>'
      // Tooltip background + text (hidden, shows on hover)
      var tooltipY = py - 32
      if (tooltipY < 5) tooltipY = py + 20
      svg += '<rect x="' + (px - 40).toFixed(1) + '" y="' + (tooltipY - 10) + '" width="80" height="22" rx="4" fill="#1a1a1a" opacity="0.9" class="bc-chart-tooltip"/>'
      svg += '<text x="' + px.toFixed(1) + '" y="' + (tooltipY + 4) + '" text-anchor="middle" fill="#fff" font-size="8" font-weight="600" class="bc-chart-tooltip">' + nameLabel + ' — ' + valLabel + '</text>'
      svg += '</g>'
    })

    svg += '</svg>'

    return '<div class="bc-dash-chart">' + metricTabs + svg + '</div>'
  }

  function _renderBroadcastDashboard() {
    var filtered = _filterBroadcastsByPeriod(_bcDashPeriod)

    // KPI calculations
    var totalDisparos = filtered.length
    var totalEnviados = 0
    var totalTargets = 0
    var totalCompleted = 0
    var totalResponded = 0
    var totalDelivered = 0
    var totalRead = 0
    filtered.forEach(function(b) {
      totalEnviados += (b.sent_count || 0)
      totalTargets += (b.total_targets || 0)
      totalResponded += (b.responded || 0)
      totalDelivered += (b.delivered || 0)
      totalRead += (b.read || 0)
      if (b.status === 'completed') totalCompleted++
    })
    var taxaEnvio = totalTargets > 0 ? Math.round((totalEnviados / totalTargets) * 100) : 0
    var taxaEntrega = totalEnviados > 0 ? Math.round((totalDelivered / totalEnviados) * 100) : 0
    var taxaLeitura = totalEnviados > 0 ? Math.round((totalRead / totalEnviados) * 100) : 0
    var taxaResposta = totalEnviados > 0 ? Math.round((totalResponded / totalEnviados) * 100) : 0

    var html = '<div class="bc-dashboard">'

    // Period filter tabs
    html += '<div class="bc-dash-top-row">'
    html += '<div class="bc-dash-filters">'
    var periods = [
      { key: 'today', label: 'Hoje' },
      { key: '7d', label: '7 dias' },
      { key: 'month', label: 'Mes' },
      { key: '90d', label: '90 dias' },
      { key: 'all', label: 'Todos' }
    ]
    periods.forEach(function(p) {
      html += '<button class="bc-dash-filter' + (_bcDashPeriod === p.key ? ' active' : '') + '" data-period="' + p.key + '">' + p.label + '</button>'
    })
    html += '</div>'
    // Botao Novo Disparo removido do dashboard — ja existe no panel lateral
    html += '</div>'

    // KPI cards
    html += '<div class="bc-dash-kpis">'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + totalDisparos + '</span><span class="bc-dash-kpi-lbl">Disparos</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + totalEnviados + '</span><span class="bc-dash-kpi-lbl">Enviados</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + taxaEnvio + '%</span><span class="bc-dash-kpi-lbl">Taxa envio</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + taxaEntrega + '%</span><span class="bc-dash-kpi-lbl">Taxa entrega</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + taxaLeitura + '%</span><span class="bc-dash-kpi-lbl">Taxa leitura</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + totalResponded + '</span><span class="bc-dash-kpi-lbl">Responderam</span></div>'
    html += '<div class="bc-dash-kpi"><span class="bc-dash-kpi-val">' + taxaResposta + '%</span><span class="bc-dash-kpi-lbl">Taxa resp.</span></div>'
    html += '</div>'

    // Line chart
    html += _renderBcLineChart(filtered)

    html += '</div>' // close dashboard
    return html
  }

  // ── Expose ──────────────────────────────────────────────────

  window.BroadcastDashboard = Object.freeze({
    render: _renderBroadcastDashboard,
    getState: function() { return { period: _bcDashPeriod, sort: _bcDashSort, metric: _bcDashMetric } },
    setState: function(key, val) {
      if (key === 'bcDashPeriod') _bcDashPeriod = val
      if (key === 'bcDashSort') _bcDashSort = val
      if (key === 'bcDashMetric') _bcDashMetric = val
    }
  })

})()
