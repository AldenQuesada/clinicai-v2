/**
 * ClinicAI — Analytics Dashboard (WhatsApp & Lara)
 * Metricas de conversao, funil, cadencia, custos
 * Renderiza em #analytics-root na page-analytics
 */
;(function () {
  'use strict'
  if (window._clinicaiAnalyticsUILoaded) return
  window._clinicaiAnalyticsUILoaded = true

  let _data = {}
  let _loading = true
  let _period = 30

  function _root() { return document.getElementById('analytics-root') }

  function _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') }

  function _svg(name, size) {
    size = size || 16
    var paths = {
      barChart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
      trendingUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      dollarSign: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    }
    return '<svg width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + (paths[name] || '') + '</svg>'
  }

  async function init() {
    _loading = true
    _render()
    await _loadData()
    _loading = false
    _render()
  }

  async function _loadData() {
    var sb = window._sbShared
    if (!sb) return

    async function rpc(name, params) {
      try {
        var res = await sb.rpc(name, params || {})
        if (res.error) { console.warn('[Analytics] RPC ' + name + ':', res.error.message); return null }
        return res.data
      } catch(e) { return null }
    }

    var p = { p_days: _period }
    var results = await Promise.all([
      rpc('wa_analytics_overview', p),
      rpc('wa_analytics_funnel', p),
      rpc('wa_analytics_daily', p),
      rpc('wa_analytics_cadence', p),
      rpc('wa_analytics_top_tags', p)
    ])

    _data = {
      overview: results[0] || {},
      funnel: results[1] || [],
      daily: results[2] || [],
      cadence: results[3] || [],
      tags: results[4] || []
    }
  }

  function _render() {
    var root = _root()
    if (!root) return

    if (_loading) {
      root.innerHTML = '<div class="anl-page"><div class="anl-loading"><div class="ibx-spinner"></div><span>Carregando metricas...</span></div></div>'
      return
    }

    var o = _data.overview || {}

    root.innerHTML =
      '<div class="anl-page">' +
        _renderHeader() +
        _renderKPIs(o) +
        '<div class="anl-grid">' +
          _renderFunnel() +
          _renderDaily() +
          _renderCadence() +
          _renderTags() +
        '</div>' +
      '</div>'

    _bindEvents(root)
  }

  function _renderHeader() {
    return '<div class="anl-header">' +
      '<div><h1 class="anl-title">Analytics WhatsApp & Lara</h1>' +
      '<p class="anl-subtitle">Metricas de conversao, custo e performance</p></div>' +
      '<div class="anl-period">' +
        _periodBtn(7, '7 dias') +
        _periodBtn(30, '30 dias') +
        _periodBtn(90, '90 dias') +
      '</div>' +
    '</div>'
  }

  function _periodBtn(days, label) {
    return '<button class="anl-period-btn' + (_period === days ? ' anl-period-active' : '') + '" data-period="' + days + '">' + label + '</button>'
  }

  function _renderKPIs(o) {
    var avgTime = o.avg_response_time_seconds || 0
    var avgTimeLabel = avgTime < 60 ? Math.round(avgTime) + 's' : Math.round(avgTime / 60) + 'min'

    return '<div class="anl-kpis">' +
      _kpi('Conversas', o.total_conversations || 0, _svg('messageCircle', 16), '#2563EB', 'Ativas: ' + (o.active_conversations || 0)) +
      _kpi('Mensagens', (o.total_messages_inbound || 0) + (o.total_messages_outbound || 0), _svg('zap', 16), '#7C3AED',
        'In: ' + (o.total_messages_inbound || 0) + ' | Out: ' + (o.total_messages_outbound || 0)) +
      _kpi('Tempo Resposta', avgTimeLabel, _svg('clock', 16), '#059669', 'Media Lara + Secretaria') +
      _kpi('Tokens IA', (o.total_tokens_used || 0).toLocaleString(), _svg('dollarSign', 16), '#D97706',
        'Msgs IA: ' + (o.total_ai_messages || 0) + ' | Humano: ' + (o.total_secretary_messages || 0)) +
    '</div>'
  }

  function _kpi(label, value, icon, color, sub) {
    return '<div class="anl-kpi">' +
      '<div class="anl-kpi-label">' + icon + ' ' + label + '</div>' +
      '<div class="anl-kpi-value" style="color:' + color + '">' + value + '</div>' +
      '<div class="anl-kpi-sub">' + (sub || '') + '</div>' +
    '</div>'
  }

  function _renderFunnel() {
    var funnels = _data.funnel || []
    if (funnels.length === 0) return '<div class="anl-section"><div class="anl-section-title">' + _svg('trendingUp', 16) + ' Funil de Conversao</div><div style="color:var(--text-secondary);font-size:13px">Sem dados suficientes</div></div>'

    var html = '<div class="anl-section"><div class="anl-section-title">' + _svg('trendingUp', 16) + ' Funil de Conversao</div>'

    for (var f = 0; f < funnels.length; f++) {
      var fn = funnels[f]
      var maxVal = fn.total_leads || 1
      var funnelName = fn.funnel_name === 'fullface' ? 'Full Face' : fn.funnel_name === 'procedimentos' ? 'Procedimentos' : 'Geral'
      var color = fn.funnel_name === 'fullface' ? '#7C3AED' : fn.funnel_name === 'procedimentos' ? '#2563EB' : '#6B7280'

      html += '<div style="margin-bottom:12px;font-size:12px;font-weight:700;color:' + color + '">' + funnelName + ' (taxa: ' + (fn.conversion_rate || 0) + '%)</div>'
      html += '<div class="anl-funnel">'

      var steps = [
        { label: 'Leads', value: fn.total_leads || 0 },
        { label: 'Contactados', value: fn.contacted || 0 },
        { label: 'Qualificados', value: fn.qualified || 0 },
        { label: 'Interessados', value: fn.interested || 0 },
        { label: 'Agendados', value: fn.scheduled || 0 },
        { label: 'Convertidos', value: fn.converted || 0 }
      ]

      for (var s = 0; s < steps.length; s++) {
        var pct = maxVal > 0 ? Math.round((steps[s].value / maxVal) * 100) : 0
        var width = Math.max(pct, 2)
        html += '<div class="anl-funnel-step">' +
          '<span class="anl-funnel-label">' + steps[s].label + '</span>' +
          '<div class="anl-funnel-bar" style="width:' + width + '%;background:' + color + '20;border:1px solid ' + color + '40"></div>' +
          '<span class="anl-funnel-value">' + steps[s].value + '</span>' +
          '<span class="anl-funnel-pct">(' + pct + '%)</span>' +
        '</div>'
      }

      html += '</div>'
    }

    html += '</div>'
    return html
  }

  function _renderDaily() {
    var daily = _data.daily || []
    if (daily.length === 0) return '<div class="anl-section"><div class="anl-section-title">' + _svg('barChart', 16) + ' Mensagens por Dia</div><div style="color:var(--text-secondary);font-size:13px">Sem dados</div></div>'

    var maxMsgs = 1
    for (var i = 0; i < daily.length; i++) {
      var total = (daily[i].messages_inbound || 0) + (daily[i].messages_outbound || 0)
      if (total > maxMsgs) maxMsgs = total
    }

    var barsHtml = ''
    var showCount = Math.min(daily.length, 30)
    var start = daily.length - showCount

    for (var i = start; i < daily.length; i++) {
      var d = daily[i]
      var total = (d.messages_inbound || 0) + (d.messages_outbound || 0)
      var height = Math.max((total / maxMsgs) * 100, 2)
      var dateLabel = (d.date || '').substring(5, 10)
      barsHtml += '<div class="anl-chart-bar" style="height:' + height + '%" data-label="' + dateLabel + '" data-value="' + total + '"></div>'
    }

    return '<div class="anl-section"><div class="anl-section-title">' + _svg('barChart', 16) + ' Mensagens por Dia</div>' +
      '<div class="anl-chart" style="margin-bottom:24px">' + barsHtml + '</div></div>'
  }

  function _renderCadence() {
    var cadence = _data.cadence || []
    if (cadence.length === 0) return '<div class="anl-section"><div class="anl-section-title">' + _svg('zap', 16) + ' Performance Cadencia</div><div style="color:var(--text-secondary);font-size:13px">Sem disparos ainda</div></div>'

    var rows = ''
    for (var i = 0; i < cadence.length; i++) {
      var c = cadence[i]
      rows += '<tr>' +
        '<td>' + _esc(c.template_name || c.template_slug) + '</td>' +
        '<td>' + (c.sent_count || 0) + '</td>' +
        '<td>' + (c.response_count || 0) + '</td>' +
        '<td style="font-weight:700;color:' + ((c.response_rate || 0) > 20 ? '#059669' : '#D97706') + '">' + (c.response_rate || 0) + '%</td>' +
      '</tr>'
    }

    return '<div class="anl-section"><div class="anl-section-title">' + _svg('zap', 16) + ' Performance Cadencia</div>' +
      '<table class="anl-table"><thead><tr><th>Template</th><th>Enviados</th><th>Respostas</th><th>Taxa</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>'
  }

  function _renderTags() {
    var tags = _data.tags || []
    if (tags.length === 0) return '<div class="anl-section"><div class="anl-section-title">' + _svg('tag', 16) + ' Tags Mais Frequentes</div><div style="color:var(--text-secondary);font-size:13px">Sem tags</div></div>'

    var html = '<div class="anl-section"><div class="anl-section-title">' + _svg('tag', 16) + ' Tags Mais Frequentes</div><div class="anl-tags">'
    for (var i = 0; i < tags.length; i++) {
      html += '<div class="anl-tag-item"><span class="anl-tag-count">' + (tags[i].count || 0) + '</span> ' + _esc(tags[i].tag_name) + '</div>'
    }
    html += '</div></div>'
    return html
  }

  function _bindEvents(root) {
    root.querySelectorAll('.anl-period-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        _period = parseInt(btn.dataset.period)
        _loading = true
        _render()
        await _loadData()
        _loading = false
        _render()
      })
    })
  }

  window.AnalyticsUI = Object.freeze({ init: init })
})()
