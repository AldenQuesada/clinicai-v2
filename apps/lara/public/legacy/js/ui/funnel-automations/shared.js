/**
 * ClinicAI — Funil Automations Shared (AAShared)
 *
 * Componentes compartilhados usados pelo shell e por todos os modulos.
 * Nao contem logica de negocio de nenhuma fase especifica.
 *
 * Namespace global: window.AAShared
 */
;(function () {
  'use strict'
  if (window.AAShared) return

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
  function _feather(n, s) { return window._clinicaiHelpers ? window._clinicaiHelpers.feather(n, s) : '' }

  // ── Sample vars para preview — ALINHADO com _apptVars() do engine ─
  // Fonte de verdade: js/agenda-automations.engine.js (_apptVars)
  var SAMPLE_VARS = {
    nome:               'Maria Silva',
    data:               '16/04/2026',
    data_consulta:      '16/04/2026',
    hora:               '14:30',
    hora_consulta:      '14:30',
    profissional:       'Dra. Mirian',
    procedimento:       'Bioestimulador',
    linha_procedimento: '\uD83D\uDC86 *Procedimento:* Bioestimulador',
    clinica:            'Clinica Mirian de Paula',
    link_anamnese:      'https://clinica.app/anamnese/abc',
    endereco:           'Av. Carneiro Leao, 296 - Sala 806, Parnamirim - Recife',
    endereco_clinica:   'Av. Carneiro Leao, 296 - Sala 806, Parnamirim - Recife',
    link_maps:          'https://maps.app.goo.gl/xyz',
    link:               'https://clinica.app',
    menu_clinica:       'https://clinica.app/menu-clinica.html',
    status:             'agendado',
    obs:                '',
    valor:              'R$ 2.500,00',
    queixas:            'bigode chines e flacidez',
  }

  var TEMPLATE_VARS = [
    { id: 'nome',               label: 'Nome do paciente',          example: 'Maria Silva' },
    { id: 'data',               label: 'Data da consulta',          example: '16/04/2026' },
    { id: 'hora',               label: 'Horario da consulta',       example: '14:30' },
    { id: 'profissional',       label: 'Profissional',              example: 'Dra. Mirian' },
    { id: 'procedimento',       label: 'Procedimento',              example: 'Bioestimulador' },
    { id: 'linha_procedimento', label: 'Linha procedimento (auto)', example: '💆 *Procedimento:* X' },
    { id: 'clinica',            label: 'Nome da clinica',           example: 'Clinica' },
    { id: 'link_anamnese',      label: 'Link da anamnese',          example: 'https://...' },
    { id: 'endereco',           label: 'Endereco completo',         example: 'Rua X, 123...' },
    { id: 'link_maps',          label: 'Google Maps',               example: 'https://maps...' },
    { id: 'menu_clinica',       label: 'Menu clinica',              example: 'https://...' },
    { id: 'valor',              label: 'Valor formatado',           example: 'R$ 2.500,00' },
    { id: 'status',             label: 'Status do agendamento',     example: 'agendado' },
    { id: 'obs',                label: 'Observacoes',               example: '' },
    { id: 'queixas',            label: 'Queixas do lead (quiz)',    example: 'bigode chines' },
    // Variaveis disponiveis SO em on_recurrence_created (serie recorrente)
    { id: 'lista_datas',        label: 'Lista datas da serie',      example: 'Sessao 1: 24/04...' },
    { id: 'total_sessoes',      label: 'Total sessoes da serie',    example: '8' },
    { id: 'intervalo',          label: 'Intervalo em dias',         example: '7' },
  ]

  // Validador de placeholders: extrai {{var}} e retorna invalidas.
  var VALID_VAR_IDS = TEMPLATE_VARS.map(function(v) { return v.id })
  function validatePlaceholders(text) {
    if (!text) return []
    var found = []
    var re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    var m
    while ((m = re.exec(text)) !== null) {
      var key = m[1]
      if (VALID_VAR_IDS.indexOf(key) < 0 && found.indexOf(key) < 0) found.push(key)
    }
    return found
  }
  function validatePlaceholdersInForm(form) {
    if (!form) return []
    var fields = [form.content_template, form.alexa_message, form.task_title, form.alert_title]
    var bad = []
    fields.forEach(function(f) {
      validatePlaceholders(f || '').forEach(function(k) { if (bad.indexOf(k) < 0) bad.push(k) })
    })
    return bad
  }

  function _renderTemplate(template, vars) {
    if (!template) return ''
    var result = template
    var keys = Object.keys(vars || {})
    for (var i = 0; i < keys.length; i++) {
      var re = new RegExp('\\{\\{' + keys[i] + '\\}\\}', 'g')
      result = result.replace(re, vars[keys[i]] || '')
    }
    return result.replace(/\{\{[^}]+\}\}/g, '')
  }

  function _waFormat(text) {
    if (!text) return ''
    var s = _esc(text)
    s = s.replace(/\n/g, '<br>')
    s = s.replace(/\*([^*]+)\*/g, '<b>$1</b>')
    s = s.replace(/_([^_]+)_/g, '<i>$1</i>')
    s = s.replace(/~([^~]+)~/g, '<s>$1</s>')
    return s
  }

  // ── Phone preview (WhatsApp — classes .bc-* do Templates) ───
  function renderPhonePreview(text, imageUrl, imageAbove) {
    var rendered = _renderTemplate(text, SAMPLE_VARS)
    var formatted = _waFormat(rendered).replace(/\{\{([^}]+)\}\}/g, '<span class="bc-wa-tag">{{$1}}</span>')
    var now = new Date()
    var hhmm = (now.getHours()<10?'0':'')+now.getHours()+':'+(now.getMinutes()<10?'0':'')+now.getMinutes()
    var tick = '<svg width="14" height="8" viewBox="0 0 16 8" fill="none" stroke="#53bdeb" stroke-width="1.5"><polyline points="1 4 4 7 9 2"/><polyline points="5 4 8 7 13 2"/></svg>'
    var imgBubble = imageUrl ? '<div class="bc-wa-bubble bc-wa-img-bubble"><img class="bc-wa-preview-img" src="'+_esc(imageUrl)+'" alt="media"></div>' : ''
    var textBubble = formatted ? '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">'+formatted+'</div><div class="bc-wa-bubble-time">'+hhmm+' '+tick+'</div></div>' : ''
    var above = imageAbove !== false
    var chat = above ? (imgBubble + textBubble) : (textBubble + imgBubble)
    if (!chat) chat = '<div class="bc-wa-empty">Escreva a mensagem ao lado</div>'
    return '<div class="bc-phone fa-preview-phone">'
      + '<div class="bc-phone-notch"><span class="bc-phone-notch-time">'+hhmm+'</span></div>'
      + '<div class="bc-wa-header"><div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div></div>'
      + '<div class="bc-wa-chat">'+chat+'</div>'
      + '<div class="bc-wa-bottom"><div class="bc-wa-input-mock">Mensagem</div><div class="bc-wa-send-mock"><svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg></div></div>'
      + '<div class="bc-phone-home"></div>'
      + '</div>'
  }

  function renderAlexaPreview(message, target) {
    var msg = _renderTemplate(message || '', SAMPLE_VARS)
    var t = target || 'sala'
    var tLabel = t === 'recepcao' ? 'Recepcao' : t === 'todos' ? 'Todos' : t === 'profissional' ? 'Profissional' : 'Sala'
    return '<div class="fa-alexa-preview">'
      + '<div class="fa-alexa-header">'+_feather('speaker',14)+' Alexa · '+_esc(tLabel)+'</div>'
      + '<div class="fa-alexa-device"><svg viewBox="0 0 100 100" width="100" height="100">'
      +   '<defs><radialGradient id="faDotGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#0EA5E9"/><stop offset="100%" stop-color="#0369A1"/></radialGradient></defs>'
      +   '<circle cx="50" cy="50" r="46" fill="#1E293B"/>'
      +   '<circle cx="50" cy="50" r="40" fill="none" stroke="url(#faDotGrad)" stroke-width="4" class="fa-alexa-ring"/>'
      +   '<circle cx="50" cy="50" r="6" fill="#0EA5E9"/>'
      + '</svg></div>'
      + '<div class="fa-alexa-msg">"'+_esc(msg || '(sem mensagem)')+'"</div>'
      + '<button type="button" class="fa-alexa-play-btn" data-action="speak-alexa">'+_feather('play',12)+' Reproduzir voz</button>'
      + '</div>'
  }

  function renderTaskPreview(title, assignee, priority, deadline) {
    var pri = priority || 'normal'
    var pColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[pri] || '#3B82F6'
    var pLabel = { urgente:'URGENTE', alta:'ALTA', normal:'NORMAL', baixa:'BAIXA' }[pri] || 'NORMAL'
    var aLabel = { sdr:'SDR / Comercial', secretaria:'Secretaria', cs:'CS / Pos-venda', clinica:'Equipe Clinica', gestao:'Gestao' }[assignee] || assignee || 'SDR'
    var d = deadline || 24
    var prazoLabel = d < 24 ? d+'h' : d===24?'1 dia' : d<168?Math.round(d/24)+' dias' : Math.round(d/168)+' sem'
    var tRendered = _renderTemplate(title || '', SAMPLE_VARS)
    return '<div class="fa-task-preview" style="border-left-color:'+pColor+'">'
      + '<div class="fa-task-header">'+_feather('clipboard',14)+'<span class="fa-task-pri" style="background:'+pColor+'20;color:'+pColor+'">'+pLabel+'</span></div>'
      + '<div class="fa-task-title">'+_esc(tRendered || '(sem titulo)')+'</div>'
      + '<div class="fa-task-meta"><span>'+_feather('user',11)+' '+_esc(aLabel)+'</span><span>'+_feather('clock',11)+' Prazo '+prazoLabel+'</span></div>'
      + '</div>'
  }

  function renderAlertPreview(title, type) {
    var map = {
      info:    { color:'#3B82F6', bg:'#EFF6FF', icon:'info',          label:'Info' },
      warning: { color:'#F59E0B', bg:'#FEF3C7', icon:'alertTriangle', label:'Aviso' },
      success: { color:'#10B981', bg:'#D1FAE5', icon:'checkCircle',   label:'Sucesso' },
      error:   { color:'#DC2626', bg:'#FEE2E2', icon:'alertCircle',   label:'Erro' },
    }
    var t = map[type] || map.info
    var tRendered = _renderTemplate(title || '', SAMPLE_VARS)
    return '<div class="fa-alert-preview" style="--ac:'+t.color+';background:'+t.bg+';border-left-color:'+t.color+'">'
      + '<div class="fa-alert-header">'+_feather(t.icon,14)+' Alerta '+t.label+'</div>'
      + '<div class="fa-alert-body">'+_esc(tRendered || '(sem titulo)')+'</div>'
      + '<button type="button" class="fa-alert-sim-btn" data-action="simulate-alert">'+_feather('zap',12)+' Simular</button>'
      + '</div>'
  }

  // ── Channel helpers ─────────────────────────────────────────
  var MULTI_CHANNELS = {
    whatsapp_alert: 1, whatsapp_task: 1, whatsapp_alexa: 1,
    alert_task: 1, alert_alexa: 1, all: 1, both: 1,
  }

  function channelIncludes(channel, type) {
    if (!channel) return false
    if (channel === type) return true
    if (channel === 'all') return true
    if (channel === 'both') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_alert') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_task') return type === 'whatsapp' || type === 'task'
    if (channel === 'whatsapp_alexa') return type === 'whatsapp' || type === 'alexa'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    if (channel === 'alert_alexa') return type === 'alert' || type === 'alexa'
    return false
  }

  function combineChannels(arr) {
    if (!arr || !arr.length) return ''
    if (arr.length === 1) return arr[0]
    if (arr.length >= 3) return 'all'
    var s = arr.slice().sort().join('_')
    var map = {
      'alert_whatsapp': 'whatsapp_alert',
      'alexa_whatsapp': 'whatsapp_alexa',
      'task_whatsapp':  'whatsapp_task',
      'alert_task':     'alert_task',
      'alert_alexa':    'alert_alexa',
      'alexa_task':     'all',
    }
    return map[s] || 'all'
  }

  function renderChannelChecks(currentChannel) {
    var channels = [
      { id:'whatsapp', label:'WhatsApp', icon:'messageCircle' },
      { id:'alexa',    label:'Alexa',    icon:'speaker' },
      { id:'task',     label:'Tarefa',   icon:'clipboard' },
      { id:'alert',    label:'Alerta',   icon:'bell' },
    ]
    return '<div class="fa-channel-checks">' + channels.map(function(ch) {
      var checked = channelIncludes(currentChannel, ch.id) ? ' checked' : ''
      return '<label class="fa-channel-check"><input type="checkbox" name="faChannel" value="'+ch.id+'"'+checked+'>'
        + _feather(ch.icon, 14) + ' <span>'+ch.label+'</span></label>'
    }).join('') + '</div>'
  }

  function renderChipsBar(dataAttr) {
    return '<div class="fa-chips-bar">' + TEMPLATE_VARS.map(function(v) {
      var tip = v.label + (v.example ? ' — ex.: "'+v.example+'"' : '')
      return '<button type="button" class="fa-chip" data-'+dataAttr+'="'+v.id+'" title="'+_esc(tip)+'">{{'+v.id+'}}</button>'
    }).join('') + '</div>'
  }

  // Emojis mais usados em clinica (saude, confirmacao, afeto, celebracao)
  var EMOJI_LIST = [
    '😊','😍','🥰','😉','🤗','👋','💜','❤️','🌸','✨','🌟','⭐',
    '✅','❌','⏰','📅','🕐','📍','📞','💆‍♀️','👩‍⚕️','🏥','💉','💊',
    '🎉','🎁','💐','🙏','👏','💫','🔥','💎','📸','🪞','🌺','🥳',
    '💪','👍','💡','⚡','📊','📝','📎','🎯','🔔','💌','📲','🫶',
  ]

  function renderFormatToolbar() {
    var html = '<div class="fa-fmt-bar">'
      + '<button type="button" class="fa-fmt-btn" data-fmt="*" title="Negrito"><b>B</b></button>'
      + '<button type="button" class="fa-fmt-btn" data-fmt="_" title="Italico"><i>I</i></button>'
      + '<button type="button" class="fa-fmt-btn" data-fmt="~" title="Tachado"><s>S</s></button>'
      + '<span class="fa-fmt-sep"></span>'
      + '<button type="button" class="fa-fmt-btn fa-emoji-toggle" data-action="emoji-toggle" title="Emojis">😊</button>'
      + '</div>'
    // Picker de emojis (escondido por default)
    html += '<div class="fa-emoji-picker" id="faEmojiPicker" style="display:none">'
    EMOJI_LIST.forEach(function(e) {
      html += '<button type="button" class="fa-emoji-btn" data-emoji="' + e + '">' + e + '</button>'
    })
    html += '</div>'
    return html
  }

  function renderAttachArea(url, above) {
    var pos = above === false ? 'below' : 'above'
    var html = '<div class="fa-attach">'
      +   '<div class="fa-attach-row">'
      +     '<button type="button" class="fa-btn-attach" data-action="pick-image">'+_feather('image',14)+' Enviar imagem</button>'
      +     '<input type="text" id="faAttachUrl" class="fa-attach-url" placeholder="https://... (URL da imagem)" value="'+_esc(url || '')+'">'
      +   '</div>'

    if (url) {
      html += '<div class="fa-attach-preview">'
        +   '<img src="'+_esc(url)+'" alt="anexo">'
        +   '<button type="button" class="fa-attach-remove" data-action="remove-image" title="Remover">'+_feather('x',14)+'</button>'
        + '</div>'
      html += '<div class="fa-attach-pos">'
        +   '<label><input type="radio" name="faAttachPos" value="above"' + (pos==='above'?' checked':'') + '> Acima do texto</label>'
        +   '<label style="margin-left:16px"><input type="radio" name="faAttachPos" value="below"' + (pos==='below'?' checked':'') + '> Abaixo do texto</label>'
        + '</div>'
    } else {
      html += '<div class="fa-attach-hint">JPG, PNG, WEBP ou GIF — max 10 MB. Ou cole URL direto.</div>'
    }

    html += '<input type="file" id="faAttachInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none"></div>'
    return html
  }

  // ── Galeria rotativa de imagens ──────────────────────────────
  // Permite >=1 imagem por regra. No envio, o engine pega uma aleatoriamente
  // (rotacao evita bombardeio repetitivo no WA).
  // attachment_urls: jsonb array em wa_agenda_automations (coluna nova).
  function renderAttachGallery(urls, above) {
    var arr = Array.isArray(urls) ? urls.filter(Boolean) : []
    var pos = above === false ? 'below' : 'above'
    var html = '<div class="fa-attach fa-attach-gallery">'
      +   '<div class="fa-attach-row">'
      +     '<button type="button" class="fa-btn-attach" data-action="pick-image-multi">'+_feather('image',14)+'  '
      +       (arr.length ? 'Adicionar mais' : 'Adicionar imagem(s)')+'</button>'
      +     '<span class="fa-attach-count">'+(arr.length
              ? arr.length + (arr.length > 1 ? ' imagens (rotacao aleatoria)' : ' imagem')
              : 'nenhuma')+'</span>'
      +   '</div>'

    if (arr.length) {
      html += '<div class="fa-attach-gallery-grid">'
      arr.forEach(function(u, i) {
        html += '<div class="fa-attach-thumb" data-url="'+_esc(u)+'">'
          +   '<img src="'+_esc(u)+'" alt="img '+(i+1)+'">'
          +   '<button type="button" class="fa-attach-thumb-x" data-action="remove-gallery-image" data-idx="'+i+'" title="Remover">'+_feather('x',12)+'</button>'
          + '</div>'
      })
      html += '</div>'
      html += '<div class="fa-attach-pos">'
        +   '<label><input type="radio" name="faAttachPos" value="above"' + (pos==='above'?' checked':'') + '> Acima do texto</label>'
        +   '<label style="margin-left:16px"><input type="radio" name="faAttachPos" value="below"' + (pos==='below'?' checked':'') + '> Abaixo do texto</label>'
        + '</div>'
    } else {
      html += '<div class="fa-attach-hint">JPG, PNG, WEBP ou GIF — max 10 MB cada. Suba varias pra rodar aleatorio a cada envio.</div>'
    }

    html += '<input type="file" id="faAttachInputMulti" multiple accept="image/jpeg,image/png,image/webp,image/gif" style="display:none"></div>'
    return html
  }

  // Upload de N arquivos em paralelo, retorna array de URLs publicas.
  async function uploadAttachmentMulti(files) {
    if (!files || !files.length) return []
    var list = Array.from(files)
    var results = await Promise.all(list.map(function(f) { return uploadAttachment(f) }))
    return results.filter(Boolean)
  }

  // ── Dispatch simulator ──────────────────────────────────────
  // Simula quando a regra vai disparar proximos N vezes.
  // Para d_before/d_zero/min_before: busca appointments futuros reais.
  // Para on_tag/on_status: descritivo (sem data especifica).
  // Para d_after: busca appointments finalizados recentes.
  function _loadAppts() {
    try {
      var k = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
      return JSON.parse(localStorage.getItem(k) || '[]')
    } catch (e) { return [] }
  }
  function _fmtDispatchDate(d) {
    if (!d || isNaN(d.getTime())) return ''
    var dd = String(d.getDate()).padStart(2, '0')
    var mm = String(d.getMonth() + 1).padStart(2, '0')
    var yy = d.getFullYear()
    var hh = String(d.getHours()).padStart(2, '0')
    var mi = String(d.getMinutes()).padStart(2, '0')
    var now = new Date()
    var diffMs = d - now
    var diffDays = Math.round(diffMs / 86400000)
    var rel = ''
    if (diffMs < 0) rel = '(ja passou)'
    else if (diffDays === 0) rel = '(hoje)'
    else if (diffDays === 1) rel = '(amanha)'
    else if (diffDays > 1 && diffDays < 30) rel = '(em ' + diffDays + 'd)'
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mi + ' ' + rel
  }
  function _calcForApptRule(rule, apptDate) {
    var cfg = rule.trigger_config || {}
    var d
    switch (rule.trigger_type) {
      case 'd_before':
        d = new Date(apptDate)
        d.setDate(d.getDate() - (cfg.days || 1))
        d.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)
        return d
      case 'd_zero':
        d = new Date(apptDate)
        d.setHours(cfg.hour || 8, cfg.minute || 0, 0, 0)
        return d
      case 'min_before':
        d = new Date(apptDate)
        d.setMinutes(d.getMinutes() - (cfg.minutes || 30))
        return d
      case 'd_after':
        d = new Date(apptDate)
        d.setDate(d.getDate() + (cfg.days || 1))
        d.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)
        return d
      default:
        return null
    }
  }
  function simulateDispatches(rule, limit) {
    limit = limit || 3
    if (!rule || !rule.trigger_type) return { type: 'unknown', items: [] }
    var tt = rule.trigger_type
    var cfg = rule.trigger_config || {}

    if (tt === 'on_tag') {
      return {
        type: 'reactive',
        headline: 'Dispara quando a tag <b>' + _esc(cfg.tag || '?') + '</b> for aplicada',
        delay: cfg.delay_days || cfg.delay_hours || cfg.delay_minutes
          ? _delayDescription(cfg) : 'imediatamente',
        items: [],
      }
    }
    if (tt === 'on_status') {
      return {
        type: 'reactive',
        headline: 'Dispara quando status mudar para <b>' + _esc(cfg.status || '?') + '</b>',
        delay: 'imediato',
        items: [],
      }
    }
    if (tt === 'on_finalize') {
      return { type: 'reactive', headline: 'Dispara ao <b>finalizar</b> a consulta', delay: 'imediato', items: [] }
    }
    if (tt === 'daily_summary') {
      return { type: 'recurring', headline: 'Dispara <b>todo dia</b> as ' + (cfg.hour || 9) + 'h' + String(cfg.minute || 0).padStart(2, '0'), items: [] }
    }

    // Time-based: precisa appointments
    var appts = _loadAppts()
    if (!appts.length) {
      return { type: 'empty', headline: 'Nenhum agendamento encontrado para simular', items: [] }
    }

    var now = new Date()
    var isAfter = tt === 'd_after'
    var candidates = appts
      .filter(function(a) {
        if (!a.data || a.status === 'cancelado' || a.status === 'no_show') return false
        var dt = new Date(a.data + 'T' + (a.horaInicio || '09:00') + ':00')
        if (isNaN(dt.getTime())) return false
        return isAfter ? dt < now : dt >= now
      })
      .sort(function(a, b) {
        var da = new Date(a.data + 'T' + (a.horaInicio || '09:00') + ':00')
        var db = new Date(b.data + 'T' + (b.horaInicio || '09:00') + ':00')
        return isAfter ? db - da : da - db
      })
      .slice(0, limit)

    var items = candidates.map(function(a) {
      var dt = new Date(a.data + 'T' + (a.horaInicio || '09:00') + ':00')
      var dispatchAt = _calcForApptRule(rule, dt)
      return {
        patient: a.pacienteNome || 'Paciente',
        appt_at: _fmtDispatchDate(dt),
        dispatch_at: _fmtDispatchDate(dispatchAt),
        overdue: dispatchAt < now,
      }
    })

    return {
      type: 'scheduled',
      headline: items.length ? 'Proximos ' + items.length + ' disparos:' : 'Nenhum agendamento futuro encontrado',
      items: items,
    }
  }
  function _delayDescription(cfg) {
    var parts = []
    if (cfg.delay_days) parts.push(cfg.delay_days + 'd')
    if (cfg.delay_hours) parts.push(cfg.delay_hours + 'h')
    if (cfg.delay_minutes) parts.push(cfg.delay_minutes + 'min')
    return parts.length ? 'apos ' + parts.join(' ') : 'imediatamente'
  }

  function renderDispatchTimeline(rule) {
    var sim = simulateDispatches(rule, 3)
    var body = ''
    if (sim.type === 'reactive' || sim.type === 'recurring' || sim.type === 'empty') {
      body = '<div class="fa-sim-headline">' + sim.headline + '</div>'
      if (sim.delay) body += '<div class="fa-sim-delay">' + _feather('clock', 11) + ' ' + _esc(sim.delay) + '</div>'
    } else if (sim.items.length) {
      body = '<div class="fa-sim-headline">' + sim.headline + '</div>'
        + '<ul class="fa-sim-list">'
        + sim.items.map(function(it) {
            var icon = it.overdue ? 'alertCircle' : 'clock'
            var cls = it.overdue ? ' fa-sim-overdue' : ''
            return '<li class="fa-sim-item' + cls + '">'
              + _feather(icon, 12)
              + '<div class="fa-sim-who">' + _esc(it.patient) + '</div>'
              + '<div class="fa-sim-when">' + _esc(it.dispatch_at) + '</div>'
              + '<div class="fa-sim-appt">consulta: ' + _esc(it.appt_at) + '</div>'
              + '</li>'
          }).join('')
        + '</ul>'
    } else {
      body = '<div class="fa-sim-headline">' + _esc(sim.headline) + '</div>'
    }
    return '<div class="fa-sim-card">'
      + '<div class="fa-sim-header">' + _feather('radio', 13) + ' Simulador de disparo</div>'
      + body + '</div>'
  }

  // ── Alexa TTS ───────────────────────────────────────────────
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.getVoices() } catch (e) {}
    window.speechSynthesis.onvoiceschanged = function () {}
  }

  function speakAlexa(text) {
    if (!('speechSynthesis' in window)) { showToast('Navegador', 'Sem suporte a voz', 'warning'); return }
    window.speechSynthesis.cancel()
    var u = new SpeechSynthesisUtterance(text || 'Mensagem vazia')
    u.lang = 'pt-BR'; u.rate = 0.95; u.pitch = 1.0
    var voices = window.speechSynthesis.getVoices() || []
    var pt = voices.find(function(v){ return v.lang && v.lang.indexOf('pt') === 0 && /female|mulher|feminin/i.test(v.name) })
      || voices.find(function(v){ return v.lang && v.lang.indexOf('pt') === 0 })
    if (pt) u.voice = pt
    u.onstart = function(){ var r = document.querySelector('.fa-alexa-ring'); if (r) r.classList.add('fa-alexa-speaking') }
    u.onend = u.onerror = function(){ var r = document.querySelector('.fa-alexa-ring'); if (r) r.classList.remove('fa-alexa-speaking') }
    window.speechSynthesis.speak(u)
  }

  // ── Upload imagem ───────────────────────────────────────────
  async function uploadAttachment(file) {
    if (!window._sbShared) throw new Error('Supabase nao disponivel')
    var MAX = 10 * 1024 * 1024
    if (file.size > MAX) throw new Error('Imagem > 10 MB')
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    var key = 'fa_' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + ext
    var up = await window._sbShared.storage.from('wa-automations').upload(key, file, {
      contentType: file.type || 'image/jpeg', cacheControl: '3600', upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    return window._sbShared.storage.from('wa-automations').getPublicUrl(key).data.publicUrl
  }

  // ── Toast ───────────────────────────────────────────────────
  function showToast(title, msg, type) {
    if (window._showToast) window._showToast(title, msg, type || 'info')
  }

  // ── Biblioteca de templates WhatsApp ────────────────────────
  // Templates curados por fase do funil. Tags ([nome], [data], etc.) sao
  // substituidas server-side em wa_outbox_fetch_pending. Tons: premium, Lara.
  var TEMPLATE_LIBRARY = [
    // ── Pre-agendamento ───────────────────────────────────────
    { id: 'prea_lembrete_lead', category: 'pre_agendamento', intent: 'lembrete', name: 'Lembrete lead novo (D+1)',
      description: 'Primeiro follow-up no dia seguinte a captacao se lead nao agendou.',
      content: 'Oi [nome], aqui e a Lara da Clinica Mirian de Paula \uD83D\uDC96\n\nVi que voce demonstrou interesse ontem mas ainda nao conseguimos agendar sua avaliacao.\n\nPosso separar um horario pra voce essa semana? E gratuito e dura uns 30 minutos.' },
    { id: 'prea_reativacao_frio', category: 'pre_agendamento', intent: 'reativacao', name: 'Reativacao de lead frio',
      description: 'Lead parado ha mais de 30 dias sem agendamento.',
      content: 'Oi [nome], faz um tempinho que nao conversamos.\n\nSe ainda tiver curiosidade em conhecer nossos procedimentos, aqui esta seu espaco. Posso te mostrar os resultados reais das pacientes que fizeram seu caso?' },
    { id: 'prea_quiz_resultado', category: 'pre_agendamento', intent: 'quiz', name: 'Pos-quiz com resultado',
      description: 'Enviado logo apos o paciente finalizar o quiz. Usa [queixa].',
      content: 'Oi [nome], recebi seu quiz \uD83D\uDCCB\n\nPelo que voce respondeu, o caminho mais indicado pro seu caso de *[queixa]* seria uma avaliacao presencial. La a gente fecha o protocolo ideal pra voce.\n\nQuer que eu veja horario pra essa semana?' },

    // ── Agendamento ───────────────────────────────────────────
    { id: 'agd_confirmacao', category: 'agendamento', intent: 'confirmacao', name: 'Confirmacao de agendamento',
      description: 'Disparo imediato apos criar agendamento.',
      content: 'Oi [nome], tudo certo! \u2705\n\nSua avaliacao foi marcada:\n*[data] as [hora]*\n[linha_procedimento]\nCom [profissional]\n\nEndereco: [endereco_clinica]\n\nAte la! Qualquer coisa, estou por aqui.' },
    { id: 'agd_d1_confirmar', category: 'agendamento', intent: 'lembrete', name: 'Lembrete D-1 (com SIM/NAO)',
      description: 'Dia anterior as 8h30. Pede confirmacao SIM ou NAO.',
      content: 'Bom dia [nome]! \u263C\n\nSo pra lembrar: amanha *[data] as [hora]* e sua avaliacao com [profissional].\n\nConsegue confirmar sua presenca? Responde *SIM* pra confirmar ou *NAO* se precisar remarcar.' },
    { id: 'agd_d0_manha', category: 'agendamento', intent: 'lembrete', name: 'Lembrete dia zero (manha)',
      description: 'No proprio dia da consulta, pela manha.',
      content: 'Oi [nome], hoje e o dia! \uD83D\uDCC5\n\n*[hora]* com [profissional]\n[endereco_clinica]\n\nDica: venha com 10 min de antecedencia pra conversarmos com calma. Te espero aqui!' },
    { id: 'agd_preparo', category: 'agendamento', intent: 'preparo', name: 'Preparo para o procedimento',
      description: 'Envia orientacoes de preparo D-2 ou D-3.',
      content: 'Oi [nome], tudo bem?\n\nAntes da sua consulta em [data], separei algumas orientacoes importantes de preparo:\n\n- Evitar bebida alcoolica 48h antes\n- Nao usar acido na regiao 3 dias antes\n- Vir com rosto limpo, sem maquiagem\n\nSe tiver duvida, me chama!' },
    { id: 'agd_1h_antes', category: 'agendamento', intent: 'lembrete', name: 'Lembrete 1h antes',
      description: 'Ultimo lembrete, 1 hora antes da consulta.',
      content: 'Oi [nome], ja estou te esperando! \uD83D\uDC8E\n\nSua avaliacao comeca em 1 hora - [hora] com [profissional].\n\nSe precisar de qualquer coisa, e so chamar.' },

    // ── Pos-consulta ──────────────────────────────────────────
    { id: 'pac_agradecimento', category: 'paciente', intent: 'pos_consulta', name: 'Agradecimento pos-consulta',
      description: 'Logo apos finalizar o procedimento.',
      content: 'Oi [nome], foi um prazer te receber hoje! \uD83D\uDC97\n\nQualquer duvida sobre os cuidados pos-procedimento, me chama aqui. Estou a disposicao.\n\nEm breve te mando as orientacoes detalhadas por aqui mesmo.' },
    { id: 'pac_pos_d1', category: 'paciente', intent: 'pos_consulta', name: 'Check pos-procedimento D+1',
      description: 'No dia seguinte ao procedimento.',
      content: 'Oi [nome], como voce esta hoje?\n\nQualquer vermelhidao, inchaco ou duvida, me avisa. Isso pode ser normal mas gosto de acompanhar de perto.\n\n[profissional] pediu pra te dar um oi \uD83D\uDC8B' },
    { id: 'pac_review', category: 'paciente', intent: 'pedido_review', name: 'Pedido de avaliacao Google',
      description: 'D+7 pos-procedimento, pede avaliacao.',
      content: 'Oi [nome], espero que esteja amando o resultado! \uD83C\uDF38\n\nSeu depoimento ajuda outras mulheres que tem duvida sobre o procedimento. Pode me fazer um favorzinho e deixar uma avaliacao no Google?\n\n(Me manda o print depois que eu te mando uma surpresa \uD83C\uDF81)' },

    // ── Orcamento ─────────────────────────────────────────────
    { id: 'orc_envio', category: 'orcamento', intent: 'envio', name: 'Envio de orcamento personalizado',
      description: 'Apos a consulta, com o protocolo fechado.',
      content: 'Oi [nome], aqui esta seu orcamento personalizado! \uD83D\uDCC4\n\n[linha_procedimento]\n\nTudo foi pensado com [profissional] pra alcancar o resultado que a gente conversou. O investimento pode ser dividido em ate 10x sem juros.\n\nO que voce achou?' },
    { id: 'orc_followup_d2', category: 'orcamento', intent: 'followup', name: 'Follow-up 48h sem resposta',
      description: 'Se passou 48h sem retorno do orcamento.',
      content: 'Oi [nome], consegui pensar mais no seu caso.\n\n[profissional] tambem ficou animada com o seu perfil - voce tem tudo pra ter um resultado lindo. Se tiver alguma duvida do orcamento, me fala pra gente conversar.' },
    { id: 'orc_objecao_preco', category: 'orcamento', intent: 'objecao', name: 'Objecao de preco',
      description: 'Quando paciente diz que esta caro.',
      content: 'Entendo, [nome]. E um investimento importante mesmo.\n\nO que eu sempre falo: o valor se paga na primeira vez que voce sai de casa e nao pensa mais em maquiagem pesada pra disfarcar. E o efeito dura 12 a 18 meses.\n\nSe ajudar, posso ver se conseguimos dividir em mais vezes ou encaixar em condicao especial. O que voce acha mais justo pra voce?' },

    // ── Paciente orcamento ────────────────────────────────────
    { id: 'po_retomar', category: 'paciente_orcamento', intent: 'reativacao', name: 'Retomar orcamento parado',
      description: 'Paciente que ja veio mas nao fechou o orcamento ha semanas.',
      content: 'Oi [nome], faz um tempo que nao conversamos sobre seu protocolo.\n\nTenho espacos bons esse mes e lembrei de voce. Se quiser, posso reservar uma data pra comecarmos ja? O orcamento anterior continua valido.' },

    // ── Perdido ───────────────────────────────────────────────
    { id: 'per_reativacao', category: 'perdido', intent: 'reativacao', name: 'Reativacao de paciente perdido',
      description: 'Paciente sumido ha 3+ meses.',
      content: 'Oi [nome], quanto tempo! \uD83D\uDC95\n\nEstava revisando minha agenda e lembrei de voce. Como voce esta? Se ainda pensa em cuidar do [queixa], posso te contar uma novidade.\n\nQuer conversar?' },
    { id: 'per_promocao', category: 'perdido', intent: 'promocao', name: 'Oferta especial perdido',
      description: 'Promocao sazonal (aniversario da clinica, black).',
      content: 'Oi [nome], temos uma condicao especial esse mes que lembrei de voce.\n\nPrimeira sessao com 20% off e brinde exclusivo. E por tempo limitado - valido so ate [data].\n\nQuer que eu reserve um horario?' },
  ]

  var CATEGORY_LABELS = {
    pre_agendamento: 'Pre-agendamento',
    agendamento: 'Agendamento',
    paciente: 'Paciente',
    orcamento: 'Orcamento',
    paciente_orcamento: 'Paciente + Orcamento',
    perdido: 'Perdido',
  }
  var INTENT_LABELS = {
    lembrete: 'Lembrete',
    confirmacao: 'Confirmacao',
    reativacao: 'Reativacao',
    preparo: 'Preparo',
    pos_consulta: 'Pos-consulta',
    pedido_review: 'Pedido Review',
    objecao: 'Objecao',
    promocao: 'Promocao',
    envio: 'Envio',
    followup: 'Follow-up',
    quiz: 'Quiz',
  }

  // ── Tag filter (segmentacao AND/OR) ─────────────────────────
  function renderTagFilter(cfg) {
    cfg = cfg || {}
    var mode = cfg.mode || 'off'
    var tags = Array.isArray(cfg.tags) ? cfg.tags.join(', ') : ''
    var modes = [
      { v: 'off',  label: 'Sem filtro (dispara para todos)' },
      { v: 'all',  label: 'Lead deve ter TODAS as tags (AND)' },
      { v: 'any',  label: 'Lead deve ter QUALQUER uma (OR)' },
      { v: 'none', label: 'Lead NAO pode ter NENHUMA (NOT)' },
    ]
    var opts = modes.map(function(m) {
      return '<option value="' + m.v + '"' + (mode === m.v ? ' selected' : '') + '>' + m.label + '</option>'
    }).join('')
    var disabled = mode === 'off' ? ' disabled' : ''
    return '<div class="fa-tag-filter" id="faTagFilter">'
      + '<div class="fa-field"><label>Modo</label>'
      +   '<select id="faTagFilterMode">' + opts + '</select>'
      + '</div>'
      + '<div class="fa-field"><label>Tags</label>'
      +   '<input type="text" id="faTagFilterTags" placeholder="agendou, interessada, vip" value="' + _esc(tags) + '"' + disabled + '>'
      + '</div>'
      + '<div class="fa-tag-filter-hint">' + _feather('info', 11)
      +   ' Separe por virgula. Comparacao case-insensitive contra tags do lead. '
      +   'Ex: <code>vip, fidelidade</code> em modo OR dispara se lead tiver VIP <b>ou</b> Fidelidade.</div>'
      + '</div>'
  }

  function readTagFilter(rootEl) {
    var scope = rootEl || document
    var modeEl = scope.querySelector('#faTagFilterMode')
    var tagsEl = scope.querySelector('#faTagFilterTags')
    if (!modeEl) return null
    var mode = modeEl.value || 'off'
    if (mode === 'off') return null
    var raw = (tagsEl && tagsEl.value) || ''
    var tags = raw.split(',').map(function(s) { return s.trim() }).filter(Boolean)
    if (!tags.length) return null
    return { mode: mode, tags: tags }
  }

  function renderTemplateLibraryButton() {
    return '<button type="button" class="fa-tpl-btn" data-action="show-template-library" data-fae-action="show-template-library" title="Biblioteca de templates">'
      + _feather('bookOpen', 12) + ' Biblioteca</button>'
  }

  function showTemplateLibrary(defaultCategory, onSelect) {
    var existing = document.getElementById('faTemplateLibraryModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'faTemplateLibraryModal'
    overlay.className = 'fa-modal-overlay'
    var categories = Object.keys(CATEGORY_LABELS)
    var activeCategory = defaultCategory && categories.indexOf(defaultCategory) >= 0 ? defaultCategory : 'agendamento'
    var activeIntent = ''
    var searchQ = ''

    function filtered() {
      return TEMPLATE_LIBRARY.filter(function(t) {
        if (activeCategory !== 'all' && t.category !== activeCategory) return false
        if (activeIntent && t.intent !== activeIntent) return false
        if (searchQ) {
          var q = searchQ.toLowerCase()
          if (t.name.toLowerCase().indexOf(q) < 0
              && (t.description || '').toLowerCase().indexOf(q) < 0
              && (t.content || '').toLowerCase().indexOf(q) < 0) return false
        }
        return true
      })
    }

    function availableIntents() {
      var intents = {}
      TEMPLATE_LIBRARY.forEach(function(t) {
        if (activeCategory === 'all' || t.category === activeCategory) intents[t.intent] = true
      })
      return Object.keys(intents)
    }

    function render() {
      var tabs = [{ id: 'all', label: 'Todos' }].concat(categories.map(function(c) {
        return { id: c, label: CATEGORY_LABELS[c] }
      })).map(function(t) {
        var cls = t.id === activeCategory ? ' fa-tpl-tab-active' : ''
        return '<button type="button" class="fa-tpl-tab' + cls + '" data-tpl-cat="' + t.id + '">'
          + _esc(t.label) + '</button>'
      }).join('')

      var intents = availableIntents()
      var intentPills = intents.length
        ? '<div class="fa-tpl-intents">'
          + '<button type="button" class="fa-tpl-pill' + (!activeIntent ? ' fa-tpl-pill-active' : '') + '" data-tpl-intent="">Todas intencoes</button>'
          + intents.map(function(i) {
            var cls = activeIntent === i ? ' fa-tpl-pill-active' : ''
            return '<button type="button" class="fa-tpl-pill' + cls + '" data-tpl-intent="' + i + '">'
              + _esc(INTENT_LABELS[i] || i) + '</button>'
          }).join('')
          + '</div>'
        : ''

      var list = filtered()
      var listHtml = list.length
        ? list.map(function(t) {
            var preview = (t.content || '').substring(0, 160).replace(/\n/g, ' ')
            return '<div class="fa-tpl-card" data-tpl-select="' + t.id + '">'
              +   '<div class="fa-tpl-card-head">'
              +     '<div class="fa-tpl-card-name">' + _esc(t.name) + '</div>'
              +     '<div class="fa-tpl-card-intent">' + _esc(INTENT_LABELS[t.intent] || t.intent) + '</div>'
              +   '</div>'
              +   (t.description ? '<div class="fa-tpl-card-desc">' + _esc(t.description) + '</div>' : '')
              +   '<div class="fa-tpl-card-preview">' + _esc(preview) + (t.content.length > 160 ? '...' : '') + '</div>'
              +   '<div class="fa-tpl-card-action">' + _feather('plus', 12) + ' Usar este template</div>'
              + '</div>'
          }).join('')
        : '<div class="fa-tpl-empty">' + _feather('inbox', 16) + ' Nenhum template corresponde aos filtros.</div>'

      overlay.innerHTML = '<div class="fa-modal fa-modal-tpl" role="dialog">'
        + '<div class="fa-modal-header">'
        +   '<div class="fa-modal-title">' + _feather('bookOpen', 16) + ' Biblioteca de templates</div>'
        +   '<button type="button" class="fa-btn-icon" data-tpl-close>' + _feather('x', 16) + '</button>'
        + '</div>'
        + '<div class="fa-tpl-filters">'
        +   '<div class="fa-tpl-tabs">' + tabs + '</div>'
        +   '<input type="search" class="fa-tpl-search" placeholder="Buscar por texto ou nome..." value="' + _esc(searchQ) + '">'
        + '</div>'
        + intentPills
        + '<div class="fa-modal-body fa-tpl-body">'
        +   '<div class="fa-tpl-list">' + listHtml + '</div>'
        + '</div>'
        + '<div class="fa-tpl-footer">' + _feather('info', 11)
        +   ' ' + TEMPLATE_LIBRARY.length + ' templates · tags [nome], [data], [hora], [profissional], [queixa] sao substituidas ao enviar.</div>'
        + '</div>'
    }

    render()
    document.body.appendChild(overlay)

    function close() { overlay.remove() }
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return close()
      if (e.target.closest('[data-tpl-close]')) return close()
      var tab = e.target.closest('[data-tpl-cat]')
      if (tab) { activeCategory = tab.dataset.tplCat; activeIntent = ''; render(); return }
      var pill = e.target.closest('[data-tpl-intent]')
      if (pill) { activeIntent = pill.dataset.tplIntent; render(); return }
      var card = e.target.closest('[data-tpl-select]')
      if (card) {
        var id = card.dataset.tplSelect
        var tpl = TEMPLATE_LIBRARY.find(function(t) { return t.id === id })
        if (tpl && typeof onSelect === 'function') onSelect(tpl)
        close()
        return
      }
    })
    overlay.addEventListener('input', function(e) {
      var search = e.target.closest('.fa-tpl-search')
      if (search) { searchQ = search.value || ''; render(); search.focus(); }
    })
    if (!window._faTplEscBound) {
      window._faTplEscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return
        var m = document.getElementById('faTemplateLibraryModal')
        if (m) m.remove()
      })
    }
  }

  // ── Public API ──────────────────────────────────────────────
  window.AAShared = Object.freeze({
    TEMPLATE_VARS: TEMPLATE_VARS,
    SAMPLE_VARS: SAMPLE_VARS,
    VALID_VAR_IDS: VALID_VAR_IDS,
    TEMPLATE_LIBRARY: TEMPLATE_LIBRARY,
    TEMPLATE_CATEGORY_LABELS: CATEGORY_LABELS,
    TEMPLATE_INTENT_LABELS: INTENT_LABELS,
    validatePlaceholders: validatePlaceholders,
    validatePlaceholdersInForm: validatePlaceholdersInForm,
    simulateDispatches: simulateDispatches,
    renderDispatchTimeline: renderDispatchTimeline,
    renderPhonePreview: renderPhonePreview,
    renderAlexaPreview: renderAlexaPreview,
    renderTaskPreview:  renderTaskPreview,
    renderAlertPreview: renderAlertPreview,
    renderChannelChecks: renderChannelChecks,
    renderChipsBar:     renderChipsBar,
    renderFormatToolbar: renderFormatToolbar,
    renderAttachArea:   renderAttachArea,
    renderAttachGallery: renderAttachGallery,
    uploadAttachmentMulti: uploadAttachmentMulti,
    renderTemplateLibraryButton: renderTemplateLibraryButton,
    showTemplateLibrary: showTemplateLibrary,
    renderTagFilter:    renderTagFilter,
    readTagFilter:      readTagFilter,
    combineChannels:    combineChannels,
    channelIncludes:    channelIncludes,
    speakAlexa:         speakAlexa,
    uploadAttachment:   uploadAttachment,
    showToast:          showToast,
    renderTemplate:     _renderTemplate,
    esc:                _esc,
    feather:            _feather,
  })
})()
