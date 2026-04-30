;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Smart System
//  State Machine · Automations · Filters · Detail Panel
//  Financial · WhatsApp · Reports · Closed Loop
//
//  GLOBAIS DE DADOS (STATE_MACHINE, STATUS_LABELS, STATUS_COLORS,
//  BLOCK_REASONS, PAYMENT_METHODS, WA_TPLS, createBlockTime) foram
//  extraidos para agenda-smart.constants.js em 2026-04-23.
//  Este arquivo os consome via window.* (ver bindings abaixo).
//
//  Status de LEADS/CRM ficam em app.js como LEAD_STATUS_LABELS / LEAD_STATUS_COLORS
// ══════════════════════════════════════════════════════════════════

// ── Shadow local das constantes (carregadas via agenda-smart.constants.js) ──
// Isto evita refatorar todas as 150+ referencias internas; mantem compatibilidade.
const STATE_MACHINE   = window.STATE_MACHINE   || {}
const STATUS_LABELS   = window.STATUS_LABELS   || {}
const STATUS_COLORS   = window.STATUS_COLORS   || {}
const BLOCK_REASONS   = window.BLOCK_REASONS   || []
const PAYMENT_METHODS = window.PAYMENT_METHODS || []
const WA_TPLS         = window.WA_TPLS         || {}

// ── Tag mapping por status ────────────────────────────────────────
const STATUS_TAG_MAP = {
  agendado:               'agendado',
  aguardando_confirmacao: 'aguardando_confirmacao',
  confirmado:             'confirmado',
  remarcado:              'reagendado',
  cancelado:              'cancelado',
  no_show:                'falta',
}

function _applyStatusTag(appt, tagId, by) {
  if (!appt || !appt.pacienteId || !window.TagEngine) return
  try {
    const vars = { nome: appt.pacienteNome||'', data: appt.data||'', hora: appt.horaInicio||'', profissional: appt.profissionalNome||'' }
    TagEngine.applyTag(appt.pacienteId, 'paciente', tagId, by || 'agenda', vars)
  } catch(e) { /* silencioso */ }
}

// PAYMENT_METHODS e WA_TPLS sao lidos via window.* (shadow no topo).
// Ver agenda-smart.constants.js.

// ── Automation Queue ──────────────────────────────────────────────
const QUEUE_KEY = 'clinicai_automations_queue'

function _getQueue()    { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch(e) { return [] } }
function _saveQueue(q)  { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); if (window.sbSave) sbSave(QUEUE_KEY, q) } catch(e) { if (e.name === 'QuotaExceededError') { _clearOldLogs(); try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch(e2) { /* quota full */ } } } }
function _clearOldLogs() { try { var logs = JSON.parse(localStorage.getItem('clinicai_auto_logs')||'[]'); if (logs.length > 100) localStorage.setItem('clinicai_auto_logs', JSON.stringify(logs.slice(-50))); } catch(e) { /* silencioso */ } }

// ── Inline validation alert (replaces browser alert()) ──────
function _showInlineAlert(title, items, parentId) {
  var containerId = 'finValidationAlert'
  var old = document.getElementById(containerId); if (old) old.remove()
  var target = parentId ? document.getElementById(parentId) : document.querySelector('#smartFinalizeModal > div > div:nth-child(2)')
  if (!target) { if (window._showToast) _showToast(title, Array.isArray(items) ? items[0] : items, 'error'); else console.warn('[Validation]', title, items); return }
  var html = '<div id="' + containerId + '" style="position:sticky;top:0;z-index:10;margin:-18px -18px 12px;padding:12px 16px;background:#FEF2F2;border-bottom:2px solid #FCA5A5;animation:slideDown .2s ease">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="font-size:12px;font-weight:700;color:#991B1B">' + title + '</div>'
    + '<button onclick="document.getElementById(\'' + containerId + '\').remove()" style="background:none;border:none;cursor:pointer;color:#991B1B;font-size:16px">x</button>'
    + '</div>'
  if (Array.isArray(items) && items.length) {
    html += '<ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#DC2626;line-height:1.8">'
    items.forEach(function(e) { html += '<li>' + e + '</li>' })
    html += '</ul>'
  } else if (items) {
    html += '<div style="font-size:11px;color:#DC2626;margin-top:4px">' + items + '</div>'
  }
  html += '</div>'
  target.insertAdjacentHTML('afterbegin', html)
  document.getElementById(containerId).scrollIntoView({ behavior:'smooth', block:'nearest' })
}

function scheduleAutomations(appt) {
  const dt = new Date(`${appt.data}T${appt.horaInicio}:00`)
  if (isNaN(dt.getTime())) return

  // ── Delegate to AutomationsEngine (reads rules from DB) ──
  // Engine is async (loads rules on first call). We call it fire-and-forget
  // but catch errors to prevent silent failures.
  if (window.AutomationsEngine) {
    AutomationsEngine.processAppointment(appt).catch(function(e) {
      console.error('[Agenda] Engine.processAppointment falhou:', e)
    })
  }

  // ── Client-side only: status change queue ──
  const q = _getQueue().filter(x => x.apptId !== appt.id)
  const push = (trigger, date, type) => q.push({
    id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    apptId:      appt.id,
    trigger, type,
    scheduledAt: date.toISOString(),
    executed:    false,
    payload:     { pacienteNome: appt.pacienteNome, pacienteId: appt.pacienteId }
  })

  const d30 = new Date(dt); d30.setMinutes(d30.getMinutes()-30)
  push('30min_antes', d30, 'status_aguardando')

  _saveQueue(q)
}

function processQueue() {
  const now = new Date()
  const q = _getQueue()
  let changed = false
  q.forEach(item => {
    if (item.executed || new Date(item.scheduledAt) > now) return
    item.executed = true; changed = true
    _execAuto(item)
  })
  if (changed) _saveQueue(q)
}

function _execAuto(item) {
  if (!window.getAppointments) return
  const appt = getAppointments().find(a => a.id === item.apptId)
  if (!appt) return
  if (['cancelado','no_show','finalizado'].includes(appt.status)) {
    _logAuto(appt.id, item.type, 'pulado')
    return
  }

  // WhatsApp messages are now handled server-side (wa_outbox with scheduled_at).
  // Only client-side actions remain here.

  if (item.type === 'status_aguardando' && ['confirmado','agendado','aguardando_confirmacao'].includes(appt.status)) {
    // 30min antes: mudar status para aguardando (client-side only)
    apptTransition(appt.id, 'aguardando', 'automacao')
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  if (item.type === 'notif_interna') {
    _logAuto(appt.id, item.type, 'notificado')
    return
  }
  // Engine-scheduled alerts and tasks
  if (item.type === 'engine_alert' && item.payload) {
    if (window._showToast) _showToast('Automacao', item.payload.title || 'Alerta', item.payload.alertType || 'info')
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  if (item.type === 'engine_task' && item.payload) {
    var tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    tasks.push({ id:'task_auto_'+Date.now(), tipo:'automacao', titulo:item.payload.title||'', responsavel:item.payload.assignee||'sdr', status:'pendente', prioridade:item.payload.priority||'normal', prazo:item.payload.deadlineHours ? new Date(Date.now()+item.payload.deadlineHours*3600000).toISOString() : null, apptId:item.apptId, createdAt:new Date().toISOString() })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)); if (window.sbSave) sbSave('clinic_op_tasks', tasks) } catch(e) { /* quota */ }
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  _logAuto(appt.id, item.type, 'ignorado')
}

function _logAuto(apptId, type, status) {
  const logs = JSON.parse(localStorage.getItem('clinicai_auto_logs') || '[]')
  logs.push({ id:'log_'+Date.now(), apptId, type, status, at:new Date().toISOString() })
  try { localStorage.setItem('clinicai_auto_logs', JSON.stringify(logs)) } catch(e) { /* quota */ }
}

// ── State Machine Transition ──────────────────────────────────────
// Alerta secretaria quando paciente chega na clinica e ha pagamento em aberto
function _alertPagamentoAberto(appt) {
  if (!appt) return
  var pagamentos = Array.isArray(appt.pagamentos) ? appt.pagamentos : []
  var abertos = pagamentos.filter(function(p) { return p.status !== 'pago' })
  // Compat: appts antigos so tem statusPagamento
  var statusLegacy = appt.statusPagamento
  var temAberto = abertos.length > 0 || (pagamentos.length === 0 && (statusLegacy === 'aberto' || statusLegacy === 'pendente' || statusLegacy === 'parcial'))
  if (!temAberto) return

  var totalAberto = abertos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
  if (totalAberto === 0 && pagamentos.length === 0) {
    totalAberto = parseFloat(appt.valor) || 0
  }
  if (totalAberto <= 0) return

  var nome = appt.pacienteNome || 'Paciente'
  var msg = nome + ' chegou na clinica com PAGAMENTO EM ABERTO de R$ ' + totalAberto.toFixed(2).replace('.', ',') + '. Cobrar antes de iniciar o atendimento.'

  if (window.Modal) {
    Modal.alert({ title: 'Pagamento em aberto', message: msg, tone: 'warn' })
  } else if (window._showToast) {
    _showToast('Pagamento em aberto', msg, 'warning')
  }
}

function apptTransition(id, newStatus, by) {
  if (!window.getAppointments) return false
  const appts = getAppointments()
  const idx = appts.findIndex(a => a.id === id)
  if (idx < 0) return false
  const appt = appts[idx]
  const allowed = STATE_MACHINE[appt.status] || []
  if (!allowed.includes(newStatus)) return false

  const prevStatus = appt.status
  if (!appt.historicoStatus) appt.historicoStatus = []
  appt.historicoStatus.push({ status: newStatus, at: new Date().toISOString(), by: by || 'manual' })
  appt.status = newStatus

  // Audit log de mudança de status
  if (!appt.historicoAlteracoes) appt.historicoAlteracoes = []
  appt.historicoAlteracoes.push({
    action_type: 'mudanca_status',
    old_value:   { status: prevStatus },
    new_value:   { status: newStatus },
    changed_by:  by || 'manual',
    changed_at:  new Date().toISOString(),
    reason:      by || 'manual',
  })

  appts[idx] = appt
  saveAppointments(appts)

  // Sync Supabase (fire-and-forget, nunca bloqueia)
  if (window.AppointmentsService?.syncOne) {
    AppointmentsService.syncOne(appt)
  }

  // Alerta de pagamento em aberto quando paciente chega na clinica
  if (newStatus === 'na_clinica') _alertPagamentoAberto(appt)

  // Aplicar tag correspondente ao status (cérebro do sistema)
  const tagId = STATUS_TAG_MAP[newStatus]
  if (tagId) _applyStatusTag(appt, tagId, by || 'automação')

  // Automações por transição
  if (newStatus === 'agendado' || newStatus === 'remarcado') scheduleAutomations(appt)
  if (newStatus === 'cancelado' || newStatus === 'no_show') {
    const q = _getQueue().map(x => x.apptId === id ? {...x, executed:true} : x)
    _saveQueue(q)
    if (window.AppointmentsService) {
      window.AppointmentsService.cancelWAByAppt(id)
        .then(function(r){ if (r && !r.ok) console.warn('[Agenda] cancel_by_appt falhou:', r.error) },
              function(e){ console.warn('[Agenda] cancel_by_appt exception:', e) })
    }
  }

  // ── AutomationsEngine: dispatch on_status rules ──
  if (window.AutomationsEngine) {
    AutomationsEngine.processStatusChange(appt, newStatus).catch(function(e) { console.error('[Agenda] Engine.processStatusChange falhou:', e) })
    if (newStatus === 'finalizado') AutomationsEngine.processFinalize(appt).catch(function(e) { console.error('[Agenda] Engine.processFinalize falhou:', e) })
  }

  // Hook SDR unificado: disparar regras (fase muda APENAS no confirmFinalize, nao aqui)
  if (appt.pacienteId && window.SdrService) {
    if (newStatus === 'finalizado') {
      SdrService.onLeadAttended(appt.pacienteId)
      // NAO mudar fase aqui — fase muda no confirmFinalize() apos check do modal
    }
  }

  // Alexa: boas-vindas na recepcao + aviso na sala
  if (newStatus === 'na_clinica' && window.AlexaNotificationService) {
    AlexaNotificationService.notifyArrival(appt).catch(function(e) { console.warn('[Agenda] Alexa notify falhou:', e) })
  }

  // Documentos legais: auto-gerar por status
  if (window.LegalDocumentsService) {
    LegalDocumentsService.autoSendForStatus(newStatus, appt).catch(function(e) { console.warn('[Agenda] Legal docs falhou:', e) })
  }

  // Ações contextuais (checklists + recovery modals only)
  if (newStatus === 'na_clinica') setTimeout(() => _showChecklist(appt, 'na_clinica'), 200)
  if (newStatus === 'em_consulta') setTimeout(() => _showChecklist(appt, 'em_consulta'), 200)
  if (newStatus === 'cancelado')   setTimeout(() => _openRecovery(appt), 400)
  if (newStatus === 'no_show')     setTimeout(() => _openRecovery(appt), 400)

  return true
}

function _createNoShowTask(appt) {
  const tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
  tasks.push({
    id:          'task_ns_' + Date.now(),
    tipo:        'no_show',
    titulo:      `No-show: ${appt.pacienteNome}`,
    descricao:   `Paciente não compareceu em ${appt.data} às ${appt.horaInicio}. Contatar para reagendamento.`,
    responsavel: 'sdr',
    status:      'pendente',
    prioridade:  'alta',
    apptId:      appt.id,
    createdAt:   new Date().toISOString(),
  })
  try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)) } catch(e) { /* quota */ }
}

// ── Checklist Contextual ──────────────────────────────────────────
function _showChecklist(appt, phase) {
  const tipo = appt.tipoConsulta || ''

  const items = phase === 'na_clinica' ? [
    { label:'Anestésico preparado',          show: ['injetavel','procedimento'].includes(tipo) },
    { label:'Poltrona de massagem pronta',    show: true },
    { label:'Anovator configurado',           show: tipo === 'procedimento' },
    { label:'Ficha/prontuário impresso',      show: true },
    { label:'Sala preparada e higienizada',   show: true },
    { label:'Kit de acolhimento / café',      show: true },
    { label:'Menu/cardápio disponível',       show: true },
    { label:'Orientação pré-consulta entregue', show: tipo === 'avaliacao' },
  ].filter(i=>i.show) : [
    { label:'Anamnese carregada na tela',     show: true },
    { label:'Motivo da consulta confirmado',  show: true },
    { label:'Material clínico preparado',     show: ['injetavel','procedimento'].includes(tipo) },
    { label:'Apresentação de protocolos pronta', show: tipo === 'avaliacao' },
    { label:'Orientações pós impressas',      show: tipo === 'procedimento' },
    { label:'Lista de consumo pronta',        show: ['injetavel','procedimento'].includes(tipo) },
  ].filter(i=>i.show)

  const existing = document.getElementById('agendaChecklistPanel')
  if (existing) existing.remove()
  const panel = document.createElement('div')
  panel.id = 'agendaChecklistPanel'
  panel.style.cssText = 'position:fixed;top:20px;right:20px;width:300px;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9800;border:2px solid '+(phase==='na_clinica'?'#06B6D4':'#7C3AED')+';animation:slideInRight .2s ease'
  const color = phase === 'na_clinica' ? '#06B6D4' : '#7C3AED'
  const label = phase === 'na_clinica' ? 'Paciente Na Clinica' : 'Em Consulta'
  const totalItems = items.length
  panel.innerHTML = `
    <div style="padding:12px 14px;background:${color};border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:800;color:#fff">${label} — ${appt.pacienteNome||'Paciente'}</div>
      <span id="ckProgress" style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7)">0/${totalItems}</span>
    </div>
    <div style="padding:12px 14px">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:8px">Checklist de seguranca</div>
      ${items.map((it,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:12px;color:#374151">
        <input type="checkbox" id="ck_${phase}_${i}" onchange="_ckUpdate()" style="accent-color:${color};width:14px;height:14px"> ${it.label}
      </label>`).join('')}
      <button id="ckDoneBtn" onclick="_ckTryClose()" disabled style="margin-top:10px;width:100%;padding:8px;background:#D1D5DB;color:#fff;border:none;border-radius:8px;cursor:not-allowed;font-size:12px;font-weight:700">Marque todos os itens</button>
      <div id="ckBlockMsg" style="display:none;margin-top:6px;font-size:10px;font-weight:700;color:#DC2626;text-align:center">Complete todos os itens antes de fechar</div>
    </div>`
  document.body.appendChild(panel)
  setTimeout(() => { const p = document.getElementById('agendaChecklistPanel'); if(p) p.style.animation = 'none' }, 300)
}

function _ckUpdate() {
  const panel = document.getElementById('agendaChecklistPanel')
  if (!panel) return
  const cbs = panel.querySelectorAll('input[type=checkbox]')
  const total = cbs.length
  const checked = Array.from(cbs).filter(c => c.checked).length
  const progress = document.getElementById('ckProgress')
  if (progress) progress.textContent = checked + '/' + total
  const btn = document.getElementById('ckDoneBtn')
  const msg = document.getElementById('ckBlockMsg')
  if (checked === total) {
    if (btn) { btn.disabled = false; btn.style.background = panel.style.borderColor.replace('2px solid ','') || '#7C3AED'; btn.style.cursor = 'pointer'; btn.textContent = 'Checklist OK' }
    if (msg) msg.style.display = 'none'
  } else {
    if (btn) { btn.disabled = true; btn.style.background = '#D1D5DB'; btn.style.cursor = 'not-allowed'; btn.textContent = 'Marque todos os itens' }
  }
}

function _ckTryClose() {
  const panel = document.getElementById('agendaChecklistPanel')
  if (!panel) return
  const cbs = panel.querySelectorAll('input[type=checkbox]')
  const allChecked = Array.from(cbs).every(c => c.checked)
  if (allChecked) {
    panel.remove()
  } else {
    var msg = document.getElementById('ckBlockMsg')
    if (msg) msg.style.display = 'block'
  }
}
window._ckUpdate = _ckUpdate
window._ckTryClose = _ckTryClose

// ── Envio automatico de consentimentos via WhatsApp ─────────
// Guard in-flight + TTL contra duplo-clique e re-abertura do modal.
// Backend dedup adicional via wa_outbox_schedule_automation (unique_violation em appt_ref+scheduled_at+content_hash).
var _CONSENT_TTL_MS = 10 * 60 * 1000
function _consentKey(apptId, tipo) { return 'consent_sent_' + apptId + '_' + tipo }
function _consentRecent(apptId, tipo) {
  try {
    var raw = localStorage.getItem(_consentKey(apptId, tipo))
    if (!raw) return false
    return (Date.now() - parseInt(raw, 10)) < _CONSENT_TTL_MS
  } catch (e) { return false }
}
function _consentMark(apptId, tipo) {
  try { localStorage.setItem(_consentKey(apptId, tipo), String(Date.now())) } catch (e) { /* quota */ }
}

function _enviarConsentimento(appt, tipo) {
  if (!appt || !appt.id) return
  if (_consentRecent(appt.id, tipo)) return

  var phone = (_getPhone(appt) || '').replace(/\D/g, '')
  if (!phone || !window._sbShared) return

  var nome = appt.pacienteNome || 'Paciente'
  var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'

  var msgs = {
    imagem: 'Ola, *' + nome + '*!\n\nPara darmos continuidade ao seu atendimento, precisamos do seu consentimento para uso de imagem.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nAutorizo o uso de imagens do meu rosto para fins de acompanhamento clinico e documentacao do tratamento.\n\n*' + clinica + '*',
    procedimento: 'Ola, *' + nome + '*!\n\nSegue o termo de consentimento do procedimento realizado hoje.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nDeclaro que fui informada sobre o procedimento, seus beneficios, riscos e cuidados pos.\n\n*' + clinica + '*',
    pagamento: 'Ola, *' + nome + '*!\n\nSegue o termo de consentimento referente a forma de pagamento acordada (boleto/parcelamento).\n\nPor favor, confirme respondendo *ACEITO*:\n\nDeclaro que estou ciente das condicoes de pagamento acordadas.\n\n*' + clinica + '*',
  }

  var msg = msgs[tipo]
  if (!msg) return

  _consentMark(appt.id, tipo)

  if (window.AppointmentsService) {
    window.AppointmentsService.scheduleWAAutomation({
      p_phone: phone,
      p_content: msg,
      p_lead_id: appt.pacienteId || '',
      p_lead_name: nome,
      p_appt_ref: appt.id
    }).then(function(res) {
      if (!res.ok) {
        console.warn('[Agenda] consentimento falhou:', res.error)
        return
      }
      if (res.data && window._showToast) {
        var labels = { imagem: 'Consent. Imagem', procedimento: 'Consent. Procedimento', pagamento: 'Consent. Pagamento' }
        _showToast('Consentimento enviado', (labels[tipo] || tipo) + ' para ' + nome, 'success')
      }
    }).catch(function(e) { console.warn('[Agenda] consentimento exception:', e) })
  }

  _logAuto(appt.id, 'wa_consentimento_' + tipo, 'enviado')
}

// ── Documentos Legais — badge readonly (atualiza automaticamente) ──
function _docRow(label, isDone, doneText, pendingText) {
  var dot = isDone
    ? '<span style="width:8px;height:8px;border-radius:50%;background:#10B981;flex-shrink:0"></span>'
    : '<span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;flex-shrink:0;animation:pulse 1.5s infinite"></span>'
  var statusText = isDone ? doneText : pendingText
  var statusColor = isDone ? '#10B981' : '#F59E0B'
  var borderColor = isDone ? '#BBF7D0' : '#FDE68A'
  var bgColor = isDone ? '#F0FDF4' : '#FFFBEB'
  return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:' + bgColor + ';border-radius:6px;border:1px solid ' + borderColor + '">' +
    dot +
    '<div style="flex:1"><div style="font-size:11px;font-weight:600;color:#374151">' + label + '</div></div>' +
    '<span style="font-size:10px;font-weight:700;color:' + statusColor + '">' + statusText + '</span>' +
  '</div>'
}

// ── Recovery Flow ─────────────────────────────────────────────────
function _openRecovery(appt) {
  const existing = document.getElementById('agendaRecoveryModal')
  if (existing) existing.remove()
  const m = document.createElement('div')
  m.id = 'agendaRecoveryModal'
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9600;display:flex;align-items:center;justify-content:center;padding:16px'
  const isCancelado = window.getAppointments ? getAppointments().find(a=>a.id===appt.id)?.status === 'cancelado' : false
  const cor = isCancelado ? '#EF4444' : '#DC2626'
  const tipo = isCancelado ? 'Cancelamento' : 'No-show'

  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="background:${cor};padding:14px 18px">
        <div style="font-size:14px;font-weight:800;color:#fff">Fluxo de Recuperação — ${tipo}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">${appt.pacienteNome||'Paciente'}</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:12px;color:#6B7280;padding:8px 12px;background:#F9FAFB;border-radius:8px">
          O fluxo de recuperação é iniciado automaticamente. Escolha as ações imediatas:
        </div>
        <button onclick="sendWATemplate('${appt.id}','${isCancelado?'cancelado':'no_show'}');document.getElementById('agendaRecoveryModal').remove()" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px solid #10B98133;background:#F0FDF4;color:#059669;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;text-align:left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.22 0h3a2 2 0 012 1.72 19.79 19.79 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.07-1.07a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Enviar WhatsApp de recuperação
        </button>
        <button onclick="document.getElementById('agendaRecoveryModal').remove();openApptModal('${appt.id}',null,null,null)" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px solid #3B82F633;background:#EFF6FF;color:#2563EB;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;text-align:left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Remarcar agendamento
        </button>
        <button onclick="document.getElementById('agendaRecoveryModal').remove()" style="width:100%;padding:9px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600">
          Fechar — tratar depois
        </button>
      </div>
    </div>`
  m.addEventListener('click', e => { if(e.target===m) m.remove() })
  document.body.appendChild(m)
}

// ── Filter State ──────────────────────────────────────────────────
let _filters = { status:'', profissional:'', tipoConsulta:'', statusPag:'', origem:'', tipoAvaliacao:'' }

function setAgendaFilter(key, val) {
  _filters[key] = val
  if (window.renderAgenda) renderAgenda()
}

function clearAgendaFilters() {
  _filters = { status:'', profissional:'', tipoConsulta:'', statusPag:'', origem:'', tipoAvaliacao:'' }
  if (window.renderAgenda) renderAgenda()
}

function getFilteredAppointments() {
  let appts = window.getAppointments ? getAppointments() : []
  if (_filters.status)        appts = appts.filter(a => a.status === _filters.status)
  if (_filters.profissional)  appts = appts.filter(a => String(a.profissionalIdx) === _filters.profissional)
  if (_filters.tipoConsulta)  appts = appts.filter(a => a.tipoConsulta === _filters.tipoConsulta)
  if (_filters.statusPag)     appts = appts.filter(a => a.statusPagamento === _filters.statusPag)
  if (_filters.origem)        appts = appts.filter(a => a.origem === _filters.origem)
  if (_filters.tipoAvaliacao) appts = appts.filter(a => a.tipoAvaliacao === _filters.tipoAvaliacao)
  return appts
}

function _hasFilters() {
  return Object.values(_filters).some(Boolean)
}

function renderAgendaFilterBar() {
  const profs = window.getProfessionals ? getProfessionals() : []
  const sOpts = Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${_filters.status===k?'selected':''}>${v}</option>`).join('')
  const pOpts = profs.map((p,i)=>`<option value="${i}" ${_filters.profissional===String(i)?'selected':''}>${p.nome}</option>`).join('')
  const active = _hasFilters()
  const sel = _fSel()

  return `<div id="agendaFilterBar" style="background:${active?'#F0F9FF':'#F9FAFB'};border-radius:10px;margin-bottom:12px;border:1px solid ${active?'#BAE6FD':'#E5E7EB'};padding:8px 12px">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${active?'#0284C7':'#9CA3AF'}" stroke-width="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      <select onchange="setAgendaFilter('status',this.value)" style="${sel}">
        <option value="">Todos status</option>${sOpts}
      </select>
      <select onchange="setAgendaFilter('profissional',this.value)" style="${sel}">
        <option value="">Todos profissionais</option>${pOpts}
      </select>
      <select onchange="setAgendaFilter('tipoConsulta',this.value)" style="${sel}">
        <option value="">Tipo de consulta</option>
        <option value="avaliacao"    ${_filters.tipoConsulta==='avaliacao'?'selected':''}>Avaliação</option>
        <option value="retorno"      ${_filters.tipoConsulta==='retorno'?'selected':''}>Retorno</option>
        <option value="procedimento" ${_filters.tipoConsulta==='procedimento'?'selected':''}>Procedimento</option>
        <option value="sessao"       ${_filters.tipoConsulta==='sessao'?'selected':''}>Sessão de Protocolo</option>
        <option value="pos_proc"     ${_filters.tipoConsulta==='pos_proc'?'selected':''}>Pós-procedimento</option>
        <option value="emergencia"   ${_filters.tipoConsulta==='emergencia'?'selected':''}>Emergência</option>
      </select>
      <select onchange="setAgendaFilter('statusPag',this.value)" style="${sel}">
        <option value="">Financeiro</option>
        <option value="pendente" ${_filters.statusPag==='pendente'?'selected':''}>Pendente</option>
        <option value="parcial"  ${_filters.statusPag==='parcial'?'selected':''}>Parcial</option>
        <option value="pago"     ${_filters.statusPag==='pago'?'selected':''}>Pago</option>
      </select>
      <select onchange="setAgendaFilter('origem',this.value)" style="${sel}">
        <option value="">Origem</option>
        <option value="whatsapp"  ${(_filters.origem||'')==='whatsapp'?'selected':''}>WhatsApp</option>
        <option value="instagram" ${(_filters.origem||'')==='instagram'?'selected':''}>Instagram</option>
        <option value="indicacao" ${(_filters.origem||'')==='indicacao'?'selected':''}>Indicação</option>
        <option value="site"      ${(_filters.origem||'')==='site'?'selected':''}>Site</option>
        <option value="direto"    ${(_filters.origem||'')==='direto'?'selected':''}>Direto</option>
      </select>
      <select onchange="setAgendaFilter('tipoAvaliacao',this.value)" style="${sel}">
        <option value="">Avaliação</option>
        <option value="paga"     ${(_filters.tipoAvaliacao||'')==='paga'?'selected':''}>Paga</option>
        <option value="cortesia" ${(_filters.tipoAvaliacao||'')==='cortesia'?'selected':''}>Cortesia</option>
      </select>
      ${active?`<button onclick="clearAgendaFilters()" style="font-size:11px;padding:4px 10px;border:1px solid #EF4444;background:#FEF2F2;color:#EF4444;border-radius:6px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Limpar</button>`:''}
    </div>
  </div>`
}

function _fSel() {
  return 'font-size:12px;padding:5px 8px;border:1px solid #E5E7EB;border-radius:7px;background:#fff;color:#374151;cursor:pointer'
}

// ── Detail Panel (Sidebar deslizante) ─────────────────────────────
let _detailTab = 'resumo'
let _detailId  = null

function openApptDetail(id) {
  _detailId  = id
  _detailTab = 'resumo'
  _buildPanel(id)
}

function setDetailTab(tab) {
  _detailTab = tab
  _buildPanel(_detailId)
}

function closeApptDetail() {
  const p = document.getElementById('apptDetailPanel')
  if (p) { p.style.animation = 'slideOutRight .18s ease forwards'; setTimeout(()=>p.remove(), 180) }
  _detailId = null
}

function _buildPanel(id) {
  const appts = window.getAppointments ? getAppointments() : []
  const appt  = appts.find(a => a.id === id)
  if (!appt) return

  let panel = document.getElementById('apptDetailPanel')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'apptDetailPanel'
    document.body.appendChild(panel)
  }

  const sc  = STATUS_COLORS[appt.status] || STATUS_COLORS.agendado
  const sLb = STATUS_LABELS[appt.status] || appt.status
  const isLocked   = ['finalizado','em_consulta','na_clinica'].includes(appt.status)
  const isDimmed   = ['cancelado','no_show'].includes(appt.status)
  // Filtrar transições — nunca mostrar cancel/no-show direto (exigem modal com motivo)
  const rawAllowed = STATE_MACHINE[appt.status] || []
  const allowed    = rawAllowed.filter(s => !['cancelado','no_show'].includes(s))
  const cancelOpts = rawAllowed.filter(s => ['cancelado','no_show'].includes(s))

  panel.style.cssText = 'position:fixed;top:0;right:0;width:380px;max-width:100vw;height:100vh;background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,.15);z-index:9300;display:flex;flex-direction:column;overflow:hidden;animation:slideInRight .2s ease'

  const tabs = [['resumo','Resumo'],['financeiro','Financeiro'],['historico','Histórico'],['acoes','Ações']]

  panel.innerHTML = `
    <style>
      @keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}
      @keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(40px);opacity:0}}
    </style>
    <!-- Header -->
    <div style="padding:16px 18px;border-bottom:1px solid #E5E7EB;flex-shrink:0;background:#FAFAFA">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${appt.pacienteNome||'Paciente'}</div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:${sc.color};background:${sc.bg};padding:2px 9px;border-radius:20px">${sLb}</span>
            <span style="font-size:11px;color:#9CA3AF">${appt.data?_fmtD(appt.data):''} ${appt.horaInicio||''}</span>
            ${(appt.recurrenceGroupId && appt.recurrenceIndex && appt.recurrenceTotal) ? `<span title="Serie recorrente${appt.recurrenceProcedure?' · '+appt.recurrenceProcedure:''}" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;color:#6D28D9;background:#EDE9FE;padding:2px 8px;border-radius:20px"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sessao ${appt.recurrenceIndex}/${appt.recurrenceTotal}</span>` : ''}
          </div>
        </div>
        <button onclick="closeApptDetail()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;flex-shrink:0;line-height:1;padding:2px 4px;display:inline-flex;align-items:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      ${isLocked ? `<div style="margin-top:8px;display:flex;align-items:center;gap:6px;padding:7px 10px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        <span style="font-size:11px;color:#DC2626;font-weight:700">${appt.status==='finalizado'?'Atendimento finalizado — somente leitura':appt.status==='em_consulta'?'Em consulta — aguarde finalização':'Paciente na clínica'}</span>
      </div>` : ''}
      ${!isLocked && allowed.length ? `<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">
        ${allowed.map(ns=>{const nc=STATUS_COLORS[ns]||{color:'#374151',bg:'#F3F4F6'};return`<button onclick="smartTransition('${id}','${ns}')" style="font-size:10px;font-weight:700;padding:4px 10px;border:1.5px solid ${nc.color};background:${nc.bg};color:${nc.color};border-radius:20px;cursor:pointer">${STATUS_LABELS[ns]||ns}</button>`}).join('')}
      </div>` : ''}
      ${!isLocked && cancelOpts.length ? `<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        ${cancelOpts.map(ns=>{
          const lbl = ns==='cancelado'?'Cancelar':'No-show'
          const cor = ns==='cancelado'?'#EF4444':'#DC2626'
          return`<button onclick="openCancelModal('${id}','${ns}')" style="font-size:10px;font-weight:700;padding:4px 10px;border:1.5px solid ${cor};background:#FEF2F2;color:${cor};border-radius:20px;cursor:pointer">${lbl}</button>`
        }).join('')}
      </div>` : ''}
    </div>
    <!-- Tabs -->
    <div style="display:flex;border-bottom:2px solid #E5E7EB;flex-shrink:0">
      ${tabs.map(([t,l])=>`<button onclick="setDetailTab('${t}')" style="flex:1;padding:10px 4px;font-size:11px;font-weight:700;border:none;background:none;cursor:pointer;color:${_detailTab===t?'#7C3AED':'#6B7280'};border-bottom:2.5px solid ${_detailTab===t?'#7C3AED':'transparent'};margin-bottom:-2px;transition:color .15s">${l}</button>`).join('')}
    </div>
    <!-- Content -->
    <div style="flex:1;overflow-y:auto;padding:18px">
      ${_detailTab==='resumo'     ? _tabResumo(appt)     : ''}
      ${_detailTab==='financeiro' ? _tabFin(appt)        : ''}
      ${_detailTab==='historico'  ? _tabHist(appt)       : ''}
      ${_detailTab==='acoes'      ? _tabAcoes(appt, id)  : ''}
    </div>`
}

function _fmtD(iso) {
  const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`
}

function _row(label, value) {
  return value === undefined || value === null || value === '' ? '' :
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid #F3F4F6">
      <span style="font-size:11px;color:#9CA3AF;font-weight:500;flex-shrink:0;margin-right:12px">${label}</span>
      <span style="font-size:12px;color:#111;font-weight:600;text-align:right">${value}</span>
    </div>`
}

function _tabResumo(a) {
  const profs  = window.getProfessionals ? getProfessionals() : []
  const salas  = window.getRooms ? getRooms() : []
  const prof   = profs[a.profissionalIdx]?.nome || a.profissionalNome || '—'
  const sala   = salas[a.salaIdx]?.nome || '—'
  const tipoMap = { avaliacao:'Avaliação', retorno:'Retorno', procedimento:'Procedimento', emergencia:'Emergência' }
  const origMap = { whatsapp:'WhatsApp', instagram:'Instagram', indicacao:'Indicação', site:'Site', direto:'Direto' }
  const tipoPMap= { novo:'Novo', retorno:'Retorno', vip:'VIP' }

  const procs = window.ApptSchema ? window.ApptSchema.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:6px">Consulta</div>
    ${_row('Data',      a.data ? _fmtD(a.data) : '')}
    ${_row('Horário',   a.horaInicio && a.horaFim ? `${a.horaInicio} – ${a.horaFim}` : a.horaInicio||'')}
    ${_row('Proc.',     a.procedimento)}
    ${_row('Profissional', prof)}
    ${_row('Sala',      sala)}
    ${_row('Tipo',      tipoMap[a.tipoConsulta]||'')}
    ${a.tipoConsulta==='avaliacao'?_row('Avaliação', a.tipoAvaliacao==='paga'?'Paga':a.tipoAvaliacao==='cortesia'?'Cortesia':''):''}
    ${_row('Origem',    origMap[a.origem]||a.origem||'')}
    ${_row('Paciente',  tipoPMap[a.tipoP]||'')}
    ${a.obs?`<div style="margin-top:10px;padding:9px;background:#F9FAFB;border-radius:7px;font-size:11px;color:#6B7280;line-height:1.5">${a.obs}</div>`:''}

    <div style="margin-top:14px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.06em">Documentos Legais</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${_docRow('Ficha de Anamnese', a.anamneseRespondida, 'Preenchida', 'Pendente')}
        ${_docRow('Consentimento de Imagem', a.consentimentoImagem === 'assinado' || a.consentimentoImagem === true, 'Assinado', 'Pendente')}
        ${_docRow('Consentimento de Procedimento', a.consentimentoProcedimento === 'assinado', 'Assinado', 'Pendente')}
        ${(a.formaPagamento==='boleto'||a.formaPagamento==='parcelado'||a.formaPagamento==='entrada_saldo') ? _docRow('Consentimento de Pagamento', a.consentimentoPagamento === 'assinado', 'Assinado', 'Pendente') : ''}
      </div>
      <button onclick="window._sendManualConsent('${a.id}')" style="width:100%;margin-top:8px;padding:7px;background:linear-gradient(135deg,#C9A96E,#D4B978);color:#1a1a2e;border:none;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer">Enviar Consentimento Manual</button>
    </div>

    ${procs.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Procedimentos Realizados</div>
      ${procs.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#374151">${p.nome}</span><span style="font-weight:700;color:#111">×${p.qtd||1}</span></div>`).join('')}
    `:''}`
}

function _tabFin(a) {
  const pmMap = { pix:'PIX',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',parcelado:'Parcelado',entrada_saldo:'Entrada + Saldo',boleto:'Boleto',link:'Link',cortesia:'Cortesia',convenio:'Convênio' }
  const psMap = { pendente:'Pendente', parcial:'Parcial', pago:'Pago' }
  const psClr = { pendente:'#F59E0B', parcial:'#3B82F6', pago:'#10B981' }
  const ps = a.statusPagamento || 'pendente'
  const pmOpts = PAYMENT_METHODS.map(m=>`<option value="${m.id}" ${a.formaPagamento===m.id?'selected':''}>${m.label}</option>`).join('')

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:6px">Financeiro</div>
    ${_row('Valor',    a.valor ? _fmtBRL(a.valor) : '')}
    ${_row('Status',  `<span style="color:${psClr[ps]||'#374151'};font-weight:700">${psMap[ps]||ps}</span>`)}
    ${_row('Forma',    pmMap[a.formaPagamento]||a.formaPagamento||'')}
    ${_row('Pago',     a.valorPago ? _fmtBRL(a.valorPago) : '')}
    ${a.valor&&a.valorPago&&a.valor>a.valorPago?_row('Saldo',`<span style="color:#EF4444;font-weight:700">${_fmtBRL(a.valor-a.valorPago)}</span>`):''}
    ${a.tipoConsulta==='avaliacao'&&a.tipoAvaliacao==='paga'?`<div style="margin-top:10px;padding:9px 12px;background:#FFFBEB;border-radius:8px;font-size:11px;color:#92400E;font-weight:600;display:flex;align-items:center;gap:6px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Avaliação paga — confirme o pagamento antes de finalizar</div>`:''}
    <!-- Status buttons -->
    <div style="margin-top:14px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px">Atualizar Status</div>
      <div style="display:flex;gap:6px">
        ${['pendente','parcial','pago'].map(s=>`<button onclick="updatePayStatus('${a.id}','${s}')" style="flex:1;font-size:11px;padding:6px;border:1.5px solid ${psClr[s]};background:${ps===s?psClr[s]:'#fff'};color:${ps===s?'#fff':psClr[s]};border-radius:7px;cursor:pointer;font-weight:700">${psMap[s]}</button>`).join('')}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <input id="dpValPago" type="number" placeholder="Valor pago..." value="${a.valorPago||''}" style="flex:1;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">
        <select id="dpFormaPag" style="flex:1;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">${pmOpts}</select>
      </div>
      <button onclick="savePay('${a.id}')" style="margin-top:8px;width:100%;padding:9px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Salvar Pagamento</button>
    </div>`
}

const _ACTION_LABELS = {
  mudanca_status:        'Mudança de status',
  edicao:                'Edição de dados',
  remarcacao_drag:       'Remarcação (drag & drop)',
  reagendamento_manual:  'Reagendamento (botão Reagendar)',
  remarcacao:            'Remarcação',
  cancelamento:          'Cancelamento',
  no_show:               'No-show',
  finalizacao:           'Finalização',
  fluxo_avaliacao_google: 'Fluxo: Avaliação Google',
  fluxo_parceria:        'Fluxo: Parceria',
}

function _tabHist(a) {
  const hist = [...(a.historicoStatus||[])].reverse()
  const logs = JSON.parse(localStorage.getItem('clinicai_auto_logs')||'[]').filter(l=>l.apptId===a.id)
  const alteracoes = [...(a.historicoAlteracoes||[])].reverse()
  const autoLbls = { whatsapp_confirmacao:'WA: Confirmação D-1', whatsapp_chegou_o_dia:'WA: Chegou o dia', notif_interna:'Notif. interna 10min', status_aguardando:'Auto: → Aguardando', wa_pos_atendimento:'WA: Pós-atendimento' }

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:8px">Histórico de Status</div>
    ${!hist.length?`<div style="text-align:center;color:#9CA3AF;padding:16px;font-size:12px">Sem histórico</div>`:''}
    ${hist.map(h=>{const sc=STATUS_COLORS[h.status]||{color:'#374151'};return`<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #F3F4F6">
      <div style="width:7px;height:7px;border-radius:50%;background:${sc.color};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#111">${STATUS_LABELS[h.status]||h.status}</div>
      <div style="font-size:10px;color:#9CA3AF;margin-top:1px">${h.at?new Date(h.at).toLocaleString('pt-BR'):''} · ${h.by||'manual'}${h.motivo?` · ${h.motivo}`:''}</div></div>
    </div>`}).join('')}
    ${alteracoes.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Trilha de Auditoria</div>
      ${alteracoes.map(l=>`<div style="padding:7px 0;border-bottom:1px solid #F3F4F6">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <span style="font-size:11px;font-weight:700;color:#374151">${_ACTION_LABELS[l.action_type]||l.action_type}</span>
          <span style="font-size:10px;color:#9CA3AF;white-space:nowrap;margin-left:8px">${l.changed_at?new Date(l.changed_at).toLocaleString('pt-BR'):''}</span>
        </div>
        ${l.reason?`<div style="font-size:10px;color:#6B7280;margin-top:2px">${l.reason}</div>`:''}
      </div>`).join('')}
    `:''}
    ${logs.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Automações</div>
      ${logs.map(l=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:11px">
        <span style="color:#374151">${autoLbls[l.type]||l.type}</span>
        <span style="color:${l.status==='pendente'?'#F59E0B':l.status==='enviado'?'#10B981':'#9CA3AF'};font-weight:700">${l.status}</span>
      </div>`).join('')}`:''}
  `
}

function _tabAcoes(a, id) {
  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:10px">WhatsApp</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">
      ${Object.entries(WA_TPLS).map(([key,tpl])=>`<button onclick="sendWATemplate('${id}','${key}')" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;cursor:pointer;text-align:left;width:100%;transition:background .1s" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='#fff'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.22 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.07-1.07a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        <span style="font-size:12px;font-weight:600;color:#374151">${tpl.label}</span>
      </button>`).join('')}
    </div>
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:10px">Ações</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      <button onclick="openApptModal('${id}',null,null,null)" style="${_aBtn('#3B82F6')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar Consulta</button>
      ${a.status!=='finalizado'&&a.status!=='cancelado'?`<button onclick="openFinalizeModal('${id}')" style="${_aBtn('#10B981')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Finalizar Atendimento</button>`:''}
      <button onclick="closeApptDetail();window.tagsOpenCheckoutModal&&tagsOpenCheckoutModal('${id}','${(a.pacienteNome||'').replace(/'/g,"\\'")}',[])" style="${_aBtn('#8B5CF6')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Registrar Saída</button>
    </div>`
}

function _aBtn(c) {
  return `display:flex;align-items:center;gap:8px;padding:9px 13px;border:1.5px solid ${c}22;background:${c}10;color:${c};border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;width:100%;text-align:left;transition:background .1s`
}

function _fmtBRL(v) { return 'R$ '+Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.') }
function _getPhone(appt) {
  try {
    const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    const l = leads.find(x=>x.id===appt.pacienteId||(x.nome||x.name||'')===appt.pacienteNome)
    return l?.whatsapp||l?.phone||l?.telefone||''
  } catch { return '' }
}
function _waVars(appt) {
  return { nome:appt.pacienteNome||'Paciente', data:appt.data?_fmtD(appt.data):'', hora:appt.horaInicio||'', profissional:appt.profissionalNome||'', procedimento:appt.procedimento||'', clinica:window._getClinicaNome?_getClinicaNome():'Clínica' }
}

function sendWATemplate(apptId, tplKey) {
  const appt = window.getAppointments ? getAppointments().find(a=>a.id===apptId) : null
  if (!appt) return
  const tpl = WA_TPLS[tplKey]; if (!tpl) return
  const text = tpl.fn(_waVars(appt))
  const phone = (_getPhone(appt)||'').replace(/\D/g,'')

  if (!phone) {
    if (window._showToast) _showToast('Sem telefone', (appt.pacienteNome||'Paciente') + ' nao tem WhatsApp', 'warning')
    return
  }

  // Enviar via Evolution API (por baixo, via Supabase RPC)
  if (window.AppointmentsService) {
    window.AppointmentsService.enqueueWAReminder({
      p_phone: phone,
      p_content: text,
      p_lead_name: appt.pacienteNome || 'Paciente'
    }).then(function(res) {
      if (!res.ok) {
        console.error('[WA] Falha:', res.error)
        // Fallback: abre wa.me se RPC falhar
        window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
      } else {
        if (window._showToast) _showToast('WhatsApp enviado', (WA_TPLS[tplKey]||{}).label + ' para ' + (appt.pacienteNome||''), 'success')
      }
    }).catch(function() {
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
    })
  } else {
    // Sem Supabase: fallback wa.me
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
  }

  _logAuto(apptId, 'wa_'+tplKey, 'enviado')
}

// ── Transition from panel ─────────────────────────────────────────
function smartTransition(id, newStatus) {
  // Cancelamento e no-show exigem modal com motivo obrigatório
  if ((newStatus === 'cancelado' || newStatus === 'no_show') && window.openCancelModal) {
    openCancelModal(id, newStatus)
    return
  }

  // Validar transição via AgendaValidator
  if (window.AgendaValidator && window.getAppointments) {
    const appt = getAppointments().find(a => a.id === id)
    if (appt) {
      const errs = AgendaValidator.validateTransition(appt, newStatus)
      if (errs.length) {
        if (window.showValidationErrors) showValidationErrors(errs, 'Transicao nao permitida')
        else if (window._showToast) _showToast('Transicao bloqueada', errs[0], 'error')
        return
      }
    }
  }

  const ok = apptTransition(id, newStatus, 'manual')
  if (!ok) {
    if (window._showToast) _showToast('Transicao bloqueada', 'Transicao nao permitida no fluxo atual.', 'error')
    return
  }
  if (window.renderAgenda) renderAgenda()
  _buildPanel(id)
}

// ── Payment helpers (from detail panel) ──────────────────────────
function updatePayStatus(id, status) {
  if (!window.getAppointments) return
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) return
  appts[idx].statusPagamento = status
  saveAppointments(appts)
  _buildPanel(id)
}

function savePay(id) {
  if (!window.getAppointments) return
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) return
  const val   = parseFloat(document.getElementById('dpValPago')?.value||'0')
  const forma = document.getElementById('dpFormaPag')?.value
  if (val) appts[idx].valorPago = val
  if (forma) appts[idx].formaPagamento = forma
  if (val && appts[idx].valor && val >= appts[idx].valor) appts[idx].statusPagamento = 'pago'
  else if (val>0) appts[idx].statusPagamento = 'parcial'
  saveAppointments(appts)
  _buildPanel(id)
}


// ── Reports: Real Data ────────────────────────────────────────────
function getAgendaReportData(period) {
  const appts = window.getAppointments ? getAppointments() : []
  const now   = new Date()
  let start, end

  if (period === 'semana') {
    const day = now.getDay()
    start = new Date(now); start.setDate(now.getDate()-(day===0?6:day-1)); start.setHours(0,0,0,0)
    end   = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999)
  } else if (period === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999)
  } else {
    const q = Math.floor(now.getMonth()/3)
    start = new Date(now.getFullYear(), q*3, 1)
    end   = new Date(now.getFullYear(), q*3+3, 0, 23,59,59,999)
  }

  const inRange = appts.filter(a=>{ const d=new Date(a.data+'T12:00'); return d>=start&&d<=end })
  const total       = inRange.length
  const realizados  = inRange.filter(a=>a.status==='finalizado').length
  const noshow      = inRange.filter(a=>a.status==='no_show').length
  const cancelados  = inRange.filter(a=>a.status==='cancelado').length
  const remarcados  = inRange.filter(a=>a.status==='remarcado').length
  const confirmados = inRange.filter(a=>['confirmado','na_clinica','em_consulta','em_atendimento','finalizado'].includes(a.status)).length
  const pagos       = inRange.filter(a=>a.statusPagamento==='pago')
  // Cortesia (valor 0 ou formaPagamento=cortesia) polui ticket medio — exclui da media.
  const pagosRemunerados = pagos.filter(a => {
    var forma = (a.formaPagamento || a.pagamento || '').toLowerCase()
    return forma !== 'cortesia' && (a.valor || 0) > 0
  })
  const faturamento = window.Money
    ? window.Money.sum(pagosRemunerados.map(a => a.valor || 0))
    : pagosRemunerados.reduce((s,a)=>s+(a.valor||0),0)
  const ticketMedio = pagosRemunerados.length
    ? (window.Money ? window.Money.div(faturamento, pagosRemunerados.length) : faturamento/pagosRemunerados.length)
    : 0

  const pct = (v) => total ? Math.round(v/total*100) : 0

  const porDia = []
  if (period==='semana') {
    const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
    for(let i=0;i<7;i++){
      const d=new Date(start); d.setDate(start.getDate()+i)
      const iso=d.toISOString().slice(0,10)
      const da=inRange.filter(a=>a.data===iso)
      porDia.push({dia:dias[i],agendados:da.length,realizados:da.filter(a=>a.status==='finalizado').length,noshow:da.filter(a=>a.status==='no_show').length})
    }
  }

  return { total, confirmados, realizados, noshow, cancelados, remarcados, faturamento, ticketMedio,
           txComparecimento:pct(realizados), txConfirmacao:pct(confirmados), txNoshow:pct(noshow), txCancelamento:pct(cancelados), porDia }
}

// ── Resumo Diario — WhatsApp as 8h para o responsavel ────────────
var DAILY_SENT_KEY = 'clinicai_daily_summary_sent'

function _checkDailySummary() {
  var now = new Date()
  var todayIso = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
  var hora = now.getHours()
  var minuto = now.getMinutes()

  // So envia entre 8:00 e 8:05
  if (hora !== 8 || minuto > 5) return

  // Verificar se ja enviou hoje
  var lastSent = localStorage.getItem(DAILY_SENT_KEY)
  if (lastSent === todayIso) return

  // Marcar como enviado ANTES de enviar (evita duplicados)
  localStorage.setItem(DAILY_SENT_KEY, todayIso)

  // Buscar agendamentos do dia
  var appts = window.getAppointments ? getAppointments() : []
  var today = appts.filter(function(a) {
    return a.data === todayIso && a.status !== 'cancelado' && a.status !== 'no_show'
  }).sort(function(a, b) { return (a.horaInicio || '').localeCompare(b.horaInicio || '') })

  if (!today.length) return // Sem agendamentos, nao envia

  // Buscar telefone do responsavel
  var profs = window.getProfessionals ? getProfessionals() : []
  // Buscar primeiro profissional com telefone (nao hardcodar nome)
  var responsavel = profs.find(function(p) { return !!(p.phone || p.whatsapp || p.telefone) }) || profs[0]
  var phone = responsavel && (responsavel.phone || responsavel.whatsapp || responsavel.telefone)
  if (!phone || !window._sbShared) return

  // Formatar mensagem elegante
  var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
  var dias = ['Domingo','Segunda-feira','Terca-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sabado']
  var dia = dias[now.getDay()]
  var dataFmt = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear()

  var header = '*' + clinica + ' — Agenda do Dia*\n'
  header += dia + ', ' + dataFmt + '\n'
  header += today.length + ' agendamento' + (today.length > 1 ? 's' : '') + '\n'
  header += '━━━━━━━━━━━━━━\n\n'

  var body = today.map(function(a, i) {
    var nome = a.pacienteNome || 'Paciente'
    var proc = a.procedimento || a.tipoConsulta || '—'
    var hora = (a.horaInicio || '') + (a.horaFim ? ' - ' + a.horaFim : '')
    var obs = a.obs ? '\n   Obs: ' + a.obs : ''
    var status = (STATUS_LABELS[a.status] || a.status)

    return (i + 1) + '. *' + nome + '*\n' +
           '   ' + proc + '\n' +
           '   ' + hora + ' | ' + status +
           obs
  }).join('\n\n')

  var footer = '\n\n━━━━━━━━━━━━━━\n'
  footer += 'Bom dia e sucesso Dra. Mirian!'

  var msg = header + body + footer

  // Enviar (dividir se necessario — max ~4000 chars por msg)
  var parts = []
  if (msg.length <= 3800) {
    parts.push(msg)
  } else {
    // Dividir pacientes em grupos de 3
    var grupos = []
    for (var g = 0; g < today.length; g += 3) {
      grupos.push(today.slice(g, g + 3))
    }
    grupos.forEach(function(grupo, gi) {
      var partHeader = '*Agenda do Dia (' + (gi + 1) + '/' + grupos.length + ')*\n' + dia + ', ' + dataFmt + '\n━━━━━━━━━━━━━━\n\n'
      var partBody = grupo.map(function(a, i) {
        var idx = gi * 3 + i + 1
        var nome = a.pacienteNome || 'Paciente'
        var proc = a.procedimento || a.tipoConsulta || '—'
        var hora = (a.horaInicio || '') + (a.horaFim ? ' - ' + a.horaFim : '')
        var obs = a.obs ? '\n   Obs: ' + a.obs : ''
        return idx + '. *' + nome + '*\n   ' + proc + '\n   ' + hora + obs
      }).join('\n\n')
      if (gi === grupos.length - 1) partBody += '\n\n━━━━━━━━━━━━━━\nBom dia e sucesso Dra. Mirian!'
      parts.push(partHeader + partBody)
    })
  }

  // Enviar cada parte
  parts.forEach(function(part, pi) {
    setTimeout(function() {
      if (window.AppointmentsService) {
        window.AppointmentsService.enqueueWAReminder({
          p_phone: phone.replace(/\D/g, ''),
          p_content: part,
          p_lead_name: 'Sistema ClinicAI'
        })
      }
    }, pi * 2000) // 2s entre cada mensagem
  })

  _logAuto('daily_summary', 'resumo_diario', 'enviado')
}

// ── Auto-sync appointments to Supabase ───────────────────────────
var APPT_SYNC_KEY = 'clinicai_appt_synced_v1'
function _autoSyncAppointments() {
  if (localStorage.getItem(APPT_SYNC_KEY) === 'done') return
  if (!window.AppointmentsService?.syncBatch) return
  AppointmentsService.syncBatch().then(function(res) {
    if (res && res.ok) {
      localStorage.setItem(APPT_SYNC_KEY, 'done')
      console.info('[AutoSync] Appointments synced to Supabase:', res)
    } else {
      console.warn('[AutoSync] Appointments sync failed:', res?.error)
    }
  }).catch(function(e) { console.warn('[AutoSync] Exception:', e) })
}

// ── Init ──────────────────────────────────────────────────────────
var _queueInterval = null
var _dailyInterval = null

function _init() {
  processQueue()
  _checkDailySummary()
  _autoSyncAppointments()
  // Clear previous intervals (prevents leak on re-init/navigation)
  if (_queueInterval) clearInterval(_queueInterval)
  if (_dailyInterval) clearInterval(_dailyInterval)
  _queueInterval = setInterval(processQueue, 60_000)
  _dailyInterval = setInterval(_checkDailySummary, 60_000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init)
} else {
  setTimeout(_init, 0)
}

// ── Expose ────────────────────────────────────────────────────────
window.apptTransition         = apptTransition
window.scheduleAutomations    = scheduleAutomations
window.processQueue           = processQueue
window.openApptDetail         = openApptDetail
window.closeApptDetail        = closeApptDetail
window.setDetailTab           = setDetailTab
window.smartTransition        = smartTransition
window.sendWATemplate         = sendWATemplate
window.openFinalizarModal     = openFinalizeModal  // Bridge: legacy name → canonical
window._finAutoRoute          = _finAutoRoute
window.renderAgendaFilterBar  = renderAgendaFilterBar
window.setAgendaFilter        = setAgendaFilter
window.clearAgendaFilters     = clearAgendaFilters
window.getFilteredAppointments= getFilteredAppointments
window.getAgendaReportData    = getAgendaReportData
window._applyStatusTag        = _applyStatusTag
window._openRecovery          = _openRecovery
window._getQueue              = _getQueue
window._saveQueue             = _saveQueue
window.processQueue           = processQueue

// Duplicado removido — _init() ja faz processQueue + setInterval(60s)
window.WA_TPLS                = WA_TPLS
window.STATUS_LABELS          = STATUS_LABELS
window.STATUS_COLORS          = STATUS_COLORS
window.STATE_MACHINE          = STATE_MACHINE
window.PAYMENT_METHODS        = PAYMENT_METHODS

// Internals expostos pra finalize modal (seam 6 - 2026-04-24)
window._consentRecent       = _consentRecent
window._enviarConsentimento = _enviarConsentimento
window._fmtBRL              = _fmtBRL
window._fmtD                = _fmtD
window._getPhone            = _getPhone
window._logAuto             = _logAuto
window._showInlineAlert     = _showInlineAlert

// ── Namespace agregador congelado (contrato canonico do projeto) ─
// Os window.<fn> acima permanecem para compatibilidade com onclick inline.
window.AgendaSmart = Object.freeze({
  transition: apptTransition,
  smartTransition: smartTransition,
  scheduleAutomations: scheduleAutomations,
  processQueue: processQueue,
  openDetail: openApptDetail,
  closeDetail: closeApptDetail,
  setDetailTab: setDetailTab,
  updatePayStatus: updatePayStatus,
  savePay: savePay,
  sendWATemplate: sendWATemplate,
  openFinalizeModal: openFinalizeModal,
  closeFinalizeModal: closeFinalizeModal,
  confirmFinalize: confirmFinalize,
  renderFilterBar: renderAgendaFilterBar,
  setFilter: setAgendaFilter,
  clearFilters: clearAgendaFilters,
  getFiltered: getFilteredAppointments,
  getReportData: getAgendaReportData,
  WA_TPLS: WA_TPLS,
  STATUS_LABELS: STATUS_LABELS,
  STATUS_COLORS: STATUS_COLORS,
  STATE_MACHINE: STATE_MACHINE,
  PAYMENT_METHODS: PAYMENT_METHODS
})

})()
