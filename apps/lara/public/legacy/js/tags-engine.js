;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Tags Automation Engine
//  Engine desacoplada de UI: aplica tags, valida regras,
//  dispara automações e registra histórico completo.
// ══════════════════════════════════════════════════════════════

const DB   = window.tagsDB
const KEYS = window.TAGS_STORAGE_KEYS

// ── Fire-and-forget RPC — nunca lança exceção para o chamador ─
// Suporta: retorno Promise, retorno síncrono, throw síncrono, _sbShared ausente.
function _rpcFire(name, params) {
  if (!window._sbShared) return
  try {
    var result = params !== undefined
      ? window._sbShared.rpc(name, params)
      : window._sbShared.rpc(name)
    if (result && typeof result.catch === 'function') result.catch(function(e) { console.warn("[tags-engine]", e.message || e) })
  } catch(e) {}
}

// ── Getters de dados ──────────────────────────────────────────
function _getGroups()      { const d = DB.get(KEYS.GROUPS);    return d.length ? d : _clone(window.TAG_GROUP_SEEDS) }
function _getTags()        { const d = DB.get(KEYS.TAGS);      return d.length ? d : _clone(window.TAG_SEEDS_V2) }
function _getMsgTpls()     { const d = DB.get(KEYS.TMPL_MSG);  return d.length ? d : _clone(window.MESSAGE_TEMPLATE_SEEDS) }
function _getAlertTpls()   { const d = DB.get(KEYS.TMPL_ALERT);return d.length ? d : _clone(window.ALERT_TEMPLATE_SEEDS) }
function _getTaskTpls()    { const d = DB.get(KEYS.TMPL_TASK); return d.length ? d : _clone(window.TASK_TEMPLATE_SEEDS) }
function _getFlows()       { const d = DB.get(KEYS.FLOWS);     return d.length ? d : _clone(window.FLOW_SEEDS) }
function _getEntityTags(eid, etype) { return DB.get(KEYS.ENTITY_TAGS).filter(et => et.entity_id===eid && et.entity_type===etype && et.ativo) }

function _findTag(id)          { return _getTags().find(t => t.id === id) }
function _findMsgTpl(id)       { return _getMsgTpls().find(t => t.id === id) }
function _findAlertTpl(id)     { return _getAlertTpls().find(t => t.id === id) }
function _findTaskTpl(id)      { return _getTaskTpls().find(t => t.id === id) }
function _findGroup(id)        { return _getGroups().find(g => g.id === id) }

function _clone(obj)           { return JSON.parse(JSON.stringify(obj)) }
function _uid()                { return Date.now().toString(36) + Math.random().toString(36).slice(2,7) }
function _now()                { return new Date().toISOString() }

// ── Mapeia formato Supabase → formato TagEngine (localStorage) ─
// sdr_get_tags_by_group retorna campos em inglês; TagEngine usa pt-BR
function _mapTagFromSb(t) {
  return {
    id:                t.slug || t.id,
    group_id:          t.group_slug,
    nome:              t.label,
    cor:               t.color,
    icone:             t.icon,
    kanban_coluna:     t.kanban_coluna,
    cor_calendario:    t.cor_calendario,
    msg_template_id:   t.msg_template_id,
    alert_template_id: t.alert_template_id,
    task_template_id:  t.task_template_id,
    proxima_acao:      t.proxima_acao,
    regras:            t.regras_aplicacao,
    incompativeis:     t.incompativeis || [],
    ativo:             t.is_active !== false,
    ordem:             t.sort_order || 0,
  }
}
// sdr_get_tag_groups retorna id UUID + slug; TagEngine usa slug como id
function _mapGroupFromSb(g) {
  return {
    id:        g.slug || g.id,
    nome:      g.nome,
    cor:       g.cor,
    icone:     g.icone,
    descricao: g.descricao,
    ordem:     g.ordem || 0,
    ativo:     g.ativo !== false,
  }
}
// sdr_get_templates_config usa row_to_json(t.*) → slug como id, conteudo vs corpo
function _mapMsgTplFromSb(t) {
  return { id: t.slug || t.id, nome: t.nome, canal: t.canal || 'whatsapp', corpo: t.conteudo || t.corpo || '', variaveis: t.variaveis || [], ativo: t.ativo !== false }
}
function _mapAlertTplFromSb(t) {
  return { id: t.slug || t.id, nome: t.nome, titulo: t.titulo || '', corpo: t.corpo || '', tipo: t.tipo || 'info', para: t.para || 'sdr', ativo: t.ativo !== false }
}
function _mapTaskTplFromSb(t) {
  return { id: t.slug || t.id, nome: t.nome, titulo: t.titulo || '', descricao: t.descricao || '', prazo_horas: t.prazo_horas || 24, prioridade: t.prioridade || 'normal', responsavel: t.responsavel || 'sdr', ativo: t.ativo !== false }
}

// ── Inicializar seeds ─────────────────────────────────────────
function ensureSeeds() {
  // Se os dados no localStorage estiverem no formato Supabase (antes do fix de mapeamento),
  // detecta e força reset com os seeds padrão
  var existingTags = DB.get(KEYS.TAGS)
  var tagsCorrupt  = existingTags.length > 0 && existingTags[0].label !== undefined && existingTags[0].nome === undefined
  var existingMsg  = DB.get(KEYS.TMPL_MSG)
  var msgCorrupt   = existingMsg.length > 0 && existingMsg[0].conteudo !== undefined && existingMsg[0].corpo === undefined
  if (tagsCorrupt) {
    DB.set(KEYS.TAGS,   _clone(window.TAG_SEEDS_V2))
    DB.set(KEYS.GROUPS, _clone(window.TAG_GROUP_SEEDS))
    console.info('[TagEngine] ensureSeeds: tags em formato Supabase detectadas — reset com seeds padrão')
  }
  if (msgCorrupt) {
    DB.set(KEYS.TMPL_MSG,   _clone(window.MESSAGE_TEMPLATE_SEEDS))
    DB.set(KEYS.TMPL_ALERT, _clone(window.ALERT_TEMPLATE_SEEDS))
    DB.set(KEYS.TMPL_TASK,  _clone(window.TASK_TEMPLATE_SEEDS))
    console.info('[TagEngine] ensureSeeds: templates em formato Supabase detectados — reset com seeds padrão')
  }

  if (!DB.get(KEYS.GROUPS).length)    DB.set(KEYS.GROUPS,    _clone(window.TAG_GROUP_SEEDS))
  if (!DB.get(KEYS.TAGS).length)      DB.set(KEYS.TAGS,      _clone(window.TAG_SEEDS_V2))
  if (!DB.get(KEYS.TMPL_MSG).length)  DB.set(KEYS.TMPL_MSG,  _clone(window.MESSAGE_TEMPLATE_SEEDS))
  if (!DB.get(KEYS.TMPL_ALERT).length)DB.set(KEYS.TMPL_ALERT,_clone(window.ALERT_TEMPLATE_SEEDS))
  if (!DB.get(KEYS.TMPL_TASK).length) DB.set(KEYS.TMPL_TASK, _clone(window.TASK_TEMPLATE_SEEDS))
  if (!DB.get(KEYS.FLOWS).length)     DB.set(KEYS.FLOWS,     _clone(window.FLOW_SEEDS))
  if (!DB.get(KEYS.OBJECTIONS).length)DB.set(KEYS.OBJECTIONS,_clone(window.BUDGET_OBJECTION_SEEDS))
  deduplicateTags()
}

// Remove duplicatas de tags: mesma group_id + nome (case-insensitive), mantém a seed ou a primeira salva
function deduplicateTags() {
  const tags = _getTags()
  const seen = {}
  const deduped = []
  tags.forEach(function(t) {
    const key = (t.group_id || '') + '||' + (t.nome || '').toLowerCase().trim()
    if (!seen[key]) { seen[key] = true; deduped.push(t) }
  })
  if (deduped.length !== tags.length) {
    DB.set(KEYS.TAGS, deduped)
    console.info('[TagEngine] deduplicateTags: removidas ' + (tags.length - deduped.length) + ' tags duplicadas')
  }
}

// ── Carregar configuração do Supabase → localStorage ─────────
// Chamado no startup. Sobrescreve localStorage com dados do
// Supabase, tornando Settings > Tags a fonte única de verdade.
async function loadConfigFromSupabase() {
  if (!window._sbShared) return

  // Coleta tudo em `pending` antes de tocar no localStorage.
  // Só persiste se não lançar exceção — garante que uma falha parcial
  // não deixa o cache em estado inconsistente (tudo ou nada).
  const pending = {}
  try {
    // Grupos
    const { data: groups } = await window._sbShared.rpc('sdr_get_tag_groups')
    if (groups && groups.length) pending.groups = groups.map(_mapGroupFromSb)

    // Tags por grupo
    const groupSlugs = (pending.groups || window.TAG_GROUP_SEEDS).map(function(g) { return g.slug || g.id })
    const allTags = []
    for (var i = 0; i < groupSlugs.length; i++) {
      const { data: tags } = await window._sbShared.rpc('sdr_get_tags_by_group', { p_group_slug: groupSlugs[i] })
      if (tags && tags.length) allTags.push.apply(allTags, tags)
    }
    if (allTags.length) pending.tags = allTags.map(_mapTagFromSb)

    // Templates
    const { data: msgTpls }   = await window._sbShared.rpc('sdr_get_templates_config', { p_type: 'msg' })
    if (msgTpls && msgTpls.length) pending.tmplMsg = msgTpls.map(_mapMsgTplFromSb)

    const { data: alertTpls } = await window._sbShared.rpc('sdr_get_templates_config', { p_type: 'alert' })
    if (alertTpls && alertTpls.length) pending.tmplAlert = alertTpls.map(_mapAlertTplFromSb)

    const { data: taskTpls }  = await window._sbShared.rpc('sdr_get_templates_config', { p_type: 'task' })
    if (taskTpls && taskTpls.length) pending.tmplTask = taskTpls.map(_mapTaskTplFromSb)

    // Commit atômico — só escreve no localStorage após todos os RPCs concluírem
    if (pending.groups)    DB.set(KEYS.GROUPS,    pending.groups)
    if (pending.tags)      DB.set(KEYS.TAGS,       pending.tags)
    if (pending.tmplMsg)   DB.set(KEYS.TMPL_MSG,   pending.tmplMsg)
    if (pending.tmplAlert) DB.set(KEYS.TMPL_ALERT, pending.tmplAlert)
    if (pending.tmplTask)  DB.set(KEYS.TMPL_TASK,  pending.tmplTask)

    console.info('[TagEngine] Config carregada do Supabase —',
      (pending.tags?.length||0) + ' tags,',
      (pending.tmplMsg?.length||0) + ' msg,',
      (pending.tmplAlert?.length||0) + ' alertas,',
      (pending.tmplTask?.length||0) + ' tarefas'
    )
  } catch(e) {
    console.warn('[TagEngine] Falha ao carregar config do Supabase — usando localStorage/seeds', e)
    // Nenhum dado parcial foi escrito (pending não chegou ao commit)
  }
}

// ── Log de automação ──────────────────────────────────────────
function _log(eid, etype, tagId, acao, resultado, detalhes) {
  const logs = DB.get(KEYS.AUTO_LOGS)
  logs.unshift({ id:_uid(), entity_id:eid, entity_type:etype, tag_id:tagId, acao, resultado, detalhes:detalhes||{}, created_at:_now() })
  if (logs.length > 500) logs.splice(500)
  DB.set(KEYS.AUTO_LOGS, logs)
}

// ── Histórico de tag ──────────────────────────────────────────
function _addHistory(eid, etype, tagId, tagNome, acao, por, motivo) {
  const hist = DB.get(KEYS.HISTORY)
  hist.unshift({ id:_uid(), entity_id:eid, entity_type:etype, tag_id:tagId, tag_nome:tagNome, acao, por:por||'sistema', motivo:motivo||'', created_at:_now() })
  DB.set(KEYS.HISTORY, hist)
}

// ── Criar alerta interno ──────────────────────────────────────
function _createAlert(tplId, eid, etype, vars) {
  const tpl = _findAlertTpl(tplId)
  if (!tpl) return

  const titulo = _interpolate(tpl.titulo, vars)
  const corpo  = _interpolate(tpl.corpo,  vars)

  // localStorage (cache local / fallback)
  const alerts = DB.get(KEYS.ALERTS)
  const local  = {
    id:_uid(), entity_id:eid, entity_type:etype, template_id:tplId,
    titulo, corpo, tipo:tpl.tipo, para:tpl.para, lido:false, created_at:_now()
  }
  alerts.unshift(local)
  DB.set(KEYS.ALERTS, alerts)
  if (window.onNewTagAlert) window.onNewTagAlert(local)

  // Supabase — fire-and-forget
  _rpcFire('sdr_create_internal_alert', {
    p_entity_type:   etype,
    p_entity_id:     eid,
    p_template_slug: tplId,
    p_titulo:        titulo,
    p_corpo:         corpo,
    p_tipo:          tpl.tipo,
    p_para:          tpl.para,
  })
}

// ── Criar tarefa operacional ──────────────────────────────────
function _createTask(tplId, eid, etype, vars) {
  const tpl = _findTaskTpl(tplId)
  if (!tpl) return
  const prazo = new Date(Date.now() + (tpl.prazo_horas||24) * 3600000).toISOString()
  const tasks = DB.get(KEYS.TASKS)
  tasks.unshift({
    id:_uid(), entity_id:eid, entity_type:etype, template_id:tplId,
    titulo: _interpolate(tpl.titulo, vars), descricao:tpl.descricao||'',
    para:tpl.para, prazo, status:'aberta', prioridade:tpl.prioridade||'normal', created_at:_now()
  })
  DB.set(KEYS.TASKS, tasks)
}

// ── Interpolar variáveis ──────────────────────────────────────
function _interpolate(text, vars) {
  if (!text) return ''
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars||{})[k] !== undefined ? (vars||{})[k] : `{{${k}}}`)
}

// ── Verificar compatibilidade ─────────────────────────────────
function _checkCompatibility(tagId, currentTagIds) {
  const tag = _findTag(tagId)
  if (!tag) return { ok:false, reason:'Tag não encontrada.' }
  const blocked = (tag.incompativeis||[]).filter(id => currentTagIds.includes(id))
  if (blocked.length) {
    const names = blocked.map(id => _findTag(id)?.nome || id).join(', ')
    return { ok:false, reason:`Incompatível com: ${names}` }
  }
  return { ok:true }
}

// ── Config global de automações ───────────────────────────────
function _getCfg() {
  return DB.getObj('clinic_tags_config', {
    auto_mensagens:true, auto_tarefas:true, auto_kanban:true,
    auto_alertas:true, auto_cor_agenda:true, auto_popups:false,
  })
}

// ══════════════════════════════════════════════════════════════
//  APLICAR TAG — Ponto de entrada principal
// ══════════════════════════════════════════════════════════════
function applyTag(eid, etype, tagId, appliedBy, vars) {
  const tag = _findTag(tagId)
  if (!tag) { console.warn('[TagEngine] Tag não encontrada:', tagId); return { ok:false, reason:'Tag não encontrada.' } }

  const current    = _getEntityTags(eid, etype)
  const currentIds = current.map(et => et.tag_id)

  // Já possui essa tag?
  if (currentIds.includes(tagId)) {
    _log(eid, etype, tagId, 'apply', 'ignorado', { reason:'já aplicada' })
    return { ok:true, ignored:true }
  }

  // Compatibilidade
  const compat = _checkCompatibility(tagId, currentIds)
  if (!compat.ok) {
    _log(eid, etype, tagId, 'apply', 'bloqueado', { reason:compat.reason })
    return { ok:false, reason:compat.reason }
  }

  // 1. Persistir entity_tag
  const entityTags = DB.get(KEYS.ENTITY_TAGS)
  entityTags.push({
    id:_uid(), entity_id:eid, entity_type:etype, tag_id:tagId,
    eh_principal: currentIds.length === 0,
    aplicado_por: appliedBy||'usuario', aplicado_em:_now(), ativo:true
  })
  DB.set(KEYS.ENTITY_TAGS, entityTags)

  // 2. Histórico
  _addHistory(eid, etype, tagId, tag.nome, 'aplicada', appliedBy||'usuario', '')

  // 3. Disparar automações
  _dispatch(eid, etype, tag, vars||{})

  // 4. Log
  _log(eid, etype, tagId, 'apply', 'sucesso', {})

  // 5. Notificar UI
  if (window.onTagApplied) window.onTagApplied(eid, etype, tagId)

  // 6. AutomationsEngine: dispatch on_tag rules
  if (window.AutomationsEngine) {
    AutomationsEngine.processTag(eid, etype, tagId, vars || {})
    // Camada 3: dispara campanha de mensagens vinculada a esta tag
    if (AutomationsEngine.dispatchCampaignForTag) {
      AutomationsEngine.dispatchCampaignForTag(eid, etype, tagId, vars || {})
    }
  }

  return { ok:true }
}

// ── Remover tag ───────────────────────────────────────────────
function removeTag(eid, etype, tagId, removedBy, motivo) {
  const tag        = _findTag(tagId)
  const entityTags = DB.get(KEYS.ENTITY_TAGS)
  const idx        = entityTags.findIndex(et => et.entity_id===eid && et.entity_type===etype && et.tag_id===tagId && et.ativo)
  if (idx < 0) return { ok:false, reason:'Tag não aplicada nesta entidade.' }

  entityTags[idx].ativo       = false
  entityTags[idx].removido_em = _now()
  DB.set(KEYS.ENTITY_TAGS, entityTags)

  _addHistory(eid, etype, tagId, tag?.nome||tagId, 'removida', removedBy||'usuario', motivo||'')
  _log(eid, etype, tagId, 'remove', 'sucesso', {})

  if (window.onTagApplied) window.onTagApplied(eid, etype, tagId)
  return { ok:true }
}

// ── Trocar tag (remove antiga, aplica nova) ───────────────────
function switchTag(eid, etype, oldTagId, newTagId, by, vars) {
  if (oldTagId) removeTag(eid, etype, oldTagId, by||'usuario', `Substituída por ${newTagId}`)
  return applyTag(eid, etype, newTagId, by||'usuario', vars||{})
}

// ── Buscar tags de uma entidade ───────────────────────────────
function getEntityTags(eid, etype) {
  return _getEntityTags(eid, etype).map(et => ({ ...et, tag: _findTag(et.tag_id) })).filter(et => et.tag)
}

// ── Dispatch de automações ────────────────────────────────────
function _dispatch(eid, etype, tag, vars) {
  const cfg = _getCfg()

  // Alerta interno
  if (tag.alert_template_id && cfg.auto_alertas) {
    try { _createAlert(tag.alert_template_id, eid, etype, vars) } catch(e) {}
  }

  // Tarefa operacional
  if (tag.task_template_id && cfg.auto_tarefas) {
    try { _createTask(tag.task_template_id, eid, etype, vars) } catch(e) {}
  }

  // Mensagem automática (log — integração real via futura API de WhatsApp)
  if (tag.msg_template_id && cfg.auto_mensagens) {
    const tpl = _findMsgTpl(tag.msg_template_id)
    if (tpl) _log(eid, etype, tag.id, 'mensagem_auto', 'enfileirada', { template:tpl.id, preview:_interpolate(tpl.corpo, vars).slice(0,80) })
  }

  // Kanban log
  if (tag.kanban_coluna && cfg.auto_kanban) {
    _log(eid, etype, tag.id, 'kanban_move', 'sucesso', { coluna:tag.kanban_coluna })
  }

  // Cor de calendário log
  if (tag.cor_calendario && cfg.auto_cor_agenda) {
    _log(eid, etype, tag.id, 'cor_calendario', 'sucesso', { cor:tag.cor_calendario })
  }
}

// ══════════════════════════════════════════════════════════════
//  CRUD helpers
// ══════════════════════════════════════════════════════════════
function _upsert(arr, item, keyField) {
  const idx = arr.findIndex(x => x[keyField||'id'] === item[keyField||'id'])
  if (idx >= 0) arr[idx] = item; else arr.push(item)
  return arr
}

// ── API pública ───────────────────────────────────────────────
window.TagEngine = {

  // Seeds + sync Supabase
  ensureSeeds,
  deduplicateTags,
  loadConfigFromSupabase,

  // Tag operations
  applyTag, removeTag, switchTag, getEntityTags,

  // Getters
  getGroups:      _getGroups,
  getTags:        _getTags,
  getMsgTpls:     _getMsgTpls,
  getAlertTpls:   _getAlertTpls,
  getTaskTpls:    _getTaskTpls,
  getFlows:       _getFlows,
  getAlerts:      () => DB.get(KEYS.ALERTS),
  getOpTasks:     () => DB.get(KEYS.TASKS),
  getHistory:     () => DB.get(KEYS.HISTORY),
  getLogs:        () => DB.get(KEYS.AUTO_LOGS),
  getBudgets:     () => DB.get(KEYS.BUDGETS),
  getObjections:  () => { const d=DB.get(KEYS.OBJECTIONS); return d.length?d:_clone(window.BUDGET_OBJECTION_SEEDS) },
  findTag:        _findTag,
  findGroup:      _findGroup,
  getCfg:         _getCfg,

  // CRUD grupos
  saveGroup(g) {
    const all = _getGroups(); DB.set(KEYS.GROUPS, _upsert(all, g))
    _rpcFire('sdr_upsert_tag_group', { p_data: g })
  },

  // CRUD tags
  saveTag(t) {
    const all = _getTags(); DB.set(KEYS.TAGS, _upsert(all, t))
    _rpcFire('sdr_upsert_tag_metadata', { p_tag_slug: t.id, p_data: t })
  },
  deleteTag(id){ DB.set(KEYS.TAGS, _getTags().filter(t=>t.id!==id)) },
  isDefaultTag(id) { return window.TAG_SEEDS_V2.some(s=>s.id===id) },

  // CRUD templates
  saveMsgTpl(t) {
    const all = _getMsgTpls(); DB.set(KEYS.TMPL_MSG, _upsert(all, t))
    _rpcFire('sdr_upsert_template', { p_type: 'msg', p_data: Object.assign({}, t, { slug: t.id }) })
  },
  saveAlertTpl(t) {
    const all = _getAlertTpls(); DB.set(KEYS.TMPL_ALERT, _upsert(all, t))
    _rpcFire('sdr_upsert_template', { p_type: 'alert', p_data: Object.assign({}, t, { slug: t.id }) })
  },
  saveTaskTpl(t) {
    const all = _getTaskTpls(); DB.set(KEYS.TMPL_TASK, _upsert(all, t))
    _rpcFire('sdr_upsert_template', { p_type: 'task', p_data: Object.assign({}, t, { slug: t.id, responsavel: t.para }) })
  },
  deleteMsgTpl(id) {
    DB.set(KEYS.TMPL_MSG, _getMsgTpls().filter(t=>t.id!==id))
    _rpcFire('sdr_delete_template', { p_type: 'msg', p_slug: id })
  },
  deleteAlertTpl(id) {
    DB.set(KEYS.TMPL_ALERT, _getAlertTpls().filter(t=>t.id!==id))
    _rpcFire('sdr_delete_template', { p_type: 'alert', p_slug: id })
  },
  deleteTaskTpl(id) {
    DB.set(KEYS.TMPL_TASK, _getTaskTpls().filter(t=>t.id!==id))
    _rpcFire('sdr_delete_template', { p_type: 'task', p_slug: id })
  },

  // CRUD fluxos
  saveFlow(f)  { const all=_getFlows(); DB.set(KEYS.FLOWS, _upsert(all,f)) },
  deleteFlow(id){ DB.set(KEYS.FLOWS, _getFlows().filter(f=>f.id!==id)) },

  // Alertas / Tarefas
  markAlertRead(alertId) {
    const all = DB.get(KEYS.ALERTS)
    const a   = all.find(x=>x.id===alertId)
    if (a) { a.lido=true; a.lido_em=_now() }
    DB.set(KEYS.ALERTS, all)
    _rpcFire('sdr_mark_alert_read', { p_alert_id: alertId })
  },
  markAllAlertsRead() {
    const all = DB.get(KEYS.ALERTS).map(a => ({...a, lido:true, lido_em:_now()}))
    DB.set(KEYS.ALERTS, all)
    _rpcFire('sdr_mark_all_alerts_read')
  },
  updateTaskStatus(taskId, status) {
    const all  = DB.get(KEYS.TASKS)
    const task = all.find(x=>x.id===taskId)
    if (task) { task.status=status; if (status==='concluida') task.concluida_em=_now() }
    DB.set(KEYS.TASKS, all)
  },

  // Orçamentos
  saveBudget(b) { const all=DB.get(KEYS.BUDGETS); b.updated_at=_now(); if(!b.id)b.id=_uid(); DB.set(KEYS.BUDGETS, _upsert(all,b)) },

  // Config
  saveCfg(cfg) { DB.set('clinic_tags_config', cfg) },

  // Utils
  uid:          _uid,
  interpolate:  _interpolate,
}

})()
