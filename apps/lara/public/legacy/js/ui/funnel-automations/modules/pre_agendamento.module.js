/**
 * Modulo Pre-agendamento — Lara / Captacao
 * Zero dependencia de outros modulos. So depende de AAShared.
 *
 * Paridade com modulo agendamento:
 * - ALLOWED_WHEN_BY_STATUS
 * - DEFAULT_WHEN
 * - SUGGESTED_NAMES
 * - groups (chegada / temperatura)
 * - groupRule
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  var STATUSES = [
    { id: 'lead_novo',          label: 'Lead Novo' },
    { id: 'lead_novo_fullface', label: 'Lead Novo — Fullface' },
    { id: 'lead_novo_olheiras', label: 'Lead Novo — Olheiras' },
    { id: 'qualificado',        label: 'Qualificado' },
    { id: 'em_conversa',        label: 'Em Conversa' },
    { id: 'lead_quente',        label: 'Lead Quente' },
    { id: 'lead_morno',         label: 'Lead Morno' },
    { id: 'lead_frio',          label: 'Lead Frio' },
    { id: 'follow_up',          label: 'Follow-up' },
  ]

  var TIME_OPTIONS = [
    { id: 'immediate', label: 'Imediata (ao aplicar tag)' },
    { id: 'hours',     label: 'Horas depois' },
    { id: 'days',      label: 'Dias depois (linha do tempo)' },
  ]

  // Todos os statuses aceitam todas as opcoes de tempo
  var ALLOWED_WHEN_BY_STATUS = {
    lead_novo:          ['immediate', 'hours', 'days'],
    lead_novo_fullface: ['immediate', 'hours', 'days'],
    lead_novo_olheiras: ['immediate', 'hours', 'days'],
    qualificado:        ['immediate', 'hours', 'days'],
    em_conversa:        ['immediate', 'hours', 'days'],
    lead_quente:        ['immediate', 'hours', 'days'],
    lead_morno:         ['immediate', 'hours', 'days'],
    lead_frio:          ['immediate', 'hours', 'days'],
    follow_up:          ['immediate', 'hours', 'days'],
  }

  // Defaults inteligentes — quando faz mais sentido disparar cada status
  var DEFAULT_WHEN = {
    lead_novo:          { when: 'immediate' },
    lead_novo_fullface: { when: 'immediate' },
    lead_novo_olheiras: { when: 'immediate' },
    qualificado:        { when: 'immediate' },
    em_conversa:        { when: 'hours', hours: 2, minutes: 0 },
    lead_quente:        { when: 'immediate' },
    lead_morno:         { when: 'days', days: 3, hour: 10, minute: 0 },
    lead_frio:          { when: 'days', days: 7, hour: 10, minute: 0 },
    follow_up:          { when: 'days', days: 2, hour: 10, minute: 0 },
  }

  var SUGGESTED_NAMES = {
    'lead_novo|immediate':          'Boas-vindas Lead Novo',
    'lead_novo|hours':              'Follow-up Lead Novo (horas)',
    'lead_novo|days':               'Follow-up Lead Novo (dias)',
    'lead_novo_fullface|immediate': 'Fullface — Inicio',
    'lead_novo_fullface|days':      'Fullface — Sequencia',
    'lead_novo_olheiras|immediate': 'Olheiras — Inicio',
    'lead_novo_olheiras|days':      'Olheiras — Sequencia',
    'qualificado|immediate':        'Lead Qualificado',
    'em_conversa|hours':            'Acompanhamento Conversa',
    'em_conversa|immediate':        'Conversa Iniciada',
    'lead_quente|immediate':        'Lead Quente — Acao Imediata',
    'lead_quente|hours':            'Follow-up Lead Quente',
    'lead_morno|days':              'Follow-up Lead Morno',
    'lead_frio|days':               'Follow-up Lead Frio',
    'follow_up|days':               'Follow-up Pendente',
  }

  // Grupos visuais por fase do funil de captacao
  var GROUPS = [
    { id: 'chegada',     label: 'Lead recem-chegado',  icon: 'userPlus',  minOrder: 0,  maxOrder: 49 },
    { id: 'temperatura', label: 'Por temperatura',      icon: 'thermometer', minOrder: 50, maxOrder: 999 },
  ]

  function timeOptionsFor(statusId) {
    var allowed = ALLOWED_WHEN_BY_STATUS[statusId]
    if (!allowed) return TIME_OPTIONS
    return TIME_OPTIONS.filter(function(t) { return allowed.indexOf(t.id) >= 0 })
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
    var key = form.status + '|' + (form.when || 'immediate')
    return SUGGESTED_NAMES[key] || ''
  }

  function groupRule(rule) {
    var so = (rule && rule.sort_order) || 0
    for (var i = 0; i < GROUPS.length; i++) {
      if (so >= GROUPS[i].minOrder && so <= GROUPS[i].maxOrder) return GROUPS[i].id
    }
    return 'chegada'
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
    if (cfg.delay_days) {
      form.when = 'days'
      form.days = cfg.delay_days
      form.hour = cfg.delay_hours || 0
      form.minute = cfg.delay_minutes || 0
    } else if (cfg.delay_hours || cfg.delay_minutes) {
      form.when = 'hours'
      form.hours = cfg.delay_hours || 0
      form.minutes = cfg.delay_minutes || 0
    }
    return form
  }

  function validate(form) {
    if (!form.status) return { ok: false, error: 'Escolha um status' }
    if (!form.when) return { ok: false, error: 'Escolha quando disparar' }
    if (!isValidCombination(form.status, form.when)) {
      return { ok: false, error: 'Combinacao invalida' }
    }
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

    var html = '<div class="fa-field"><label>Status (tag)</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label>'
      + '<select id="faWhen"'+(form.status?'':' disabled')+'>'+timeOpts+'</select>'
      + (form.status ? '' : '<div class="fa-hint-small">Escolha o status primeiro</div>') + '</div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Minutos</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'days') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Dias</label><input type="number" id="faDays" min="1" max="365" value="'+(form.days||1)+'"></div>'
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

  window.FAModules.pre_agendamento = {
    id: 'pre_agendamento',
    label: 'Pre-agendamento',
    color: '#7C3AED',
    icon: 'users',
    statuses: STATUSES,
    timeOptions: TIME_OPTIONS,
    matchesRule: matchesRule,
    toTrigger: toTrigger,
    fromRule: fromRule,
    validate: validate,
    renderTriggerFields: renderTriggerFields,
    readTriggerForm: readTriggerForm,
    applyStatusDefaults: applyStatusDefaults,
    suggestName: suggestName,
    isValidCombination: isValidCombination,
    groups: GROUPS,
    groupRule: groupRule,
  }
})()
