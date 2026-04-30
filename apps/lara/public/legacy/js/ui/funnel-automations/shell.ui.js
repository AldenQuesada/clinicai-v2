/**
 * ClinicAI — Funil Automations Shell (router + layout + modal)
 *
 * Roteia entre 6 modulos self-contained em window.FAModules.
 * Cada modulo renderiza seus proprios trigger fields.
 * Shell cuida de: tabs, lista, editor wrapper, modal, salvamento.
 *
 * Depende de:
 *   window.AAShared                    — componentes compartilhados
 *   window.FAModules[*]                — 6 modulos isolados
 *   window.AgendaAutomationsRepository — save/list/remove/toggle
 */
;(function () {
  'use strict'
  if (window._faShellLoaded) return
  window._faShellLoaded = true

  var S = function() { return window.AAShared }
  var REPO = function() { return window.AgendaAutomationsRepository }

  // Ordem das tabs
  var MODULE_ORDER = ['pre_agendamento', 'agendamento', 'paciente', 'orcamento', 'paciente_orcamento', 'perdido']

  // ── State ──────────────────────────────────────────────────
  var _rules = []
  var _loading = false
  var _saving = false
  var _activeModule = 'agendamento'
  var _selectedId = null
  var _modalOpen = false
  var _form = _emptyForm()
  var _root = null
  var PAGE_SIZE = 50
  var _visibleCount = PAGE_SIZE

  function _emptyForm() {
    return {
      // Trigger fields (definidos pelo modulo ativo)
      status: '', when: 'immediate',
      // Campos comuns
      name: '', description: '',
      channel: 'whatsapp',
      content_template: '',
      ab_variant_template: '',
      attachment_url: '',
      attachment_above_text: true,
      alert_title: '', alert_type: 'info',
      task_title: '', task_assignee: 'sdr', task_priority: 'normal', task_deadline_hours: 24,
      alexa_message: '', alexa_target: 'sala',
      is_active: true, sort_order: 0,
      recipient_type: 'patient',
      tag_filter: null,
    }
  }

  function _mod() { return window.FAModules && window.FAModules[_activeModule] }
  function _esc(s) { return S().esc(s) }
  function _f(n, sz) { return S().feather(n, sz) }

  // ── Load ───────────────────────────────────────────────────
  async function _load() {
    _loading = true; _render()
    try {
      var res = await REPO().list()
      _rules = (res.ok && Array.isArray(res.data)) ? res.data : []
      // Popula singleton (FAState) pra editor-modal reusar sem refetch
      _faState.set(_rules)
    } catch (e) { _rules = [] }
    _loading = false; _render()
  }

  // ── Singleton de estado compartilhado (FAState) ───────────────
  // Shell e editor-modal tinham caches _rules independentes. Isso
  // criava estado duplicado: salvar regra no editor nao atualizava
  // cache do shell ate _load() rodar explicitamente. FAState centraliza.
  var _faState = window.FAState || (window.FAState = {
    _rules: null,
    _subscribers: [],
    set: function (rules) {
      this._rules = Array.isArray(rules) ? rules.slice() : []
      this._subscribers.forEach(function (fn) { try { fn(this._rules) } catch (e) {} }.bind(this))
    },
    get: function () { return Array.isArray(this._rules) ? this._rules.slice() : null },
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {}
      this._subscribers.push(fn)
      var subs = this._subscribers
      return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1) }
    },
    invalidate: function () { this._rules = null },
  })

  // ── Cache invalidation cross-tab (BroadcastChannel) ───────────
  // Quando uma aba cria/edita/deleta regra, notifica as outras pra
  // invalidarem o cache _rules local e recarregarem da fonte.
  var _bc = null
  function _bcInit() {
    if (_bc || typeof BroadcastChannel !== 'function') return
    try {
      _bc = new BroadcastChannel('clinicai_funnel_rules')
      _bc.onmessage = function (ev) {
        if (!ev || !ev.data) return
        if (ev.data.type === 'rules:invalidate') {
          // Recarrega silenciosamente sem spinner (preserva UX)
          REPO().list().then(function (res) {
            _rules = (res && res.ok && Array.isArray(res.data)) ? res.data : _rules
            if (_root) _render()
          }).catch(function () {})
        }
      }
    } catch (e) {
      _bc = null
    }
  }
  function _bcNotify() {
    // Invalida cache local primeiro (mesmo tab) — entao cross-tab
    try { _faState.invalidate() } catch (e) {}
    if (!_bc) return
    try { _bc.postMessage({ type: 'rules:invalidate', at: Date.now() }) } catch (e) {}
  }
  // Expoe helper pra editor-modal invocar apos save
  window.FARulesCache = window.FARulesCache || {}
  window.FARulesCache.notifyChange = _bcNotify

  function _rulesInModule() {
    var m = _mod()
    if (!m) return []
    return _rules.filter(function(r) { return m.matchesRule(r) })
  }

  // ── Render ─────────────────────────────────────────────────
  function _render() {
    if (!_root) return
    _root.innerHTML = _renderPage()
  }

  function _renderPage() {
    if (_loading) {
      return '<div class="fa-page">' + _renderTopHeader() + '<div class="fa-loading">Carregando...</div></div>'
    }
    return '<div class="fa-page">'
      + _renderTopHeader()
      + _renderTabs()
      + '<div class="fa-grid">'
      +   '<div class="fa-col-list">' + _renderList() + '</div>'
      +   '<div class="fa-col-editor">' + _renderEditorColumn() + '</div>'
      +   '<div class="fa-col-preview">' + _renderPreviewColumn() + '</div>'
      + '</div>'
      + (_modalOpen ? _renderModal() : '')
      + '</div>'
  }

  function _renderTopHeader() {
    var total = _rulesInModule().length
    return '<div class="fa-top">'
      +   '<div class="fa-top-left">'
      +     '<div class="fa-title">Funis de Automacao</div>'
      +     '<div class="fa-subtitle">' + total + ' regras nesta fase · isolamento total</div>'
      +   '</div>'
      +   '<div class="fa-top-actions">'
      +     '<button type="button" class="fa-btn-sec" data-action="show-lifecycle" title="Lifecycle — conversao por fase">' + _f('trendingUp', 14) + ' Lifecycle</button>'
      +     '<button type="button" class="fa-btn-sec" data-action="show-d1tracking" title="Rastreamento SIM/NAO do D-1">' + _f('checkCircle', 14) + ' D-1 Tracking</button>'
      +     '<button type="button" class="fa-btn-sec" data-action="show-absig" title="A/B com significancia estatistica">' + _f('zap', 14) + ' A/B Tests</button>'
      +     '<button type="button" class="fa-btn-sec" data-action="show-deliverability" title="Entregabilidade (ultimos 30 dias)">' + _f('barChart2', 14) + ' Entregabilidade</button>'
      +     '<button type="button" class="fa-btn-sec" data-action="export-json" title="Exportar regras desta fase como JSON">' + _f('download', 14) + ' Exportar</button>'
      +     '<button type="button" class="fa-btn-sec" data-action="import-json" title="Importar regras de JSON">' + _f('upload', 14) + ' Importar</button>'
      +     '<input type="file" id="faImportInput" accept="application/json" style="display:none">'
      +     '<button type="button" class="fa-btn-new" data-action="new">' + _f('plus', 14) + ' Nova automacao</button>'
      +   '</div>'
      + '</div>'
  }

  function _renderTabs() {
    var html = MODULE_ORDER.map(function(id) {
      var m = window.FAModules[id]
      if (!m) return ''
      var count = _rules.filter(function(r) { return m.matchesRule(r) }).length
      var active = _activeModule === id ? ' fa-tab-active' : ''
      return '<button type="button" class="fa-tab' + active + '" data-tab="' + id + '" style="--acc:'+m.color+'">'
        + _f(m.icon, 14) + ' ' + m.label + ' <span class="fa-tab-count">' + count + '</span></button>'
    }).join('')
    return '<div class="fa-tabs">' + html + '</div>'
  }

  // Icone por canal — mostra rapidamente que canal a regra usa
  var CHANNEL_ICONS = {
    whatsapp: 'messageCircle',
    alexa: 'speaker',
    task: 'clipboard',
    alert: 'bell',
  }
  function _channelIconFor(rule) {
    var ch = rule && rule.channel || ''
    // Canais compostos: icone do primeiro canal
    if (ch.indexOf('whatsapp') === 0) return 'messageCircle'
    if (ch.indexOf('alexa') === 0) return 'speaker'
    if (ch.indexOf('task') === 0) return 'clipboard'
    if (ch.indexOf('alert') === 0) return 'bell'
    if (ch === 'all' || ch === 'both') return 'radio'
    return CHANNEL_ICONS[ch] || 'messageCircle'
  }

  function _renderList() {
    var rules = _rulesInModule()
    if (!rules.length) {
      return '<div class="fa-list-empty">'
        + _f('inbox', 24) + '<br>Nenhuma regra nesta fase.<br>Clique em <b>+ Nova automacao</b>.'
        + '</div>'
    }

    var total = rules.length
    var visible = Math.min(_visibleCount, total)
    var hasMore = visible < total
    var loadMoreHtml = hasMore
      ? '<button type="button" class="fa-load-more" data-action="load-more">'
        + _f('chevronDown', 14) + ' Carregar mais (' + (total - visible) + ' restantes)'
        + '</button>'
      : ''

    var m = _mod()
    // Sem agrupamento: lista flat numerada
    if (!m || !m.groups || !m.groupRule) {
      var slice = rules.slice(0, visible)
      return '<div class="fa-list">' + slice.map(function(r, i) { return _renderRuleCard(r, i+1) }).join('') + loadMoreHtml + '</div>'
    }

    // Agrupamento por fase — aplica limite global preservando ordem
    var shown = rules.slice(0, visible)
    var buckets = {}
    m.groups.forEach(function(g) { buckets[g.id] = [] })
    shown.forEach(function(r) {
      var gid = m.groupRule(r)
      if (!buckets[gid]) buckets[gid] = []
      buckets[gid].push(r)
    })

    var html = '<div class="fa-list">'
    var counter = 0
    m.groups.forEach(function(g) {
      var items = buckets[g.id] || []
      if (!items.length) return
      html += '<div class="fa-list-group-header">'
        + _f(g.icon, 11) + ' <span>' + g.label + '</span>'
        + '<span class="fa-list-group-count">' + items.length + '</span>'
        + '</div>'
      items.forEach(function(r) {
        counter++
        html += _renderRuleCard(r, counter)
      })
    })
    html += loadMoreHtml + '</div>'
    return html
  }

  function _renderRuleCard(r, num) {
    var sel = _selectedId === r.id ? ' fa-card-selected' : ''
    var inactive = r.is_active ? '' : ' fa-card-inactive'
    var status = r.is_active ? 'ON' : 'OFF'
    var statusCls = r.is_active ? 'fa-status-on' : 'fa-status-off'
    var sub = _ruleSubtitle(r)
    var chanIcon = _channelIconFor(r)
    return '<div class="fa-card' + sel + inactive + '">'
      +   '<div class="fa-card-num">' + num + '</div>'
      +   '<div class="fa-card-channel" title="' + _esc(r.channel||'') + '">' + _f(chanIcon, 13) + '</div>'
      +   '<div class="fa-card-body" data-select="' + _esc(r.id) + '">'
      +     '<div class="fa-card-name">' + _esc(r.name) + '</div>'
      +     '<div class="fa-card-sub">' + _esc(sub) + '</div>'
      +   '</div>'
      +   '<div class="fa-card-actions">'
      +     '<button type="button" class="fa-card-action-btn" data-duplicate="' + _esc(r.id) + '" title="Duplicar regra">' + _f('copy', 13) + '</button>'
      +   '</div>'
      +   '<div class="fa-card-status ' + statusCls + '">' + status + '</div>'
      + '</div>'
  }

  function _ruleSubtitle(r) {
    var m = _mod()
    if (!m) return ''
    var f = m.fromRule(r)
    var status = (m.statuses.find(function(s){return s.id===f.status})||{}).label || f.status || '—'
    var when = (m.timeOptions.find(function(t){return t.id===f.when})||{}).label || ''
    return status + ' · ' + when
  }

  // ── Coluna 2: Editor (regra selecionada) ───────────────────
  function _renderEditorColumn() {
    if (_modalOpen) {
      return '<div class="fa-empty-col">' + _f('edit3', 24) + '<br>Editando no modal</div>'
    }
    if (!_selectedId) {
      return '<div class="fa-empty-col">' + _f('mousePointer', 24)
        + '<br>Selecione uma regra na lista para editar'
        + '<br>ou clique em <b>+ Nova automacao</b>.</div>'
    }
    var r = _rules.find(function(x){return x.id===_selectedId})
    if (!r) return '<div class="fa-empty-col">Regra nao encontrada</div>'

    // Carrega _form a partir da regra
    if (!_form.__loadedFromId || _form.__loadedFromId !== r.id) {
      _form = _formFromRule(r)
      _form.__loadedFromId = r.id
    }

    return '<div class="fa-editor">'
      + _renderEditorHeader(r)
      + '<div class="fa-editor-body">' + _renderForm() + '</div>'
      + _renderEditorFooter(r)
      + '</div>'
  }

  function _renderEditorHeader(r) {
    return '<div class="fa-editor-header">'
      +   '<div class="fa-editor-title">' + _f('edit3', 16) + ' <span>' + _esc(r.name) + '</span></div>'
      +   '<label class="fa-switch"><input type="checkbox" ' + (r.is_active?'checked':'') + ' data-toggle="' + _esc(r.id) + '"><span class="fa-switch-slider"></span></label>'
      + '</div>'
  }

  function _renderEditorFooter(r) {
    return '<div class="fa-editor-footer">'
      +   '<button type="button" class="fa-btn-del" data-delete="' + _esc(r.id) + '">' + _f('trash2', 14) + ' Excluir</button>'
      +   '<div style="flex:1"></div>'
      +   '<button type="button" class="fa-btn-save" data-action="save">' + (_saving?'Salvando...':'Salvar alteracoes') + '</button>'
      + '</div>'
  }

  // ── Form (editor compartilhado modal + coluna central) ─────
  function _renderForm() {
    var m = _mod()
    if (!m) return '<div class="fa-empty-col">Modulo nao carregado</div>'
    var f = _form

    return ''
      // Secao 1 — Identificacao
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('tag', 11) + ' Identificacao</div>'
      +   '<div class="fa-field"><label>Nome</label>'
      +     '<input type="text" id="faName" value="'+_esc(f.name)+'" placeholder="Ex: Confirmacao D-1"></div>'
      +   '<div class="fa-field"><label>Descricao</label>'
      +     '<input type="text" id="faDesc" value="'+_esc(f.description)+'" placeholder="(opcional)"></div>'
      + '</div>'
      // Secao 2 — Gatilho (modulo renderiza seus campos)
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('zap', 11) + ' Gatilho · ' + m.label + '</div>'
      +   '<div id="faTriggerFields">' + m.renderTriggerFields(f) + '</div>'
      + '</div>'
      // Secao 2.5 — Filtro por tags (AND/OR/NOT)
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('filter', 11) + ' Segmentacao por tags · opcional</div>'
      +   S().renderTagFilter(f.tag_filter)
      + '</div>'
      // Secao 3 — Canal + config por canal
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('send', 11) + ' Como avisar</div>'
      +   S().renderChannelChecks(f.channel)
      +   '<div id="faChannelBlocks">' + _renderChannelBlocks(f) + '</div>'
      + '</div>'
  }

  function _renderChannelBlocks(f) {
    var html = ''
    if (S().channelIncludes(f.channel, 'whatsapp')) html += _blockWhatsapp(f)
    if (S().channelIncludes(f.channel, 'alexa'))    html += _blockAlexa(f)
    if (S().channelIncludes(f.channel, 'task'))     html += _blockTask(f)
    if (S().channelIncludes(f.channel, 'alert'))    html += _blockAlert(f)
    return html
  }

  function _blockWhatsapp(f) {
    var abActive = !!(f.ab_variant_template && f.ab_variant_template.trim())
    var abLabel = abActive ? 'A/B ativo' : 'Testar variacao B'
    var abIcon = abActive ? 'zap' : 'plus'
    var abBlock = abActive
      ? '<div class="fa-ab-block">'
        +   '<div class="fa-ab-header">' + _f('zap', 12) + ' Variante B <span class="fa-ab-badge">50/50</span>'
        +     '<button type="button" class="fa-ab-remove" data-action="ab-remove" title="Desativar A/B">' + _f('x', 12) + '</button>'
        +   '</div>'
        +   '<textarea id="faContentB" class="fa-wa-textarea" rows="6" placeholder="Variante B — engine sorteia 50/50 entre A e B">' + _esc(f.ab_variant_template || '') + '</textarea>'
        + '</div>'
      : ''
    return '<div class="fa-channel-block fa-wa-block">'
      +   '<div class="fa-channel-block-title">' + _f('messageCircle', 12) + ' WhatsApp'
      +     S().renderTemplateLibraryButton()
      +     '<button type="button" class="fa-ab-toggle" data-action="ab-toggle" title="A/B testing de copy">' + _f(abIcon, 11) + ' ' + abLabel + '</button>'
      +   '</div>'
      +   S().renderChipsBar('var')
      +   S().renderFormatToolbar()
      +   '<textarea id="faContent" class="fa-wa-textarea" rows="10" placeholder="Digite a mensagem do WhatsApp...">'+_esc(f.content_template)+'</textarea>'
      +   abBlock
      +   S().renderAttachArea(f.attachment_url, f.attachment_above_text !== false)
      + '</div>'
  }

  function _blockAlexa(f) {
    var targets = [
      {id:'sala',label:'Sala'},{id:'recepcao',label:'Recepcao'},
      {id:'profissional',label:'Profissional'},{id:'todos',label:'Todos'},
    ]
    var opts = targets.map(function(t){ return '<option value="'+t.id+'"'+(f.alexa_target===t.id?' selected':'')+'>'+t.label+'</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('speaker', 12) + ' Alexa</div>'
      +   '<div class="fa-field"><label>Dispositivo alvo</label><select id="faAlexaTarget">'+opts+'</select></div>'
      +   '<div class="fa-field"><label>Mensagem</label>' + S().renderChipsBar('alexa-var')
      +     '<textarea id="faAlexaMsg" rows="3" placeholder="Ex: Dra {{profissional}}, paciente {{nome}} na recepcao.">'+_esc(f.alexa_message)+'</textarea>'
      +   '</div>'
      + '</div>'
  }

  function _blockTask(f) {
    var assignees = [
      {id:'sdr',label:'SDR / Comercial'},{id:'secretaria',label:'Secretaria'},
      {id:'cs',label:'CS / Pos-venda'},{id:'clinica',label:'Equipe Clinica'},{id:'gestao',label:'Gestao'},
    ]
    var priorities = [
      {id:'urgente',label:'Urgente'},{id:'alta',label:'Alta'},
      {id:'normal',label:'Normal'},{id:'baixa',label:'Baixa'},
    ]
    var aOpts = assignees.map(function(a){ return '<option value="'+a.id+'"'+((f.task_assignee||'sdr')===a.id?' selected':'')+'>'+a.label+'</option>' }).join('')
    var pOpts = priorities.map(function(p){ return '<option value="'+p.id+'"'+((f.task_priority||'normal')===p.id?' selected':'')+'>'+p.label+'</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('clipboard', 12) + ' Tarefa</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faTaskTitle" value="'+_esc(f.task_title||'')+'" placeholder="Ex: Confirmar presenca"></div>'
      +   '<div class="fa-field-row">'
      +     '<div class="fa-field"><label>Responsavel</label><select id="faTaskAssignee">'+aOpts+'</select></div>'
      +     '<div class="fa-field"><label>Prioridade</label><select id="faTaskPriority">'+pOpts+'</select></div>'
      +     '<div class="fa-field"><label>Prazo (h)</label><input type="number" id="faTaskDeadline" min="1" max="720" value="'+(f.task_deadline_hours||24)+'"></div>'
      +   '</div>'
      + '</div>'
  }

  function _blockAlert(f) {
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('bell', 12) + ' Alerta Visual</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faAlertTitle" value="'+_esc(f.alert_title||'')+'" placeholder="Ex: Paciente chegou"></div>'
      +   '<div class="fa-field"><label>Tipo</label><select id="faAlertType">'
      +     '<option value="info"'+(f.alert_type==='info'?' selected':'')+'>Info</option>'
      +     '<option value="warning"'+(f.alert_type==='warning'?' selected':'')+'>Aviso</option>'
      +     '<option value="success"'+(f.alert_type==='success'?' selected':'')+'>Sucesso</option>'
      +     '<option value="error"'+(f.alert_type==='error'?' selected':'')+'>Erro</option>'
      +   '</select></div>'
      + '</div>'
  }

  // ── Coluna 3: Preview ───────────────────────────────────────
  function _renderPreviewColumn() {
    if (_modalOpen) return '<div class="fa-col-preview-empty">' + _f('smartphone', 24) + '<br>Preview no modal</div>'
    if (!_selectedId && !_form.content_template && !_form.alexa_message && !_form.task_title && !_form.alert_title) {
      return '<div class="fa-col-preview-empty">' + _f('smartphone', 24) + '<br>Preview ao vivo aqui</div>'
    }
    return _renderLivePreview(_form)
  }

  function _renderLivePreview(rule) {
    var html = ''
    if (S().channelIncludes(rule.channel, 'whatsapp')) {
      html += S().renderPhonePreview(rule.content_template, rule.attachment_url, rule.attachment_above_text !== false)
    }
    if (S().channelIncludes(rule.channel, 'alexa')) {
      html += S().renderAlexaPreview(rule.alexa_message, rule.alexa_target)
    }
    if (S().channelIncludes(rule.channel, 'task')) {
      html += S().renderTaskPreview(rule.task_title, rule.task_assignee, rule.task_priority, rule.task_deadline_hours)
    }
    if (S().channelIncludes(rule.channel, 'alert')) {
      html += S().renderAlertPreview(rule.alert_title, rule.alert_type)
    }
    // Simulador de disparo: converte _form → rule via modulo ativo
    try {
      var m = _mod()
      if (m && m.toTrigger) {
        var trig = m.toTrigger(rule)
        if (trig && trig.trigger_type) {
          html += S().renderDispatchTimeline({ trigger_type: trig.trigger_type, trigger_config: trig.trigger_config })
        }
      }
    } catch (e) { /* silencioso se form incompleto */ }
    return html || '<div class="fa-col-preview-empty">Preview vazio</div>'
  }

  // ── Modal criar nova ───────────────────────────────────────
  function _renderModal() {
    var m = _mod()
    return '<div class="fa-modal-overlay" data-action="modal-backdrop">'
      +   '<div class="fa-modal" role="dialog">'
      +     '<div class="fa-modal-header">'
      +       '<div class="fa-modal-title">' + _f('plus', 16) + ' Nova automacao · ' + (m?m.label:'') + '</div>'
      +       '<button type="button" class="fa-btn-icon" data-action="modal-close">' + _f('x', 16) + '</button>'
      +     '</div>'
      +     '<div class="fa-modal-body">'
      +       '<div class="fa-modal-editor">' + _renderForm() + '</div>'
      +       '<div class="fa-modal-preview">' + _renderLivePreview(_form) + '</div>'
      +     '</div>'
      +     '<div class="fa-modal-footer">'
      +       '<button type="button" class="fa-btn-cancel" data-action="modal-close">Cancelar</button>'
      +       '<button type="button" class="fa-btn-save" data-action="save">' + (_saving?'Salvando...':'Criar automacao') + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
  }

  // ── Form IO ─────────────────────────────────────────────────
  function _formFromRule(r) {
    var m = _mod()
    var triggerForm = m ? m.fromRule(r) : { status: '', when: 'immediate' }
    var out = _emptyForm()
    Object.keys(triggerForm).forEach(function(k){ out[k] = triggerForm[k] })
    out.name = r.name || ''
    out.description = r.description || ''
    out.channel = r.channel || 'whatsapp'
    out.content_template = r.content_template || ''
    out.ab_variant_template = r.ab_variant_template || ''
    out.attachment_url = r.attachment_url || ''
    out.attachment_above_text = r.attachment_above_text !== false
    out.alert_title = r.alert_title || ''
    out.alert_type = r.alert_type || 'info'
    out.task_title = r.task_title || ''
    out.task_assignee = r.task_assignee || 'sdr'
    out.task_priority = r.task_priority || 'normal'
    out.task_deadline_hours = r.task_deadline_hours || 24
    out.alexa_message = r.alexa_message || ''
    out.alexa_target = r.alexa_target || 'sala'
    out.is_active = r.is_active
    out.sort_order = r.sort_order || 0
    out.recipient_type = r.recipient_type || 'patient'
    out.tag_filter = (r.trigger_config && r.trigger_config.tag_filter) || null
    return out
  }

  function _readForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var m = _mod()
    if (m) {
      var triggerForm = m.readTriggerForm()
      Object.keys(triggerForm).forEach(function(k){ _form[k] = triggerForm[k] })
    }
    _form.name = v('faName')
    _form.description = v('faDesc')
    _form.content_template = v('faContent')
    _form.ab_variant_template = v('faContentB')
    _form.alert_title = v('faAlertTitle')
    _form.alert_type = v('faAlertType') || 'info'
    _form.task_title = v('faTaskTitle')
    _form.task_assignee = v('faTaskAssignee') || 'sdr'
    _form.task_priority = v('faTaskPriority') || 'normal'
    _form.task_deadline_hours = parseInt(v('faTaskDeadline')) || 24
    _form.alexa_message = v('faAlexaMsg')
    _form.alexa_target = v('faAlexaTarget') || 'sala'

    // Imagem: URL colada manualmente sobrescreve attachment_url atual
    var urlEl = document.getElementById('faAttachUrl')
    if (urlEl) {
      var typedUrl = (urlEl.value || '').trim()
      if (typedUrl) _form.attachment_url = typedUrl
      else if (!_form.attachment_url) _form.attachment_url = ''
    }
    // Posicao da imagem (above/below)
    var posEl = document.querySelector('input[name=faAttachPos]:checked')
    if (posEl) _form.attachment_above_text = (posEl.value === 'above')

    var chs = Array.prototype.slice.call(document.querySelectorAll('input[name=faChannel]:checked'))
      .map(function(el){ return el.value })
    _form.channel = S().combineChannels(chs)

    _form.tag_filter = S().readTagFilter()
  }

  // ── Save ────────────────────────────────────────────────────
  async function _handleSave() {
    _readForm()
    var m = _mod()
    if (!m) { S().showToast('Erro', 'Modulo nao carregado', 'error'); return }
    if (!_form.name.trim()) { S().showToast('Validacao', 'Nome obrigatorio', 'warning'); return }
    if (!_form.channel) { S().showToast('Validacao', 'Marque ao menos 1 canal', 'warning'); return }
    var v = m.validate(_form)
    if (!v.ok) { S().showToast('Validacao', v.error, 'warning'); return }

    var badVars = S().validatePlaceholdersInForm(_form)
    if (badVars.length) {
      var validList = S().TEMPLATE_VARS.map(function(x) { return x.id }).slice(0, 8).join(', ')
      S().showToast(
        'Placeholders invalidos',
        'Nao existem: {{' + badVars.join('}}, {{') + '}}. Use: ' + validList + '...',
        'error'
      )
      return
    }

    var trig = m.toTrigger(_form)
    var triggerCfg = Object.assign({}, trig.trigger_config || {})
    if (_form.tag_filter && _form.tag_filter.mode && _form.tag_filter.mode !== 'off'
        && Array.isArray(_form.tag_filter.tags) && _form.tag_filter.tags.length) {
      triggerCfg.tag_filter = _form.tag_filter
    } else {
      delete triggerCfg.tag_filter
    }
    var data = {
      name: _form.name,
      description: _form.description,
      channel: _form.channel,
      content_template: _form.content_template || _form.alexa_message || '-',
      ab_variant_template: (_form.ab_variant_template && _form.ab_variant_template.trim()) ? _form.ab_variant_template : null,
      attachment_url: _form.attachment_url || null,
      attachment_above_text: _form.attachment_above_text !== false,
      alert_title: _form.alert_title,
      alert_type: _form.alert_type,
      task_title: _form.task_title,
      task_assignee: _form.task_assignee,
      task_priority: _form.task_priority,
      task_deadline_hours: _form.task_deadline_hours,
      alexa_message: _form.alexa_message,
      alexa_target: _form.alexa_target,
      is_active: _form.is_active,
      sort_order: _form.sort_order,
      recipient_type: _form.recipient_type,
      category: _activeModule, // legacy, mantido por compat
      trigger_type: trig.trigger_type,
      trigger_config: triggerCfg,
    }
    if (_selectedId && !_modalOpen) data.id = _selectedId

    _saving = true; _render()
    var res = await REPO().upsert(data)
    _saving = false

    if (res.ok) {
      _modalOpen = false
      if (res.data && res.data.id) _selectedId = res.data.id
      _form = _emptyForm()
      S().showToast('Salvo', _form.name + ' gravada', 'success')
      _bcNotify()
      await _load()
    } else {
      S().showToast('Erro', res.error || 'Falha ao salvar', 'error')
      _render()
    }
  }

  // ── Events ──────────────────────────────────────────────────
  function _bindEvents(root) {
    if (!root) return

    // ESC fecha modal
    if (!window._faEscBound) {
      window._faEscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && _modalOpen) {
          _modalOpen = false; _form = _emptyForm(); _render()
        }
      })
    }

    root.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action]')
      if (el) {
        var a = el.dataset.action
        if (a === 'new') {
          _form = _emptyForm(); _modalOpen = true; _selectedId = null; _render(); return
        }
        if (a === 'modal-close' || a === 'modal-backdrop') {
          if (a === 'modal-backdrop' && e.target !== el) return
          _modalOpen = false; _form = _emptyForm(); _render(); return
        }
        if (a === 'save') { _handleSave(); return }
        if (a === 'pick-image') { var ai = document.getElementById('faAttachInput'); if (ai) ai.click(); return }
        if (a === 'remove-image') { _readForm(); _form.attachment_url = ''; _render(); return }
        if (a === 'speak-alexa') { _readForm(); S().speakAlexa(S().renderTemplate(_form.alexa_message || 'Mensagem vazia', S().SAMPLE_VARS)); return }
        if (a === 'simulate-alert') { _readForm(); S().showToast('Automacao', S().renderTemplate(_form.alert_title||'Alerta', S().SAMPLE_VARS), _form.alert_type || 'info'); return }
        if (a === 'emoji-toggle') {
          var pk = document.getElementById('faEmojiPicker')
          if (pk) pk.style.display = pk.style.display === 'none' ? 'flex' : 'none'
          return
        }
        if (a === 'export-json') { _exportJson(); return }
        if (a === 'import-json') { var imp = document.getElementById('faImportInput'); if (imp) imp.click(); return }
        if (a === 'load-more') { _visibleCount += PAGE_SIZE; _render(); return }
        if (a === 'ab-toggle') {
          _readForm()
          _form.ab_variant_template = _form.ab_variant_template && _form.ab_variant_template.trim()
            ? ''
            : (_form.content_template || 'Variacao alternativa...')
          _render(); return
        }
        if (a === 'ab-remove') {
          _readForm(); _form.ab_variant_template = ''; _render(); return
        }
        if (a === 'show-deliverability') { _showDeliverability(); return }
        if (a === 'close-deliverability') {
          var mdv = document.getElementById('faDeliverabilityModal')
          if (mdv) mdv.remove()
          return
        }
        if (a === 'show-lifecycle') { _showLifecycle(); return }
        if (a === 'show-d1tracking') { _showD1Tracking(); return }
        if (a === 'show-absig') { _showAbSignificance(); return }
        if (a === 'show-template-library') {
          var cat = _activeModule || 'agendamento'
          S().showTemplateLibrary(cat, function(tpl) {
            _readForm()
            var append = _form.content_template && _form.content_template.trim()
              ? confirm('Ja existe texto. OK = substituir. Cancelar = anexar no fim.')
              : true
            _form.content_template = append ? tpl.content : (_form.content_template + '\n\n' + tpl.content)
            _render()
            S().showToast('Template aplicado', tpl.name, 'success')
          })
          return
        }
      }

      // Duplicar regra
      var dupBtn = e.target.closest('[data-duplicate]')
      if (dupBtn) { e.stopPropagation(); _duplicateRule(dupBtn.dataset.duplicate); return }

      var tab = e.target.closest('[data-tab]')
      if (tab) { _activeModule = tab.dataset.tab; _selectedId = null; _form = _emptyForm(); _visibleCount = PAGE_SIZE; _render(); return }

      var sel = e.target.closest('[data-select]')
      if (sel) { _selectedId = sel.dataset.select; _render(); return }

      var tog = e.target.closest('[data-toggle]')
      if (tog) { e.stopPropagation(); REPO().toggle(tog.dataset.toggle).then(function () { _bcNotify(); _load() }); return }

      var del = e.target.closest('[data-delete]')
      if (del) {
        if (confirm('Excluir esta regra?')) {
          REPO().remove(del.dataset.delete).then(function(){ _selectedId = null; _bcNotify(); _load() })
        }
        return
      }

      // Inserir emoji no textarea ativo
      var emojiBtn = e.target.closest('[data-emoji]')
      if (emojiBtn) {
        var em = emojiBtn.dataset.emoji
        // Determina qual textarea esta focado (whatsapp ou alexa)
        var target = document.getElementById('faContent') || document.getElementById('faAlexaMsg')
        if (target) {
          var es = target.selectionStart
          target.value = target.value.slice(0, es) + em + target.value.slice(target.selectionEnd)
          target.selectionStart = target.selectionEnd = es + em.length
          target.focus()
          if (target.id === 'faContent') _form.content_template = target.value
          else if (target.id === 'faAlexaMsg') _form.alexa_message = target.value
          _refreshPreview()
        }
        return
      }

      // Inserir var no textarea
      var varBtn = e.target.closest('[data-var]')
      if (varBtn) {
        var ta = document.getElementById('faContent')
        if (ta) {
          var tag = '{{' + varBtn.dataset.var + '}}'
          var s = ta.selectionStart
          ta.value = ta.value.slice(0,s) + tag + ta.value.slice(ta.selectionEnd)
          ta.selectionStart = ta.selectionEnd = s + tag.length
          ta.focus(); _form.content_template = ta.value
          _refreshPreview()
        }
        return
      }
      var avBtn = e.target.closest('[data-alexa-var]')
      if (avBtn) {
        var ta2 = document.getElementById('faAlexaMsg')
        if (ta2) {
          var tag2 = '{{' + avBtn.dataset.alexaVar + '}}'
          var s2 = ta2.selectionStart
          ta2.value = ta2.value.slice(0,s2) + tag2 + ta2.value.slice(ta2.selectionEnd)
          ta2.selectionStart = ta2.selectionEnd = s2 + tag2.length
          ta2.focus(); _form.alexa_message = ta2.value
        }
        return
      }
      // Formatacao
      var fmt = e.target.closest('[data-fmt]')
      if (fmt) {
        var ta3 = document.getElementById('faContent')
        if (ta3) {
          var w = fmt.dataset.fmt
          var s3 = ta3.selectionStart, e3 = ta3.selectionEnd
          var sel3 = ta3.value.slice(s3, e3)
          if (sel3) {
            ta3.value = ta3.value.slice(0,s3) + w + sel3 + w + ta3.value.slice(e3)
            ta3.selectionStart = s3; ta3.selectionEnd = e3 + w.length * 2
          }
          ta3.focus(); _form.content_template = ta3.value
          _refreshPreview()
        }
        return
      }
    })

    root.addEventListener('input', function(e) {
      if (e.target.id === 'faContent') { _form.content_template = e.target.value; _schedulePreview() }
      if (e.target.id === 'faContentB') { _form.ab_variant_template = e.target.value }
      if (e.target.id === 'faAlexaMsg') { _form.alexa_message = e.target.value; _schedulePreview() }
      if (e.target.id === 'faName') { _form.name = e.target.value }
      if (e.target.id === 'faAttachUrl') { _form.attachment_url = e.target.value.trim(); _schedulePreview() }
    })

    root.addEventListener('change', function(e) {
      // Channel checkbox → re-render SO dos blocos (sem flash, preserva check)
      if (e.target.name === 'faChannel') {
        _readForm()
        var wrap = document.getElementById('faChannelBlocks')
        if (wrap) wrap.innerHTML = _renderChannelBlocks(_form)
        _refreshPreview()
        return
      }
      // Posicao da imagem (acima/abaixo do texto)
      if (e.target.name === 'faAttachPos') {
        _form.attachment_above_text = (e.target.value === 'above')
        _refreshPreview()
        return
      }
      // Modo do tag_filter: habilita/desabilita o input de tags
      if (e.target.id === 'faTagFilterMode') {
        var tagsInput = document.getElementById('faTagFilterTags')
        if (tagsInput) tagsInput.disabled = e.target.value === 'off'
        return
      }
      // Status select → aplica defaults do modulo (when + campos) + sugere nome
      if (e.target.id === 'faStatus') {
        _readForm()
        var mod = _mod()
        if (mod && mod.applyStatusDefaults) {
          var newStatus = e.target.value
          var defaults = mod.applyStatusDefaults(_form, newStatus)
          Object.keys(defaults).forEach(function(k){ _form[k] = defaults[k] })
          // Sugere nome se user nao digitou ainda
          if (mod.suggestName && (!_form.name || _form.name.trim() === '')) {
            var suggested = mod.suggestName(_form)
            if (suggested) _form.name = suggested
          }
        }
        var tw1 = document.getElementById('faTriggerFields')
        if (tw1 && mod) tw1.innerHTML = mod.renderTriggerFields(_form)
        // Atualiza o input Nome tambem se foi preenchido
        var nameEl = document.getElementById('faName')
        if (nameEl && _form.name) nameEl.value = _form.name
        return
      }
      // When select → re-render SO dos trigger fields (sem flash)
      if (e.target.id === 'faWhen') {
        _readForm()
        var tw = document.getElementById('faTriggerFields')
        var m = _mod()
        if (tw && m) tw.innerHTML = m.renderTriggerFields(_form)
        // Sugere nome novo se nome ainda vazio ou se era sugestao antiga
        if (m && m.suggestName) {
          var newSug = m.suggestName(_form)
          var nameEl2 = document.getElementById('faName')
          if (nameEl2 && newSug && (!nameEl2.value.trim() || _form.__wasSuggested)) {
            nameEl2.value = newSug
            _form.name = newSug
            _form.__wasSuggested = true
          }
        }
        return
      }
      // Upload imagem
      if (e.target.id === 'faAttachInput') {
        var file = e.target.files && e.target.files[0]
        if (!file) return
        _readForm()
        S().showToast('Upload', 'Enviando imagem...', 'info')
        S().uploadAttachment(file).then(function(url) {
          _form.attachment_url = url
          S().showToast('Upload', 'Imagem anexada', 'success')
          _render()
        }).catch(function(err) { S().showToast('Erro', err.message || 'Upload falhou', 'error') })
      }
      // Importar JSON
      if (e.target.id === 'faImportInput') {
        var ifile = e.target.files && e.target.files[0]
        if (!ifile) return
        _importJson(ifile)
        e.target.value = ''
      }
    })
  }

  var _previewTimer = null
  function _schedulePreview() {
    if (_previewTimer) clearTimeout(_previewTimer)
    _previewTimer = setTimeout(_refreshPreview, 100)
  }
  function _refreshPreview() {
    var preview = document.querySelector(_modalOpen ? '.fa-modal-preview' : '.fa-col-preview')
    if (!preview) return
    preview.innerHTML = _renderLivePreview(_form)
  }

  // ── Dashboard de Entregabilidade ────────────────────────────
  async function _showDeliverability() {
    var existing = document.getElementById('faDeliverabilityModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'faDeliverabilityModal'
    overlay.className = 'fa-modal-overlay'
    overlay.setAttribute('data-action', 'close-deliverability')
    overlay.innerHTML = '<div class="fa-modal fa-modal-deliv" role="dialog">'
      + '<div class="fa-modal-header">'
      +   '<div class="fa-modal-title">' + _f('barChart2', 16) + ' Entregabilidade - ultimos 30 dias</div>'
      +   '<button type="button" class="fa-btn-icon" data-action="close-deliverability">' + _f('x', 16) + '</button>'
      + '</div>'
      + '<div class="fa-modal-body"><div class="fa-deliv-loading">Carregando metricas...</div></div>'
      + '</div>'
    document.body.appendChild(overlay)

    try {
      if (!window._sbShared) throw new Error('Supabase indisponivel')
      var res = await window._sbShared.rpc('wa_rule_deliverability', { p_days: 30 })
      if (res.error) throw new Error(res.error.message)
      var rows = res.data || []
      _renderDeliverabilityTable(rows)
    } catch (e) {
      var body = document.querySelector('#faDeliverabilityModal .fa-modal-body')
      if (body) body.innerHTML = '<div class="fa-deliv-error">Erro: ' + S().esc(e.message) + '</div>'
    }
  }

  function _renderDeliverabilityTable(rows) {
    var body = document.querySelector('#faDeliverabilityModal .fa-modal-body')
    if (!body) return
    if (!rows.length) {
      body.innerHTML = '<div class="fa-deliv-empty">Nenhum dado nos ultimos 30 dias</div>'
      return
    }
    var totalSent = rows.reduce(function(s,r){ return s + parseInt(r.sent||0) }, 0)
    var totalFailed = rows.reduce(function(s,r){ return s + parseInt(r.failed||0) }, 0)
    var totalPending = rows.reduce(function(s,r){ return s + parseInt(r.pending||0) }, 0)
    var avgRate = totalSent + totalFailed > 0
      ? Math.round((totalSent / (totalSent + totalFailed)) * 1000) / 10
      : null

    var summary = '<div class="fa-deliv-summary">'
      + '<div class="fa-deliv-stat"><div class="fa-deliv-stat-label">Enviadas</div><div class="fa-deliv-stat-val" style="color:#10B981">' + totalSent + '</div></div>'
      + '<div class="fa-deliv-stat"><div class="fa-deliv-stat-label">Falharam</div><div class="fa-deliv-stat-val" style="color:#DC2626">' + totalFailed + '</div></div>'
      + '<div class="fa-deliv-stat"><div class="fa-deliv-stat-label">Pendentes</div><div class="fa-deliv-stat-val" style="color:#F59E0B">' + totalPending + '</div></div>'
      + '<div class="fa-deliv-stat"><div class="fa-deliv-stat-label">Taxa geral</div><div class="fa-deliv-stat-val">' + (avgRate != null ? avgRate + '%' : '—') + '</div></div>'
      + '</div>'

    var thead = '<tr><th>Regra</th><th>Canal</th><th>Total</th><th>Enviadas</th><th>Falhas</th><th>Pendentes</th><th>Taxa</th></tr>'
    var tbody = rows.map(function(r) {
      var rate = r.delivery_rate
      var rateCls = rate == null ? '' : rate >= 90 ? 'fa-deliv-good' : rate >= 70 ? 'fa-deliv-warn' : 'fa-deliv-bad'
      var rateTxt = rate == null ? '—' : rate + '%'
      var inactiveCls = r.is_active ? '' : ' fa-deliv-row-inactive'
      return '<tr class="' + inactiveCls + '">'
        + '<td>' + S().esc(r.rule_name) + (r.is_active ? '' : ' <span class="fa-deliv-off">OFF</span>') + '</td>'
        + '<td><span class="fa-deliv-chan">' + S().esc(r.channel || '') + '</span></td>'
        + '<td>' + r.total + '</td>'
        + '<td style="color:#10B981">' + r.sent + '</td>'
        + '<td' + (parseInt(r.failed) > 0 ? ' style="color:#DC2626;font-weight:600"' : '') + '>' + r.failed + '</td>'
        + '<td>' + r.pending + '</td>'
        + '<td class="' + rateCls + '">' + rateTxt + '</td>'
        + '</tr>'
    }).join('')

    body.innerHTML = summary
      + '<table class="fa-deliv-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>'
      + '<div class="fa-deliv-hint">' + _f('info', 11) + ' Taxa = enviadas / (enviadas + falhas). Regras sem dados nao aparecem com valor.</div>'
  }

  // ── Dashboard de Lifecycle (conversao por fase) ─────────────
  var PHASE_LABELS = {
    lead: 'Lead',
    agendado: 'Agendado',
    reagendado: 'Reagendado',
    compareceu: 'Compareceu',
    orcamento: 'Orcamento',
    paciente: 'Paciente',
    perdido: 'Perdido',
  }
  var PHASE_COLORS = {
    lead: '#64748B',
    agendado: '#3B82F6',
    reagendado: '#6366F1',
    compareceu: '#8B5CF6',
    orcamento: '#F59E0B',
    paciente: '#10B981',
    perdido: '#DC2626',
  }
  function _phaseLabel(p) { return PHASE_LABELS[p] || (p || '—') }
  function _phaseColor(p) { return PHASE_COLORS[p] || '#94A3B8' }
  function _hoursHuman(h) {
    var n = Number(h) || 0
    if (n < 1) return Math.round(n * 60) + 'm'
    if (n < 24) return (Math.round(n * 10) / 10) + 'h'
    return (Math.round((n / 24) * 10) / 10) + 'd'
  }

  function _showLifecycle() {
    var existing = document.getElementById('faLifecycleModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'faLifecycleModal'
    overlay.className = 'fa-modal-overlay'
    overlay.innerHTML = '<div class="fa-modal fa-modal-lc" role="dialog">'
      + '<div class="fa-modal-header">'
      +   '<div class="fa-modal-title">' + _f('trendingUp', 16) + ' Lifecycle · conversao por fase</div>'
      +   '<button type="button" class="fa-btn-icon" data-lc-close>' + _f('x', 16) + '</button>'
      + '</div>'
      + '<div class="fa-lc-filters">'
      +   '<label>Periodo'
      +     '<select id="faLcDays">'
      +       '<option value="7">Ultimos 7 dias</option>'
      +       '<option value="30" selected>Ultimos 30 dias</option>'
      +       '<option value="60">Ultimos 60 dias</option>'
      +       '<option value="90">Ultimos 90 dias</option>'
      +       '<option value="180">Ultimos 180 dias</option>'
      +     '</select>'
      +   '</label>'
      +   '<label>Funil'
      +     '<select id="faLcFunnel">'
      +       '<option value="">Todos</option>'
      +       '<option value="fullface">Full Face</option>'
      +       '<option value="procedimentos">Procedimentos</option>'
      +     '</select>'
      +   '</label>'
      + '</div>'
      + '<div class="fa-modal-body"><div class="fa-lc-loading">Carregando metricas...</div></div>'
      + '</div>'
    document.body.appendChild(overlay)

    function close() { overlay.remove() }
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return close()
      if (e.target.closest('[data-lc-close]')) return close()
    })
    overlay.querySelector('#faLcDays').addEventListener('change', function() {
      _loadLifecycle(parseInt(this.value, 10) || 30, overlay.querySelector('#faLcFunnel').value || null)
    })
    overlay.querySelector('#faLcFunnel').addEventListener('change', function() {
      _loadLifecycle(parseInt(overlay.querySelector('#faLcDays').value, 10) || 30, this.value || null)
    })
    if (!window._faLcEscBound) {
      window._faLcEscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return
        var m = document.getElementById('faLifecycleModal')
        if (m) m.remove()
      })
    }

    _loadLifecycle(30, null)
  }

  async function _loadLifecycle(days, funnel) {
    var body = document.querySelector('#faLifecycleModal .fa-modal-body')
    if (!body) return
    body.innerHTML = '<div class="fa-lc-loading">Carregando metricas...</div>'
    try {
      if (!window._sbShared) throw new Error('Supabase indisponivel')
      var res = await window._sbShared.rpc('sdr_lifecycle_metrics', { p_days: days, p_funnel: funnel })
      if (res.error) throw new Error(res.error.message)
      var payload = res.data || {}
      if (payload.ok === false) throw new Error(payload.error || 'Erro na RPC')
      _renderLifecycleDashboard(payload.data || {}, body)
    } catch (e) {
      body.innerHTML = '<div class="fa-lc-error">' + _f('alertCircle', 14) + ' Erro: ' + S().esc(e.message) + '</div>'
    }
  }

  function _renderLifecycleDashboard(data, body) {
    var phases = Array.isArray(data.phases) ? data.phases : []
    var transitions = Array.isArray(data.transitions) ? data.transitions : []
    var totals = data.totals || {}
    var origins = data.origins || {}

    if (!phases.length && !totals.events) {
      body.innerHTML = '<div class="fa-lc-empty">' + _f('info', 14) + ' Sem movimentacoes no periodo selecionado.</div>'
      return
    }

    var overallConv = totals.leads_touched > 0
      ? Math.round((Number(totals.pacientes_period) / Number(totals.leads_touched)) * 1000) / 10
      : null
    var dropRate = totals.leads_touched > 0
      ? Math.round((Number(totals.perdidos_period) / Number(totals.leads_touched)) * 1000) / 10
      : null

    var summary = '<div class="fa-lc-summary">'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Leads movimentados</div><div class="fa-lc-stat-val">' + (totals.leads_touched || 0) + '</div></div>'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Viraram Paciente</div><div class="fa-lc-stat-val" style="color:#10B981">' + (totals.pacientes_period || 0) + '</div></div>'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Viraram Perdido</div><div class="fa-lc-stat-val" style="color:#DC2626">' + (totals.perdidos_period || 0) + '</div></div>'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Conversao geral</div><div class="fa-lc-stat-val">' + (overallConv != null ? overallConv + '%' : '—') + '</div></div>'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Taxa de perda</div><div class="fa-lc-stat-val">' + (dropRate != null ? dropRate + '%' : '—') + '</div></div>'
      + '<div class="fa-lc-stat"><div class="fa-lc-stat-label">Total eventos</div><div class="fa-lc-stat-val">' + (totals.events || 0) + '</div></div>'
      + '</div>'

    // Funnel bars — proporcao de entries em cada fase
    var maxEntries = phases.reduce(function(m, p) { return Math.max(m, Number(p.entries) || 0) }, 0) || 1
    var funnelBars = phases.map(function(p) {
      var pct = Math.round((Number(p.entries) / maxEntries) * 100)
      var color = _phaseColor(p.phase)
      var convOut = Number(p.entries) > 0 ? Math.round((Number(p.exits) / Number(p.entries)) * 1000) / 10 : null
      return '<div class="fa-lc-phase-row">'
        + '<div class="fa-lc-phase-name" style="color:' + color + '">' + S().esc(_phaseLabel(p.phase)) + '</div>'
        + '<div class="fa-lc-phase-bar-wrap">'
        +   '<div class="fa-lc-phase-bar" style="width:' + pct + '%;background:' + color + '"></div>'
        +   '<div class="fa-lc-phase-bar-label">' + (p.entries || 0) + ' entradas</div>'
        + '</div>'
        + '<div class="fa-lc-phase-meta">'
        +   '<span title="Atualmente na fase">' + _f('users', 11) + ' ' + (p.current || 0) + '</span>'
        +   '<span title="Sairam da fase no periodo">' + _f('logOut', 11) + ' ' + (p.exits || 0) + (convOut != null ? ' (' + convOut + '%)' : '') + '</span>'
        +   '<span title="Tempo medio na fase">' + _f('clock', 11) + ' ' + (p.samples > 0 ? _hoursHuman(p.avg_hours) : '—') + '</span>'
        + '</div>'
        + '</div>'
    }).join('')

    // Transicoes
    var transitionsBlock = ''
    if (transitions.length) {
      var rows = transitions.slice(0, 20).map(function(t) {
        var fromColor = _phaseColor(t.from)
        var toColor = _phaseColor(t.to)
        return '<tr>'
          + '<td><span class="fa-lc-chip" style="background:' + fromColor + '20;color:' + fromColor + '">' + S().esc(_phaseLabel(t.from)) + '</span></td>'
          + '<td class="fa-lc-arrow">' + _f('arrowRight', 12) + '</td>'
          + '<td><span class="fa-lc-chip" style="background:' + toColor + '20;color:' + toColor + '">' + S().esc(_phaseLabel(t.to)) + '</span></td>'
          + '<td class="fa-lc-tnum">' + (t.count || 0) + '</td>'
          + '</tr>'
      }).join('')
      transitionsBlock = '<div class="fa-lc-section-title">Transicoes mais frequentes</div>'
        + '<table class="fa-lc-trans-table"><thead>'
        +   '<tr><th>De</th><th></th><th>Para</th><th>Qtd</th></tr>'
        + '</thead><tbody>' + rows + '</tbody></table>'
    }

    // Origin attribution
    var originBlock = ''
    var originKeys = Object.keys(origins)
    if (originKeys.length) {
      var totalOrig = originKeys.reduce(function(s, k) { return s + Number(origins[k] || 0) }, 0) || 1
      var originLabelMap = {
        auto_transition: 'Automatico (sistema)',
        manual_override: 'Manual (usuario)',
        rule:            'Regra de automacao',
        unknown:         'Sem origem',
      }
      var origColorMap = {
        auto_transition: '#3B82F6',
        manual_override: '#F59E0B',
        rule:            '#10B981',
        unknown:         '#94A3B8',
      }
      var origRows = originKeys.map(function(k) {
        var pct = Math.round((Number(origins[k]) / totalOrig) * 1000) / 10
        var color = origColorMap[k] || '#94A3B8'
        return '<div class="fa-lc-orig-row">'
          + '<div class="fa-lc-orig-name">' + S().esc(originLabelMap[k] || k) + '</div>'
          + '<div class="fa-lc-orig-bar-wrap"><div class="fa-lc-orig-bar" style="width:' + pct + '%;background:' + color + '"></div></div>'
          + '<div class="fa-lc-orig-val">' + origins[k] + ' <span class="fa-lc-orig-pct">(' + pct + '%)</span></div>'
          + '</div>'
      }).join('')
      originBlock = '<div class="fa-lc-section-title">Origem das transicoes</div>'
        + '<div class="fa-lc-origins">' + origRows + '</div>'
    }

    body.innerHTML = summary
      + '<div class="fa-lc-section-title">Funil por fase (entradas no periodo)</div>'
      + '<div class="fa-lc-phases">' + funnelBars + '</div>'
      + transitionsBlock
      + originBlock
      + '<div class="fa-lc-hint">' + _f('info', 11) + ' "Entradas" = leads que entraram na fase no periodo. "Atual" = leads que estao nela agora. "Tempo medio" = duracao tipica entre entrar e sair.</div>'
  }

  // ── D-1 Tracking (SIM/NAO) ──────────────────────────────────
  function _showD1Tracking() {
    var existing = document.getElementById('faD1TrackingModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'faD1TrackingModal'
    overlay.className = 'fa-modal-overlay'
    overlay.innerHTML = '<div class="fa-modal fa-modal-d1" role="dialog">'
      + '<div class="fa-modal-header">'
      +   '<div class="fa-modal-title">' + _f('checkCircle', 16) + ' Rastreamento D-1 · SIM/NAO</div>'
      +   '<button type="button" class="fa-btn-icon" data-d1-close>' + _f('x', 16) + '</button>'
      + '</div>'
      + '<div class="fa-d1-filters">'
      +   '<label>Periodo'
      +     '<select id="faD1Days">'
      +       '<option value="7">Ultimos 7 dias</option>'
      +       '<option value="30" selected>Ultimos 30 dias</option>'
      +       '<option value="60">Ultimos 60 dias</option>'
      +       '<option value="90">Ultimos 90 dias</option>'
      +     '</select>'
      +   '</label>'
      + '</div>'
      + '<div class="fa-modal-body"><div class="fa-d1-loading">Carregando metricas...</div></div>'
      + '</div>'
    document.body.appendChild(overlay)

    function close() { overlay.remove() }
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return close()
      if (e.target.closest('[data-d1-close]')) return close()
    })
    overlay.querySelector('#faD1Days').addEventListener('change', function() {
      _loadD1Tracking(parseInt(this.value, 10) || 30)
    })
    if (!window._faD1EscBound) {
      window._faD1EscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return
        var m = document.getElementById('faD1TrackingModal')
        if (m) m.remove()
      })
    }

    _loadD1Tracking(30)
  }

  async function _loadD1Tracking(days) {
    var body = document.querySelector('#faD1TrackingModal .fa-modal-body')
    if (!body) return
    body.innerHTML = '<div class="fa-d1-loading">Carregando...</div>'
    try {
      if (!window._sbShared) throw new Error('Supabase indisponivel')
      var res = await window._sbShared.rpc('sdr_d1_tracking_metrics', { p_days: days })
      if (res.error) throw new Error(res.error.message)
      var payload = res.data || {}
      if (payload.ok === false) throw new Error(payload.error || 'Erro na RPC')
      _renderD1Tracking(payload.data || {}, body)
    } catch (e) {
      body.innerHTML = '<div class="fa-d1-error">' + _f('alertCircle', 14) + ' Erro: ' + S().esc(e.message) + '</div>'
    }
  }

  function _renderD1Tracking(data, body) {
    var t = data.totals || {}
    var daily = Array.isArray(data.daily) ? data.daily : []
    var sent = Number(t.sent) || 0

    if (!sent) {
      body.innerHTML = '<div class="fa-d1-empty">' + _f('info', 14)
        + ' Nenhum disparo D-1 registrado no periodo. Crie ou ative uma regra'
        + ' <b>d_before</b> com <b>days=1</b> para comecar o rastreamento.</div>'
      return
    }

    var confirmed = Number(t.confirmed) || 0
    var declined = Number(t.declined) || 0
    var silent = Number(t.silent) || 0
    var responded = confirmed + declined
    var respRate = sent ? Math.round((responded / sent) * 1000) / 10 : 0
    var confRate = responded ? Math.round((confirmed / responded) * 1000) / 10 : 0
    var avgHours = t.avg_response_hours != null ? Number(t.avg_response_hours).toFixed(1) + 'h' : '—'

    var summary = '<div class="fa-d1-summary">'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Enviados</div><div class="fa-d1-stat-val">' + sent + '</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Confirmaram</div><div class="fa-d1-stat-val" style="color:#10B981">' + confirmed + '</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Recusaram</div><div class="fa-d1-stat-val" style="color:#DC2626">' + declined + '</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Sem resposta</div><div class="fa-d1-stat-val" style="color:#94A3B8">' + silent + '</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Taxa resposta</div><div class="fa-d1-stat-val">' + respRate + '%</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Taxa confirmacao</div><div class="fa-d1-stat-val">' + confRate + '%</div></div>'
      + '<div class="fa-d1-stat"><div class="fa-d1-stat-label">Tempo medio</div><div class="fa-d1-stat-val">' + avgHours + '</div></div>'
      + '</div>'

    // Stacked bar for overall
    var pctConf = sent ? Math.round((confirmed / sent) * 100) : 0
    var pctDecl = sent ? Math.round((declined / sent) * 100) : 0
    var pctSilent = Math.max(0, 100 - pctConf - pctDecl)
    var stack = '<div class="fa-d1-stacked">'
      + '<div class="fa-d1-stacked-label">Distribuicao geral</div>'
      + '<div class="fa-d1-stacked-bar">'
      +   '<div class="fa-d1-stacked-seg" style="width:' + pctConf + '%;background:#10B981" title="Confirmaram ' + confirmed + '">' + (pctConf >= 8 ? pctConf + '%' : '') + '</div>'
      +   '<div class="fa-d1-stacked-seg" style="width:' + pctDecl + '%;background:#DC2626" title="Recusaram ' + declined + '">' + (pctDecl >= 8 ? pctDecl + '%' : '') + '</div>'
      +   '<div class="fa-d1-stacked-seg" style="width:' + pctSilent + '%;background:#CBD5E1;color:#475569" title="Sem resposta ' + silent + '">' + (pctSilent >= 8 ? pctSilent + '%' : '') + '</div>'
      + '</div>'
      + '<div class="fa-d1-stacked-legend">'
      +   '<span><i style="background:#10B981"></i> Confirmaram</span>'
      +   '<span><i style="background:#DC2626"></i> Recusaram</span>'
      +   '<span><i style="background:#CBD5E1"></i> Sem resposta</span>'
      + '</div>'
      + '</div>'

    // Daily breakdown
    var dailyBlock = ''
    if (daily.length) {
      var rows = daily.map(function(d) {
        var rConf = d.total ? Math.round((d.confirmed / d.total) * 100) : 0
        var rDecl = d.total ? Math.round((d.declined / d.total) * 100) : 0
        var rSil = Math.max(0, 100 - rConf - rDecl)
        return '<tr>'
          + '<td>' + S().esc(d.date) + '</td>'
          + '<td class="fa-d1-num">' + d.total + '</td>'
          + '<td class="fa-d1-num" style="color:#10B981">' + d.confirmed + '</td>'
          + '<td class="fa-d1-num" style="color:#DC2626">' + d.declined + '</td>'
          + '<td class="fa-d1-num" style="color:#94A3B8">' + d.silent + '</td>'
          + '<td><div class="fa-d1-bar">'
          +   '<div style="width:' + rConf + '%;background:#10B981"></div>'
          +   '<div style="width:' + rDecl + '%;background:#DC2626"></div>'
          +   '<div style="width:' + rSil + '%;background:#CBD5E1"></div>'
          + '</div></td>'
          + '</tr>'
      }).join('')
      dailyBlock = '<div class="fa-d1-section-title">Por dia da consulta</div>'
        + '<table class="fa-d1-table"><thead>'
        +   '<tr><th>Data</th><th>Enviados</th><th>Conf</th><th>Rec</th><th>Silent</th><th>Distribuicao</th></tr>'
        + '</thead><tbody>' + rows + '</tbody></table>'
    }

    body.innerHTML = summary + stack + dailyBlock
      + '<div class="fa-d1-hint">' + _f('info', 11)
      + ' Resposta capturada automaticamente via trigger <b>wa_auto_confirm_appointment</b> (SIM/NAO/CONFIRMO/CANCELAR).'
      + ' Atualiza <code>appointments.d1_response</code> + status da consulta.</div>'
  }

  // ── A/B Significance testing ────────────────────────────────
  function _showAbSignificance() {
    var existing = document.getElementById('faAbSigModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'faAbSigModal'
    overlay.className = 'fa-modal-overlay'
    overlay.innerHTML = '<div class="fa-modal fa-modal-absig" role="dialog">'
      + '<div class="fa-modal-header">'
      +   '<div class="fa-modal-title">' + _f('zap', 16) + ' Testes A/B · significancia estatistica</div>'
      +   '<button type="button" class="fa-btn-icon" data-absig-close>' + _f('x', 16) + '</button>'
      + '</div>'
      + '<div class="fa-absig-filters">'
      +   '<label>Periodo'
      +     '<select id="faAbSigDays">'
      +       '<option value="7">Ultimos 7 dias</option>'
      +       '<option value="30" selected>Ultimos 30 dias</option>'
      +       '<option value="60">Ultimos 60 dias</option>'
      +       '<option value="90">Ultimos 90 dias</option>'
      +     '</select>'
      +   '</label>'
      + '</div>'
      + '<div class="fa-modal-body"><div class="fa-absig-loading">Carregando...</div></div>'
      + '</div>'
    document.body.appendChild(overlay)

    function close() { overlay.remove() }
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return close()
      if (e.target.closest('[data-absig-close]')) return close()
    })
    overlay.querySelector('#faAbSigDays').addEventListener('change', function() {
      _loadAbSignificance(parseInt(this.value, 10) || 30)
    })
    if (!window._faAbSigEscBound) {
      window._faAbSigEscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return
        var m = document.getElementById('faAbSigModal')
        if (m) m.remove()
      })
    }

    _loadAbSignificance(30)
  }

  async function _loadAbSignificance(days) {
    var body = document.querySelector('#faAbSigModal .fa-modal-body')
    if (!body) return
    body.innerHTML = '<div class="fa-absig-loading">Carregando...</div>'
    try {
      if (!window._sbShared) throw new Error('Supabase indisponivel')
      var res = await window._sbShared.rpc('wa_rule_ab_significance', { p_days: days })
      if (res.error) throw new Error(res.error.message)
      var payload = res.data || {}
      if (payload.ok === false) throw new Error(payload.error || 'Erro na RPC')
      _renderAbSignificance(payload.data || {}, body)
    } catch (e) {
      body.innerHTML = '<div class="fa-absig-error">' + _f('alertCircle', 14) + ' Erro: ' + S().esc(e.message) + '</div>'
    }
  }

  function _renderAbSignificance(data, body) {
    var rules = Array.isArray(data.rules) ? data.rules : []
    if (!rules.length) {
      body.innerHTML = '<div class="fa-absig-empty">' + _f('info', 14)
        + ' Nenhuma regra com A/B ativo. Abra uma regra de WhatsApp e clique em '
        + '<b>Testar variacao B</b> para comecar um experimento.</div>'
      return
    }

    var cards = rules.map(function(r) {
      var aRate = r.a_rate != null ? r.a_rate + '%' : '—'
      var bRate = r.b_rate != null ? r.b_rate + '%' : '—'
      var winnerBadge = ''
      var verdictCls = 'fa-absig-verdict-none'
      var verdictTxt = ''

      if (r.n_total < 30) {
        verdictTxt = 'Amostra pequena (' + r.n_total + ' envios). Precisa de pelo menos ~' + (r.min_sample_rec > 0 ? r.min_sample_rec : '200') + ' para decidir.'
      } else if (r.chi_square == null) {
        verdictTxt = 'Sem dados suficientes nas duas variantes.'
      } else if (r.significant_99) {
        verdictCls = 'fa-absig-verdict-strong'
        winnerBadge = r.winner
        verdictTxt = 'Vencedor ' + (r.winner || '?') + ' com 99% de confianca. x^2=' + r.chi_square
      } else if (r.significant_95) {
        verdictCls = 'fa-absig-verdict-good'
        winnerBadge = r.winner
        verdictTxt = 'Vencedor ' + (r.winner || '?') + ' com 95% de confianca. x^2=' + r.chi_square
      } else {
        verdictCls = 'fa-absig-verdict-weak'
        verdictTxt = 'Diferenca nao significativa (x^2=' + r.chi_square + ' < 3.841). Continue rodando.'
      }

      var a_ratio = r.a_total > 0 ? Math.round((r.a_sent / r.a_total) * 100) : 0
      var b_ratio = r.b_total > 0 ? Math.round((r.b_sent / r.b_total) * 100) : 0

      return '<div class="fa-absig-card">'
        + '<div class="fa-absig-card-head">'
        +   '<div class="fa-absig-card-name">' + _f('zap', 13) + ' ' + S().esc(r.rule_name)
        +     (r.is_active ? '' : ' <span class="fa-absig-off">OFF</span>') + '</div>'
        +   (winnerBadge ? '<div class="fa-absig-winner">Vencedor ' + S().esc(winnerBadge) + '</div>' : '')
        + '</div>'
        + '<div class="fa-absig-variants">'
        +   '<div class="fa-absig-variant' + (r.winner === 'A' ? ' fa-absig-variant-win' : '') + '">'
        +     '<div class="fa-absig-var-label">Variante A</div>'
        +     '<div class="fa-absig-var-text">' + S().esc(r.a_content || '—') + '</div>'
        +     '<div class="fa-absig-var-stats">'
        +       '<span class="fa-absig-var-rate">' + aRate + '</span>'
        +       '<span class="fa-absig-var-counts">' + r.a_sent + '/' + r.a_total + '</span>'
        +     '</div>'
        +     '<div class="fa-absig-var-bar"><div style="width:' + a_ratio + '%;background:#10B981"></div></div>'
        +   '</div>'
        +   '<div class="fa-absig-variant' + (r.winner === 'B' ? ' fa-absig-variant-win' : '') + '">'
        +     '<div class="fa-absig-var-label">Variante B</div>'
        +     '<div class="fa-absig-var-text">' + S().esc(r.b_content || '—') + '</div>'
        +     '<div class="fa-absig-var-stats">'
        +       '<span class="fa-absig-var-rate">' + bRate + '</span>'
        +       '<span class="fa-absig-var-counts">' + r.b_sent + '/' + r.b_total + '</span>'
        +     '</div>'
        +     '<div class="fa-absig-var-bar"><div style="width:' + b_ratio + '%;background:#6366F1"></div></div>'
        +   '</div>'
        + '</div>'
        + '<div class="fa-absig-verdict ' + verdictCls + '">'
        +   '<strong>Veredicto:</strong> ' + S().esc(verdictTxt)
        + '</div>'
        + '</div>'
    }).join('')

    body.innerHTML = '<div class="fa-absig-list">' + cards + '</div>'
      + '<div class="fa-absig-hint">' + _f('info', 11)
      + ' Metrica usada: <b>taxa de entrega</b> (sent / (sent+failed)). '
      + 'Chi-quadrado com 1 grau de liberdade. Criterios: > 3.841 = 95% / > 6.635 = 99%. '
      + 'Recomendado rodar com N >= 200 envios totais para uma decisao confiavel.</div>'
  }

  // ── Duplicar regra ──────────────────────────────────────────
  async function _duplicateRule(ruleId) {
    var orig = _rules.find(function(r) { return r.id === ruleId })
    if (!orig) { S().showToast('Erro', 'Regra nao encontrada', 'error'); return }
    var copy = Object.assign({}, orig)
    delete copy.id
    delete copy.created_at
    delete copy.updated_at
    copy.name = 'Copia de ' + orig.name
    copy.is_active = false // criada desativada por seguranca
    copy.sort_order = (parseInt(orig.sort_order) || 0) + 1

    S().showToast('Duplicando', 'Criando copia de "' + orig.name + '"', 'info')
    var res = await REPO().upsert(copy)
    if (res.ok) {
      if (res.data && res.data.id) _selectedId = res.data.id
      S().showToast('Duplicado', 'Copia criada (inativa). Ative quando quiser.', 'success')
      _bcNotify()
      await _load()
    } else {
      S().showToast('Erro', res.error || 'Falha ao duplicar', 'error')
    }
  }

  // ── Export / Import JSON ────────────────────────────────────
  function _exportJson() {
    var m = _mod()
    if (!m) return
    var rules = _rulesInModule()
    var payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      module: m.id,
      module_label: m.label,
      count: rules.length,
      rules: rules.map(function(r) {
        // Sanitiza — remove IDs do DB
        var copy = Object.assign({}, r)
        delete copy.id
        delete copy.created_at
        delete copy.updated_at
        delete copy.clinic_id
        return copy
      }),
    }
    var json = JSON.stringify(payload, null, 2)
    var blob = new Blob([json], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'funnel-' + m.id + '-' + new Date().toISOString().slice(0, 10) + '.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    S().showToast('Exportado', rules.length + ' regras em JSON', 'success')
  }

  async function _importJson(file) {
    try {
      var txt = await file.text()
      var data = JSON.parse(txt)
      if (!data || !Array.isArray(data.rules)) {
        S().showToast('Erro', 'JSON invalido (esperado { rules: [...] })', 'error')
        return
      }
      var m = _mod()
      if (data.module && m && data.module !== m.id) {
        if (!confirm('JSON e do modulo "' + data.module + '" mas voce esta em "' + m.id + '". Importar mesmo assim?')) return
      }
      var ok = 0, fail = 0
      for (var i = 0; i < data.rules.length; i++) {
        var r = Object.assign({}, data.rules[i])
        delete r.id // forca criacao nova
        r.is_active = false // importadas ficam inativas
        r.name = (r.name || 'Importada') + ' (importada)'
        var res = await REPO().upsert(r)
        if (res.ok) ok++; else fail++
      }
      S().showToast('Importado', ok + ' criadas (inativas)' + (fail ? ', ' + fail + ' falharam' : ''), ok > 0 ? 'success' : 'error')
      if (ok > 0) _bcNotify()
      await _load()
    } catch (e) {
      S().showToast('Erro', 'JSON invalido: ' + e.message, 'error')
    }
  }

  // ── Init ────────────────────────────────────────────────────
  function init(rootId) {
    var el = document.getElementById(rootId || 'funnel-automations-root')
    if (!el) return
    if (_root !== el) { _root = el; _bindEvents(_root) }
    _bcInit()
    _loading = true
    _root.innerHTML = _renderPage()
    _load()
  }

  window.FunnelAutomationsUI = Object.freeze({ init: init })
})()
