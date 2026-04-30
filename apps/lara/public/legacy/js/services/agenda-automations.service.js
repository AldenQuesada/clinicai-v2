/**
 * ClinicAI — Agenda Automations Service
 *
 * Camada de negocio para regras de automacao da agenda.
 * CRUD + cache local + helpers de trigger.
 */
;(function () {
  'use strict'
  if (window._clinicaiAgendaAutoSvcLoaded) return
  window._clinicaiAgendaAutoSvcLoaded = true

  var _cache = null
  var CACHE_KEY = 'clinicai_agenda_automations'

  function _repo() { return window.AgendaAutomationsRepository || null }

  // ── Cache ──────────────────────────────────────────────────
  function _readCache() {
    if (_cache) return _cache
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') } catch { return [] }
  }

  function _writeCache(rules) {
    _cache = rules
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(rules)) } catch { /* quota */ }
  }

  // ── CRUD ───────────────────────────────────────────────────
  async function loadAll() {
    var repo = _repo()
    if (!repo) return _readCache()
    var res = await repo.list()
    if (res.ok && res.data.length > 0) _writeCache(res.data)
    return res.ok ? res.data : _readCache()
  }

  async function save(ruleData) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'Sem conexao' }
    var res = await repo.upsert(ruleData)
    if (res.ok) await loadAll()
    return res
  }

  async function remove(id) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'Sem conexao' }
    var res = await repo.remove(id)
    if (res.ok) await loadAll()
    return res
  }

  async function toggle(id) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'Sem conexao' }
    var res = await repo.toggle(id)
    if (res.ok) await loadAll()
    return res
  }

  // ── Query helpers ──────────────────────────────────────────
  function getActive() {
    return _readCache().filter(function (r) { return r.is_active })
  }

  function getByTrigger(triggerType) {
    return getActive().filter(function (r) { return r.trigger_type === triggerType })
  }

  function getByCategory(category) {
    return _readCache().filter(function (r) { return r.category === category })
  }

  function getByStatus(status) {
    return getActive().filter(function (r) {
      return r.trigger_type === 'on_status' && r.trigger_config && r.trigger_config.status === status
    })
  }

  function getByTag(tagId) {
    return getActive().filter(function (r) {
      return r.trigger_type === 'on_tag' && r.trigger_config && r.trigger_config.tag === tagId
    })
  }

  // Canais "multi" = canais agrupados (whatsapp_alert, all, etc.)
  var MULTI_CHANNEL_IDS = {
    whatsapp_alert: 1, whatsapp_task: 1, whatsapp_alexa: 1,
    alert_task: 1, alert_alexa: 1, all: 1, both: 1,
  }

  // Chave de trigger para agrupamento na UI.
  // on_status -> 'status:<id>' | on_tag -> 'tag:<id>' | outros -> 'time:<type>'
  function triggerKeyOf(rule) {
    if (!rule || !rule.trigger_type) return 'time:unknown'
    var cfg = rule.trigger_config || {}
    if (rule.trigger_type === 'on_status') return 'status:' + (cfg.status || 'unknown')
    if (rule.trigger_type === 'on_tag')    return 'tag:' + (cfg.tag || 'unknown')
    return 'time:' + rule.trigger_type
  }

  // Agrupa regras por trigger key. Retorna objeto { key: { key, triggerType, refId, rules[] } }.
  // Se category for informada, filtra por categoria antes.
  function getGroupedByTrigger(category) {
    var all = _readCache()
    if (category) all = all.filter(function (r) { return r.category === category })
    var groups = {}
    for (var i = 0; i < all.length; i++) {
      var r = all[i]
      var key = triggerKeyOf(r)
      if (!groups[key]) {
        var parts = key.split(':')
        groups[key] = {
          key: key,
          scope: parts[0],              // 'status' | 'tag' | 'time'
          refId: parts.slice(1).join(':'),
          triggerType: r.trigger_type,
          rules: [],
        }
      }
      groups[key].rules.push(r)
    }
    return groups
  }

  // getByChannel: filtra regras por canal (ativas + inativas — UI decide).
  //   'whatsapp' | 'alexa' | 'task' | 'alert' -> exata
  //   'multi' -> qualquer canal agrupado
  function getByChannel(channelId) {
    var all = _readCache()
    if (channelId === 'multi') {
      return all.filter(function (r) { return !!MULTI_CHANNEL_IDS[r.channel] })
    }
    return all.filter(function (r) { return r.channel === channelId })
  }

  // ── Template rendering ─────────────────────────────────────
  // Sanitiza templates WA contra vars vazias (Fase 8 - Entrega 1).
  // Universal — espelha o helper SQL public._wa_render_template.
  function renderTemplate(template, vars) {
    if (!template) return ''
    var result = String(template)
    var keys = Object.keys(vars || {})
    for (var i = 0; i < keys.length; i++) {
      var re = new RegExp('\\{\\{' + keys[i] + '\\}\\}', 'g')
      var val = vars[keys[i]]
      result = result.replace(re, val == null ? '' : String(val))
    }
    // 1. Limpa placeholders nao resolvidos
    result = result.replace(/\{\{[^{}]+\}\}/g, '')
    // 2. Remove delimitadores markdown orfaos (valor vazio entre eles)
    result = result.replace(/\*\s*\*/g, '')
    result = result.replace(/_\s*_/g,   '')
    result = result.replace(/~\s*~/g,   '')
    // 3. Espacos antes de pontuacao
    result = result.replace(/[ \t]+([.,;:!?])/g, '$1')
    // 4. Colapsa espacos/tabs multiplos
    result = result.replace(/[ \t]{2,}/g, ' ')
    // 5. Colapsa quebras de linha (>=3) em 2
    result = result.replace(/\n{3,}/g, '\n\n')
    // 6. Trim por linha
    result = result.replace(/[ \t]+\n/g, '\n')
    result = result.replace(/\n[ \t]+/g, '\n')
    // 7. Trim final
    return result.trim()
  }

  // ── Constants ──────────────────────────────────────────────
  var TRIGGER_TYPES = [
    { id: 'd_before',      label: 'Dias antes',         category: 'before' },
    { id: 'd_zero',        label: 'Mesmo dia',          category: 'before' },
    { id: 'min_before',    label: 'Minutos antes',      category: 'before' },
    { id: 'on_status',     label: 'Ao mudar status',    category: 'during' },
    { id: 'on_tag',        label: 'Ao aplicar tag',     category: 'during' },
    { id: 'on_finalize',   label: 'Ao finalizar',       category: 'after'  },
    { id: 'd_after',       label: 'Dias depois',        category: 'after'  },
    { id: 'daily_summary', label: 'Resumo diario',      category: 'before' },
  ]

  var RECIPIENT_TYPES = [
    { id: 'patient',      label: 'Paciente' },
    { id: 'professional', label: 'Profissional' },
    { id: 'both',         label: 'Ambos' },
  ]

  var CHANNELS = [
    { id: 'whatsapp',       label: 'WhatsApp' },
    { id: 'alert',          label: 'Alerta Visual' },
    { id: 'task',           label: 'Tarefa' },
    { id: 'alexa',          label: 'Alexa' },
    { id: 'whatsapp_alert', label: 'WhatsApp + Alerta' },
    { id: 'whatsapp_task',  label: 'WhatsApp + Tarefa' },
    { id: 'whatsapp_alexa', label: 'WhatsApp + Alexa' },
    { id: 'alert_task',     label: 'Alerta + Tarefa' },
    { id: 'alert_alexa',    label: 'Alerta + Alexa' },
    { id: 'all',            label: 'Todos' },
  ]

  var ALEXA_TARGETS = [
    { id: 'recepcao',     label: 'Recepcao' },
    { id: 'sala',         label: 'Sala do Profissional' },
    { id: 'profissional', label: 'Device do Profissional' },
    { id: 'todos',        label: 'Todos os Dispositivos' },
  ]

  var CATEGORIES = [
    { id: 'captacao',  label: 'Captacao',  color: '#6366F1' },
    { id: 'before',    label: 'Antes',     color: '#3B82F6' },
    { id: 'during',    label: 'Durante',   color: '#7C3AED' },
    { id: 'after',     label: 'Depois',    color: '#10B981' },
    { id: 'pos',       label: 'Pos',       color: '#0891B2' },
    { id: 'orcamento', label: 'Orcamento', color: '#F59E0B' },
  ]

  var TASK_ASSIGNEES = [
    { id: 'sdr',        label: 'SDR / Comercial' },
    { id: 'secretaria', label: 'Secretaria' },
    { id: 'cs',         label: 'CS / Pos-venda' },
    { id: 'clinica',    label: 'Equipe Clinica' },
    { id: 'gestao',     label: 'Gestao' },
  ]

  var TASK_PRIORITIES = [
    { id: 'urgente', label: 'Urgente', color: '#DC2626' },
    { id: 'alta',    label: 'Alta',    color: '#F59E0B' },
    { id: 'normal',  label: 'Normal',  color: '#3B82F6' },
    { id: 'baixa',   label: 'Baixa',   color: '#6B7280' },
  ]

  var TEMPLATE_VARS = [
    { id: 'nome',          label: 'Nome paciente',        example: 'Maria Silva' },
    { id: 'data',          label: 'Data da consulta',     example: '16/04/2026' },
    { id: 'hora',          label: 'Horario da consulta',  example: '14:30' },
    { id: 'profissional',  label: 'Profissional',         example: 'Dra. Mirian' },
    { id: 'procedimento',  label: 'Procedimento',         example: 'Bioestimulador' },
    { id: 'clinica',       label: 'Nome da clinica',      example: 'Clinica' },
    { id: 'link_anamnese', label: 'Link da anamnese',     example: 'https://clinica.app/anamnese/abc' },
    { id: 'endereco',      label: 'Endereco da clinica',  example: 'Rua X, 123 - Centro' },
    { id: 'link_maps',     label: 'Link Google Maps',     example: 'https://maps.app.goo.gl/xyz' },
    { id: 'menu_clinica',  label: 'Link menu da clinica', example: 'https://clinica.app/menu' },
    { id: 'status',        label: 'Status atual',         example: 'agendado' },
    { id: 'obs',           label: 'Observacoes',          example: '' },
  ]

  window.AgendaAutomationsService = Object.freeze({
    loadAll, save, remove, toggle,
    getActive, getByTrigger, getByCategory, getByStatus, getByTag, getByChannel,
    triggerKeyOf, getGroupedByTrigger,
    renderTemplate,
    TRIGGER_TYPES, RECIPIENT_TYPES, CHANNELS, CATEGORIES, TEMPLATE_VARS,
    TASK_ASSIGNEES, TASK_PRIORITIES, ALEXA_TARGETS,
  })
})()
