/**
 * ClinicAI — Automations Engine
 *
 * Executa regras de wa_agenda_automations.
 * Substitui o hardcoded de scheduleAutomations(), _execAuto(), _enviarConsentimento().
 *
 * Entry points (chamados pelos hooks existentes):
 *   processAppointment(appt)            — ao criar/remarcar agendamento
 *   processStatusChange(appt, status)   — ao mudar status via apptTransition()
 *   processTag(entityId, tagId, vars)   — ao aplicar tag via TagEngine
 *   processFinalize(appt)               — ao finalizar consulta
 *
 * Despacha por canal:
 *   whatsapp → wa_outbox_schedule_automation (server-side, n8n envia)
 *   alert    → toast/popup no dashboard
 *   task     → clinic_op_tasks (localStorage)
 *
 * Depende de:
 *   AgendaAutomationsService — regras + renderTemplate
 *   window._sbShared         — Supabase client
 *   window._showToast        — toast UI
 */
;(function () {
  'use strict'

  if (window._clinicaiAutoEngineLoaded) return
  window._clinicaiAutoEngineLoaded = true

  var _svc = function () { return window.AgendaAutomationsService }
  var _initialized = false

  // ── Init: load rules on first use ──────────────────────────
  async function _ensureLoaded() {
    if (_initialized) return
    _initialized = true
    if (_svc() && _svc().loadAll) await _svc().loadAll()
  }

  // ── Build variables from appointment ───────────────────────
  function _apptVars(appt) {
    var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
    // Endereco e links da clinica a partir de clinic_settings
    var _cfg = {}; try { _cfg = JSON.parse(localStorage.getItem('clinicai_clinic_settings') || '{}') } catch(e) {}
    var _end = [_cfg.rua, _cfg.num].filter(Boolean).join(', ')
    if (_cfg.comp) _end += ' - ' + _cfg.comp
    if (_cfg.bairro) _end += ', ' + _cfg.bairro
    if (_cfg.cidade) _end += ' - ' + _cfg.cidade

    var proc = appt.procedimento || appt.tipoConsulta || ''
    var linhaProc = proc ? '\uD83D\uDC86 *Procedimento:* ' + proc : ''

    return {
      nome:          appt.pacienteNome || 'Paciente',
      data:          appt.data ? _fmtDate(appt.data) : '',
      data_consulta: appt.data ? _fmtDate(appt.data) : '',
      hora:          appt.horaInicio || '',
      hora_consulta: appt.horaInicio || '',
      profissional:  appt.profissionalNome || '',
      procedimento:  proc,
      linha_procedimento: linhaProc,
      clinica:       clinica,
      // link_anamnese: passado via appt.link_anamnese quando gerado pelo fluxo de criacao
      link_anamnese: appt.link_anamnese || '',
      endereco:      _end || '',
      endereco_clinica: _end || '',
      link_maps:     _cfg.maps || '',
      link:          _cfg.site || '',
      menu_clinica:  (window.location.origin || '') + '/menu-clinica.html',
      status:        appt.status || '',
      obs:           appt.obs || '',
      valor:         appt.valor ? 'R$ ' + parseFloat(appt.valor).toFixed(2).replace('.', ',') : '',
    }
  }

  function _fmtDate(isoDate) {
    if (!isoDate) return ''
    var p = isoDate.split('-')
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : isoDate
  }

  // Diferenca em dias de calendario entre hoje e a data da consulta (YYYY-MM-DD).
  // Ignora horario. Retorna 0 se hoje, 1 se amanha, negativo se passado.
  function _dayDiffToAppt(apptIsoDate) {
    if (!apptIsoDate) return 0
    var p = apptIsoDate.split('-')
    if (p.length !== 3) return 0
    var appt = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10))
    var today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((appt.getTime() - today.getTime()) / 86400000)
  }

  // ── Get phone from lead ────────────────────────────────────
  function _getPhone(appt) {
    try {
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      var l = leads.find(function (x) { return x.id === appt.pacienteId || (x.nome || x.name || '') === appt.pacienteNome })
      return (l && (l.whatsapp || l.phone || l.telefone)) || ''
    } catch (e) { return '' }
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 1: processAppointment
  //  Called when appointment is created or rescheduled.
  //  Handles: d_before, d_zero, min_before (time-based scheduling)
  // ══════════════════════════════════════════════════════════
  async function processAppointment(appt) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var dt = new Date(appt.data + 'T' + (appt.horaInicio || '09:00') + ':00')
    if (isNaN(dt.getTime())) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)

    // Cancel previous scheduled automations for this appointment
    if (window.AppointmentsService && appt.id) {
      window.AppointmentsService.cancelWAByAppt(appt.id)
    }

    // Process time-based rules
    var timeRules = svc.getActive().filter(function (r) {
      return ['d_before', 'd_zero', 'min_before'].indexOf(r.trigger_type) >= 0
    })

    timeRules.forEach(function (rule) {
      var scheduledAt = _calcScheduledAt(rule, dt)
      if (!scheduledAt) return

      // Guard min_lead_days (so d_before): pula se faltam menos de N dias
      // de calendario entre hoje e a data da consulta.
      if (rule.trigger_type === 'd_before') {
        var cfg = rule.trigger_config || {}
        var minLead = parseInt(cfg.min_lead_days, 10) || 0
        if (minLead > 0 && _dayDiffToAppt(appt.data) < minLead) return
      }

      // Guard tag_filter: so dispara se lead bate com filtro de tags
      if (!_matchesTagFilter(rule, _leadIdFromAppt(appt))) return

      // WhatsApp: enqueue in wa_outbox
      if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
        var ab = _renderWithAB(rule, vars)
        _enqueueWA(phone, ab.content, appt, scheduledAt, rule.name, rule.id, ab.variant, vars)
      }

      // Alert: schedule client-side (only fires if dashboard open)
      if (_channelIncludes(rule.channel, 'alert') && rule.alert_title) {
        _scheduleAlert(rule, vars, scheduledAt, appt.id)
      }

      // Task: create operational task
      if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
        _scheduleTask(rule, vars, scheduledAt, appt.id)
      }

      // Alexa: schedule announcement
      if (_channelIncludes(rule.channel, 'alexa') && rule.alexa_message) {
        _scheduleAlexa(rule, vars, scheduledAt, appt)
      }
    })

    // on_status e responsabilidade exclusiva de processStatusChange —
    // evita double-insert quando apptTransition dispara ambos os caminhos.
    // Caller deve invocar processStatusChange apos processAppointment em
    // fluxos de criacao nova (onde nao ha apptTransition intermediario).
  }

  // Filtra regra pelo tipo do paciente (novo/retorno). Retorna true se pode disparar.
  function _matchesPatientType(rule, appt) {
    var cfg = rule && rule.trigger_config || {}
    if (!cfg.patient_type) return true // regra generica — dispara sempre
    var apptType = (appt && appt.tipoPaciente) || 'novo' // default novo se nao especificado
    return cfg.patient_type === apptType
  }

  // Tag filter: trigger_config.tag_filter = { mode:'all'|'any'|'none', tags:[...] }
  // Avalia contra lead.tags local. Retorna true se pode disparar.
  function _matchesTagFilter(rule, leadId) {
    var cfg = rule && rule.trigger_config || {}
    var f = cfg.tag_filter
    if (!f || !f.mode || f.mode === 'off' || !Array.isArray(f.tags) || !f.tags.length) return true
    if (!leadId) return false
    var tags = []
    try {
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      var lead = leads.find(function(l) { return l.id === leadId })
      tags = (lead && Array.isArray(lead.tags)) ? lead.tags : []
    } catch (e) { tags = [] }
    var tagSet = Object.create(null)
    tags.forEach(function(t) { tagSet[String(t).toLowerCase().trim()] = true })
    var filterTags = f.tags.map(function(t) { return String(t).toLowerCase().trim() }).filter(Boolean)
    if (!filterTags.length) return true
    if (f.mode === 'all')  return filterTags.every(function(t) { return tagSet[t] })
    if (f.mode === 'any')  return filterTags.some (function(t) { return tagSet[t] })
    if (f.mode === 'none') return !filterTags.some(function(t) { return tagSet[t] })
    return true
  }

  function _leadIdFromAppt(appt) {
    return (appt && (appt.pacienteId || appt.leadId)) || ''
  }

  // ── VPI: resolve lookup "indicado por" do lead (cache por sessao) ──
  // Retorna {indicated, partner_nome, partner_first_name} ou {indicated:false}.
  // Usado pelos guards only_if_indicated / only_if_not_indicated.
  var _vpiLookupCache = {}  // key: leadId -> promise
  async function _vpiLookupIndicado(leadId) {
    var key = String(leadId || '')
    if (!key) return { indicated: false }
    if (_vpiLookupCache[key]) return _vpiLookupCache[key]
    _vpiLookupCache[key] = (async function () {
      try {
        if (!window.AppointmentsService) return { indicated: false }
        var res = await window.AppointmentsService.getPartnerNameByLead(key)
        if (!res.ok) return { indicated: false }
        return res.data || { indicated: false }
      } catch (e) { return { indicated: false } }
    })()
    return _vpiLookupCache[key]
  }

  // Avalia guards VPI indicado / not_indicated. Retorna true se a regra pode disparar.
  // Se dispara e e indicado, enriquece vars com indicado_por_nome.
  async function _matchesVpiGuards(rule, appt, vars) {
    var cfg = rule && rule.trigger_config || {}
    var needIndicated    = cfg.only_if_indicated    === true
    var needNotIndicated = cfg.only_if_not_indicated === true
    if (!needIndicated && !needNotIndicated) return true // sem guard — passa

    var leadId = (appt && (appt.pacienteId || appt.leadId)) || ''
    var info = await _vpiLookupIndicado(leadId)
    var isIndicated = !!(info && info.indicated)

    if (needIndicated && !isIndicated) return false
    if (needNotIndicated && isIndicated) return false

    // Passou: enriquece vars com dados do parceiro (seguro pra renderTemplate)
    if (isIndicated && info) {
      vars.indicado_por_nome        = info.partner_first_name || info.partner_nome || ''
      vars.indicado_por_nome_completo = info.partner_nome || ''
    }
    return true
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 2: processStatusChange
  //  Called from apptTransition() when status changes.
  //  Handles: on_status rules
  // ══════════════════════════════════════════════════════════
  async function processStatusChange(appt, newStatus) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var rules = svc.getByStatus(newStatus)
    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)
    vars.status = newStatus

    // Avalia regras sequencialmente (async por causa do lookup VPI).
    // O lookup e cacheado por leadId, entao multiplas regras pro mesmo
    // appt fazem no maximo 1 round-trip.
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      if (!_matchesPatientType(rule, appt)) continue
      if (!_matchesTagFilter(rule, _leadIdFromAppt(appt))) continue
      // Vars tem escopo por iteracao pra enriquecer so na regra que precisa
      var varsRule = Object.assign({}, vars)
      var okGuard = await _matchesVpiGuards(rule, appt, varsRule)
      if (!okGuard) continue
      _executeRule(rule, varsRule, phone, appt)
    }
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 3: processFinalize
  //  Called when appointment is finalized.
  //  Handles: on_finalize rules + d_after scheduling
  // ══════════════════════════════════════════════════════════
  async function processFinalize(appt) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)

    // on_finalize rules (immediate)
    var finalizeRules = svc.getByTrigger('on_finalize')
    var apptLeadId = _leadIdFromAppt(appt)
    finalizeRules.forEach(function (rule) {
      if (!_matchesTagFilter(rule, apptLeadId)) return
      _executeRule(rule, vars, phone, appt)
    })

    // d_after rules (scheduled for future)
    var afterRules = svc.getByTrigger('d_after')
    var now = new Date()
    afterRules.forEach(function (rule) {
      if (!_matchesTagFilter(rule, apptLeadId)) return
      var cfg = rule.trigger_config || {}
      var scheduledAt = new Date(now)
      scheduledAt.setDate(scheduledAt.getDate() + (cfg.days || 1))
      scheduledAt.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)

      if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
        var ab2 = _renderWithAB(rule, vars)
        _enqueueWA(phone, ab2.content, appt, scheduledAt, rule.name, rule.id, ab2.variant, vars)
      }
      if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
        _scheduleTask(rule, vars, scheduledAt, appt.id)
      }
    })
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 4: processTag
  //  Called from TagEngine.applyTag() when a tag is applied.
  //  Handles: on_tag rules
  // ══════════════════════════════════════════════════════════
  async function processTag(entityId, entityType, tagId, vars) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var rules = svc.getByTag(tagId)
    if (!rules.length) return

    vars = vars || {}
    if (!vars.nome) vars.nome = 'Paciente'
    if (!vars.clinica) vars.clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'

    // Get phone from lead
    var phone = ''
    try {
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      var lead = leads.find(function (l) { return l.id === entityId })
      if (lead) {
        phone = ((lead.whatsapp || lead.phone || lead.telefone) || '').replace(/\D/g, '')
        if (!vars.nome || vars.nome === 'Paciente') vars.nome = lead.nome || lead.name || 'Paciente'
      }
    } catch (e) { /* silencioso */ }

    var fakeAppt = { id: entityId, pacienteId: entityId, pacienteNome: vars.nome }

    async function _canDispatch(rule) {
      if (!window.AppointmentsService || !entityId || !rule.id) return true
      try {
        var res = await window.AppointmentsService.tryMarkAutomationSent({
          p_lead_id: String(entityId), p_rule_id: rule.id,
        })
        if (res.ok && res.data === false) return false
        return true
      } catch (e) { return true } // fallback: nao bloqueia por erro de rede
    }

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      if (!_matchesTagFilter(rule, entityId)) {
        console.info('[automations] skip tag_filter on_tag:', rule.name, 'lead', entityId)
        continue
      }
      var ok = await _canDispatch(rule)
      if (!ok) {
        console.info('[automations] skip duplicado on_tag:', rule.name, 'lead', entityId)
        continue
      }
      var cfg = rule.trigger_config || {}
      var delayDays = parseInt(cfg.delay_days) || 0
      var delayHours = parseInt(cfg.delay_hours) || 0
      var delayMinutes = parseInt(cfg.delay_minutes) || 0

      if (delayDays || delayHours || delayMinutes) {
        // on_tag com delay: agenda para o futuro
        if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
          var scheduledAt = new Date()
          scheduledAt.setDate(scheduledAt.getDate() + delayDays)
          scheduledAt.setHours(scheduledAt.getHours() + delayHours)
          scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes)
          var ab3 = _renderWithAB(rule, vars)
          _enqueueWA(phone, ab3.content, fakeAppt, scheduledAt, rule.name, rule.id, ab3.variant, vars)
        }
        if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
          var sched2 = new Date()
          sched2.setDate(sched2.getDate() + delayDays)
          sched2.setHours(sched2.getHours() + delayHours)
          sched2.setMinutes(sched2.getMinutes() + delayMinutes)
          _scheduleTask(rule, vars, sched2, entityId)
        }
        // alert/alexa com delay nao faz sentido — ignora
      } else {
        // Sem delay: executa imediatamente
        _executeRule(rule, vars, phone, fakeAppt)
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  DISPATCHERS (private)
  // ══════════════════════════════════════════════════════════

  function _executeRule(rule, vars, phone, appt) {
    var svc = _svc()

    // WhatsApp
    if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
      var ab4 = _renderWithAB(rule, vars)
      _enqueueWA(phone, ab4.content, appt, new Date(), rule.name, rule.id, ab4.variant, vars)
    }

    // Alert
    if (_channelIncludes(rule.channel, 'alert') && rule.alert_title) {
      var title = svc.renderTemplate(rule.alert_title, vars)
      _fireAlert(title, rule.alert_type)
    }

    // Task
    if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
      var taskTitle = svc.renderTemplate(rule.task_title, vars)
      _createTask(taskTitle, rule.task_assignee, rule.task_priority, rule.task_deadline_hours, appt)
    }

    // Alexa
    if (_channelIncludes(rule.channel, 'alexa') && rule.alexa_message) {
      var alexaMsg = svc.renderTemplate(rule.alexa_message, vars)
      _fireAlexa(alexaMsg, rule.alexa_target, appt, rule.name)
    }
  }

  // ── WhatsApp: enqueue in wa_outbox (server-side) ───────────
  function _enqueueWA(phone, content, appt, scheduledAt, ruleName, ruleId, abVariant, vars) {
    if (!window.AppointmentsService || !phone) return
    window.AppointmentsService.scheduleWAAutomation({
      p_phone:         phone,
      p_content:       content,
      p_lead_id:       appt.pacienteId || '',
      p_lead_name:     appt.pacienteNome || 'Paciente',
      p_scheduled_at:  scheduledAt.toISOString(),
      p_appt_ref:      appt.id || null,
      p_rule_id:       ruleId || null,
      p_ab_variant:    abVariant || null,
      p_vars_snapshot: vars || null,
    }).then(function (res) {
      if (!res.ok) console.error('[Engine] WA falha:', ruleName, res.error)
    }).catch(function (e) { console.error('[Engine] WA exception:', e) })
  }

  // Escolhe template (A ou B) e renderiza. Retorna {content, variant}.
  function _renderWithAB(rule, vars) {
    var svc = _svc()
    var hasAB = rule.ab_variant_template && rule.ab_variant_template.trim()
    if (!hasAB) return { content: svc.renderTemplate(rule.content_template, vars), variant: null }
    var useB = Math.random() < 0.5
    var tpl = useB ? rule.ab_variant_template : rule.content_template
    return { content: svc.renderTemplate(tpl, vars), variant: useB ? 'B' : 'A' }
  }

  // ── Alert: toast in dashboard ──────────────────────────────
  function _fireAlert(title, type) {
    if (window._showToast) {
      var icon = { info: 'info', warning: 'alert-triangle', success: 'check-circle', error: 'alert-circle' }[type] || 'info'
      _showToast('Automacao', title, type || 'info')
    }
  }

  // ── Alert: scheduled (client-side queue) ───────────────────
  function _scheduleAlert(rule, vars, scheduledAt, apptId) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      apptId,
      trigger:     rule.trigger_type,
      type:        'engine_alert',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     { title: _svc().renderTemplate(rule.alert_title, vars), alertType: rule.alert_type },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
  }

  // ── Task: create operational task ──────────────────────────
  function _createTask(title, assignee, priority, deadlineHours, appt) {
    var tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    tasks.push({
      id:          'task_auto_' + Date.now(),
      tipo:        'automacao',
      titulo:      title,
      descricao:   '',
      responsavel: assignee || 'sdr',
      status:      'pendente',
      prioridade:  priority || 'normal',
      prazo:       deadlineHours ? new Date(Date.now() + deadlineHours * 3600000).toISOString() : null,
      apptId:      appt ? appt.id : null,
      pacienteNome: appt ? appt.pacienteNome : '',
      createdAt:   new Date().toISOString(),
    })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)); if (window.sbSave) sbSave('clinic_op_tasks', tasks) } catch (e) { /* quota */ }
  }

  // ── Alexa: scheduled (client-side queue) ────────────────────
  function _scheduleAlexa(rule, vars, scheduledAt, appt) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      appt ? appt.id : null,
      trigger:     rule.trigger_type,
      type:        'engine_alexa',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     {
        message:    _svc().renderTemplate(rule.alexa_message, vars),
        target:     rule.alexa_target || 'sala',
        ruleName:   rule.name,
        appt:       appt ? { pacienteNome: appt.pacienteNome, profissionalNome: appt.profissionalNome, salaIdx: appt.salaIdx, profissionalIdx: appt.profissionalIdx } : null,
      },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
  }

  // ── Task: scheduled (future) ───────────────────────────────
  function _scheduleTask(rule, vars, scheduledAt, apptId) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      apptId,
      trigger:     rule.trigger_type,
      type:        'engine_task',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     { title: _svc().renderTemplate(rule.task_title, vars), assignee: rule.task_assignee, priority: rule.task_priority, deadlineHours: rule.task_deadline_hours },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
  }

  // ── Helpers ────────────────────────────────────────────────
  function _channelIncludes(channel, type) {
    if (!channel) return false
    if (channel === type) return true
    if (channel === 'both') return type === 'whatsapp' || type === 'alert'
    if (channel === 'all') return true
    if (channel === 'whatsapp_alert') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_task') return type === 'whatsapp' || type === 'task'
    if (channel === 'whatsapp_alexa') return type === 'whatsapp' || type === 'alexa'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    if (channel === 'alert_alexa') return type === 'alert' || type === 'alexa'
    return false
  }

  // ── Alexa: announce via webhook ─────────────────────────────
  async function _fireAlexa(message, target, appt, ruleName) {
    if (!window.AlexaNotificationService) {
      console.warn('[Engine] AlexaNotificationService nao disponivel para:', ruleName)
      return
    }

    var config = await AlexaNotificationService.getConfig()
    if (!config || !config.is_active || !config.webhook_url) {
      console.log('[Engine] Alexa desativada ou sem config')
      return
    }

    // Resolve target devices
    var devices = []
    if (window.AlexaDevicesRepository) {
      var res = await AlexaDevicesRepository.getAll()
      if (res.ok) devices = res.data || []
    }

    var targetDevices = []
    var targetType = target || 'sala'

    if (targetType === 'recepcao') {
      targetDevices = devices.filter(function(d) {
        var loc = (d.location_label || '').toLowerCase()
        return d.is_active && (loc.indexOf('recepc') >= 0 || loc.indexOf('recepç') >= 0)
      })
      // Fallback: usar reception_device_name da config global
      if (!targetDevices.length && config.reception_device_name) {
        targetDevices = [{ device_name: config.reception_device_name }]
      }
    } else if (targetType === 'sala') {
      // Buscar device vinculado a sala do appointment
      var rooms = typeof getRooms === 'function' ? getRooms() : []
      var room = null
      if (appt && appt.salaIdx !== undefined && appt.salaIdx !== null && rooms[appt.salaIdx]) {
        room = rooms[appt.salaIdx]
      }
      if (room) {
        targetDevices = devices.filter(function(d) { return d.is_active && d.room_id === room.id })
        // Fallback: usar alexa_device_name da sala
        if (!targetDevices.length && room.alexa_device_name) {
          targetDevices = [{ device_name: room.alexa_device_name }]
        }
      }
    } else if (targetType === 'profissional') {
      // Buscar device vinculado ao profissional
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      var prof = appt && appt.profissionalIdx !== undefined ? profs[appt.profissionalIdx] : null
      if (prof) {
        targetDevices = devices.filter(function(d) { return d.is_active && d.professional_id === prof.id })
      }
    } else if (targetType === 'todos') {
      targetDevices = devices.filter(function(d) { return d.is_active })
    } else {
      // UUID de device especifico
      var specific = devices.find(function(d) { return d.id === targetType })
      if (specific) targetDevices = [specific]
    }

    // Enviar sequencialmente com delay (rate limit) e retry
    var headers = { 'Content-Type': 'application/json' }
    if (config.auth_token) headers['Authorization'] = 'Bearer ' + config.auth_token

    var sent = 0, failed = 0, cookieExpired = false

    for (var di = 0; di < targetDevices.length; di++) {
      var device = targetDevices[di]
      var payload = {
        device:   device.device_name,
        message:  message,
        type:     'announce',
      }

      // Retry com backoff (3 tentativas)
      var ok = false
      for (var attempt = 1; attempt <= 3; attempt++) {
        try {
          var r = await fetch(config.webhook_url, {
            method: 'POST', headers: headers, body: JSON.stringify(payload),
          })
          if (r.ok) { ok = true; break }
          var body = null
          try { body = await r.json() } catch (e) { /* ignore */ }
          if (body && body.code === 'COOKIE_EXPIRED') { cookieExpired = true; break }
          if (r.status === 429 || r.status >= 500) {
            await new Promise(function(res) { setTimeout(res, attempt * 2000) })
            continue
          }
          break // 4xx — nao retenta
        } catch (e) {
          if (attempt < 3) { await new Promise(function(res) { setTimeout(res, attempt * 2000) }); continue }
        }
      }

      if (ok) { sent++; console.log('[Engine] Alexa OK:', device.device_name, ruleName) }
      else { failed++; console.error('[Engine] Alexa falhou:', device.device_name, ruleName) }

      // Rate limit: 2s entre devices
      if (di < targetDevices.length - 1) await new Promise(function(res) { setTimeout(res, 2000) })
    }

    // Toast honesto
    if (window._showToast) {
      if (cookieExpired) {
        _showToast('Alexa', 'Cookie expirado! Re-autenticar no bridge.', 'error')
      } else if (sent > 0 && failed === 0) {
        _showToast('Alexa', ruleName + ': ' + sent + ' device(s) OK', 'success')
      } else if (sent > 0 && failed > 0) {
        _showToast('Alexa', ruleName + ': ' + sent + ' OK, ' + failed + ' falhou', 'warning')
      } else if (failed > 0) {
        _showToast('Alexa', ruleName + ': falhou em ' + failed + ' device(s)', 'error')
      }
    }
  }

  function _calcScheduledAt(rule, appointmentDate) {
    var cfg = rule.trigger_config || {}
    var d

    switch (rule.trigger_type) {
      case 'd_before':
        d = new Date(appointmentDate)
        d.setDate(d.getDate() - (cfg.days || 1))
        d.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)
        return d

      case 'd_zero':
        d = new Date(appointmentDate)
        d.setHours(cfg.hour || 8, cfg.minute || 0, 0, 0)
        return d

      case 'min_before':
        d = new Date(appointmentDate)
        d.setMinutes(d.getMinutes() - (cfg.minutes || 30))
        return d

      default:
        return null
    }
  }

  // Camadas 2 e 3 removidas: leitura de wa_templates_for_phase foi descontinuada
  // em favor de regras em wa_agenda_automations (on_tag/on_status com delay).
  // Stubs mantidos como no-op para preservar compat de chamadas existentes.
  function dispatchCampaignForLead() { /* no-op */ }
  function dispatchCampaignForTag() { /* no-op */ }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 5: processRecurrenceCreated
  //  Called by agenda-modal.js after a recurrence series is saved.
  //  Handles: on_recurrence_created rules — envia UMA msg WA
  //  consolidada com todas as datas da serie.
  // ══════════════════════════════════════════════════════════
  function _recBuildDateList(dates, inicio) {
    var days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
    return dates.map(function(iso, i) {
      var d = new Date(iso + 'T12:00:00')
      var dn = days[d.getDay()]
      var dayStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
      return 'Sessao ' + (i + 1) + ': ' + dayStr + ' (' + dn + ')' + (inicio ? ' as ' + inicio : '')
    }).join('\n')
  }

  async function processRecurrenceCreated(info) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return
    if (!info || !info.appt) return

    var appt = info.appt
    var active = (svc.getByTrigger ? svc.getByTrigger('on_recurrence_created') : [])
      .filter(function(r) { return r && r.is_active })
    if (!active.length) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    if (!phone) return

    var vars = _apptVars(appt)
    vars.procedimento  = info.procedureName || appt.procedimento || ''
    vars.total_sessoes = String(info.totalSessions || (info.dates ? info.dates.length : 0))
    vars.intervalo     = String(info.intervalDays || '')
    vars.lista_datas   = _recBuildDateList(info.dates || [], info.inicio || '')

    // Delay defensivo de 5s: garante que a msg universal de Agendamento (enfileirada
    // via processStatusChange no saveAppt da base) chegue ao wa_outbox ANTES da
    // consolidada da serie. Mesmo que o caller ja tenha awaited, o outbox processor
    // pode preferir a mais antiga — este offset tranca a ordem.
    var whenConsolidada = new Date(Date.now() + 5000)
    active.forEach(function(rule) {
      if (!_channelIncludes(rule.channel, 'whatsapp') || !rule.content_template) return
      var rendered = svc.renderTemplate(rule.content_template, vars)
      _enqueueWA(phone, rendered, appt, whenConsolidada, rule.name, rule.id, null, vars)
    })
  }

  // ── Public API ─────────────────────────────────────────────
  window.AutomationsEngine = Object.freeze({
    processAppointment:        processAppointment,
    processStatusChange:       processStatusChange,
    processFinalize:           processFinalize,
    processTag:                processTag,
    processRecurrenceCreated:  processRecurrenceCreated,
    dispatchCampaignForLead:   dispatchCampaignForLead,
    dispatchCampaignForTag:    dispatchCampaignForTag,
  })
})()
