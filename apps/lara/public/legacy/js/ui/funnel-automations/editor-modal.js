/**
 * ClinicAI — Funil Automations Editor Modal (standalone)
 *
 * Editor reutilizavel de regras wa_agenda_automations, chamavel de qualquer pagina.
 * Monta seu proprio overlay em document.body, sem depender do shell do funil.
 *
 * API publica:
 *   FAEditor.open(ruleId|null, opts?)
 *     ruleId   — id para editar, null para criar
 *     opts     = {
 *       prefill?: { trigger_type, trigger_config, category },
 *       onSave?:  function(savedRule)
 *     }
 *   FAEditor.close()
 *
 * Depende de:
 *   window.FAModules[*]                — logica de trigger por fase
 *   window.AAShared                    — primitivas de render (preview, chips, canais)
 *   window.AgendaAutomationsRepository — list/upsert
 */
;(function () {
  'use strict'
  if (window.FAEditor) return

  var MODULE_ORDER = ['pre_agendamento', 'agendamento', 'paciente', 'orcamento', 'paciente_orcamento', 'perdido']

  var _rules = []
  var _rulesLoaded = false
  var _moduleId = 'agendamento'
  var _ruleId = null
  var _originalRule = null
  var _form = _emptyForm()
  var _saving = false
  var _onSave = null
  var _overlay = null

  function S() { return window.AAShared }
  function REPO() { return window.AgendaAutomationsRepository }
  function _mod() { return (window.FAModules || {})[_moduleId] }
  function _esc(s) { return S() ? S().esc(s) : String(s == null ? '' : s) }
  function _f(n, sz) { return S() ? S().feather(n, sz) : '' }

  function _emptyForm() {
    return {
      status: '', when: 'immediate',
      name: '', description: '',
      channel: 'whatsapp',
      content_template: '', ab_variant_template: '',
      attachment_url: '', attachment_urls: [], attachment_above_text: true,
      alert_title: '', alert_type: 'info',
      task_title: '', task_assignee: 'sdr', task_priority: 'normal', task_deadline_hours: 24,
      alexa_message: '', alexa_target: 'sala',
      is_active: true, sort_order: 0, recipient_type: 'patient',
      tag_filter: null,
    }
  }

  function _pickModuleFor(rule) {
    var mods = window.FAModules || {}
    for (var i = 0; i < MODULE_ORDER.length; i++) {
      var m = mods[MODULE_ORDER[i]]
      if (m && typeof m.matchesRule === 'function' && m.matchesRule(rule)) return MODULE_ORDER[i]
    }
    return 'agendamento'
  }

  function _formFromRule(r) {
    var m = _mod()
    var triggerForm = m && m.fromRule ? m.fromRule(r) : { status: '', when: 'immediate' }
    var out = _emptyForm()
    Object.keys(triggerForm).forEach(function (k) { out[k] = triggerForm[k] })
    out.name = r.name || ''
    out.description = r.description || ''
    out.channel = r.channel || 'whatsapp'
    out.content_template = r.content_template || ''
    out.ab_variant_template = r.ab_variant_template || ''
    out.attachment_url = r.attachment_url || ''
    out.attachment_urls = Array.isArray(r.attachment_urls) ? r.attachment_urls.filter(Boolean) : []
    out.attachment_above_text = r.attachment_above_text !== false
    out.alert_title = r.alert_title || ''
    out.alert_type = r.alert_type || 'info'
    out.task_title = r.task_title || ''
    out.task_assignee = r.task_assignee || 'sdr'
    out.task_priority = r.task_priority || 'normal'
    out.task_deadline_hours = r.task_deadline_hours || 24
    out.alexa_message = r.alexa_message || ''
    out.alexa_target = r.alexa_target || 'sala'
    out.is_active = r.is_active !== false
    out.sort_order = r.sort_order || 0
    out.recipient_type = r.recipient_type || 'patient'
    out.tag_filter = (r.trigger_config && r.trigger_config.tag_filter) || null
    return out
  }

  function _formFromPrefill(prefill) {
    var out = _emptyForm()
    if (!prefill) return out
    var fake = { trigger_type: prefill.trigger_type, trigger_config: prefill.trigger_config || {} }
    var m = _mod()
    if (m && m.fromRule) {
      var tf = m.fromRule(fake)
      Object.keys(tf).forEach(function (k) { out[k] = tf[k] })
      if (m.suggestName) out.name = m.suggestName(out) || ''
    }
    return out
  }

  async function _ensureRules() {
    if (_rulesLoaded) return
    // Reusa cache compartilhado (FAState) se shell ja carregou — evita
    // duplicacao de estado e round-trip extra. Sem cache, fetch direto.
    var cached = (window.FAState && typeof window.FAState.get === 'function') ? window.FAState.get() : null
    if (Array.isArray(cached)) {
      _rules = cached
      _rulesLoaded = true
      return
    }
    try {
      var res = await REPO().list()
      _rules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
      if (window.FAState && typeof window.FAState.set === 'function' && _rules.length) {
        try { window.FAState.set(_rules) } catch (e) {}
      }
    } catch (e) { _rules = [] }
    _rulesLoaded = true
  }

  function _render() {
    if (!_overlay) return
    _overlay.innerHTML = _renderOverlayBody()
    if (typeof featherIn === 'function') featherIn(_overlay)
  }

  function _renderOverlayBody() {
    var m = _mod()
    var title = _ruleId
      ? (_f('edit3', 16) + ' Editar automacao' + (m ? ' · ' + m.label : ''))
      : (_f('plus', 16) + ' Nova automacao' + (m ? ' · ' + m.label : ''))
    var saveLabel = _saving ? 'Salvando...' : (_ruleId ? 'Salvar alteracoes' : 'Criar automacao')
    return ''
      + '<div class="fa-modal" role="dialog" data-fae-stop>'
      +   '<div class="fa-modal-header">'
      +     '<div class="fa-modal-title">' + title + '</div>'
      +     '<button type="button" class="fa-btn-icon" data-fae-action="close">' + _f('x', 16) + '</button>'
      +   '</div>'
      +   '<div class="fa-modal-body">'
      +     '<div class="fa-modal-editor">' + _renderForm() + '</div>'
      +     '<div class="fa-modal-preview">' + _renderLivePreview(_form) + '</div>'
      +   '</div>'
      +   '<div class="fa-modal-footer">'
      +     (_ruleId ? '<button type="button" class="fa-btn-del" data-fae-action="delete">' + _f('trash2', 14) + ' Excluir</button>' : '')
      +     '<div style="flex:1"></div>'
      +     '<button type="button" class="fa-btn-cancel" data-fae-action="close">Cancelar</button>'
      +     '<button type="button" class="fa-btn-save" data-fae-action="save">' + saveLabel + '</button>'
      +   '</div>'
      + '</div>'
  }

  function _renderForm() {
    var m = _mod()
    if (!m) return '<div class="fa-empty-col">Modulo "' + _esc(_moduleId) + '" nao carregado</div>'
    var f = _form
    return ''
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('tag', 11) + ' Identificacao</div>'
      +   '<div class="fa-field"><label>Nome</label>'
      +     '<input type="text" id="faeName" value="' + _esc(f.name) + '" placeholder="Ex: Confirmacao D-1"></div>'
      +   '<div class="fa-field"><label>Descricao</label>'
      +     '<input type="text" id="faeDesc" value="' + _esc(f.description) + '" placeholder="(opcional)"></div>'
      + '</div>'
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('zap', 11) + ' Gatilho · ' + m.label + '</div>'
      +   '<div id="faeTriggerFields">' + _renderTriggerFields(m, f) + '</div>'
      + '</div>'
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('filter', 11) + ' Segmentacao por tags · opcional</div>'
      +   S().renderTagFilter(f.tag_filter)
      + '</div>'
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('send', 11) + ' Como avisar</div>'
      +   S().renderChannelChecks(f.channel)
      +   '<div id="faeChannelBlocks">' + _renderChannelBlocks(f) + '</div>'
      + '</div>'
  }

  function _renderTriggerFields(m, f) {
    var html = m.renderTriggerFields(f)
    return html
      .replace(/id="faStatus"/g,         'id="faStatus" data-fae-status')
      .replace(/id="faWhen"/g,           'id="faWhen" data-fae-when')
      .replace(/id="faHours"/g,          'id="faHours"')
      .replace(/id="faMinutes"/g,        'id="faMinutes"')
      .replace(/id="faDays"/g,           'id="faDays"')
      .replace(/id="faHour"/g,           'id="faHour"')
      .replace(/id="faMinute"/g,         'id="faMinute"')
      .replace(/id="faMinutesBefore"/g,  'id="faMinutesBefore"')
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
    var abBlock = abActive
      ? '<div class="fa-ab-block">'
        +   '<div class="fa-ab-header">' + _f('zap', 12) + ' Variante B <span class="fa-ab-badge">50/50</span>'
        +     '<button type="button" class="fa-ab-remove" data-fae-action="ab-remove" title="Desativar A/B">' + _f('x', 12) + '</button>'
        +   '</div>'
        +   '<textarea id="faContentB" class="fa-wa-textarea" rows="6" placeholder="Variante B">' + _esc(f.ab_variant_template || '') + '</textarea>'
        + '</div>'
      : ''
    return '<div class="fa-channel-block fa-wa-block">'
      +   '<div class="fa-channel-block-title">' + _f('messageCircle', 12) + ' WhatsApp'
      +     S().renderTemplateLibraryButton()
      +     '<button type="button" class="fa-ab-toggle" data-fae-action="ab-toggle" title="A/B testing">' + _f(abActive ? 'zap' : 'plus', 11) + ' ' + (abActive ? 'A/B ativo' : 'Testar variacao B') + '</button>'
      +   '</div>'
      +   S().renderChipsBar('var')
      +   S().renderFormatToolbar()
      +   '<textarea id="faContent" class="fa-wa-textarea" rows="10" placeholder="Digite a mensagem do WhatsApp...">' + _esc(f.content_template) + '</textarea>'
      +   abBlock
      +   (S().renderAttachGallery
            ? S().renderAttachGallery(
                (Array.isArray(f.attachment_urls) && f.attachment_urls.length)
                  ? f.attachment_urls
                  : (f.attachment_url ? [f.attachment_url] : []),
                f.attachment_above_text !== false)
            : S().renderAttachArea(f.attachment_url, f.attachment_above_text !== false))
      + '</div>'
  }

  function _blockAlexa(f) {
    var targets = [
      { id: 'sala', label: 'Sala' }, { id: 'recepcao', label: 'Recepcao' },
      { id: 'profissional', label: 'Profissional' }, { id: 'todos', label: 'Todos' },
    ]
    var opts = targets.map(function (t) { return '<option value="' + t.id + '"' + (f.alexa_target === t.id ? ' selected' : '') + '>' + t.label + '</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('speaker', 12) + ' Alexa</div>'
      +   '<div class="fa-field"><label>Dispositivo alvo</label><select id="faAlexaTarget">' + opts + '</select></div>'
      +   '<div class="fa-field"><label>Mensagem</label>' + S().renderChipsBar('alexa-var')
      +     '<textarea id="faAlexaMsg" rows="3" placeholder="Ex: Dra {{profissional}}, paciente {{nome}} na recepcao.">' + _esc(f.alexa_message) + '</textarea>'
      +   '</div>'
      + '</div>'
  }

  function _blockTask(f) {
    var assignees = [
      { id: 'sdr', label: 'SDR / Comercial' }, { id: 'secretaria', label: 'Secretaria' },
      { id: 'cs', label: 'CS / Pos-venda' }, { id: 'clinica', label: 'Equipe Clinica' }, { id: 'gestao', label: 'Gestao' },
    ]
    var priorities = [
      { id: 'urgente', label: 'Urgente' }, { id: 'alta', label: 'Alta' },
      { id: 'normal', label: 'Normal' }, { id: 'baixa', label: 'Baixa' },
    ]
    var aOpts = assignees.map(function (a) { return '<option value="' + a.id + '"' + ((f.task_assignee || 'sdr') === a.id ? ' selected' : '') + '>' + a.label + '</option>' }).join('')
    var pOpts = priorities.map(function (p) { return '<option value="' + p.id + '"' + ((f.task_priority || 'normal') === p.id ? ' selected' : '') + '>' + p.label + '</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('clipboard', 12) + ' Tarefa</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faTaskTitle" value="' + _esc(f.task_title || '') + '" placeholder="Ex: Confirmar presenca"></div>'
      +   '<div class="fa-field-row">'
      +     '<div class="fa-field"><label>Responsavel</label><select id="faTaskAssignee">' + aOpts + '</select></div>'
      +     '<div class="fa-field"><label>Prioridade</label><select id="faTaskPriority">' + pOpts + '</select></div>'
      +     '<div class="fa-field"><label>Prazo (h)</label><input type="number" id="faTaskDeadline" min="1" max="720" value="' + (f.task_deadline_hours || 24) + '"></div>'
      +   '</div>'
      + '</div>'
  }

  function _blockAlert(f) {
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('bell', 12) + ' Alerta Visual</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faAlertTitle" value="' + _esc(f.alert_title || '') + '" placeholder="Ex: Paciente chegou"></div>'
      +   '<div class="fa-field"><label>Tipo</label><select id="faAlertType">'
      +     '<option value="info"' + (f.alert_type === 'info' ? ' selected' : '') + '>Info</option>'
      +     '<option value="warning"' + (f.alert_type === 'warning' ? ' selected' : '') + '>Aviso</option>'
      +     '<option value="success"' + (f.alert_type === 'success' ? ' selected' : '') + '>Sucesso</option>'
      +     '<option value="error"' + (f.alert_type === 'error' ? ' selected' : '') + '>Erro</option>'
      +   '</select></div>'
      + '</div>'
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
    try {
      var m = _mod()
      if (m && m.toTrigger) {
        var trig = m.toTrigger(rule)
        if (trig && trig.trigger_type) {
          html += S().renderDispatchTimeline({ trigger_type: trig.trigger_type, trigger_config: trig.trigger_config })
        }
      }
    } catch (e) {}
    return html || '<div class="fa-col-preview-empty">Preview vazio</div>'
  }

  function _readForm() {
    function v(id) { var e = _overlay.querySelector('#' + id); return e ? e.value : '' }
    var m = _mod()
    if (m && m.readTriggerForm) {
      var triggerForm
      try { triggerForm = m.readTriggerForm() } catch (e) { triggerForm = {} }
      Object.keys(triggerForm || {}).forEach(function (k) { _form[k] = triggerForm[k] })
    }
    _form.name = v('faeName')
    _form.description = v('faeDesc')
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

    var urlEl = _overlay.querySelector('#faAttachUrl')
    if (urlEl) {
      var typed = (urlEl.value || '').trim()
      if (typed) _form.attachment_url = typed
    }
    var posEl = _overlay.querySelector('input[name=faAttachPos]:checked')
    if (posEl) _form.attachment_above_text = (posEl.value === 'above')

    var chs = Array.prototype.slice.call(_overlay.querySelectorAll('input[name=faChannel]:checked'))
      .map(function (el) { return el.value })
    _form.channel = S().combineChannels(chs)

    _form.tag_filter = S().readTagFilter(_overlay)
  }

  async function _handleSave() {
    _readForm()
    var m = _mod()
    if (!m) { S().showToast('Erro', 'Modulo "' + _moduleId + '" nao carregado', 'error'); return }
    if (!_form.name.trim()) { S().showToast('Validacao', 'Nome obrigatorio', 'warning'); return }
    if (!_form.channel) { S().showToast('Validacao', 'Marque ao menos 1 canal', 'warning'); return }
    var v = m.validate(_form)
    if (!v.ok) { S().showToast('Validacao', v.error, 'warning'); return }

    var bad = S().validatePlaceholdersInForm(_form)
    if (bad.length) {
      var validList = S().TEMPLATE_VARS.map(function (x) { return x.id }).slice(0, 8).join(', ')
      S().showToast('Placeholders invalidos', 'Nao existem: {{' + bad.join('}}, {{') + '}}. Use: ' + validList + '...', 'error')
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
      attachment_urls: Array.isArray(_form.attachment_urls) && _form.attachment_urls.length ? _form.attachment_urls : [],
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
      category: _moduleId,
      trigger_type: trig.trigger_type,
      trigger_config: triggerCfg,
    }
    if (_ruleId) data.id = _ruleId

    _saving = true; _render()
    var res = await REPO().upsert(data)
    _saving = false

    if (res.ok) {
      S().showToast('Salvo', (_form.name || 'Regra') + ' gravada', 'success')
      var saved = res.data || data
      var savedId = (saved && saved.id) || _ruleId
      await _resyncOutbox(savedId, _originalRule, data)
      // Invalida cache de regras local + outras abas (shell escuta BroadcastChannel)
      _rulesLoaded = false
      if (window.FAState && typeof window.FAState.invalidate === 'function') {
        try { window.FAState.invalidate() } catch (e) {}
      }
      if (window.FARulesCache && typeof window.FARulesCache.notifyChange === 'function') {
        try { window.FARulesCache.notifyChange() } catch (e) {}
      }
      var cb = _onSave
      close()
      if (typeof cb === 'function') { try { cb(saved) } catch (e) {} }
    } else {
      S().showToast('Erro', res.error || 'Falha ao salvar', 'error')
      _render()
    }
  }

  async function _resyncOutbox(ruleId, oldRule, newData) {
    if (!ruleId || !window._sbShared) return
    var cancelOnly = false
    if (oldRule) {
      var oldType = oldRule.trigger_type || ''
      var newType = newData.trigger_type || ''
      var oldCfg = JSON.stringify(oldRule.trigger_config || {})
      var newCfg = JSON.stringify(newData.trigger_config || {})
      if (oldType !== newType || oldCfg !== newCfg) cancelOnly = true
    }
    try {
      var r = await window._sbShared.rpc('wa_outbox_resync_rule', {
        p_rule_id: ruleId,
        p_cancel_only: cancelOnly,
      })
      if (r.error) { console.warn('[FAEditor] resync falhou:', r.error); return }
      var d = r.data || {}
      var cancelled = parseInt(d.cancelled, 10) || 0
      var reenq = parseInt(d.reenqueued, 10) || 0
      var skipped = parseInt(d.skipped_past, 10) || 0
      if (cancelled > 0 || reenq > 0) {
        var title = 'Mensagens atualizadas'
        var msg
        if (cancelOnly && cancelled > 0) {
          msg = cancelled + ' cancelada(s). Novos envios usarao config nova.'
        } else {
          msg = reenq + ' re-enfileirada(s), ' + cancelled + ' cancelada(s)'
          if (skipped > 0) msg += ', ' + skipped + ' no passado (ignorada)'
        }
        S().showToast(title, msg, 'info')
      }
    } catch (e) {
      console.warn('[FAEditor] resync exception:', e)
    }
  }

  async function _handleDelete() {
    if (!_ruleId) return
    if (!confirm('Excluir esta regra?')) return
    var res = await REPO().remove(_ruleId)
    if (res && res.ok) {
      S().showToast('Excluida', 'Regra removida', 'success')
      _rulesLoaded = false
      if (window.FAState && typeof window.FAState.invalidate === 'function') {
        try { window.FAState.invalidate() } catch (e) {}
      }
      if (window.FARulesCache && typeof window.FARulesCache.notifyChange === 'function') {
        try { window.FARulesCache.notifyChange() } catch (e) {}
      }
      var cb = _onSave
      close()
      if (typeof cb === 'function') { try { cb(null) } catch (e) {} }
    } else {
      S().showToast('Erro', (res && res.error) || 'Falha ao excluir', 'error')
    }
  }

  function _refreshPreview() {
    var preview = _overlay && _overlay.querySelector('.fa-modal-preview')
    if (preview) preview.innerHTML = _renderLivePreview(_form)
  }

  function _bindEvents() {
    if (!_overlay) return

    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) { close(); return }

      var act = e.target.closest('[data-fae-action]')
      if (act) {
        var a = act.dataset.faeAction
        if (a === 'close')  { close(); return }
        if (a === 'save')   { _handleSave(); return }
        if (a === 'delete') { _handleDelete(); return }
        if (a === 'ab-toggle') {
          _readForm()
          _form.ab_variant_template = _form.ab_variant_template && _form.ab_variant_template.trim()
            ? ''
            : (_form.content_template || 'Variacao alternativa...')
          _render(); return
        }
        if (a === 'ab-remove') { _readForm(); _form.ab_variant_template = ''; _render(); return }
        if (a === 'show-template-library') {
          _readForm()
          S().showTemplateLibrary(_moduleId || 'agendamento', function(tpl) {
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

      var shellAct = e.target.closest('[data-action]')
      if (shellAct) {
        var sa = shellAct.dataset.action
        if (sa === 'pick-image')     { var ai = _overlay.querySelector('#faAttachInput'); if (ai) ai.click(); return }
        if (sa === 'pick-image-multi') { var aim = _overlay.querySelector('#faAttachInputMulti'); if (aim) aim.click(); return }
        if (sa === 'remove-image')   { _readForm(); _form.attachment_url = ''; _form.attachment_urls = []; _render(); return }
        if (sa === 'remove-gallery-image') {
          _readForm()
          var idx = parseInt(shellAct.dataset.idx, 10)
          if (!Array.isArray(_form.attachment_urls)) _form.attachment_urls = []
          if (!isNaN(idx) && idx >= 0 && idx < _form.attachment_urls.length) {
            _form.attachment_urls.splice(idx, 1)
            // Sincroniza o legado attachment_url pro primeiro (retrocompat com wa_outbox sender velho)
            _form.attachment_url = _form.attachment_urls[0] || ''
            _render()
          }
          return
        }
        if (sa === 'speak-alexa')    { _readForm(); S().speakAlexa(S().renderTemplate(_form.alexa_message || 'Mensagem vazia', S().SAMPLE_VARS)); return }
        if (sa === 'simulate-alert') { _readForm(); S().showToast('Automacao', S().renderTemplate(_form.alert_title || 'Alerta', S().SAMPLE_VARS), _form.alert_type || 'info'); return }
        if (sa === 'emoji-toggle') {
          var pk = _overlay.querySelector('#faEmojiPicker')
          if (pk) pk.style.display = pk.style.display === 'none' ? 'flex' : 'none'
          return
        }
      }

      var emojiBtn = e.target.closest('[data-emoji]')
      if (emojiBtn) {
        var em = emojiBtn.dataset.emoji
        var target = _overlay.querySelector('#faContent') || _overlay.querySelector('#faAlexaMsg')
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

      var varBtn = e.target.closest('[data-var]')
      if (varBtn) {
        var ta = _overlay.querySelector('#faContent')
        if (ta) {
          var tag = '{{' + varBtn.dataset.var + '}}'
          var s = ta.selectionStart
          ta.value = ta.value.slice(0, s) + tag + ta.value.slice(ta.selectionEnd)
          ta.selectionStart = ta.selectionEnd = s + tag.length
          ta.focus(); _form.content_template = ta.value
          _refreshPreview()
        }
        return
      }
      var avBtn = e.target.closest('[data-alexa-var]')
      if (avBtn) {
        var ta2 = _overlay.querySelector('#faAlexaMsg')
        if (ta2) {
          var tag2 = '{{' + avBtn.dataset.alexaVar + '}}'
          var s2 = ta2.selectionStart
          ta2.value = ta2.value.slice(0, s2) + tag2 + ta2.value.slice(ta2.selectionEnd)
          ta2.selectionStart = ta2.selectionEnd = s2 + tag2.length
          ta2.focus(); _form.alexa_message = ta2.value
        }
        return
      }

      var fmt = e.target.closest('[data-fmt]')
      if (fmt) {
        var ta3 = _overlay.querySelector('#faContent')
        if (ta3) {
          var w = fmt.dataset.fmt
          var s3 = ta3.selectionStart, e3 = ta3.selectionEnd
          var sel3 = ta3.value.slice(s3, e3)
          if (sel3) {
            ta3.value = ta3.value.slice(0, s3) + w + sel3 + w + ta3.value.slice(e3)
            ta3.selectionStart = s3; ta3.selectionEnd = e3 + w.length * 2
          }
          ta3.focus(); _form.content_template = ta3.value
          _refreshPreview()
        }
        return
      }
    })

    _overlay.addEventListener('input', function (e) {
      if (e.target.id === 'faContent')  { _form.content_template = e.target.value; _refreshPreview() }
      if (e.target.id === 'faContentB') { _form.ab_variant_template = e.target.value }
      if (e.target.id === 'faAlexaMsg') { _form.alexa_message = e.target.value; _refreshPreview() }
      if (e.target.id === 'faeName')    { _form.name = e.target.value }
      if (e.target.id === 'faAttachUrl'){ _form.attachment_url = e.target.value.trim(); _refreshPreview() }
    })

    _overlay.addEventListener('change', function (e) {
      if (e.target.name === 'faChannel') {
        _readForm()
        var wrap = _overlay.querySelector('#faeChannelBlocks')
        if (wrap) wrap.innerHTML = _renderChannelBlocks(_form)
        if (typeof featherIn === 'function') featherIn(_overlay)
        _refreshPreview()
        return
      }
      if (e.target.name === 'faAttachPos') {
        _form.attachment_above_text = (e.target.value === 'above')
        _refreshPreview()
        return
      }
      if (e.target.id === 'faTagFilterMode') {
        var tagsInput = _overlay.querySelector('#faTagFilterTags')
        if (tagsInput) tagsInput.disabled = e.target.value === 'off'
        return
      }
      if (e.target.id === 'faStatus') {
        _readForm()
        var mod = _mod()
        if (mod && mod.applyStatusDefaults) {
          var defaults = mod.applyStatusDefaults(_form, e.target.value)
          Object.keys(defaults).forEach(function (k) { _form[k] = defaults[k] })
          if (mod.suggestName && (!_form.name || !_form.name.trim())) {
            var sug = mod.suggestName(_form)
            if (sug) _form.name = sug
          }
        }
        var tw = _overlay.querySelector('#faeTriggerFields')
        if (tw && mod) tw.innerHTML = _renderTriggerFields(mod, _form)
        var nameEl = _overlay.querySelector('#faeName')
        if (nameEl && _form.name) nameEl.value = _form.name
        if (typeof featherIn === 'function') featherIn(_overlay)
        return
      }
      if (e.target.id === 'faWhen') {
        _readForm()
        var tw2 = _overlay.querySelector('#faeTriggerFields')
        var m2 = _mod()
        if (tw2 && m2) tw2.innerHTML = _renderTriggerFields(m2, _form)
        if (typeof featherIn === 'function') featherIn(_overlay)
        return
      }
      if (e.target.id === 'faAttachInput') {
        var file = e.target.files && e.target.files[0]
        if (!file) return
        _readForm()
        S().showToast('Upload', 'Enviando imagem...', 'info')
        S().uploadAttachment(file).then(function (url) {
          _form.attachment_url = url
          if (!Array.isArray(_form.attachment_urls)) _form.attachment_urls = []
          if (_form.attachment_urls.indexOf(url) < 0) _form.attachment_urls.unshift(url)
          S().showToast('Upload', 'Imagem anexada', 'success')
          _render()
        }).catch(function (err) { S().showToast('Erro', err.message || 'Upload falhou', 'error') })
      }
      if (e.target.id === 'faAttachInputMulti') {
        var files = e.target.files && Array.from(e.target.files)
        if (!files || !files.length) return
        _readForm()
        S().showToast('Upload', 'Enviando ' + files.length + ' imagem(s)...', 'info')
        var upFn = S().uploadAttachmentMulti || (function(fs) {
          return Promise.all(fs.map(function(f) { return S().uploadAttachment(f) }))
        })
        upFn(files).then(function (urls) {
          if (!Array.isArray(_form.attachment_urls)) _form.attachment_urls = []
          urls.forEach(function(u) {
            if (u && _form.attachment_urls.indexOf(u) < 0) _form.attachment_urls.push(u)
          })
          _form.attachment_url = _form.attachment_urls[0] || ''
          S().showToast('Upload', urls.length + ' imagem(s) anexada(s)', 'success')
          _render()
        }).catch(function (err) { S().showToast('Erro', err.message || 'Upload falhou', 'error') })
      }
    })
  }

  function _bindEsc() {
    if (window._faeEscBound) return
    window._faeEscBound = true
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _overlay) close()
    })
  }

  async function open(ruleId, opts) {
    opts = opts || {}
    _onSave = typeof opts.onSave === 'function' ? opts.onSave : null

    // Se FAState foi invalidado (outra aba/modal mutou regras), forca refetch
    if (window.FAState && typeof window.FAState.get === 'function' && window.FAState.get() === null) {
      _rulesLoaded = false
    }

    if (!window.AAShared) { alert('Editor indisponivel: AAShared nao carregado'); return }
    if (!window.FAModules) { alert('Editor indisponivel: FAModules nao carregados'); return }
    if (!window.AgendaAutomationsRepository) { alert('Editor indisponivel: repositorio nao carregado'); return }

    if (ruleId) {
      await _ensureRules()
      var r = _rules.find(function (x) { return x.id === ruleId })
      if (!r) {
        try {
          var res = await REPO().list()
          _rules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
          r = _rules.find(function (x) { return x.id === ruleId })
        } catch (e) {}
      }
      if (!r) { S().showToast('Erro', 'Regra nao encontrada', 'error'); return }
      _ruleId = r.id
      _originalRule = r
      _moduleId = _pickModuleFor(r)
      _form = _formFromRule(r)
    } else {
      _ruleId = null
      _originalRule = null
      var prefill = opts.prefill || null
      if (prefill && prefill.category && (window.FAModules || {})[prefill.category]) {
        _moduleId = prefill.category
      } else if (prefill) {
        _moduleId = _pickModuleFor({ trigger_type: prefill.trigger_type, trigger_config: prefill.trigger_config || {} })
      } else {
        _moduleId = 'agendamento'
      }
      _form = _formFromPrefill(prefill)
    }

    if (_overlay) _overlay.remove()
    _overlay = document.createElement('div')
    _overlay.id = 'faEditorOverlay'
    _overlay.className = 'fa-modal-overlay'
    document.body.appendChild(_overlay)
    _render()
    _bindEvents()
    _bindEsc()
  }

  function close() {
    if (_overlay) { _overlay.remove(); _overlay = null }
    _saving = false
    _onSave = null
    _form = _emptyForm()
    _ruleId = null
    _originalRule = null
  }

  window.FAEditor = Object.freeze({ open: open, close: close })
})()
