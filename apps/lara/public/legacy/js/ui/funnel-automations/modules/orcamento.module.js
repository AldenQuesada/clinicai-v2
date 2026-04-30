/**
 * Modulo Orcamento — negociacao
 * Zero dependencia de outros modulos.
 *
 * Paridade com Agendamento (validacoes + defaults + sugestoes + grupos).
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  var STATUSES = [
    { id: 'orcamento-aberto',   label: 'Orcamento em Aberto' },
    { id: 'orcamento_enviado',  label: 'Orcamento Enviado' },
    { id: 'em_negociacao',      label: 'Em Negociacao' },
    { id: 'follow_up_pendente', label: 'Follow-up Pendente' },
    { id: 'aprovado_agendar',   label: 'Aprovado — Agendar' },
  ]

  var TIME_OPTIONS = [
    { id: 'immediate', label: 'Imediata (ao aplicar tag)' },
    { id: 'hours',     label: 'Horas depois' },
    { id: 'days',      label: 'Dias depois' },
  ]

  var ALLOWED_WHEN_BY_STATUS = {
    'orcamento-aberto':   ['immediate', 'hours', 'days'],
    orcamento_enviado:    ['immediate', 'hours', 'days'],
    em_negociacao:        ['immediate', 'hours', 'days'],
    follow_up_pendente:   ['immediate', 'hours', 'days'],
    aprovado_agendar:     ['immediate', 'hours', 'days'],
  }

  var DEFAULT_WHEN = {
    'orcamento-aberto':  { when: 'immediate' },
    orcamento_enviado:   { when: 'immediate' },
    em_negociacao:       { when: 'days', days: 3, hour: 10, minute: 0 },
    follow_up_pendente:  { when: 'days', days: 2, hour: 10, minute: 0 },
    aprovado_agendar:    { when: 'immediate' },
  }

  var SUGGESTED_NAMES = {
    'orcamento-aberto|immediate':   'Orcamento Enviado',
    'orcamento-aberto|days':        'Follow-up Orcamento Xd',
    'orcamento_enviado|immediate':  'Confirmacao Envio',
    'em_negociacao|immediate':      'Alerta Negociacao',
    'em_negociacao|days':           'Follow-up Negociacao Xd',
    'em_negociacao|hours':          'Urgencia Negociacao',
    'follow_up_pendente|days':      'Follow-up Pendente',
    'aprovado_agendar|immediate':   'Parabenizar Aprovacao',
  }

  var GROUPS = [
    { id: 'novo',        label: 'Novo orcamento',     icon: 'fileText',    minOrder: 0,  maxOrder: 49 },
    { id: 'negociacao',  label: 'Em negociacao',      icon: 'messageSquare', minOrder: 50, maxOrder: 89 },
    { id: 'fechamento',  label: 'Fechamento',         icon: 'checkCircle', minOrder: 90, maxOrder: 999 },
  ]

  function timeOptionsFor(statusId) {
    var allowed = ALLOWED_WHEN_BY_STATUS[statusId]
    return allowed ? TIME_OPTIONS.filter(function(t) { return allowed.indexOf(t.id) >= 0 }) : TIME_OPTIONS
  }
  function isValidCombination(status, when) {
    var allowed = ALLOWED_WHEN_BY_STATUS[status]
    return !!(allowed && allowed.indexOf(when) >= 0)
  }
  function applyStatusDefaults(currentForm, newStatus) {
    var out = { status: newStatus }
    if (currentForm && currentForm.when && isValidCombination(newStatus, currentForm.when)) {
      out.when = currentForm.when
      ;['hours','minutes','days','hour','minute'].forEach(function(k){
        if (currentForm[k] !== undefined) out[k] = currentForm[k]
      })
    } else {
      var def = DEFAULT_WHEN[newStatus] || { when: 'immediate' }
      Object.keys(def).forEach(function(k){ out[k] = def[k] })
    }
    return out
  }
  function suggestName(form) {
    if (!form || !form.status) return ''
    return SUGGESTED_NAMES[form.status + '|' + (form.when || 'immediate')] || ''
  }
  function groupRule(rule) {
    var so = (rule && rule.sort_order) || 0
    for (var i = 0; i < GROUPS.length; i++) {
      if (so >= GROUPS[i].minOrder && so <= GROUPS[i].maxOrder) return GROUPS[i].id
    }
    return 'novo'
  }

  function matchesRule(rule) {
    if (!rule || rule.trigger_type !== 'on_tag') return false
    var tag = (rule.trigger_config || {}).tag
    return STATUSES.some(function(s) { return s.id === tag })
  }

  function toTrigger(form) {
    var cfg = { tag: form.status }
    if (form.when === 'hours') {
      cfg.delay_hours = parseInt(form.hours) || 0
      cfg.delay_minutes = parseInt(form.minutes) || 0
    } else if (form.when === 'days') {
      cfg.delay_days = parseInt(form.days) || 1
      cfg.delay_hours = parseInt(form.hour) || 0
      cfg.delay_minutes = parseInt(form.minute) || 0
    }
    return { trigger_type: 'on_tag', trigger_config: cfg }
  }

  function fromRule(rule) {
    var cfg = rule.trigger_config || {}
    var form = { status: cfg.tag || '', when: 'immediate' }
    if (cfg.delay_days) { form.when = 'days'; form.days = cfg.delay_days; form.hour = cfg.delay_hours||0; form.minute = cfg.delay_minutes||0 }
    else if (cfg.delay_hours || cfg.delay_minutes) { form.when = 'hours'; form.hours = cfg.delay_hours||0; form.minutes = cfg.delay_minutes||0 }
    return form
  }

  function validate(form) {
    if (!form.status) return { ok: false, error: 'Escolha um status de orcamento' }
    if (!form.when) return { ok: false, error: 'Escolha quando disparar' }
    if (!isValidCombination(form.status, form.when)) return { ok: false, error: 'Combinacao invalida' }
    if (form.when === 'days' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias invalido' }
    return { ok: true }
  }

  function renderTriggerFields(form) {
    var statusOpts = STATUSES.map(function(s) {
      return '<option value="'+s.id+'"'+(form.status===s.id?' selected':'')+'>'+s.label+'</option>'
    }).join('')
    var validTimes = form.status ? timeOptionsFor(form.status) : TIME_OPTIONS
    var timeOpts = validTimes.map(function(t) {
      return '<option value="'+t.id+'"'+(form.when===t.id?' selected':'')+'>'+t.label+'</option>'
    }).join('')

    var html = '<div class="fa-field"><label>Status (orcamento)</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label>'
      + '<select id="faWhen"'+(form.status?'':' disabled')+'>'+timeOpts+'</select>'
      + (form.status ? '' : '<div class="fa-hint-small">Escolha o status primeiro</div>') + '</div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'days') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Dias</label><input type="number" id="faDays" min="1" max="90" value="'+(form.days||3)+'"></div>'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||10)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    }
    return html
  }

  function readTriggerForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var form = { status: v('faStatus'), when: v('faWhen') || 'immediate' }
    if (form.when === 'hours') { form.hours = parseInt(v('faHours'))||0; form.minutes = parseInt(v('faMinutes'))||0 }
    else if (form.when === 'days') { form.days = parseInt(v('faDays'))||1; form.hour = parseInt(v('faHour'))||0; form.minute = parseInt(v('faMinute'))||0 }
    return form
  }

  window.FAModules.orcamento = {
    id: 'orcamento', label: 'Orcamento', color: '#D97706', icon: 'dollarSign',
    statuses: STATUSES, timeOptions: TIME_OPTIONS,
    matchesRule: matchesRule, toTrigger: toTrigger, fromRule: fromRule,
    validate: validate, renderTriggerFields: renderTriggerFields, readTriggerForm: readTriggerForm,
    applyStatusDefaults: applyStatusDefaults, suggestName: suggestName, isValidCombination: isValidCombination,
    groups: GROUPS, groupRule: groupRule,
  }
})()
