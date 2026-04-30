/* ============================================================
   ClinicAI — Relatórios Financeiros (Hub + Sub-relatórios)

   Arquitetura modular:
     • FinReports.render()        → hub de navegação (fin-reports)
     • FinReports.renderPage(id)  → sub-relatório individual

   Sub-relatórios suportados:
     fin-billing        Faturamento
     fin-receipts       Recebimentos
     fin-default        Inadimplência
     fin-ticket         Ticket Médio
     fin-conversion     Conversão em Receita
     fin-commissions    Comissões
     fin-by-procedure   Receita por Procedimento
     fin-by-patient     Receita por Paciente
     fin-by-campaign    Receita por Campanha

   Cada sub-relatório é um IIFE autônomo. O hub nunca instancia
   lógica de negócio — apenas orquestra navegação visual.
   ============================================================ */

'use strict';

window.FinReports = (() => {

  // ── Catálogo de relatórios ────────────────────────────────────
  // Cada item define identidade, grupo, ícone SVG e destino.
  const CATALOG = [
    // ── Grupo 1: Fluxo de Caixa ────────────────────────────────
    {
      id: 'fin-cashflow',
      group: 'fluxo',
      label: 'Fluxo de Caixa',
      desc: 'Movimentos financeiros do periodo (entradas e saidas), vinculados a agendamentos.',
      icon: _ico('dollar-sign'),
      accent: '#10b981',
    },
    {
      id: 'fin-billing',
      group: 'fluxo',
      label: 'Faturamento',
      desc: 'Receita bruta gerada no período. Acompanhe mês a mês e compare com metas.',
      icon: _ico('trending-up'),
      accent: '#10b981',
    },
    {
      id: 'fin-receipts',
      group: 'fluxo',
      label: 'Recebimentos',
      desc: 'Valores efetivamente recebidos. Identifique gaps entre faturado e recebido.',
      icon: _ico('credit-card'),
      accent: '#10b981',
    },
    {
      id: 'fin-default',
      group: 'fluxo',
      label: 'Inadimplência',
      desc: 'Pacientes e valores em aberto. Alerte-se antes que o fluxo seja comprometido.',
      icon: _ico('alert-circle'),
      accent: '#ef4444',
      alert: true,
    },
    // ── Grupo 2: Performance ────────────────────────────────────
    {
      id: 'fin-ticket',
      group: 'performance',
      label: 'Ticket Médio',
      desc: 'Valor médio por atendimento. Métrica direta de eficiência comercial.',
      icon: _ico('bar-chart-2'),
      accent: '#6366f1',
    },
    {
      id: 'fin-conversion',
      group: 'performance',
      label: 'Conversão em Receita',
      desc: 'Taxa de leads convertidos em receita. Mede a saúde do funil financeiro.',
      icon: _ico('percent'),
      accent: '#6366f1',
    },
    {
      id: 'fin-commissions',
      group: 'performance',
      label: 'Comissões',
      desc: 'Comissões por especialista e procedimento. Controle de custo variável.',
      icon: _ico('users'),
      accent: '#6366f1',
    },
    // ── Grupo 3: Receita por Segmento ──────────────────────────
    {
      id: 'fin-by-procedure',
      group: 'segmento',
      label: 'Receita por Procedimento',
      desc: 'Quais procedimentos geram mais receita. Priorize o mix certo.',
      icon: _ico('activity'),
      accent: '#f59e0b',
    },
    {
      id: 'fin-by-patient',
      group: 'segmento',
      label: 'Receita por Paciente',
      desc: 'Pacientes de maior valor. Identifique LTV e oportunidades de retenção.',
      icon: _ico('user'),
      accent: '#f59e0b',
    },
    {
      id: 'fin-by-campaign',
      group: 'segmento',
      label: 'Receita por Campanha',
      desc: 'ROI de cada campanha de captação. Direcione budget para o que converte.',
      icon: _ico('target'),
      accent: '#f59e0b',
    },
  ]

  const GROUPS = {
    fluxo: {
      label: 'Fluxo de Caixa',
      subtitle: 'Operacional — acompanhe receita, recebimentos e alertas de inadimplência',
      icon: _ico('dollar-sign'),
      color: '#10b981',
      bg: '#f0fdf4',
      border: '#bbf7d0',
    },
    performance: {
      label: 'Performance',
      subtitle: 'Estratégico — eficiência comercial, conversão e custo variável',
      icon: _ico('trending-up'),
      color: '#6366f1',
      bg: '#f5f3ff',
      border: '#ddd6fe',
    },
    segmento: {
      label: 'Receita por Segmento',
      subtitle: 'Inteligência — onde a receita é gerada, quem gera e o que converte',
      icon: _ico('pie-chart'),
      color: '#f59e0b',
      bg: '#fffbeb',
      border: '#fde68a',
    },
  }

  // ── Hub principal ─────────────────────────────────────────────
  function render() {
    const root = document.getElementById('finReportsRoot')
    if (!root) return

    root.innerHTML = `
      <div style="padding:28px 32px;max-width:1100px;margin:0 auto">

        <!-- Cabeçalho -->
        <div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="color:#6366f1">${_ico('bar-chart-2', 20)}</span>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827">Relatórios Financeiros</h1>
          </div>
          <p style="margin:0;font-size:14px;color:#6b7280">
            Selecione o relatório para análise. Cada módulo carrega de forma independente.
          </p>
        </div>

        <!-- Grupos -->
        ${Object.entries(GROUPS).map(([groupId, group]) => `
          <div style="margin-bottom:32px">

            <!-- Cabeçalho do grupo -->
            <div style="
              display:flex;align-items:center;gap:10px;
              padding:10px 14px;
              background:${group.bg};
              border:1px solid ${group.border};
              border-radius:10px 10px 0 0;
              border-bottom:none;
            ">
              <span style="color:${group.color}">${group.icon}</span>
              <div>
                <div style="font-size:13px;font-weight:700;color:#111827">${group.label}</div>
                <div style="font-size:12px;color:#6b7280">${group.subtitle}</div>
              </div>
            </div>

            <!-- Cards do grupo -->
            <div style="
              display:grid;
              grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
              gap:0;
              border:1px solid ${group.border};
              border-radius:0 0 10px 10px;
              overflow:hidden;
            ">
              ${CATALOG.filter(r => r.group === groupId).map((r, i, arr) => `
                <button
                  onclick="window.navigateTo && navigateTo('${r.id}')"
                  style="
                    all:unset;
                    display:flex;align-items:flex-start;gap:12px;
                    padding:16px 18px;
                    cursor:pointer;
                    background:#fff;
                    border-right:${i < arr.length - 1 ? '1px solid #f3f4f6' : 'none'};
                    border-top:1px solid #f3f4f6;
                    transition:background .15s;
                  "
                  onmouseenter="this.style.background='#fafafa'"
                  onmouseleave="this.style.background='#fff'"
                >
                  <span style="
                    flex-shrink:0;
                    width:36px;height:36px;
                    display:flex;align-items:center;justify-content:center;
                    background:${group.bg};
                    border-radius:8px;
                    color:${r.alert ? '#ef4444' : group.color};
                  ">${r.icon}</span>
                  <div style="min-width:0">
                    <div style="
                      font-size:13px;font-weight:600;color:#111827;
                      margin-bottom:3px;
                      display:flex;align-items:center;gap:6px;
                    ">
                      ${r.label}
                      ${r.alert ? `<span style="
                        font-size:10px;font-weight:700;
                        background:#fef2f2;color:#ef4444;
                        border:1px solid #fecaca;
                        border-radius:4px;padding:1px 5px;
                      ">ATENÇÃO</span>` : ''}
                    </div>
                    <div style="font-size:12px;color:#6b7280;line-height:1.4">${r.desc}</div>
                  </div>
                  <span style="flex-shrink:0;color:#9ca3af;margin-left:auto;margin-top:8px">
                    ${_ico('chevron-right', 14)}
                  </span>
                </button>
              `).join('')}
            </div>

          </div>
        `).join('')}

      </div>
    `

    if (window.feather) feather.replace()
  }

  // ── Sub-relatórios ────────────────────────────────────────────
  // Cada sub-relatório renderiza seu próprio conteúdo ao ser chamado
  // via renderPage(). Quando o módulo de dados estiver disponível,
  // o shell será substituído pelo componente real.

  const _subRenderers = {

    'fin-cashflow': function() {
      // Delega para CashflowUI — modulo proprio em js/ui/cashflow.ui.js
      setTimeout(function() {
        if (window.CashflowUI && window.CashflowUI.init) {
          window.CashflowUI.init()
        }
      }, 0)
      return '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">Carregando Fluxo de Caixa...</div>'
    },

    'fin-billing': function() {
      return _subShell('Faturamento', 'trending-up', '#10b981', [
        _kpiRow([
          { label: 'Faturamento Bruto', value: 'R$ 89.340', delta: '+8,4%', up: true },
          { label: 'Meta do Mês',       value: 'R$ 150.000', delta: '59,6%', up: null, suffix: 'atingido' },
          { label: 'Mês Anterior',      value: 'R$ 82.400', delta: null },
        ]),
        _chartPlaceholder('Faturamento mensal — últimos 12 meses'),
        _tableHeader(['Procedimento', 'Qtd', 'Faturado', '% do total']),
      ])
    },

    'fin-receipts': function() {
      return _subShell('Recebimentos', 'credit-card', '#10b981', [
        _kpiRow([
          { label: 'Recebido no Mês',  value: 'R$ 76.200', delta: '+5,1%', up: true },
          { label: 'A Receber',        value: 'R$ 13.140', delta: null },
          { label: 'Taxa de Recebimento', value: '85,3%', delta: '+2pp', up: true },
        ]),
        _chartPlaceholder('Recebimentos x Faturado — linha do tempo'),
        _tableHeader(['Paciente', 'Valor', 'Vencimento', 'Status']),
      ])
    },

    'fin-default': function() {
      return _subShell('Inadimplência', 'alert-circle', '#ef4444', [
        _kpiRow([
          { label: 'Em Aberto',      value: 'R$ 13.140', delta: '-3,2%', up: true },
          { label: 'Taxa Inadimp.',  value: '14,7%',     delta: '-1pp', up: true },
          { label: 'Acima de 30d',  value: 'R$ 5.200',  delta: null },
        ]),
        _chartPlaceholder('Inadimplência por faixa de vencimento'),
        _tableHeader(['Paciente', 'Valor', 'Dias em atraso', 'Último contato']),
      ])
    },

    'fin-ticket': function() {
      return _subShell('Ticket Médio', 'bar-chart-2', '#6366f1', [
        _kpiRow([
          { label: 'Ticket Médio',         value: 'R$ 820',  delta: '+6,2%', up: true },
          { label: 'Ticket por Consulta',  value: 'R$ 1.240', delta: null },
          { label: 'Ticket Mínimo',        value: 'R$ 180',  delta: null },
        ]),
        _chartPlaceholder('Evolução do ticket médio — últimos 6 meses'),
        _tableHeader(['Profissional', 'Atendimentos', 'Ticket Médio', 'Receita Total']),
      ])
    },

    'fin-conversion': function() {
      return _subShell('Conversão em Receita', 'percent', '#6366f1', [
        _kpiRow([
          { label: 'Taxa de Conversão', value: '38,4%',    delta: '+4pp', up: true },
          { label: 'Leads → Receita',   value: 'R$ 34.290', delta: null },
          { label: 'Custo por Lead',    value: 'R$ 42',     delta: '-8%', up: true },
        ]),
        _chartPlaceholder('Funil de conversão — etapas x receita'),
        _tableHeader(['Etapa do funil', 'Leads', 'Convertidos', 'Receita gerada']),
      ])
    },

    'fin-commissions': function() {
      _loadSegmentReport('fin-commissions', 'professional', 'Comissões', 'users', '#6366f1')
      return _loadingShell('Comissões', 'users', '#6366f1')
    },

    'fin-by-procedure': function() {
      _loadSegmentReport('fin-by-procedure', 'procedure', 'Receita por Procedimento', 'activity', '#f59e0b')
      return _loadingShell('Receita por Procedimento', 'activity', '#f59e0b')
    },

    'fin-by-patient': function() {
      _loadPatientsLtvReport()
      return _loadingShell('Receita por Paciente / LTV', 'user', '#f59e0b')
    },

    'fin-by-campaign': function() {
      _loadSegmentReport('fin-by-campaign', 'origem', 'Receita por Origem', 'target', '#f59e0b')
      return _loadingShell('Receita por Origem', 'target', '#f59e0b')
    },

    '__legacy-by-campaign': function() {
      return _subShell('Receita por Campanha', 'target', '#f59e0b', [
        _kpiRow([
          { label: 'Melhor Campanha', value: 'Instagram Ads', delta: null },
          { label: 'ROI Médio',       value: '4,8x',         delta: '+0,6x', up: true },
          { label: 'CAC Médio',       value: 'R$ 87',        delta: '-12%', up: true },
        ]),
        _chartPlaceholder('ROI por canal de campanha — barras comparativas'),
        _tableHeader(['Campanha', 'Investimento', 'Receita Gerada', 'ROI']),
      ])
    },
  }

  function renderPage(pageId) {
    const rootId = pageId.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Root'
      // fin-billing → finBillingRoot  |  fin-by-procedure → finByProcedureRoot
    const root = document.getElementById(rootId)
    if (!root) return
    const renderer = _subRenderers[pageId]
    if (!renderer) return
    root.innerHTML = renderer()
    if (window.feather) feather.replace()
  }

  // ── Loading shell + dynamic report (com dados reais via cashflow_segments) ──

  function _loadingShell(title, icon, color) {
    return _subShell(title, icon, color, [
      '<div style="padding:60px 20px;text-align:center;color:#9ca3af;font-size:13px">Carregando dados...</div>'
    ])
  }

  async function _loadSegmentReport(pageId, segmentType, title, icon, color) {
    // Aguarda o DOM ser injetado primeiro
    setTimeout(async function() {
      try {
        if (!window.CashflowService || !window.CashflowService.getSegments) {
          _renderUnavailable(pageId, title, icon, color)
          return
        }

        var now = new Date()
        var year  = now.getFullYear()
        var month = now.getMonth() + 1

        var res = await window.CashflowService.getSegments(year, month)
        if (!res || !res.ok) {
          _renderUnavailable(pageId, title, icon, color)
          return
        }

        var seg = res.data || {}
        var fmt = window.CashflowService.fmtCurrency
        var rootId = pageId.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase() }) + 'Root'
        var root = document.getElementById(rootId)
        if (!root) return

        if (segmentType === 'procedure') {
          root.innerHTML = _renderProcedureReport(seg, fmt, title, icon, color)
        } else if (segmentType === 'professional') {
          root.innerHTML = _renderProfessionalReport(seg, fmt, title, icon, color)
        } else if (segmentType === 'origem') {
          root.innerHTML = _renderOrigemReport(seg, fmt, title, icon, color)
        }
      } catch (e) {
        console.warn('[FinReports] _loadSegmentReport error:', e)
      }
    }, 100)
  }

  function _renderUnavailable(pageId, title, icon, color) {
    var rootId = pageId.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase() }) + 'Root'
    var root = document.getElementById(rootId)
    if (!root) return
    root.innerHTML = _subShell(title, icon, color, [
      '<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px">CashflowService nao disponivel. Acesse <strong>Fluxo de Caixa</strong> primeiro pra carregar.</div>'
    ])
  }

  function _renderProcedureReport(seg, fmt, title, icon, color) {
    var data = seg.by_procedure || []
    var total = data.reduce(function(s, x) { return s + Number(x.bruto || 0) }, 0)
    var totalLiquido = data.reduce(function(s, x) { return s + Number(x.liquido || 0) }, 0)
    var top = data[0] || {}
    var avgMargin = data.length > 0
      ? (data.reduce(function(s, x) { return s + Number(x.margem_pct || 0) }, 0) / data.length).toFixed(1)
      : 0

    var sections = [
      _kpiRow([
        { label: 'Procedimento Top', value: top.name || '—', suffix: top.bruto ? fmt(top.bruto) + ' bruto' : '' },
        { label: 'Total Bruto',      value: fmt(total) },
        { label: 'Total Liquido',    value: fmt(totalLiquido) },
        { label: 'Margem Media',     value: avgMargin + '%' },
      ]),
    ]

    if (data.length === 0) {
      sections.push('<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">Nenhum procedimento registrado neste mes.</div>')
    } else {
      sections.push(_realProcedureTable(data, fmt))
    }

    return _subShell(title, icon, color, sections)
  }

  function _realProcedureTable(data, fmt) {
    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:16px">'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
      + '<thead><tr style="background:#f9fafb">'
      + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Procedimento</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Qtd</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Ticket Medio</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Bruto</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Custo</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Taxa</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Comissao</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Liquido</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Margem</th>'
      + '</tr></thead><tbody>'

    data.forEach(function(p) {
      var marginColor = p.margem_pct >= 30 ? '#10b981' : p.margem_pct >= 15 ? '#f59e0b' : '#ef4444'
      html += '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:12px 14px;color:#111827"><strong>' + p.name + '</strong></td>'
        + '<td style="padding:12px 14px;text-align:right;color:#6b7280">' + p.qtd + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#374151">' + fmt(p.ticket_medio) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#10b981;font-weight:600">' + fmt(p.bruto) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#9ca3af">' + (p.custo > 0 ? fmt(p.custo) : '—') + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#9ca3af">' + (p.taxa > 0 ? fmt(p.taxa) : '—') + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#9ca3af">' + (p.comissao > 0 ? fmt(p.comissao) : '—') + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:' + marginColor + ';font-weight:700">' + fmt(p.liquido) + '</td>'
        + '<td style="padding:12px 14px;text-align:right"><span style="background:' + marginColor + '22;color:' + marginColor + ';font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px">' + p.margem_pct + '%</span></td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'
    return html
  }

  function _renderProfessionalReport(seg, fmt, title, icon, color) {
    var data = seg.by_professional || []
    var totalBruto = data.reduce(function(s, x) { return s + Number(x.bruto || 0) }, 0)
    var totalComm  = data.reduce(function(s, x) { return s + Number(x.comissao || 0) }, 0)
    var pctRev = totalBruto > 0 ? ((totalComm / totalBruto) * 100).toFixed(1) : 0

    var sections = [
      _kpiRow([
        { label: 'Total Comissoes', value: fmt(totalComm) },
        { label: '% da Receita',    value: pctRev + '%' },
        { label: 'Total Bruto',     value: fmt(totalBruto) },
        { label: 'Especialistas',   value: String(data.length) },
      ]),
    ]

    if (data.length === 0) {
      sections.push('<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">Nenhum especialista com receita neste mes.</div>')
    } else {
      var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:16px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Especialista</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Atendimentos</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Ticket Medio</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Bruto</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Comissao</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Liquido</th>'
        + '</tr></thead><tbody>'
      data.forEach(function(p) {
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:12px 14px;color:#111827"><strong>' + p.name + '</strong></td>'
          + '<td style="padding:12px 14px;text-align:right;color:#6b7280">' + p.qtd + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#374151">' + fmt(p.ticket_medio) + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#10b981;font-weight:600">' + fmt(p.bruto) + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#f59e0b">' + (p.comissao > 0 ? fmt(p.comissao) : '—') + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#10b981;font-weight:700">' + fmt(p.liquido) + '</td>'
          + '</tr>'
      })
      html += '</tbody></table></div>'
      sections.push(html)
    }

    return _subShell(title, icon, color, sections)
  }

  async function _loadPatientsLtvReport() {
    setTimeout(async function() {
      try {
        if (!window.CashflowService || !window.CashflowService.getPatientsLtv) {
          _renderUnavailable('fin-by-patient', 'Receita por Paciente / LTV', 'user', '#f59e0b')
          return
        }
        var res = await window.CashflowService.getPatientsLtv(50, false)
        if (!res || !res.ok) {
          _renderUnavailable('fin-by-patient', 'Receita por Paciente / LTV', 'user', '#f59e0b')
          return
        }
        var data = res.data || {}
        var fmt = window.CashflowService.fmtCurrency
        var root = document.getElementById('finByPatientRoot')
        if (!root) return
        root.innerHTML = _renderPatientsLtv(data, fmt)
      } catch (e) { console.warn('[FinReports] _loadPatientsLtvReport:', e) }
    }, 100)
  }

  function _renderPatientsLtv(data, fmt) {
    var stats = data.stats || {}
    var rfm   = data.rfm   || {}
    var pats  = data.patients || []

    var rfmColors = {
      vip:      { bg: '#f0fdf4', bd: '#bbf7d0', col: '#10b981', label: 'VIP' },
      regular:  { bg: '#eff6ff', bd: '#bfdbfe', col: '#3b82f6', label: 'Regular' },
      novo:     { bg: '#f5f3ff', bd: '#ddd6fe', col: '#8b5cf6', label: 'Novo' },
      em_risco: { bg: '#fffbeb', bd: '#fde68a', col: '#f59e0b', label: 'Em Risco' },
      inativo:  { bg: '#fef2f2', bd: '#fecaca', col: '#ef4444', label: 'Inativo' },
      distante: { bg: '#f3f4f6', bd: '#e5e7eb', col: '#9ca3af', label: 'Distante' },
    }

    var sections = [
      // KPIs principais
      _kpiRow([
        { label: 'Total Pacientes',  value: String(stats.total_patients || 0) },
        { label: 'LTV Medio',        value: fmt(stats.avg_ltv || 0) },
        { label: 'Top 10% Receita',  value: stats.top10_pct + '%', suffix: 'concentracao' },
        { label: 'Threshold VIP',    value: fmt(stats.p80_threshold || 0), suffix: 'monetary >= isso' },
      ]),

      // Cards RFM
      _rfmCards(rfm, rfmColors, fmt),
    ]

    if (pats.length === 0) {
      sections.push('<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">Nenhum paciente com receita. Vincule pacientes as transacoes pra ativar.</div>')
    } else {
      sections.push(_patientsTable(pats, fmt, rfmColors))
    }

    return _subShell('Receita por Paciente / LTV', 'user', '#f59e0b', sections)
  }

  function _rfmCards(rfm, colors, fmt) {
    var classes = ['vip','regular','novo','em_risco','inativo','distante']
    var html = '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">'
    classes.forEach(function(cls) {
      var data = rfm[cls] || { count: 0, monetary: 0 }
      var c = colors[cls]
      html += '<div style="background:' + c.bg + ';border:1px solid ' + c.bd + ';border-radius:10px;padding:14px 12px;text-align:center">'
        + '<div style="font-size:10px;font-weight:700;color:' + c.col + ';text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">' + c.label + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + c.col + ';margin-bottom:2px">' + (data.count || 0) + '</div>'
        + '<div style="font-size:10px;color:#6b7280">' + fmt(data.monetary || 0) + '</div>'
        + '</div>'
    })
    html += '</div>'
    return html
  }

  function _patientsTable(pats, fmt, colors) {
    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:16px">'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
      + '<thead><tr style="background:#f9fafb">'
      + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">#</th>'
      + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Paciente</th>'
      + '<th style="padding:12px 14px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Classe</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Visitas</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Ticket Medio</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">LTV</th>'
      + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Ultima Visita</th>'
      + '</tr></thead><tbody>'

    pats.forEach(function(p, i) {
      var c = colors[p.rfm_class] || colors.distante
      html += '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:12px 14px;color:#9ca3af">' + (i + 1) + '</td>'
        + '<td style="padding:12px 14px;color:#111827"><strong>' + p.name + '</strong>'
        + (p.phone ? '<div style="font-size:10px;color:#9ca3af">' + p.phone + '</div>' : '')
        + '</td>'
        + '<td style="padding:12px 14px;text-align:center"><span style="background:' + c.bg + ';color:' + c.col + ';font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;border:1px solid ' + c.bd + '">' + c.label.toUpperCase() + '</span></td>'
        + '<td style="padding:12px 14px;text-align:right;color:#6b7280">' + p.visit_days + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#374151">' + fmt(p.avg_ticket) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#10b981;font-weight:700">' + fmt(p.monetary) + '</td>'
        + '<td style="padding:12px 14px;text-align:right;color:#9ca3af;font-size:11px">' + (p.recency_days === 0 ? 'hoje' : 'ha ' + p.recency_days + 'd') + '</td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'
    return html
  }

  function _renderOrigemReport(seg, fmt, title, icon, color) {
    var data = seg.by_origem || []
    var total = data.reduce(function(s, x) { return s + Number(x.bruto || 0) }, 0)
    var topOrigin = data[0] || {}

    var sections = [
      _kpiRow([
        { label: 'Origem Top', value: topOrigin.origem || '—' },
        { label: 'Total Bruto', value: fmt(total) },
        { label: 'Origens Ativas', value: String(data.length) },
        { label: 'Pacientes Convertidos', value: String(data.reduce(function(s, x) { return s + (x.pacientes || 0) }, 0)) },
      ]),
    ]

    if (data.length === 0) {
      sections.push('<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">Nenhuma origem com receita neste mes. Vincule pacientes/leads as transacoes pra aparecer aqui.</div>')
    } else {
      var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:16px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead><tr style="background:#f9fafb">'
        + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Origem</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Pacientes</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Atendimentos</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Ticket Medio/Paciente</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Bruto</th>'
        + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">% Total</th>'
        + '</tr></thead><tbody>'
      data.forEach(function(o) {
        var pct = total > 0 ? ((o.bruto / total) * 100).toFixed(1) : 0
        html += '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:12px 14px;color:#111827"><strong>' + o.origem + '</strong></td>'
          + '<td style="padding:12px 14px;text-align:right;color:#6b7280">' + o.pacientes + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#6b7280">' + o.qtd + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#374151">' + fmt(o.ticket_medio_paciente) + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#10b981;font-weight:600">' + fmt(o.bruto) + '</td>'
          + '<td style="padding:12px 14px;text-align:right;color:#8b5cf6;font-weight:700">' + pct + '%</td>'
          + '</tr>'
      })
      html += '</tbody></table></div>'
      sections.push(html)
    }

    return _subShell(title, icon, color, sections)
  }

  // ── Shell de sub-relatório ────────────────────────────────────
  function _subShell(title, icon, color, sections) {
    return `
      <div style="padding:28px 32px;max-width:1100px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <button
            onclick="navigateTo('fin-reports')"
            style="
              all:unset;cursor:pointer;
              display:flex;align-items:center;gap:4px;
              font-size:13px;color:#6b7280;
            "
            onmouseenter="this.style.color='#374151'"
            onmouseleave="this.style.color='#6b7280'"
          >
            ${_ico('chevron-left', 14)} Relatórios
          </button>
          <span style="color:#d1d5db">/</span>
          <span style="color:${color}">${_ico(icon, 14)}</span>
          <span style="font-size:13px;font-weight:600;color:#111827">${title}</span>
        </div>

        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#111827">${title}</h2>

        ${sections.join('')}
      </div>
    `
  }

  // ── Componentes de UI ─────────────────────────────────────────
  function _kpiRow(items) {
    return `
      <div style="
        display:grid;
        grid-template-columns:repeat(${items.length},1fr);
        gap:12px;margin-bottom:20px;
      ">
        ${items.map(k => `
          <div style="
            background:#fff;border:1px solid #e5e7eb;
            border-radius:10px;padding:14px 16px;
          ">
            <div style="font-size:11px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">
              ${k.label}
            </div>
            <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:2px">${k.value}</div>
            ${k.suffix ? `<div style="font-size:11px;color:#9ca3af">${k.suffix}</div>` : ''}
            ${k.delta ? `
              <div style="font-size:12px;font-weight:500;color:${k.up === true ? '#10b981' : k.up === false ? '#ef4444' : '#6b7280'}">
                ${k.up === true ? '↑' : k.up === false ? '↓' : ''} ${k.delta}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `
  }

  function _chartPlaceholder(label) {
    return `
      <div style="
        background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;
        padding:40px 20px;text-align:center;margin-bottom:16px;color:#9ca3af;
      ">
        <div style="margin-bottom:6px">${_ico('bar-chart-2', 28)}</div>
        <div style="font-size:13px">${label}</div>
        <div style="font-size:11px;margin-top:4px">Dados carregados ao conectar com Supabase</div>
      </div>
    `
  }

  function _tableHeader(cols) {
    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:12px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f9fafb">
              ${cols.map(c => `
                <th style="
                  padding:10px 14px;text-align:left;
                  font-size:11px;font-weight:600;color:#6b7280;
                  text-transform:uppercase;letter-spacing:.4px;
                  border-bottom:1px solid #e5e7eb;
                ">${c}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="${cols.length}" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">
                Conecte o Supabase para carregar os dados
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `
  }

  // ── Ícones SVG inline ─────────────────────────────────────────
  function _ico(name, size) {
    size = size || 16
    const icons = {
      'trending-up':    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      'credit-card':    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
      'alert-circle':   `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      'bar-chart-2':    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      'percent':        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
      'users':          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      'activity':       `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      'user':           `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      'target':         `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
      'dollar-sign':    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      'pie-chart':      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
      'chevron-right':  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
      'chevron-left':   `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    }
    return icons[name] || ''
  }

  // ── API pública ───────────────────────────────────────────────
  return Object.freeze({ render, renderPage })

})()
