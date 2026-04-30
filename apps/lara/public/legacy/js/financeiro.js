/* ============================================================
   ClinicAI — Inteligência Financeira
   Metas · Gastos · Procedimentos · Clientes · Cruzamento BI
   ============================================================ */

'use strict';

const finGoals = (() => {

  /* ── Storage ───────────────────────────────────────────── */
  const KEYS = {
    meta:   'clinicai_fin_meta',
    gastos: 'clinicai_fin_gastos',
    procs:  'clinicai_fin_procs',
    demo:   'clinicai_fin_demo',
    plan:   'clinicai_fin_plan',
  };

  /* ── State ─────────────────────────────────────────────── */
  let activeTab = 'metas';
  let _charts   = {};
  let _dataLoaded = false;   // gating do render: sem dados, exibe skeleton

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function _defaultMeta() {
    var now = new Date();
    return {
      mensal: 0, realizado: 0,
      mesAtual: MESES[now.getMonth()] + ' ' + now.getFullYear(),
      diasUteis: 22, diasDecorridos: 0, ticketMedio: 0,
    };
  }
  function _defaultGastos() { return { fixos: [], variaveis: [] }; }
  function _defaultProcs()  { return []; }
  function _defaultDemo()   {
    return {
      faixas: [], genero: { feminino: 0, masculino: 0 },
      ticketPorFaixa: [], procPorFaixa: [],
    };
  }
  function _defaultPlan() {
    return {
      ano: new Date().getFullYear(),
      meses: MESES.map(function(nome, i) { return { mes: i + 1, nome: nome, meta: 0, realizado: 0 }; }),
      especialistas: [],
    };
  }

  // Estado inicial: vazio (nao mais hardcoded). _loadData preenche do Supabase
  // ou localStorage. _render so exibe numeros reais apos _dataLoaded=true.
  let meta         = _defaultMeta();
  let gastos       = _defaultGastos();
  let procs        = _defaultProcs();
  let demo         = _defaultDemo();
  let planejamento = _defaultPlan();

  /* ── Observer ──────────────────────────────────────────── */
  function _attachObserver() {
    const page = document.getElementById('page-fin-goals');
    if (!page) return;
    const obs = new MutationObserver(() => {
      if (page.classList.contains('active')) { _loadData().then(() => _render()); }
    });
    obs.observe(page, { attributes:true, attributeFilter:['class'] });
  }

  /* ── Storage ───────────────────────────────────────────── */
  async function _loadData() {
    const now = new Date();
    const svc = window.FinanceiroService;

    try {
      if (svc) {
        const { meta: m, gastos: g, procs: p, demo: d } =
          await svc.loadMonth(now.getFullYear(), now.getMonth() + 1);
        if (m) meta   = m;
        if (g) gastos = g;
        if (p) procs  = p;
        if (d) demo   = d;

        const plan = await svc.loadAnnualPlan(now.getFullYear());
        if (plan) planejamento = plan;
      } else {
        try { const d = JSON.parse(localStorage.getItem(KEYS.meta));   if (d) meta         = d; } catch {}
        try { const d = JSON.parse(localStorage.getItem(KEYS.gastos)); if (d) gastos       = d; } catch {}
        try { const d = JSON.parse(localStorage.getItem(KEYS.procs));  if (d) procs        = d; } catch {}
        try { const d = JSON.parse(localStorage.getItem(KEYS.demo));   if (d) demo         = d; } catch {}
        try { const d = JSON.parse(localStorage.getItem(KEYS.plan));   if (d) planejamento = d; } catch {}
      }
    } finally {
      _dataLoaded = true;
    }
  }

  /* ── Skeleton: shown antes de _loadData completar ───────── */
  function _renderSkeleton() {
    const root = document.getElementById('finGoalsRoot');
    if (!root) return;
    root.innerHTML = '' +
      '<div class="page-title-row"><div class="page-title-left">' +
        '<h1 class="page-title">Inteligência Financeira</h1>' +
        '<p class="page-subtitle">Carregando dados do mês...</p>' +
      '</div></div>' +
      '<div class="fin-kpi-strip">' +
        '<div class="fin-kpi fin-skel"></div>' +
        '<div class="fin-kpi fin-skel"></div>' +
        '<div class="fin-kpi fin-skel"></div>' +
        '<div class="fin-kpi fin-skel"></div>' +
      '</div>' +
      '<style>.fin-skel{min-height:72px;background:linear-gradient(90deg,#f3f4f6 0%,#e5e7eb 50%,#f3f4f6 100%);background-size:200% 100%;animation:finskel 1.2s ease infinite;border-radius:8px}' +
      '@keyframes finskel{0%{background-position:-100% 0}100%{background-position:100% 0}}</style>';
  }

  function _save() {
    // 1. localStorage sempre (síncrono — não bloqueia render)
    try {
      store.set(KEYS.meta,   meta)
      store.set(KEYS.gastos, gastos)
      store.set(KEYS.procs,  procs)
      store.set(KEYS.demo,   demo)
      store.set(KEYS.plan,   planejamento)
    } catch (e) {
      if (e.name === 'QuotaExceededError') console.warn('ClinicAI: localStorage cheio, dados financeiros não salvos.')
    }

    // 2. Supabase fire-and-forget (não bloqueia o fluxo)
    const svc = window.FinanceiroService;
    if (svc) {
      const now = new Date();
      svc.saveMonthGoal(now.getFullYear(), now.getMonth() + 1, meta).catch(e => console.warn("[financeiro]", e.message || e));
      svc.saveConfig(gastos, procs, demo).catch(e => console.warn("[financeiro]", e.message || e));
      svc.saveAnnualPlan(now.getFullYear(), planejamento).catch(e => console.warn("[financeiro]", e.message || e));
    }
  }

  /* ── Destroy charts ────────────────────────────────────── */
  function _destroyCharts() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch {} });
    _charts = {};
  }

  /* ── Render principal ──────────────────────────────────── */
  function _render() {
    const root = document.getElementById('finGoalsRoot');
    if (!root) return;
    if (!_dataLoaded) { _renderSkeleton(); return; }
    _destroyCharts();

    const totalGastos  = _totalGastos();
    const lucroLiquido = meta.realizado - totalGastos;
    const margem       = meta.realizado > 0 ? (lucroLiquido / meta.realizado * 100) : 0;
    const pctMeta      = Math.min((meta.realizado / meta.mensal) * 100, 100);
    const procsDia     = meta.diasDecorridos > 0
      ? (meta.realizado / meta.ticketMedio / meta.diasDecorridos).toFixed(1) : 0;

    root.innerHTML = `
      <div class="page-title-row">
        <div class="page-title-left">
          <h1 class="page-title">Inteligência Financeira</h1>
          <p class="page-subtitle">Metas, gastos, rentabilidade por procedimento e perfil de clientes — análise integrada</p>
        </div>
      </div>

      <!-- KPI Strip -->
      <div class="fin-kpi-strip">
        <div class="fin-kpi">
          <div class="fin-kpi-icon" style="background:rgba(201,169,110,.13);color:#C9A96E"><i data-feather="target"></i></div>
          <div class="fin-kpi-info">
            <span class="fin-kpi-val">${_fmt(meta.realizado)}</span>
            <span class="fin-kpi-lbl">Faturado — ${meta.mesAtual}</span>
          </div>
          <span class="fin-kpi-badge" style="color:#C9A96E">${pctMeta.toFixed(1)}% da meta</span>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-icon" style="background:rgba(239,68,68,.12);color:#EF4444"><i data-feather="trending-down"></i></div>
          <div class="fin-kpi-info">
            <span class="fin-kpi-val">${_fmt(totalGastos)}</span>
            <span class="fin-kpi-lbl">Total de gastos</span>
          </div>
          <span class="fin-kpi-badge" style="color:#EF4444">${meta.realizado > 0 ? (totalGastos/meta.realizado*100).toFixed(0) : 0}% do fat.</span>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-icon" style="background:rgba(16,185,129,.12);color:#10B981"><i data-feather="dollar-sign"></i></div>
          <div class="fin-kpi-info">
            <span class="fin-kpi-val">${_fmt(lucroLiquido)}</span>
            <span class="fin-kpi-lbl">Lucro Líquido</span>
          </div>
          <span class="fin-kpi-badge" style="color:#10B981">${margem.toFixed(1)}% margem</span>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-icon" style="background:rgba(59,130,246,.12);color:#3B82F6"><i data-feather="credit-card"></i></div>
          <div class="fin-kpi-info">
            <span class="fin-kpi-val">${_fmt(meta.ticketMedio)}</span>
            <span class="fin-kpi-lbl">Ticket Médio</span>
          </div>
          <span class="fin-kpi-badge" style="color:#3B82F6">${procsDia} proced./dia</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="fin-tabs">
        ${[
          ['planejamento',  'calendar',  'Planejamento Anual'],
          ['metas',         'target',    'Mês Atual'     ],
          ['gastos',        'credit-card','Gastos'        ],
          ['procedimentos', 'scissors',  'Procedimentos' ],
          ['clientes',      'users',     'Clientes'      ],
          ['cruzamento',    'bar-chart-2','Cruzamento BI'],
        ].map(([id, icon, label]) => `
          <button class="fin-tab ${activeTab === id ? 'active' : ''}" onclick="finGoals.switchTab('${id}')">
            <i data-feather="${icon}"></i> ${label}
          </button>`).join('')}
      </div>

      <!-- Conteúdo -->
      <div class="fin-tab-content" id="finTabContent">
        ${_renderActiveTab()}
      </div>
    `;

    _reIcons();
    _initCharts();
  }

  /* ── Tab router ────────────────────────────────────────── */
  function _renderActiveTab() {
    if (activeTab === 'planejamento')  return _renderPlanejamento();
    if (activeTab === 'metas')         return _renderMetas();
    if (activeTab === 'gastos')        return _renderGastos();
    if (activeTab === 'procedimentos') return _renderProcedimentos();
    if (activeTab === 'clientes')      return _renderClientes();
    if (activeTab === 'cruzamento')    return _renderCruzamento();
    return '';
  }

  /* ═══════════════════════════════════════════════════════
     TAB 1 — METAS
  ═══════════════════════════════════════════════════════ */
  function _renderMetas() {
    const falta            = Math.max(meta.mensal - meta.realizado, 0);
    const pct              = Math.min((meta.realizado / meta.mensal) * 100, 100);
    const diasRestantes    = Math.max(meta.diasUteis - meta.diasDecorridos, 0);
    const necPorDia        = diasRestantes > 0 ? falta / diasRestantes : 0;
    const consultasPorDia  = necPorDia > 0 && meta.ticketMedio > 0 ? Math.ceil(necPorDia / meta.ticketMedio) : 0;
    const projecao         = meta.diasDecorridos > 0
      ? (meta.realizado / meta.diasDecorridos) * meta.diasUteis : 0;
    const status           = projecao >= meta.mensal ? 'ok' : projecao >= meta.mensal * 0.85 ? 'warn' : 'danger';
    const totalGastos      = _totalGastos();
    const pctEq            = Math.min((meta.realizado / Math.max(totalGastos, 1)) * 100, 100);

    return `
      <div class="fin-grid-2">
        <!-- Configurar meta -->
        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title"><i data-feather="settings"></i> Configurar Meta do Mês</span>
          </div>
          <div class="fin-card-body">
            <div class="fin-field-row">
              <div class="fin-field">
                <label class="fin-label">Meta Mensal (R$)</label>
                <input type="text" id="finMetaMensal" class="fin-input" value="${_fmtRaw(meta.mensal)}" placeholder="0" oninput="finGoals.maskMoney(this)" />
              </div>
              <div class="fin-field">
                <label class="fin-label">Faturado até hoje (R$)</label>
                <input type="text" id="finRealizado" class="fin-input" value="${_fmtRaw(meta.realizado)}" placeholder="0" oninput="finGoals.maskMoney(this)" />
              </div>
            </div>
            <div class="fin-field-row">
              <div class="fin-field">
                <label class="fin-label">Dias úteis no mês</label>
                <input type="number" id="finDiasUteis" class="fin-input" value="${meta.diasUteis}" />
              </div>
              <div class="fin-field">
                <label class="fin-label">Dias úteis decorridos</label>
                <input type="number" id="finDiasDecorridos" class="fin-input" value="${meta.diasDecorridos}" />
              </div>
            </div>
            <div class="fin-field-row">
              <div class="fin-field">
                <label class="fin-label">Ticket médio (R$)</label>
                <input type="text" id="finTicket" class="fin-input" value="${_fmtRaw(meta.ticketMedio)}" placeholder="0" oninput="finGoals.maskMoney(this)" />
              </div>
              <div class="fin-field">
                <label class="fin-label">Mês de referência</label>
                <input type="text" id="finMesAtual" class="fin-input" value="${meta.mesAtual}" />
              </div>
            </div>
            <button class="fin-btn-primary" onclick="finGoals.saveMeta()">
              <i data-feather="save"></i> Salvar e Recalcular
            </button>
          </div>
        </div>

        <!-- Gauge de progresso -->
        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title"><i data-feather="activity"></i> Progresso da Meta</span>
          </div>
          <div class="fin-card-body">
            <div class="fin-gauge-wrap">
              <canvas id="finGaugeChart" height="160"></canvas>
              <div class="fin-gauge-center">
                <span class="fin-gauge-pct">${pct.toFixed(1)}%</span>
                <span class="fin-gauge-sub">da meta</span>
              </div>
            </div>
            <div class="fin-meta-triptych">
              <div class="fin-meta-val-box">
                <span class="fin-meta-val-num" style="color:#10B981">${_fmt(meta.realizado)}</span>
                <span class="fin-meta-val-lbl">Realizado</span>
              </div>
              <div class="fin-meta-val-box">
                <span class="fin-meta-val-num" style="color:#EF4444">${_fmt(falta)}</span>
                <span class="fin-meta-val-lbl">Falta</span>
              </div>
              <div class="fin-meta-val-box">
                <span class="fin-meta-val-num" style="color:#C9A96E">${_fmt(meta.mensal)}</span>
                <span class="fin-meta-val-lbl">Meta</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- O que precisa acontecer -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="zap"></i> O que precisa acontecer para bater a meta</span>
          <span class="fin-badge fin-badge-${status === 'ok' ? 'green' : status === 'warn' ? 'yellow' : 'red'}">
            ${status === 'ok' ? '✓ No caminho certo' : status === 'warn' ? '⚠ Atenção necessária' : '✗ Ritmo insuficiente'}
          </span>
        </div>
        <div class="fin-card-body">
          <div class="fin-action-grid">
            <div class="fin-action-box fin-action-blue">
              <div class="fin-action-icon"><i data-feather="calendar"></i></div>
              <div><span class="fin-action-val">${diasRestantes}</span><span class="fin-action-lbl">Dias úteis restantes</span></div>
            </div>
            <div class="fin-action-box fin-action-gold">
              <div class="fin-action-icon"><i data-feather="dollar-sign"></i></div>
              <div><span class="fin-action-val">${_fmt(necPorDia)}</span><span class="fin-action-lbl">Necessário por dia</span></div>
            </div>
            <div class="fin-action-box fin-action-purple">
              <div class="fin-action-icon"><i data-feather="scissors"></i></div>
              <div><span class="fin-action-val">${consultasPorDia}</span><span class="fin-action-lbl">Procedimentos/dia necessários</span></div>
            </div>
            <div class="fin-action-box fin-action-${status === 'ok' ? 'green' : status === 'warn' ? 'yellow' : 'red'}">
              <div class="fin-action-icon"><i data-feather="trending-up"></i></div>
              <div><span class="fin-action-val">${_fmt(projecao)}</span><span class="fin-action-lbl">Projeção ao final do mês</span></div>
            </div>
          </div>

          <div class="fin-equilibrio">
            <div class="fin-eq-row">
              <span class="fin-eq-label"><i data-feather="anchor"></i> Ponto de Equilíbrio</span>
              <span class="fin-eq-vals">${_fmt(meta.realizado)} / ${_fmt(totalGastos)}</span>
            </div>
            <div class="fin-progress-track">
              <div class="fin-progress-bar fin-progress-blue" style="width:${pctEq.toFixed(1)}%"></div>
            </div>
            <p class="fin-eq-note">
              ${meta.realizado >= totalGastos
                ? `✓ Ponto de equilíbrio atingido — ${_fmt(meta.realizado - totalGastos)} de lucro até agora.`
                : `Faltam ${_fmt(totalGastos - meta.realizado)} para cobrir todos os gastos do mês.`}
            </p>
          </div>
        </div>
      </div>

      <!-- Histórico de faturamento -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="bar-chart"></i> Histórico de Faturamento (6 meses)</span>
        </div>
        <div class="fin-card-body">
          <canvas id="finHistChart" height="90"></canvas>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════
     TAB 2 — GASTOS
  ═══════════════════════════════════════════════════════ */
  function _renderGastos() {
    const totF  = gastos.fixos.reduce((a, g) => a + g.valor, 0);
    const totV  = gastos.variaveis.reduce((a, g) => a + g.valor, 0);
    const tot   = totF + totV;
    const lucro = meta.realizado - tot;
    const mg    = meta.realizado > 0 ? (lucro / meta.realizado * 100) : 0;

    return `
      <div class="fin-grid-3-1">
        <!-- Fixos -->
        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title"><i data-feather="lock"></i> Gastos Fixos</span>
            <button class="fin-btn-add" onclick="finGoals.addGasto('fixo')"><i data-feather="plus"></i> Adicionar</button>
          </div>
          <div class="fin-card-body">
            <div class="fin-gasto-list">${_renderGastoItems(gastos.fixos, 'fixo')}</div>
            <div class="fin-gasto-total">
              <span>Total Fixo</span>
              <span class="fin-gasto-total-val">${_fmt(totF)}</span>
            </div>
          </div>
        </div>

        <!-- Variáveis -->
        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title"><i data-feather="shuffle"></i> Gastos Variáveis</span>
            <button class="fin-btn-add" onclick="finGoals.addGasto('variavel')"><i data-feather="plus"></i> Adicionar</button>
          </div>
          <div class="fin-card-body">
            <div class="fin-gasto-list">${_renderGastoItems(gastos.variaveis, 'variavel')}</div>
            <div class="fin-gasto-total">
              <span>Total Variável</span>
              <span class="fin-gasto-total-val">${_fmt(totV)}</span>
            </div>
          </div>
        </div>

        <!-- Resumo -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="fin-card">
            <div class="fin-card-header"><span class="fin-card-title"><i data-feather="pie-chart"></i> Distribuição</span></div>
            <div class="fin-card-body"><canvas id="finGastosChart" height="190"></canvas></div>
          </div>
          <div class="fin-card">
            <div class="fin-card-header"><span class="fin-card-title"><i data-feather="trending-up"></i> Resultado do Mês</span></div>
            <div class="fin-card-body">
              <div class="fin-resultado-row"><span>Faturamento</span><span class="fin-res-green">${_fmt(meta.realizado)}</span></div>
              <div class="fin-resultado-row"><span>(-) Fixos</span><span class="fin-res-red">- ${_fmt(totF)}</span></div>
              <div class="fin-resultado-row"><span>(-) Variáveis</span><span class="fin-res-red">- ${_fmt(totV)}</span></div>
              <div class="fin-resultado-divider"></div>
              <div class="fin-resultado-row fin-resultado-final">
                <span>Lucro Líquido</span>
                <span class="${lucro >= 0 ? 'fin-res-green' : 'fin-res-red'}">${lucro < 0 ? '-' : ''}${_fmt(Math.abs(lucro))}</span>
              </div>
              <div class="fin-margem-track">
                <div class="fin-margem-fill" style="width:${Math.max(0, Math.min(mg, 100)).toFixed(1)}%;background:${mg >= 30 ? '#10B981' : mg >= 15 ? '#F59E0B' : '#EF4444'}"></div>
              </div>
              <p class="fin-margem-txt">Margem líquida: <strong>${mg.toFixed(1)}%</strong></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Form inline -->
      <div class="fin-card fin-card-full fin-hidden" id="finGastoForm">
        <div class="fin-card-header">
          <span class="fin-card-title" id="finGastoFormTitle">Novo Gasto</span>
        </div>
        <div class="fin-card-body">
          <div class="fin-field-row">
            <div class="fin-field">
              <label class="fin-label">Descrição</label>
              <input type="text" id="finGastoNome" class="fin-input" placeholder="Ex: Aluguel" />
            </div>
            <div class="fin-field fin-field-sm">
              <label class="fin-label">Valor (R$)</label>
              <input type="text" id="finGastoValor" class="fin-input" placeholder="0" oninput="finGoals.maskMoney(this)" />
            </div>
            <input type="hidden" id="finGastoTipo" />
            <input type="hidden" id="finGastoId" />
          </div>
          <div class="fin-form-btns">
            <button class="fin-btn-cancel" onclick="finGoals.cancelGasto()">Cancelar</button>
            <button class="fin-btn-primary" onclick="finGoals.saveGasto()"><i data-feather="save"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;
  }

  function _renderGastoItems(list, tipo) {
    if (!list.length) return `<div class="fin-empty">Nenhum gasto cadastrado.</div>`;
    return list.map(g => `
      <div class="fin-gasto-item">
        <span class="fin-gasto-nome">${_esc(g.nome)}</span>
        <span class="fin-gasto-val">${_fmt(g.valor)}</span>
        <div class="fin-gasto-actions">
          <button class="fin-icon-btn" onclick="finGoals.editGasto('${tipo}',${g.id})" title="Editar"><i data-feather="edit-2"></i></button>
          <button class="fin-icon-btn fin-icon-del" onclick="finGoals.deleteGasto('${tipo}',${g.id})" title="Excluir"><i data-feather="trash-2"></i></button>
        </div>
      </div>`).join('');
  }

  /* ═══════════════════════════════════════════════════════
     TAB 3 — PROCEDIMENTOS
  ═══════════════════════════════════════════════════════ */
  function _renderProcedimentos() {
    const calc = procs.map(p => ({
      ...p,
      lucroUnit:    p.preco - p.custo,
      margem:       (p.preco - p.custo) / p.preco * 100,
      receitaTotal: p.preco * p.qtd,
      lucroTotal:   (p.preco - p.custo) * p.qtd,
    })).sort((a, b) => b.lucroTotal - a.lucroTotal);

    const totRec  = calc.reduce((a, p) => a + p.receitaTotal, 0);
    const totLuc  = calc.reduce((a, p) => a + p.lucroTotal,   0);
    const totQtd  = calc.reduce((a, p) => a + p.qtd,          0);

    return `
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="scissors"></i> Rentabilidade por Procedimento</span>
          <button class="fin-btn-add" onclick="finGoals.addProc()"><i data-feather="plus"></i> Adicionar</button>
        </div>
        <div class="fin-card-body">
          <div class="fin-proc-table-wrap">
            <table class="fin-proc-table">
              <thead>
                <tr>
                  <th>Procedimento</th><th>Cat.</th><th>Preço</th><th>Custo</th>
                  <th>Lucro Unit.</th><th>Margem</th><th>Qtd.</th>
                  <th>Receita Total</th><th>Lucro Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                ${calc.map((p, i) => `
                  <tr class="${i === 0 ? 'fin-proc-row-top' : ''}">
                    <td class="fin-proc-nome">${i === 0 ? '<span class="fin-proc-crown" title="Mais lucrativo">👑</span>' : ''} ${_esc(p.nome)}</td>
                    <td><span class="fin-proc-cat">${_esc(p.cat)}</span></td>
                    <td>${_fmt(p.preco)}</td>
                    <td class="fin-proc-custo">${_fmt(p.custo)}</td>
                    <td class="fin-proc-lucro-u">${_fmt(p.lucroUnit)}</td>
                    <td>
                      <div class="fin-proc-mg-wrap">
                        <div class="fin-proc-mg-bar" style="width:${p.margem.toFixed(0)}%;background:${p.margem >= 80 ? '#10B981' : p.margem >= 60 ? '#F59E0B' : '#EF4444'}"></div>
                        <span class="fin-proc-mg-txt">${p.margem.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td class="fin-proc-qtd">${p.qtd}</td>
                    <td class="fin-proc-rec">${_fmt(p.receitaTotal)}</td>
                    <td class="fin-proc-luc">${_fmt(p.lucroTotal)}</td>
                    <td>
                      <div class="fin-proc-actions">
                        <button class="fin-icon-btn" onclick="finGoals.editProc(${p.id})"><i data-feather="edit-2"></i></button>
                        <button class="fin-icon-btn fin-icon-del" onclick="finGoals.deleteProc(${p.id})"><i data-feather="trash-2"></i></button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr class="fin-proc-tfoot">
                  <td colspan="6" class="fin-proc-tfoot-lbl">Totais</td>
                  <td class="fin-proc-qtd">${totQtd}</td>
                  <td class="fin-proc-rec">${_fmt(totRec)}</td>
                  <td class="fin-proc-luc">${_fmt(totLuc)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div class="fin-grid-2">
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="bar-chart-2"></i> Receita Total por Procedimento</span></div>
          <div class="fin-card-body"><canvas id="finProcReceitaChart" height="220"></canvas></div>
        </div>
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="percent"></i> Margem por Procedimento</span></div>
          <div class="fin-card-body"><canvas id="finProcMargemChart" height="220"></canvas></div>
        </div>
      </div>

      <!-- Form -->
      <div class="fin-card fin-card-full fin-hidden" id="finProcForm">
        <div class="fin-card-header"><span class="fin-card-title" id="finProcFormTitle">Novo Procedimento</span></div>
        <div class="fin-card-body">
          <div class="fin-field-row">
            <div class="fin-field"><label class="fin-label">Nome</label><input type="text" id="finProcNome" class="fin-input" placeholder="Ex: Botox" /></div>
            <div class="fin-field"><label class="fin-label">Categoria</label><input type="text" id="finProcCat" class="fin-input" placeholder="Ex: Injetável" /></div>
            <div class="fin-field fin-field-sm"><label class="fin-label">Preço (R$)</label><input type="text" id="finProcPreco" class="fin-input" placeholder="0" oninput="finGoals.maskMoney(this)" /></div>
            <div class="fin-field fin-field-sm"><label class="fin-label">Custo (R$)</label><input type="text" id="finProcCusto" class="fin-input" placeholder="0" oninput="finGoals.maskMoney(this)" /></div>
            <div class="fin-field fin-field-sm"><label class="fin-label">Qtd. realizada</label><input type="number" id="finProcQtd" class="fin-input" /></div>
            <input type="hidden" id="finProcId" />
          </div>
          <div class="fin-form-btns">
            <button class="fin-btn-cancel" onclick="finGoals.cancelProc()">Cancelar</button>
            <button class="fin-btn-primary" onclick="finGoals.saveProc()"><i data-feather="save"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════
     TAB 4 — CLIENTES
  ═══════════════════════════════════════════════════════ */
  function _renderClientes() {
    const total = demo.genero.feminino + demo.genero.masculino;
    const pctF  = (demo.genero.feminino  / total * 100).toFixed(0);
    const pctM  = (demo.genero.masculino / total * 100).toFixed(0);
    const maxTotal = Math.max(...demo.faixas.map(f => f.total));

    return `
      <div class="fin-grid-2">
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="users"></i> Volume por Faixa Etária e Gênero</span></div>
          <div class="fin-card-body"><canvas id="finIdadeChart" height="210"></canvas></div>
        </div>
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="user"></i> Distribuição por Gênero</span></div>
          <div class="fin-card-body">
            <div class="fin-genero-wrap">
              <canvas id="finGeneroChart" height="160"></canvas>
              <div class="fin-genero-legend">
                <div class="fin-genero-item">
                  <span class="fin-genero-dot" style="background:#7C3AED"></span>
                  <div><span class="fin-genero-pct">${pctF}%</span><span class="fin-genero-lbl">Feminino — ${demo.genero.feminino} clientes</span></div>
                </div>
                <div class="fin-genero-item">
                  <span class="fin-genero-dot" style="background:#3B82F6"></span>
                  <div><span class="fin-genero-pct">${pctM}%</span><span class="fin-genero-lbl">Masculino — ${demo.genero.masculino} clientes</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="fin-grid-2">
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="dollar-sign"></i> Ticket Médio por Faixa Etária</span></div>
          <div class="fin-card-body"><canvas id="finTicketFaixaChart" height="180"></canvas></div>
        </div>
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title"><i data-feather="award"></i> Ranking por Faixa Etária</span></div>
          <div class="fin-card-body">
            ${demo.faixas.map((f, i) => {
              const w = (f.total / maxTotal * 100).toFixed(0);
              const colors = ['#7C3AED','#3B82F6','#10B981','#C9A96E','#F59E0B'];
              return `
                <div class="fin-faixa-row">
                  <span class="fin-faixa-lbl">${f.label}</span>
                  <div class="fin-faixa-bar-wrap">
                    <div class="fin-faixa-bar" style="width:${w}%;background:${colors[i]}"></div>
                  </div>
                  <span class="fin-faixa-num">${f.total}</span>
                  <span class="fin-faixa-sub">${f.feminino}F · ${f.masculino}M</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Heatmap -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="grid"></i> Heatmap — Procedimento × Faixa Etária</span>
          <span class="fin-card-note">Número de procedimentos por grupo</span>
        </div>
        <div class="fin-card-body">${_renderHeatmap()}</div>
      </div>
    `;
  }

  function _renderHeatmap() {
    const procNames = procs.map(p => p.nome);
    const faixas    = demo.faixas.map(f => f.label);
    const data      = demo.procPorFaixa;
    const max       = Math.max(...data.flat(), 1);

    let html = `<div class="fin-heatmap-wrap"><div class="fin-hm-grid" style="grid-template-columns:72px repeat(${procNames.length},1fr)">`;
    html += `<div class="fin-hm-corner"></div>`;
    procNames.forEach(n => { html += `<div class="fin-hm-col">${n.split(' ')[0]}</div>`; });
    data.forEach((row, fi) => {
      html += `<div class="fin-hm-row">${faixas[fi]}</div>`;
      row.forEach((val, pi) => {
        const intensity = val / max;
        const bg = `rgba(124,58,237,${(0.08 + intensity * 0.82).toFixed(2)})`;
        const color = intensity > 0.5 ? '#fff' : '#9CA3AF';
        html += `<div class="fin-hm-cell" style="background:${bg};color:${color}" title="${faixas[fi]} × ${procNames[pi]}: ${val}">${val}</div>`;
      });
    });
    html += `</div></div>`;
    return html;
  }

  /* ═══════════════════════════════════════════════════════
     TAB 5 — CRUZAMENTO BI
  ═══════════════════════════════════════════════════════ */
  function _renderCruzamento() {
    const canais = [
      { canal:'Instagram',  leads:180, conv:28, ticket:890  },
      { canal:'Google Ads', leads:95,  conv:35, ticket:1100 },
      { canal:'Indicação',  leads:62,  conv:58, ticket:1350 },
      { canal:'WhatsApp',   leads:143, conv:22, ticket:720  },
      { canal:'Orgânico',   leads:48,  conv:45, ticket:980  },
    ];

    const sdrs = [
      { nome:'Ana Lima',    leads:84,  agend:38, conv:28, receita:32400 },
      { nome:'Carlos Melo', leads:71,  agend:29, conv:19, receita:22100 },
      { nome:'Bia Nunes',   leads:92,  agend:45, conv:34, receita:38900 },
      { nome:'Diego Faria', leads:58,  agend:22, conv:14, receita:15600 },
    ];

    return `
      <!-- Canal × Conversão × Ticket -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="target"></i> Canal de Captação × Conversão × Ticket Médio</span>
          <span class="fin-card-note">Eficiência de cada canal de aquisição</span>
        </div>
        <div class="fin-card-body">
          <div class="fin-bi-2col">
            <canvas id="finCanalChart" height="230"></canvas>
            <table class="fin-bi-table">
              <thead><tr><th>Canal</th><th>Leads</th><th>Conv.</th><th>Ticket</th><th>Receita Est.</th></tr></thead>
              <tbody>
                ${canais.map(c => `
                  <tr>
                    <td class="fin-bi-nome">${c.canal}</td>
                    <td>${c.leads}</td>
                    <td>
                      <div class="fin-mini-bar-row">
                        <div class="fin-mini-bar" style="width:${c.conv}%;background:${c.conv >= 40 ? '#10B981' : c.conv >= 25 ? '#F59E0B' : '#EF4444'}"></div>
                        <span>${c.conv}%</span>
                      </div>
                    </td>
                    <td>${_fmt(c.ticket)}</td>
                    <td class="fin-bi-rec">${_fmt(Math.round(c.leads * (c.conv/100) * c.ticket))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SDR Performance -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="users"></i> SDR × Volume × Receita Gerada</span>
          <span class="fin-card-note">Performance individual de cada SDR</span>
        </div>
        <div class="fin-card-body">
          <div class="fin-bi-2col">
            <canvas id="finSdrChart" height="200"></canvas>
            <table class="fin-bi-table">
              <thead><tr><th>SDR</th><th>Leads</th><th>Agend.</th><th>Conver.</th><th>Receita</th><th>Conv%</th></tr></thead>
              <tbody>
                ${sdrs.map(s => {
                  const pct = s.leads > 0 ? (s.conv / s.leads * 100).toFixed(0) : 0;
                  return `
                    <tr>
                      <td class="fin-bi-nome">${s.nome}</td>
                      <td>${s.leads}</td>
                      <td>${s.agend}</td>
                      <td>${s.conv}</td>
                      <td class="fin-bi-rec">${_fmt(s.receita)}</td>
                      <td><span class="fin-conv-badge fin-conv-${pct >= 35 ? 'green' : pct >= 20 ? 'yellow' : 'red'}">${pct}%</span></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Procedimento × Faixa × Receita -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="layers"></i> Procedimento × Faixa Etária × Receita</span>
          <span class="fin-card-note">Quais procedimentos geram mais receita em cada grupo etário</span>
        </div>
        <div class="fin-card-body"><canvas id="finProcFaixaChart" height="100"></canvas></div>
      </div>

      <!-- Insight cards -->
      <div class="fin-insight-grid">
        <div class="fin-insight-card fin-ins-purple">
          <i data-feather="zap"></i>
          <div><strong>Melhor canal de ROI</strong><p>Indicação — 58% de conversão com ticket médio de R$ 1.350</p></div>
        </div>
        <div class="fin-insight-card fin-ins-blue">
          <i data-feather="star"></i>
          <div><strong>SDR de maior receita</strong><p>Bia Nunes — R$ 38.900 com 37% de conversão</p></div>
        </div>
        <div class="fin-insight-card fin-ins-gold">
          <i data-feather="trending-up"></i>
          <div><strong>Faixa mais rentável</strong><p>35–44 anos — ticket médio R$ 920 e maior volume</p></div>
        </div>
        <div class="fin-insight-card fin-ins-green">
          <i data-feather="award"></i>
          <div><strong>Procedimento top lucro</strong><p>Fios de PDO — R$ 2.600 de lucro por procedimento</p></div>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════
     TAB 0 — PLANEJAMENTO ANUAL
  ═══════════════════════════════════════════════════════ */
  function _renderPlanejamento() {
    const mesAtual    = new Date().getMonth() + 1; // 1-12
    const totalMeta   = planejamento.meses.reduce((a, m) => a + m.meta, 0);
    const totalReal   = planejamento.meses.reduce((a, m) => a + m.realizado, 0);
    const pctAnual    = totalMeta > 0 ? (totalReal / totalMeta * 100).toFixed(1) : 0;
    const shortMeses  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    /* ── Meses Grid ── */
    const mesesHtml = planejamento.meses.map((m, i) => {
      const isCurrent = m.mes === mesAtual;
      const isPast    = m.mes < mesAtual;
      const pct       = m.meta > 0 ? Math.min((m.realizado / m.meta) * 100, 100) : 0;
      const status    = !m.meta ? 'none' : isPast ? (pct >= 100 ? 'hit' : pct >= 80 ? 'close' : 'miss') : 'future';
      const barColor  = { hit:'#10B981', close:'#F59E0B', miss:'#EF4444', future:'#3B82F6', none:'#6B7280' }[status];
      return `
        <div class="plan-mes-card ${isCurrent ? 'plan-mes-current' : ''}" data-mes="${m.mes}">
          <div class="plan-mes-header">
            <span class="plan-mes-nome">${m.nome}</span>
            ${isCurrent ? '<span class="plan-mes-badge">Atual</span>' : ''}
            ${status === 'hit'  ? '<span class="plan-mes-status plan-s-hit">✓</span>'  : ''}
            ${status === 'miss' ? '<span class="plan-mes-status plan-s-miss">✗</span>' : ''}
          </div>
          <div class="plan-mes-inputs">
            <div class="plan-mes-field">
              <label>Meta</label>
              <input type="text" class="plan-mes-input plan-meta-input"
                data-mes="${m.mes}" value="${_fmtRaw(m.meta)}" placeholder="0"
                oninput="finGoals.maskMoney(this)"
                onchange="finGoals.updateMesMeta(${m.mes}, this.value)" />
            </div>
            <div class="plan-mes-field">
              <label>Realizado</label>
              <input type="text" class="plan-mes-input plan-real-input"
                data-mes="${m.mes}" value="${_fmtRaw(m.realizado)}" placeholder="0"
                oninput="finGoals.maskMoney(this)"
                onchange="finGoals.updateMesRealizado(${m.mes}, this.value)" />
            </div>
          </div>
          ${m.meta > 0 ? `
            <div class="plan-mes-progress">
              <div class="plan-mes-bar" style="width:${pct.toFixed(0)}%;background:${barColor}"></div>
            </div>
            <span class="plan-mes-pct" style="color:${barColor}">${pct.toFixed(0)}%</span>
          ` : '<span class="plan-mes-pct plan-mes-pct-empty">—</span>'}
        </div>`;
    }).join('');

    /* ── Especialistas Matrix ── */
    const espHtml = _renderEspMatrix(shortMeses);

    return `
      <!-- Header anual -->
      <div class="plan-header-row">
        <div class="plan-header-info">
          <div class="plan-ano-selector">
            <button class="plan-ano-btn" onclick="finGoals.changeAno(-1)"><i data-feather="chevron-left"></i></button>
            <span class="plan-ano-label">${planejamento.ano}</span>
            <button class="plan-ano-btn" onclick="finGoals.changeAno(1)"><i data-feather="chevron-right"></i></button>
          </div>
          <div class="plan-totais">
            <div class="plan-total-item">
              <span class="plan-total-val">${_fmt(totalMeta)}</span>
              <span class="plan-total-lbl">Meta Anual Total</span>
            </div>
            <div class="plan-total-sep"></div>
            <div class="plan-total-item">
              <span class="plan-total-val" style="color:#10B981">${_fmt(totalReal)}</span>
              <span class="plan-total-lbl">Realizado Ano</span>
            </div>
            <div class="plan-total-sep"></div>
            <div class="plan-total-item">
              <span class="plan-total-val" style="color:#C9A96E">${pctAnual}%</span>
              <span class="plan-total-lbl">% Atingido</span>
            </div>
          </div>
        </div>
        <div class="plan-header-actions">
          <button class="fin-btn-add" onclick="finGoals.distribuirMeta()"><i data-feather="divide"></i> Distribuir Meta</button>
          <button class="fin-btn-primary" onclick="finGoals.savePlan()"><i data-feather="save"></i> Salvar Planejamento</button>
        </div>
      </div>

      <!-- Modal distribuição -->
      <div class="plan-dist-bar fin-hidden" id="planDistBar">
        <div class="plan-dist-inner">
          <span class="plan-dist-lbl">Meta anual para distribuir (R$):</span>
          <input type="text" id="planDistTotal" class="fin-input" style="width:160px" placeholder="Ex: 1.800.000" oninput="finGoals.maskMoney(this)" />
          <select id="planDistTipo" class="fin-input" style="width:180px">
            <option value="igual">Dividir igualmente</option>
            <option value="sazonalidade">Com sazonalidade</option>
          </select>
          <button class="fin-btn-primary" onclick="finGoals.aplicarDistribuicao()"><i data-feather="zap"></i> Aplicar</button>
          <button class="fin-btn-cancel" onclick="finGoals.fecharDistribuicao()">Cancelar</button>
        </div>
      </div>

      <!-- Grid de meses -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="calendar"></i> Metas Mensais — ${planejamento.ano}</span>
          <span class="fin-card-note">Clique nos campos para editar</span>
        </div>
        <div class="fin-card-body">
          <div class="plan-meses-grid">${mesesHtml}</div>
        </div>
      </div>

      <!-- Gráfico anual -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="bar-chart-2"></i> Visão Anual — Meta vs Realizado</span>
        </div>
        <div class="fin-card-body">
          <canvas id="finPlanAnualChart" height="90"></canvas>
        </div>
      </div>

      <!-- Especialistas -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="users"></i> Metas por Especialista × Mês</span>
          <button class="fin-btn-add" onclick="finGoals.addEsp()"><i data-feather="user-plus"></i> Adicionar</button>
        </div>
        <div class="fin-card-body">
          <div class="plan-esp-wrap">${espHtml}</div>
        </div>
      </div>

      <!-- Campanhas necessárias por mês -->
      <div class="fin-card fin-card-full">
        <div class="fin-card-header">
          <span class="fin-card-title"><i data-feather="zap"></i> Campanhas e Ações Necessárias por Mês</span>
          <span class="fin-card-note">Baseado nas metas cadastradas</span>
        </div>
        <div class="fin-card-body">
          <div class="plan-camp-grid">
            ${planejamento.meses.filter(m => m.meta > 0).map(m => {
              const gap    = Math.max(m.meta - m.realizado, 0);
              const proc   = meta.ticketMedio > 0 ? Math.ceil(gap / meta.ticketMedio) : '—';
              const leads  = meta.ticketMedio > 0 ? Math.ceil(proc * 3.5) : '—'; // estimativa 30% conv
              return `
                <div class="plan-camp-card">
                  <div class="plan-camp-mes">${m.nome.slice(0, 3)}</div>
                  <div class="plan-camp-meta">${_fmt(m.meta)}</div>
                  ${gap > 0 ? `
                    <div class="plan-camp-row"><i data-feather="scissors"></i><span>${proc} procedimentos</span></div>
                    <div class="plan-camp-row"><i data-feather="users"></i><span>~${leads} leads</span></div>
                    <div class="plan-camp-gap">Gap: ${_fmt(gap)}</div>
                  ` : `<div class="plan-camp-ok">✓ Meta atingida</div>`}
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Form especialista -->
      <div class="fin-card fin-card-full fin-hidden" id="finEspForm">
        <div class="fin-card-header"><span class="fin-card-title" id="finEspFormTitle">Novo Especialista</span></div>
        <div class="fin-card-body">
          <div class="fin-field-row">
            <div class="fin-field"><label class="fin-label">Nome</label><input type="text" id="finEspNome" class="fin-input" placeholder="Nome completo" /></div>
            <div class="fin-field"><label class="fin-label">Cargo / Função</label><input type="text" id="finEspCargo" class="fin-input" placeholder="Ex: SDR, Esteticista" /></div>
            <input type="hidden" id="finEspId" />
          </div>
          <div class="fin-form-btns">
            <button class="fin-btn-cancel" onclick="finGoals.cancelEsp()">Cancelar</button>
            <button class="fin-btn-primary" onclick="finGoals.saveEsp()"><i data-feather="save"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;
  }

  function _renderEspMatrix(shortMeses) {
    if (!planejamento.especialistas.length) {
      return `<div class="fin-empty">Nenhum especialista cadastrado. Clique em "Adicionar".</div>`;
    }

    const totaisMes = shortMeses.map((_, mi) =>
      planejamento.especialistas.reduce((a, e) => a + (e.metas[mi] || 0), 0)
    );
    const metasMes = planejamento.meses.map(m => m.meta);

    return `
      <div class="plan-matrix-wrap">
        <table class="plan-matrix-table">
          <thead>
            <tr>
              <th class="plan-matrix-esp-col">Especialista</th>
              ${shortMeses.map(m => `<th class="plan-matrix-mes-col">${m}</th>`).join('')}
              <th class="plan-matrix-tot-col">Total</th>
              <th class="plan-matrix-act-col"></th>
            </tr>
          </thead>
          <tbody>
            ${planejamento.especialistas.map(e => {
              const total = e.metas.reduce((a, v) => a + (v || 0), 0);
              return `
                <tr class="plan-matrix-row" data-esp="${e.id}">
                  <td class="plan-matrix-esp-cell">
                    <div class="plan-esp-info">
                      <span class="plan-esp-nome">${_esc(e.nome)}</span>
                      <span class="plan-esp-cargo">${_esc(e.cargo)}</span>
                    </div>
                  </td>
                  ${e.metas.map((v, mi) => `
                    <td class="plan-matrix-input-cell">
                      <input type="text" class="plan-matrix-input"
                        value="${_fmtRaw(v)}" placeholder="—"
                        oninput="finGoals.maskMoney(this)"
                        onchange="finGoals.updateEspMeta(${e.id}, ${mi}, this.value)"
                        title="${e.nome} — ${shortMeses[mi]}" />
                    </td>`).join('')}
                  <td class="plan-matrix-tot-cell">${total > 0 ? _fmt(total) : '—'}</td>
                  <td class="plan-matrix-act-cell">
                    <button class="fin-icon-btn" onclick="finGoals.editEsp(${e.id})" title="Editar"><i data-feather="edit-2"></i></button>
                    <button class="fin-icon-btn fin-icon-del" onclick="finGoals.deleteEsp(${e.id})" title="Remover"><i data-feather="trash-2"></i></button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="plan-matrix-totals">
              <td class="plan-matrix-tot-lbl">Total por Mês</td>
              ${totaisMes.map((t, mi) => {
                const metaMes = metasMes[mi] || 0;
                const over    = metaMes > 0 && t > metaMes;
                const under   = metaMes > 0 && t < metaMes;
                return `<td class="plan-matrix-tot-mes ${over ? 'plan-tot-over' : under ? 'plan-tot-under' : ''}">${t > 0 ? _fmt(t) : '—'}</td>`;
              }).join('')}
              <td class="plan-matrix-tot-cell">${_fmt(totaisMes.reduce((a,v)=>a+v,0))}</td>
              <td></td>
            </tr>
            <tr class="plan-matrix-gap">
              <td class="plan-matrix-tot-lbl" style="color:#9CA3AF;font-size:11px">Gap c/ meta do mês</td>
              ${planejamento.meses.map((m, mi) => {
                const t   = totaisMes[mi];
                const gap = m.meta - t;
                return `<td class="plan-matrix-gap-cell" style="color:${gap > 0 ? '#F59E0B' : gap < 0 ? '#EF4444' : '#10B981'};font-size:11px">
                  ${m.meta > 0 ? (gap === 0 ? '✓' : (gap > 0 ? '+' + _fmt(gap) : _fmt(gap))) : '—'}
                </td>`;
              }).join('')}
              <td></td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════
     CHARTS
  ═══════════════════════════════════════════════════════ */
  const C = {
    gold:'#C9A96E', purple:'#7C3AED', blue:'#3B82F6',
    emerald:'#10B981', red:'#EF4444', yellow:'#F59E0B',
  };
  const PALETTE = [C.purple, C.blue, C.emerald, C.gold, C.yellow, C.red, '#8B5CF6', '#06B6D4'];

  function _tt() {
    return {
      backgroundColor:'#1A1B2E', titleColor:'#fff',
      bodyColor:'rgba(255,255,255,.75)', borderColor:'rgba(255,255,255,.1)',
      borderWidth:1, padding:10, cornerRadius:8,
    };
  }

  function _initCharts() {
    setTimeout(() => {
      if (activeTab === 'planejamento')   _initPlanCharts();
      if (activeTab === 'metas')         _initMetaCharts();
      if (activeTab === 'gastos')        _initGastosCharts();
      if (activeTab === 'procedimentos') _initProcCharts();
      if (activeTab === 'clientes')      _initClienteCharts();
      if (activeTab === 'cruzamento')    _initCruzCharts();
    }, 30);
  }

  function _initPlanCharts() {
    const ctx = document.getElementById('finPlanAnualChart');
    if (!ctx) return;
    const shortMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const metas    = planejamento.meses.map(m => m.meta);
    const reais    = planejamento.meses.map(m => m.realizado);
    const mesAtual = new Date().getMonth(); // 0-based index

    // datasets de especialistas (stacked realizado por especialista, se houver metas)
    const espDatasets = planejamento.especialistas.length
      ? planejamento.especialistas.map((e, i) => ({
          label: e.nome.split(' ')[0],
          data:  e.metas,
          backgroundColor: PALETTE[i % PALETTE.length],
          borderRadius: 3,
          stack: 'esp',
          order: 3,
        }))
      : [];

    _charts.planAnual = new Chart(ctx, {
      type:'bar',
      data:{
        labels: shortMeses,
        datasets: [
          ...espDatasets,
          {
            label: 'Meta Mensal',
            data: metas,
            type: 'line',
            borderColor: C.gold,
            borderDash: [6,3],
            borderWidth: 2,
            pointBackgroundColor: C.gold,
            pointRadius: shortMeses.map((_,i) => i === mesAtual ? 6 : 3),
            fill: false,
            order: 1,
          },
          {
            label: 'Realizado',
            data: reais,
            backgroundColor: reais.map((v,i) => {
              if (!metas[i]) return 'rgba(107,114,128,.3)';
              return v >= metas[i] ? 'rgba(16,185,129,.75)' : 'rgba(59,130,246,.6)';
            }),
            borderRadius: 6,
            borderSkipped: false,
            stack: 'real',
            order: 2,
          },
        ],
      },
      options:{
        responsive: true, maintainAspectRatio: false,
        plugins:{
          legend:{ display:true, labels:{ color:'#9CA3AF', boxWidth:12, padding:16, font:{size:11} } },
          tooltip:{ ..._tt(), callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${_fmt(ctx.raw)}` } },
        },
        scales:{
          x:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'#9CA3AF'} },
          y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>'R$'+(v/1000).toFixed(0)+'k'} },
          ...(espDatasets.length ? {} : {}),
        },
      },
    });
  }

  function _initMetaCharts() {
    const pct = Math.min((meta.realizado / meta.mensal) * 100, 100);

    const gc = document.getElementById('finGaugeChart');
    if (gc) {
      _charts.gauge = new Chart(gc, {
        type:'doughnut',
        data:{ datasets:[{
          data:[pct, 100 - pct],
          backgroundColor:[pct >= 90 ? C.emerald : pct >= 60 ? C.gold : C.red, 'rgba(255,255,255,.05)'],
          borderWidth:0, circumference:180, rotation:-90,
        }]},
        options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', plugins:{ legend:{display:false}, tooltip:{enabled:false} }, animation:{duration:900} },
      });
    }

    const hc = document.getElementById('finHistChart');
    if (hc) {
      const fat = [102000,115000,98000,134000,127000,meta.realizado];
      const lbs = ['Out','Nov','Dez','Jan','Fev','Mar'];
      _charts.hist = new Chart(hc, {
        type:'bar',
        data:{ labels:lbs, datasets:[
          { label:'Faturamento', data:fat,
            backgroundColor:fat.map((_,i) => i===5 ? 'rgba(201,169,110,.85)' : 'rgba(124,58,237,.6)'),
            borderRadius:6, borderSkipped:false, order:2 },
          { label:'Meta', data:new Array(6).fill(meta.mensal), type:'line',
            borderColor:C.red, borderDash:[6,3], borderWidth:2, pointRadius:0, fill:false, order:1 },
        ]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true, labels:{color:'#9CA3AF', boxWidth:12, padding:16}}, tooltip:{..._tt(), callbacks:{label:ctx=>` ${ctx.dataset.label}: ${_fmt(ctx.raw)}`}} },
          scales:{
            x:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'#9CA3AF'} },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>'R$'+(v/1000).toFixed(0)+'k'} },
          },
        },
      });
    }
  }

  function _initGastosCharts() {
    const totF = gastos.fixos.reduce((a,g)=>a+g.valor,0);
    const totV = gastos.variaveis.reduce((a,g)=>a+g.valor,0);
    const luc  = Math.max(meta.realizado - totF - totV, 0);
    const gc   = document.getElementById('finGastosChart');
    if (!gc) return;
    _charts.gastos = new Chart(gc, {
      type:'doughnut',
      data:{ labels:['Fixos','Variáveis','Lucro Líquido'], datasets:[{
        data:[totF, totV, luc],
        backgroundColor:[C.red, C.yellow, C.emerald],
        borderWidth:2, borderColor:'#0A0B14',
      }]},
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'60%',
        plugins:{
          legend:{display:true, position:'bottom', labels:{color:'#9CA3AF', boxWidth:12, padding:12, font:{size:11}}},
          tooltip:{..._tt(), callbacks:{label:ctx=>` ${ctx.label}: ${_fmt(ctx.raw)}`}},
        },
      },
    });
  }

  function _initProcCharts() {
    const sorted = [...procs].sort((a,b) => (b.preco-b.custo)*b.qtd - (a.preco-a.custo)*a.qtd);
    const labels  = sorted.map(p => p.nome.split(' ')[0]);
    const receitas = sorted.map(p => p.preco * p.qtd);
    const margens  = sorted.map(p => ((p.preco-p.custo)/p.preco*100));

    const rc = document.getElementById('finProcReceitaChart');
    if (rc) {
      _charts.procRec = new Chart(rc, {
        type:'bar',
        data:{ labels, datasets:[{ label:'Receita Total', data:receitas,
          backgroundColor: PALETTE.slice(0, labels.length), borderRadius:6, borderSkipped:false }]},
        options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
          plugins:{ legend:{display:false}, tooltip:{..._tt(), callbacks:{label:ctx=>` ${_fmt(ctx.raw)}`}} },
          scales:{
            x:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>'R$'+(v/1000).toFixed(0)+'k'} },
            y:{ grid:{display:false}, ticks:{color:'#9CA3AF', font:{size:11}} },
          },
        },
      });
    }

    const mc = document.getElementById('finProcMargemChart');
    if (mc) {
      _charts.procMg = new Chart(mc, {
        type:'bar',
        data:{ labels, datasets:[{ label:'Margem %', data:margens,
          backgroundColor: margens.map(m => m >= 80 ? C.emerald : m >= 60 ? C.yellow : C.red),
          borderRadius:6, borderSkipped:false }]},
        options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
          plugins:{ legend:{display:false}, tooltip:{..._tt(), callbacks:{label:ctx=>` ${ctx.raw.toFixed(1)}%`}} },
          scales:{
            x:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>v+'%'}, max:100 },
            y:{ grid:{display:false}, ticks:{color:'#9CA3AF', font:{size:11}} },
          },
        },
      });
    }
  }

  function _initClienteCharts() {
    const flabels = demo.faixas.map(f => f.label);

    const ic = document.getElementById('finIdadeChart');
    if (ic) {
      _charts.idade = new Chart(ic, {
        type:'bar',
        data:{ labels:flabels, datasets:[
          { label:'Feminino',  data:demo.faixas.map(f=>f.feminino),  backgroundColor:'rgba(124,58,237,.8)', borderRadius:4, stack:'g' },
          { label:'Masculino', data:demo.faixas.map(f=>f.masculino), backgroundColor:'rgba(59,130,246,.8)',  borderRadius:4, stack:'g' },
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true, labels:{color:'#9CA3AF', boxWidth:12}}, tooltip:_tt() },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9CA3AF'}, stacked:true },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF'}, stacked:true },
          },
        },
      });
    }

    const gc = document.getElementById('finGeneroChart');
    if (gc) {
      _charts.genero = new Chart(gc, {
        type:'doughnut',
        data:{ labels:['Feminino','Masculino'], datasets:[{
          data:[demo.genero.feminino, demo.genero.masculino],
          backgroundColor:[C.purple, C.blue], borderWidth:2, borderColor:'#0A0B14',
        }]},
        options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
          plugins:{ legend:{display:false}, tooltip:{..._tt(), callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}`}} },
        },
      });
    }

    const tc = document.getElementById('finTicketFaixaChart');
    if (tc) {
      _charts.ticketF = new Chart(tc, {
        type:'line',
        data:{ labels:flabels, datasets:[{ label:'Ticket Médio', data:demo.ticketPorFaixa,
          borderColor:C.gold, backgroundColor:'rgba(201,169,110,.12)', fill:true,
          tension:0.4, pointBackgroundColor:C.gold, pointRadius:5 }]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{..._tt(), callbacks:{label:ctx=>` ${_fmt(ctx.raw)}`}} },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9CA3AF'} },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>_fmt(v)} },
          },
        },
      });
    }
  }

  function _initCruzCharts() {
    const canais = [
      { canal:'Instagram',  leads:180, conv:28 },
      { canal:'Google Ads', leads:95,  conv:35 },
      { canal:'Indicação',  leads:62,  conv:58 },
      { canal:'WhatsApp',   leads:143, conv:22 },
      { canal:'Orgânico',   leads:48,  conv:45 },
    ];

    const cc = document.getElementById('finCanalChart');
    if (cc) {
      _charts.canal = new Chart(cc, {
        type:'bar',
        data:{ labels:canais.map(c=>c.canal), datasets:[
          { label:'Leads', data:canais.map(c=>c.leads), backgroundColor:'rgba(124,58,237,.6)', borderRadius:4, yAxisID:'y', order:2 },
          { label:'Conv.%', data:canais.map(c=>c.conv), type:'line', borderColor:C.emerald, backgroundColor:'rgba(16,185,129,.1)',
            fill:false, tension:0.3, pointRadius:4, pointBackgroundColor:C.emerald, yAxisID:'y2', order:1 },
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true, labels:{color:'#9CA3AF', boxWidth:12}}, tooltip:_tt() },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9CA3AF', font:{size:11}} },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF'}, position:'left' },
            y2:{ grid:{display:false}, ticks:{color:C.emerald, callback:v=>v+'%'}, position:'right' },
          },
        },
      });
    }

    const sc = document.getElementById('finSdrChart');
    if (sc) {
      const sdrs = ['Ana','Carlos','Bia','Diego'];
      _charts.sdr = new Chart(sc, {
        type:'bar',
        data:{ labels:sdrs, datasets:[
          { label:'Leads', data:[84,71,92,58], backgroundColor:'rgba(59,130,246,.5)', borderRadius:4 },
          { label:'Convertidos', data:[28,19,34,14], backgroundColor:'rgba(16,185,129,.8)', borderRadius:4 },
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true, labels:{color:'#9CA3AF', boxWidth:12}}, tooltip:_tt() },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9CA3AF'} },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF'} },
          },
        },
      });
    }

    const pfc = document.getElementById('finProcFaixaChart');
    if (pfc) {
      _charts.procFaixa = new Chart(pfc, {
        type:'bar',
        data:{ labels:demo.faixas.map(f=>f.label), datasets:procs.map((p,i) => ({
          label:p.nome, stack:'p',
          data:demo.procPorFaixa.map(row => row[i] * p.preco),
          backgroundColor:PALETTE[i % PALETTE.length], borderRadius:3,
        }))},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true, labels:{color:'#9CA3AF', boxWidth:10, font:{size:10}}},
            tooltip:{..._tt(), callbacks:{label:ctx=>` ${ctx.dataset.label}: ${_fmt(ctx.raw)}`}} },
          scales:{
            x:{ grid:{display:false}, ticks:{color:'#9CA3AF'}, stacked:true },
            y:{ grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#9CA3AF', callback:v=>'R$'+(v/1000).toFixed(0)+'k'}, stacked:true },
          },
        },
      });
    }
  }

  /* ═══════════════════════════════════════════════════════
     ACTIONS — PLANEJAMENTO
  ═══════════════════════════════════════════════════════ */

  function savePlan() {
    // Lê todos os inputs do grid de meses antes de salvar
    document.querySelectorAll('.plan-meta-input').forEach(el => {
      const mes = parseInt(el.dataset.mes);
      const m   = planejamento.meses.find(x => x.mes === mes);
      if (m) m.meta = _readMoney(el);
    });
    document.querySelectorAll('.plan-real-input').forEach(el => {
      const mes = parseInt(el.dataset.mes);
      const m   = planejamento.meses.find(x => x.mes === mes);
      if (m) m.realizado = _readMoney(el);
    });
    _save(); _render(); _toast('Planejamento salvo!', 'success');
  }

  function changeAno(delta) {
    planejamento.ano += delta;
    _save(); _render();
  }

  function updateMesMeta(mes, value) {
    const m = planejamento.meses.find(x => x.mes === mes);
    if (m) { m.meta = parseInt(String(value).replace(/\./g, ''), 10) || 0; }
  }

  function updateMesRealizado(mes, value) {
    const m = planejamento.meses.find(x => x.mes === mes);
    if (m) { m.realizado = parseInt(String(value).replace(/\./g, ''), 10) || 0; }
  }

  function distribuirMeta() {
    const bar = document.getElementById('planDistBar');
    if (bar) bar.classList.toggle('fin-hidden');
  }

  function fecharDistribuicao() {
    document.getElementById('planDistBar')?.classList.add('fin-hidden');
  }

  function aplicarDistribuicao() {
    const total = _readMoney(document.getElementById('planDistTotal'));
    const tipo  = document.getElementById('planDistTipo')?.value || 'igual';
    if (!total) { _toast('Informe a meta anual', 'warn'); return; }

    if (tipo === 'igual') {
      const porMes = Math.round(total / 12);
      planejamento.meses.forEach(m => { m.meta = porMes; });
    } else {
      // Sazonalidade: jan/fev menores, mar-mai e ago-out maiores, dez maior
      const pesos = [0.07, 0.07, 0.09, 0.09, 0.09, 0.07, 0.07, 0.09, 0.09, 0.09, 0.08, 0.10];
      planejamento.meses.forEach((m, i) => { m.meta = Math.round(total * pesos[i]); });
    }

    fecharDistribuicao();
    _save(); _render();
    _toast('Metas distribuídas!', 'success');
  }

  /* ── Especialistas ──────────────────────────────────── */
  function updateEspMeta(espId, mesIdx, value) {
    const e = planejamento.especialistas.find(x => x.id === espId);
    if (e) e.metas[mesIdx] = parseInt(String(value).replace(/\./g, ''), 10) || 0;
    // Atualiza totais na tfoot sem re-render completo
    _updateMatrixTotals();
  }

  function _updateMatrixTotals() {
    // Re-renderiza apenas a tfoot sem destruir inputs
    const shortMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const totaisMes  = shortMeses.map((_, mi) =>
      planejamento.especialistas.reduce((a, e) => a + (e.metas[mi] || 0), 0)
    );
    const metasMes = planejamento.meses.map(m => m.meta);

    document.querySelectorAll('.plan-matrix-totals td.plan-matrix-tot-mes').forEach((td, mi) => {
      const t = totaisMes[mi];
      const over  = metasMes[mi] > 0 && t > metasMes[mi];
      const under = metasMes[mi] > 0 && t < metasMes[mi];
      td.textContent = t > 0 ? _fmt(t) : '—';
      td.className = `plan-matrix-tot-mes ${over ? 'plan-tot-over' : under ? 'plan-tot-under' : ''}`;
    });
  }

  function addEsp() {
    document.getElementById('finEspId').value    = '';
    document.getElementById('finEspNome').value  = '';
    document.getElementById('finEspCargo').value = '';
    document.getElementById('finEspFormTitle').textContent = 'Novo Especialista';
    const form = document.getElementById('finEspForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finEspNome')?.focus();
  }

  function editEsp(id) {
    const e = planejamento.especialistas.find(x => x.id === id); if (!e) return;
    document.getElementById('finEspId').value    = id;
    document.getElementById('finEspNome').value  = e.nome;
    document.getElementById('finEspCargo').value = e.cargo;
    document.getElementById('finEspFormTitle').textContent = 'Editar Especialista';
    const form = document.getElementById('finEspForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finEspNome')?.focus();
  }

  function saveEsp() {
    const id    = parseInt(document.getElementById('finEspId')?.value) || null;
    const nome  = document.getElementById('finEspNome')?.value.trim();
    const cargo = document.getElementById('finEspCargo')?.value.trim();
    if (!nome) { _toast('Informe o nome', 'warn'); return; }
    if (id) {
      const e = planejamento.especialistas.find(x => x.id === id);
      if (e) Object.assign(e, { nome, cargo });
    } else {
      const newId = planejamento.especialistas.length
        ? Math.max(...planejamento.especialistas.map(x => x.id)) + 1 : 1;
      planejamento.especialistas.push({ id:newId, nome, cargo, metas:new Array(12).fill(0) });
    }
    _save(); cancelEsp(); _render();
  }

  function deleteEsp(id) {
    if (!confirm('Remover este especialista?')) return;
    planejamento.especialistas = planejamento.especialistas.filter(e => e.id !== id);
    _save(); _render();
  }

  function cancelEsp() { document.getElementById('finEspForm')?.classList.add('fin-hidden'); }

  /* ═══════════════════════════════════════════════════════
     ACTIONS
  ═══════════════════════════════════════════════════════ */
  function saveMeta() {
    meta.mensal         = _readMoney(document.getElementById('finMetaMensal'))    || meta.mensal;
    meta.realizado      = _readMoney(document.getElementById('finRealizado'))      || meta.realizado;
    meta.diasUteis      = +document.getElementById('finDiasUteis')?.value         || meta.diasUteis;
    meta.diasDecorridos = +document.getElementById('finDiasDecorridos')?.value    || meta.diasDecorridos;
    meta.ticketMedio    = _readMoney(document.getElementById('finTicket'))         || meta.ticketMedio;
    meta.mesAtual       =  document.getElementById('finMesAtual')?.value.trim()   || meta.mesAtual;
    _save(); _render(); _toast('Meta salva e recalculada!', 'success');
  }

  function addGasto(tipo) {
    document.getElementById('finGastoTipo').value = tipo;
    document.getElementById('finGastoId').value   = '';
    document.getElementById('finGastoNome').value  = '';
    document.getElementById('finGastoValor').value = '';
    document.getElementById('finGastoFormTitle').textContent = `Novo Gasto ${tipo === 'fixo' ? 'Fixo' : 'Variável'}`;
    const form = document.getElementById('finGastoForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finGastoNome')?.focus();
  }

  function editGasto(tipo, id) {
    const list = tipo === 'fixo' ? gastos.fixos : gastos.variaveis;
    const g    = list.find(x => x.id === id);
    if (!g) return;
    document.getElementById('finGastoTipo').value  = tipo;
    document.getElementById('finGastoId').value    = id;
    document.getElementById('finGastoNome').value  = g.nome;
    document.getElementById('finGastoValor').value = _fmtRaw(g.valor);
    document.getElementById('finGastoFormTitle').textContent = 'Editar Gasto';
    const form = document.getElementById('finGastoForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finGastoNome')?.focus();
  }

  function saveGasto() {
    const tipo  = document.getElementById('finGastoTipo')?.value;
    const id    = parseInt(document.getElementById('finGastoId')?.value) || null;
    const nome  = document.getElementById('finGastoNome')?.value.trim();
    const valor = _readMoney(document.getElementById('finGastoValor'));
    if (!nome)  { _toast('Informe a descrição', 'warn'); return; }
    if (!valor) { _toast('Informe o valor', 'warn'); return; }
    const list = tipo === 'fixo' ? gastos.fixos : gastos.variaveis;
    if (id) { const g = list.find(x => x.id === id); if (g) Object.assign(g, {nome, valor}); }
    else { const newId = list.length ? Math.max(...list.map(x=>x.id))+1 : 1; list.push({id:newId, nome, valor}); }
    _save(); cancelGasto(); _render();
  }

  function deleteGasto(tipo, id) {
    if (!confirm('Remover este gasto?')) return;
    if (tipo === 'fixo') gastos.fixos      = gastos.fixos.filter(g => g.id !== id);
    else                 gastos.variaveis  = gastos.variaveis.filter(g => g.id !== id);
    _save(); _render();
  }

  function cancelGasto() { document.getElementById('finGastoForm')?.classList.add('fin-hidden'); }

  function addProc() {
    ['finProcId','finProcNome','finProcCat','finProcPreco','finProcCusto','finProcQtd'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('finProcFormTitle').textContent = 'Novo Procedimento';
    const form = document.getElementById('finProcForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finProcNome')?.focus();
  }

  function editProc(id) {
    const p = procs.find(x => x.id === id); if (!p) return;
    document.getElementById('finProcId').value    = id;
    document.getElementById('finProcNome').value  = p.nome;
    document.getElementById('finProcCat').value   = p.cat;
    document.getElementById('finProcPreco').value = _fmtRaw(p.preco);
    document.getElementById('finProcCusto').value = _fmtRaw(p.custo);
    document.getElementById('finProcQtd').value   = p.qtd;
    document.getElementById('finProcFormTitle').textContent = 'Editar Procedimento';
    const form = document.getElementById('finProcForm');
    form?.classList.remove('fin-hidden');
    form?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    document.getElementById('finProcNome')?.focus();
  }

  function saveProc() {
    const id    = parseInt(document.getElementById('finProcId')?.value) || null;
    const nome  = document.getElementById('finProcNome')?.value.trim();
    const cat   = document.getElementById('finProcCat')?.value.trim();
    const preco = _readMoney(document.getElementById('finProcPreco'));
    const custo = _readMoney(document.getElementById('finProcCusto'));
    const qtd   = +document.getElementById('finProcQtd')?.value;
    if (!nome)  { _toast('Informe o nome', 'warn'); return; }
    if (!preco) { _toast('Informe o preço', 'warn'); return; }
    if (id) { const p = procs.find(x => x.id === id); if (p) Object.assign(p, {nome, cat, preco, custo, qtd}); }
    else { const newId = procs.length ? Math.max(...procs.map(x=>x.id))+1 : 1; procs.push({id:newId, nome, cat, preco, custo, qtd}); }
    _save(); cancelProc(); _render();
  }

  function deleteProc(id) {
    if (!confirm('Remover este procedimento?')) return;
    procs = procs.filter(p => p.id !== id);
    _save(); _render();
  }

  function cancelProc() { document.getElementById('finProcForm')?.classList.add('fin-hidden'); }

  function switchTab(tab) { activeTab = tab; _render(); }

  /* ── Helpers ───────────────────────────────────────────── */
  // Usa Money.sum quando disponivel para eliminar drift de ponto flutuante
  // em acumulacao de gastos (0.1 + 0.2 = 0.30000000000000004).
  function _totalGastos() {
    if (window.Money && typeof window.Money.sum === 'function') {
      var fx = (gastos.fixos || []).map(function(g) { return g.valor || 0; });
      var vx = (gastos.variaveis || []).map(function(g) { return g.valor || 0; });
      return window.Money.add(window.Money.sum(fx), window.Money.sum(vx));
    }
    return gastos.fixos.reduce((a,g)=>a+g.valor,0) + gastos.variaveis.reduce((a,g)=>a+g.valor,0);
  }

  function _fmt(v) {
    const n = Math.round(Number(v || 0));
    return (n < 0 ? 'R$ -' : 'R$ ') + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Formata sem "R$ " — usado para popular inputs
  function _fmtRaw(v) {
    const n = Math.round(Number(v || 0));
    if (!n) return '';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Lê valor de input com pontos e converte para número
  function _readMoney(el) {
    if (!el) return 0;
    return parseInt((el.value || '').replace(/\./g, ''), 10) || 0;
  }

  // Máscara ao digitar — chamada via oninput nos inputs de dinheiro
  function maskMoney(el) {
    const raw = el.value.replace(/\D/g, '');
    if (!raw) { el.value = ''; return; }
    el.value = parseInt(raw, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function _esc(s) {
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _reIcons(container) {
    featherIn(container || document.getElementById('finGoalsRoot'), {'stroke-width':1.8, width:15, height:15})
  }

  function _toast(msg, type='info') {
    const colors = {success:'#10B981', warn:'#F59E0B', info:'#3B82F6'};
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', bottom:'24px', right:'24px', zIndex:'9999',
      padding:'12px 20px', borderRadius:'10px', fontSize:'13px', fontWeight:'600',
      color:'#fff', background:colors[type]||colors.info, boxShadow:'0 4px 16px rgba(0,0,0,.2)',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, 2500);
  }

  /* ── Public ────────────────────────────────────────────── */
  return {
    init: _attachObserver,
    switchTab, saveMeta, maskMoney,
    addGasto, editGasto, saveGasto, deleteGasto, cancelGasto,
    addProc, editProc, saveProc, deleteProc, cancelProc,
    // Planejamento
    savePlan, changeAno, updateMesMeta, updateMesRealizado,
    distribuirMeta, fecharDistribuicao, aplicarDistribuicao,
    updateEspMeta, addEsp, editEsp, saveEsp, deleteEsp, cancelEsp,
  };

})();

document.addEventListener('DOMContentLoaded', () => finGoals.init());
