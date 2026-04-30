/**
 * Modulo Agendamento — ciclo do agendamento (antes, durante, apos a consulta)
 * Especial: tem "dias antes da consulta", "no dia da consulta", "min antes"
 * Zero dependencia de outros modulos.
 *
 * Regras de combinacao:
 * - Statuses com consulta FUTURA (agendado, aguardando_confirmacao, confirmado,
 *   remarcado, encaixe) aceitam tempos relativos a consulta (days_before,
 *   same_day, min_before).
 * - Statuses TERMINAIS (cancelado, no_show, finalizado) ou em TEMPO REAL
 *   (na_clinica, em_consulta) so aceitam linha do tempo (immediate, hours, days).
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  var STATUSES = [
    { id: 'agendado',               label: 'Agendado',               kind: 'status' },
    { id: 'aguardando_confirmacao', label: 'Aguardando Confirmacao', kind: 'status' },
    { id: 'confirmado',             label: 'Confirmado',             kind: 'status' },
    { id: 'remarcado',              label: 'Remarcado',              kind: 'status' },
    { id: 'cancelado',              label: 'Cancelado',              kind: 'status' },
    { id: 'no_show',                label: 'Falta (No-show)',        kind: 'status' },
    { id: 'na_clinica',             label: 'Na Clinica',             kind: 'status' },
    { id: 'em_consulta',            label: 'Em Consulta',            kind: 'status' },
    { id: 'finalizado',             label: 'Finalizado',             kind: 'status' },
    { id: 'encaixe',                label: 'Encaixe',                kind: 'tag' },
    { id: 'inbound_match',          label: 'Resposta do Paciente (SIM/NAO)', kind: 'inbound' },
    { id: 'recurrence_created',     label: 'Serie Recorrente Criada', kind: 'special' },
  ]

  var MATCH_TYPES = [
    { id: 'confirm', label: 'SIM / Confirmou',  desc: 'Ao detectar "sim", "confirmo", "ok", etc.' },
    { id: 'cancel',  label: 'NAO / Cancelou',   desc: 'Ao detectar "nao", "cancelar", "desmarcar", etc.' },
  ]

  var TIME_OPTIONS = [
    { id: 'immediate',   label: 'Imediata (ao entrar nesse status)' },
    { id: 'hours',       label: 'Horas depois' },
    { id: 'days',        label: 'Dias depois' },
    { id: 'days_before', label: 'Dias ANTES da consulta' },
    { id: 'same_day',    label: 'No dia da consulta' },
    { id: 'min_before',  label: 'Minutos ANTES da consulta' },
  ]

  // Matrix de combinacoes validas status x when
  var ALLOWED_WHEN_BY_STATUS = {
    agendado:               ['immediate', 'hours', 'days', 'days_before', 'same_day', 'min_before'],
    aguardando_confirmacao: ['immediate', 'hours', 'days', 'days_before', 'same_day', 'min_before'],
    confirmado:             ['immediate', 'hours', 'days', 'days_before', 'same_day', 'min_before'],
    remarcado:              ['immediate', 'hours', 'days', 'days_before', 'same_day', 'min_before'],
    encaixe:                ['immediate', 'hours', 'days', 'days_before', 'same_day', 'min_before'],
    cancelado:              ['immediate', 'hours', 'days'],
    no_show:                ['immediate', 'hours', 'days'],
    na_clinica:             ['immediate', 'hours', 'days'],
    em_consulta:            ['immediate', 'hours'],
    finalizado:             ['immediate', 'hours', 'days'],
    inbound_match:          ['immediate'],
    recurrence_created:     ['immediate'],
  }

  // Defaults inteligentes por status (when + campos do tempo)
  var DEFAULT_WHEN = {
    agendado:               { when: 'immediate' },
    aguardando_confirmacao: { when: 'days_before', days: 1, hour: 12, minute: 0 },
    confirmado:             { when: 'immediate' },
    remarcado:              { when: 'immediate' },
    cancelado:              { when: 'immediate' },
    no_show:                { when: 'hours', hours: 2, minutes: 0 },
    na_clinica:             { when: 'immediate' },
    em_consulta:            { when: 'immediate' },
    finalizado:             { when: 'immediate' },
    encaixe:                { when: 'immediate' },
    inbound_match:          { when: 'immediate', match_type: 'confirm' },
    recurrence_created:     { when: 'immediate' },
  }

  // Nomes sugeridos para regras por combinacao
  var SUGGESTED_NAMES = {
    'agendado|immediate':               'Confirmacao de Agendamento',
    'aguardando_confirmacao|days_before': 'Lembrete D-1 — Confirmar Presenca',
    'aguardando_confirmacao|immediate': 'Aguardando Confirmacao',
    'confirmado|immediate':             'Resposta: Paciente Confirmou',
    'remarcado|immediate':              'Aviso de Remarcacao',
    'cancelado|immediate':              'Mensagem de Cancelamento',
    'no_show|hours':                    'Recuperacao No-show (2h depois)',
    'no_show|immediate':                'Sentimos sua Falta',
    'na_clinica|immediate':             'Boas-vindas na Clinica',
    'em_consulta|immediate':            'Alerta Em Consulta',
    'finalizado|immediate':             'Pos-atendimento + Consentimento',
    'encaixe|immediate':                'Confirmacao de Encaixe',
    // Tempo antes da consulta
    'agendado|days_before':             'Lembrete D-1 Agendamento',
    'agendado|same_day':                'Chegou o Dia da Consulta',
    'agendado|min_before':              'Lembrete Minutos Antes',
    'confirmado|days_before':           'Lembrete D-1 (Confirmado)',
    'confirmado|same_day':              'Bom Dia — Consulta Hoje',
    'confirmado|min_before':            'Lembrete Minutos Antes',
    'inbound_match|immediate':          'Resposta Automatica SIM/NAO',
    'recurrence_created|immediate':     'Confirmacao de Serie Recorrente',
  }

  function timeOptionsFor(statusId) {
    var allowed = ALLOWED_WHEN_BY_STATUS[statusId]
    if (!allowed) return TIME_OPTIONS
    return TIME_OPTIONS.filter(function(t) { return allowed.indexOf(t.id) >= 0 })
  }

  function isValidCombination(status, when) {
    var allowed = ALLOWED_WHEN_BY_STATUS[status]
    return !!(allowed && allowed.indexOf(when) >= 0)
  }

  // Quando muda status, retorna defaults do novo (preserva status e when se valido)
  function applyStatusDefaults(currentForm, newStatus) {
    var out = { status: newStatus }
    // inbound_match tem campos proprios — sempre aplica defaults
    if (newStatus === 'inbound_match') {
      var defIm = DEFAULT_WHEN.inbound_match
      out.when = defIm.when
      out.match_type = (currentForm && currentForm.match_type) || defIm.match_type
      return out
    }
    // Se o when atual ainda e valido, preserva
    if (currentForm && currentForm.when && isValidCombination(newStatus, currentForm.when)) {
      out.when = currentForm.when
      // preserva campos numericos tambem
      ;['hours','minutes','days','hour','minute','minutesBefore'].forEach(function(k){
        if (currentForm[k] !== undefined) out[k] = currentForm[k]
      })
    } else {
      // Usa default do status
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

  function matchesRule(rule) {
    if (!rule) return false
    var t = rule.trigger_type
    var cfg = rule.trigger_config || {}
    if (t === 'on_status') {
      return STATUSES.some(function(s){ return s.kind === 'status' && s.id === cfg.status })
    }
    if (t === 'on_tag' && cfg.tag === 'encaixe') return true
    if (t === 'd_before' || t === 'd_zero' || t === 'min_before' || t === 'daily_summary') return true
    if (t === 'on_inbound_match') return true
    if (t === 'on_recurrence_created') return true
    return false
  }

  function toTrigger(form) {
    if (form.status === 'recurrence_created') {
      return { trigger_type: 'on_recurrence_created', trigger_config: { scope: 'series' } }
    }
    if (form.status === 'inbound_match') {
      return { trigger_type: 'on_inbound_match', trigger_config: { match: form.match_type || 'confirm' } }
    }
    if (form.status === 'encaixe' && form.when === 'immediate') {
      return { trigger_type: 'on_tag', trigger_config: { tag: 'encaixe' } }
    }
    if (form.when === 'immediate') {
      return { trigger_type: 'on_status', trigger_config: { status: form.status } }
    }
    if (form.when === 'days_before') {
      return { trigger_type: 'd_before', trigger_config: {
        days: parseInt(form.days) || 1,
        hour: parseInt(form.hour) || 10,
        minute: parseInt(form.minute) || 0,
      } }
    }
    if (form.when === 'same_day') {
      return { trigger_type: 'd_zero', trigger_config: {
        hour: parseInt(form.hour) || 8,
        minute: parseInt(form.minute) || 0,
      } }
    }
    if (form.when === 'min_before') {
      return { trigger_type: 'min_before', trigger_config: {
        minutes: parseInt(form.minutesBefore) || 30,
      } }
    }
    // hours/days linha do tempo desde aplicacao — on_tag com status como tag
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
    var t = rule.trigger_type
    var cfg = rule.trigger_config || {}
    if (t === 'on_recurrence_created') return { status: 'recurrence_created', when: 'immediate' }
    if (t === 'on_inbound_match') return { status: 'inbound_match', when: 'immediate', match_type: cfg.match || 'confirm' }
    if (t === 'on_status') return { status: cfg.status, when: 'immediate' }
    if (t === 'on_tag' && cfg.tag === 'encaixe') return { status: 'encaixe', when: 'immediate' }
    if (t === 'd_before') return {
      status: 'agendado', when: 'days_before',
      days: cfg.days || 1, hour: cfg.hour || 10, minute: cfg.minute || 0,
    }
    if (t === 'd_zero') return {
      status: 'agendado', when: 'same_day',
      hour: cfg.hour || 8, minute: cfg.minute || 0,
    }
    if (t === 'min_before') return {
      status: 'agendado', when: 'min_before',
      minutesBefore: cfg.minutes || 30,
    }
    if (t === 'on_tag') {
      var form = { status: cfg.tag, when: 'immediate' }
      if (cfg.delay_days) { form.when = 'days'; form.days = cfg.delay_days; form.hour = cfg.delay_hours||0; form.minute = cfg.delay_minutes||0 }
      else if (cfg.delay_hours || cfg.delay_minutes) { form.when = 'hours'; form.hours = cfg.delay_hours||0; form.minutes = cfg.delay_minutes||0 }
      return form
    }
    return { status: '', when: 'immediate' }
  }

  function validate(form) {
    if (!form.status) return { ok: false, error: 'Escolha um status do agendamento' }
    if (form.status === 'recurrence_created') {
      return { ok: true }
    }
    if (form.status === 'inbound_match') {
      if (!form.match_type || !MATCH_TYPES.some(function(m) { return m.id === form.match_type })) {
        return { ok: false, error: 'Escolha o tipo de resposta (SIM ou NAO)' }
      }
      return { ok: true }
    }
    if (!form.when) return { ok: false, error: 'Escolha quando disparar' }
    if (!isValidCombination(form.status, form.when)) {
      var statusLabel = (STATUSES.find(function(s){return s.id===form.status})||{}).label || form.status
      var whenLabel = (TIME_OPTIONS.find(function(t){return t.id===form.when})||{}).label || form.when
      return { ok: false, error: 'Combinacao invalida: "' + statusLabel + '" nao aceita "' + whenLabel + '"' }
    }
    if (form.when === 'days_before' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias antes da consulta invalido' }
    if (form.when === 'min_before' && (!form.minutesBefore || form.minutesBefore < 1)) return { ok: false, error: 'Minutos antes invalido' }
    if (form.when === 'days' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias invalido' }
    if (form.when === 'hours' && (!form.hours || form.hours < 0)) return { ok: false, error: 'Horas invalido' }
    return { ok: true }
  }

  function renderTriggerFields(form) {
    var statusOpts = STATUSES.map(function(s) {
      return '<option value="'+s.id+'"'+(form.status===s.id?' selected':'')+'>'+s.label+'</option>'
    }).join('')

    // on_recurrence_created: UI especial — dispara na criacao de uma serie recorrente
    if (form.status === 'recurrence_created') {
      return '<div class="fa-field"><label>Status do agendamento</label>'
        + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
        + '<div class="fa-hint-small" style="margin-top:8px;padding:8px 10px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;color:#5B21B6">'
        +   'Essa regra dispara <b>1 vez</b> quando uma serie de sessoes e agendada em lote no modal de agendamento. '
        +   'Envia UMA msg WhatsApp com todas as datas da serie. '
        +   'Variaveis especiais disponiveis: <code>{{procedimento}}</code>, <code>{{lista_datas}}</code>, <code>{{total_sessoes}}</code>, <code>{{intervalo}}</code>.'
        + '</div>'
    }

    // on_inbound_match: UI especial — sem "quando disparar", apenas tipo de match
    if (form.status === 'inbound_match') {
      var matchOpts = MATCH_TYPES.map(function(m) {
        return '<option value="'+m.id+'"'+((form.match_type||'confirm')===m.id?' selected':'')+'>'+m.label+'</option>'
      }).join('')
      var activeMatch = MATCH_TYPES.find(function(m) { return m.id === (form.match_type || 'confirm') }) || MATCH_TYPES[0]
      return '<div class="fa-field"><label>Status do agendamento</label>'
        + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
        + '<div class="fa-field"><label>Tipo de resposta do paciente</label>'
        +   '<select id="faMatchType">'+matchOpts+'</select>'
        +   '<div class="fa-hint-small">' + (activeMatch.desc || '') + '</div>'
        + '</div>'
        + '<div class="fa-hint-small" style="margin-top:8px;padding:8px 10px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:6px;color:#0369A1">'
        +   'Essa regra responde automaticamente quando o paciente envia SIM/NAO em resposta ao lembrete D-1. '
        +   'Disparo via trigger SQL <code>wa_auto_confirm_appointment</code> — status do agendamento e atualizado em conjunto.'
        + '</div>'
    }

    // Filtra opcoes de tempo baseado no status escolhido
    var validTimes = form.status ? timeOptionsFor(form.status) : TIME_OPTIONS
    var timeOpts = validTimes.map(function(t) {
      return '<option value="'+t.id+'"'+(form.when===t.id?' selected':'')+'>'+t.label+'</option>'
    }).join('')

    var html = '<div class="fa-field"><label>Status do agendamento</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label>'
      + '<select id="faWhen"'+(form.status?'':' disabled')+'>'+timeOpts+'</select>'
      + (form.status ? '' : '<div class="fa-hint-small">Escolha o status primeiro</div>') + '</div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'days' || form.when === 'days_before') {
      var dayLabel = form.when === 'days_before' ? 'Dias antes' : 'Dias'
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>'+dayLabel+'</label><input type="number" id="faDays" min="1" max="30" value="'+(form.days||1)+'"></div>'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||10)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'same_day') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||8)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'min_before') {
      html += '<div class="fa-field"><label>Minutos antes da consulta</label>'
        + '<input type="number" id="faMinutesBefore" min="5" max="720" value="'+(form.minutesBefore||30)+'"></div>'
    }
    return html
  }

  function readTriggerForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var form = { status: v('faStatus'), when: v('faWhen') || 'immediate' }
    if (form.status === 'inbound_match') {
      form.when = 'immediate'
      form.match_type = v('faMatchType') || 'confirm'
      return form
    }
    if (form.when === 'hours') { form.hours = parseInt(v('faHours'))||0; form.minutes = parseInt(v('faMinutes'))||0 }
    else if (form.when === 'days' || form.when === 'days_before') { form.days = parseInt(v('faDays'))||1; form.hour = parseInt(v('faHour'))||0; form.minute = parseInt(v('faMinute'))||0 }
    else if (form.when === 'same_day') { form.hour = parseInt(v('faHour'))||8; form.minute = parseInt(v('faMinute'))||0 }
    else if (form.when === 'min_before') { form.minutesBefore = parseInt(v('faMinutesBefore'))||30 }
    return form
  }

  // Agrupamento visual da lista por fase do ciclo
  var GROUPS = [
    { id: 'antes',    label: 'Antes da consulta',            icon: 'clock',      minOrder: 0,  maxOrder: 49 },
    { id: 'durante',  label: 'Durante a consulta',           icon: 'activity',   minOrder: 50, maxOrder: 69 },
    { id: 'especial', label: 'Casos especiais',              icon: 'alertCircle', minOrder: 70, maxOrder: 999 },
  ]

  function groupRule(rule) {
    var so = (rule && rule.sort_order) || 0
    for (var i = 0; i < GROUPS.length; i++) {
      if (so >= GROUPS[i].minOrder && so <= GROUPS[i].maxOrder) return GROUPS[i].id
    }
    return 'antes' // default fallback
  }

  window.FAModules.agendamento = {
    id: 'agendamento',
    label: 'Agendamento',
    color: '#059669',
    icon: 'calendar',
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
    // Agrupamento opcional
    groups: GROUPS,
    groupRule: groupRule,
  }
})()
