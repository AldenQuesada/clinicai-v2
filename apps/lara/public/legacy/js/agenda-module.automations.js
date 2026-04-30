/**
 * ClinicAI - Agenda Module - Tags + Fluxos (Automations)
 * Extraido de agenda-module.js (seam 7 - 2026-04-24). Pagina de regras
 * de automacoes WhatsApp agrupadas por modulo do funil (pre_agendamento,
 * agendamento, paciente, orcamento, paciente_orcamento, perdido).
 *
 * Expoe: renderAgendaTagsFluxos, _agendaSetAutoTab, _agendaSelectAuto,
 *        _agendaEditRule, _agendaNewRuleInGroup, _agendaReloadAuto
 * Dependencias globais: window.FAModules, window._sbShared, window.openFAShell
 */
;(function () {
  'use strict'

  // State local (scope do IIFE)
  let _autoCatTab = 'all'
  let _autoSelectedId = null
  let _autoRules = []
  let _autoLoaded = false

// ══════════════════════════════════════════════════════════════
//  TAGS E FLUXOS (agenda) — views as 6 modulos do Funil de Automacoes
//  Fonte: wa_agenda_automations (via AgendaAutomationsRepository)
//  Tabs replicadas de js/ui/funnel-automations/shell.ui.js MODULE_ORDER
// ══════════════════════════════════════════════════════════════
const _FA_MODULE_ORDER = ['pre_agendamento','agendamento','paciente','orcamento','paciente_orcamento','perdido']

// Labels para triggers (derivados dos statuses dos modulos, fallback generico)
function _autoTriggerLabel(rule) {
  if (!rule || !rule.trigger_type) return 'Sem gatilho'
  const cfg = rule.trigger_config || {}
  const mods = window.FAModules || {}
  if (rule.trigger_type === 'on_status') {
    const id = cfg.status || ''
    for (const mid of _FA_MODULE_ORDER) {
      const m = mods[mid]; if (!m || !m.statuses) continue
      const s = m.statuses.find(x => x.id === id)
      if (s) return s.label
    }
    return id || 'Status'
  }
  if (rule.trigger_type === 'on_tag') {
    const id = cfg.tag || ''
    for (const mid of _FA_MODULE_ORDER) {
      const m = mods[mid]; if (!m || !m.statuses) continue
      const s = m.statuses.find(x => x.id === id)
      if (s) return s.label
    }
    return id ? 'Tag: ' + id : 'Tag'
  }
  if (rule.trigger_type === 'd_before')      return 'D-' + (cfg.days || '?') + ' (antes da consulta)'
  if (rule.trigger_type === 'd_zero')        return 'Dia da consulta'
  if (rule.trigger_type === 'min_before')    return (cfg.minutes || '?') + ' min antes'
  if (rule.trigger_type === 'daily_summary') return 'Resumo diario'
  return rule.trigger_type
}

function _autoActiveChannels(rule) {
  const ch = String(rule && rule.channel || '')
  if (ch === 'all' || ch === 'both') return ['whatsapp','alexa','task','alert']
  const out = []
  if (ch.indexOf('whatsapp') >= 0) out.push('whatsapp')
  if (ch.indexOf('alexa') >= 0)    out.push('alexa')
  if (ch.indexOf('task') >= 0)     out.push('task')
  if (ch.indexOf('alert') >= 0)    out.push('alert')
  return out.length ? out : [ch || 'whatsapp']
}

function _autoChannelMeta(id) {
  return ({
    whatsapp: { icon: 'message-circle', color: '#10B981', label: 'WhatsApp' },
    alert:    { icon: 'bell',           color: '#F59E0B', label: 'Alerta' },
    task:     { icon: 'check-square',   color: '#3B82F6', label: 'Tarefa' },
    alexa:    { icon: 'volume-2',       color: '#8B5CF6', label: 'Alexa' },
  })[id] || { icon: 'circle', color: '#9CA3AF', label: id || '—' }
}

function _autoRulesForActiveTab() {
  if (_autoCatTab === 'all') return _autoRules
  const m = (window.FAModules || {})[_autoCatTab]
  if (!m || typeof m.matchesRule !== 'function') return []
  return _autoRules.filter(r => m.matchesRule(r))
}

function _autoGroupByTrigger(rules) {
  const groups = {}
  for (const r of rules) {
    const cfg = r.trigger_config || {}
    let key
    if (r.trigger_type === 'on_status')   key = 'status:' + (cfg.status || '?')
    else if (r.trigger_type === 'on_tag') key = 'tag:' + (cfg.tag || '?')
    else                                   key = 'time:' + (r.trigger_type || '?')
    if (!groups[key]) groups[key] = { key, label: _autoTriggerLabel(r), rules: [] }
    groups[key].rules.push(r)
  }
  return Object.values(groups).sort((a,b) => String(a.label).localeCompare(String(b.label)))
}

function _autoEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// Converte nomes camelCase (usados nos modulos FA) para kebab-case do feather-icons (standalone)
function _featherKebab(name) {
  if (!name) return 'circle'
  return String(name).replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
}

function _agendaSetAutoTab(tabId) {
  _autoCatTab = tabId
  _autoSelectedId = null
  renderAgendaTagsFluxos()
}

function _agendaSelectAuto(ruleId) {
  _autoSelectedId = _autoSelectedId === ruleId ? null : ruleId
  renderAgendaTagsFluxos()
}

async function _agendaReloadAuto(keepSelectedId) {
  try {
    const repo = window.AgendaAutomationsRepository
    if (repo) {
      const res = await repo.list()
      _autoRules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
    }
  } catch (e) {}
  _autoLoaded = true
  if (keepSelectedId && !_autoRules.some(r => r.id === keepSelectedId)) _autoSelectedId = null
  else if (keepSelectedId) _autoSelectedId = keepSelectedId
  renderAgendaTagsFluxos()
}

// Traduz a chave do grupo (status:na_clinica | tag:encaixe | time:d_before) em prefill do editor
function _autoPrefillFromGroupKey(key) {
  const mods = window.FAModules || {}
  if (!key) return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento' }
  if (key.indexOf('status:') === 0) {
    const status = key.slice(7)
    let category = _autoCatTab !== 'all' ? _autoCatTab : null
    if (!category) {
      for (const mid of _FA_MODULE_ORDER) {
        const m = mods[mid]
        if (m && m.statuses && m.statuses.some(s => s.id === status)) { category = mid; break }
      }
    }
    return { category: category || 'agendamento', trigger_type: 'on_status', trigger_config: { status } }
  }
  if (key.indexOf('tag:') === 0) {
    const tag = key.slice(4)
    return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento', trigger_type: 'on_tag', trigger_config: { tag } }
  }
  if (key.indexOf('time:') === 0) {
    const t = key.slice(5)
    return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento', trigger_type: t, trigger_config: {} }
  }
  return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento' }
}

function _agendaEditRule(ruleId) {
  if (!window.FAEditor) { if (window._showToast) _showToast('Editor', 'Editor nao carregado', 'warn'); return }
  window.FAEditor.open(ruleId, { onSave: () => _agendaReloadAuto(ruleId) })
}

function _agendaNewRuleInGroup(groupKey) {
  if (!window.FAEditor) { if (window._showToast) _showToast('Editor', 'Editor nao carregado', 'warn'); return }
  const prefill = _autoPrefillFromGroupKey(groupKey)
  window.FAEditor.open(null, { prefill, onSave: (saved) => _agendaReloadAuto(saved && saved.id) })
}

function _autoGroupKeyOf(rule) {
  if (!rule) return null
  const cfg = rule.trigger_config || {}
  if (rule.trigger_type === 'on_status') return 'status:' + (cfg.status || '?')
  if (rule.trigger_type === 'on_tag')    return 'tag:' + (cfg.tag || '?')
  return 'time:' + (rule.trigger_type || '?')
}

function _autoRuleContentSummary(r) {
  const activeCh = _autoActiveChannels(r)
  const sections = []
  if (activeCh.includes('whatsapp') && r.content_template) {
    const txt = String(r.content_template).slice(0, 120) + (r.content_template.length > 120 ? '…' : '')
    sections.push(`<div style="font-size:11px;color:#374151;background:#F0FDF4;border-left:3px solid #25D366;padding:8px 10px;border-radius:5px;white-space:pre-wrap;line-height:1.5">${_autoEsc(txt)}</div>`)
  }
  if (activeCh.includes('alexa') && r.alexa_message) {
    const txt = String(r.alexa_message).slice(0, 120) + (r.alexa_message.length > 120 ? '…' : '')
    sections.push(`<div style="font-size:11px;color:#374151;background:#ECFEFF;border-left:3px solid #1FCCB2;padding:8px 10px;border-radius:5px">${_autoEsc(txt)}</div>`)
  }
  if (activeCh.includes('task') && r.task_title) {
    sections.push(`<div style="font-size:11px;color:#374151;background:#F0FDF4;border-left:3px solid #10B981;padding:8px 10px;border-radius:5px"><b>${_autoEsc(r.task_title)}</b> · ${_autoEsc(r.task_assignee || 'sdr')} · ${r.task_deadline_hours || 24}h</div>`)
  }
  if (activeCh.includes('alert') && r.alert_title) {
    sections.push(`<div style="font-size:11px;color:#374151;background:#FFFBEB;border-left:3px solid #F59E0B;padding:8px 10px;border-radius:5px"><b>${_autoEsc(r.alert_title)}</b> · ${_autoEsc(r.alert_type || 'info')}</div>`)
  }
  return sections
}

function _autoRenderDrawer() {
  const selected = _autoRules.find(x => x.id === _autoSelectedId)
  if (!selected) return ''
  const groupKey = _autoGroupKeyOf(selected)
  const siblings = _autoRules.filter(r => _autoGroupKeyOf(r) === groupKey)
  const triggerLabel = _autoTriggerLabel(selected)
  const activeN = siblings.filter(r => r.is_active).length

  return `
    <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden;align-self:start;position:sticky;top:80px;max-height:calc(100vh - 110px);overflow-y:auto">
      <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">
        <i data-feather="zap" style="width:14px;height:14px;color:#7C3AED"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(triggerLabel)}</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${siblings.length} regra${siblings.length===1?'':'s'} · ${activeN} ativa${activeN===1?'':'s'}</div>
        </div>
        <button onclick="window._agendaSelectAuto(null)" title="Fechar" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
          <i data-feather="x" style="width:16px;height:16px"></i>
        </button>
      </div>

      <div style="padding:12px 16px;border-bottom:1px solid #F3F4F6">
        <button onclick="window._agendaNewRuleInGroup('${_autoEsc(groupKey)}')" style="width:100%;padding:10px 12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-feather="plus" style="width:12px;height:12px"></i> Nova regra neste grupo
        </button>
      </div>

      <div style="display:flex;flex-direction:column">
        ${siblings.map(r => {
          const isSel = r.id === _autoSelectedId
          const activeCh = _autoActiveChannels(r)
          const chBadges = activeCh.map(c => {
            const m = _autoChannelMeta(c)
            return `<div title="${m.label}" style="width:20px;height:20px;border-radius:5px;background:${m.color}18;display:flex;align-items:center;justify-content:center">
              <i data-feather="${m.icon}" style="width:10px;height:10px;color:${m.color}"></i>
            </div>`
          }).join('')
          const sections = _autoRuleContentSummary(r)
          return `
            <div style="border-bottom:1px solid #F9FAFB;${isSel?'background:#F5F3FF':''}">
              <div style="padding:11px 16px 8px;display:flex;align-items:flex-start;gap:8px">
                <div style="width:8px;height:8px;border-radius:50%;background:${r.is_active?'#10B981':'#D1D5DB'};flex-shrink:0;margin-top:5px"></div>
                <div onclick="window._agendaSelectAuto('${r.id}')" style="flex:1;min-width:0;cursor:pointer">
                  <div style="font-size:12.5px;font-weight:700;color:#111827">${_autoEsc(r.name || 'Sem nome')}</div>
                  ${r.description ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${_autoEsc(r.description)}</div>` : ''}
                </div>
                <div style="display:flex;gap:3px;flex-shrink:0">${chBadges}</div>
                <button onclick="window._agendaEditRule('${r.id}')" title="Editar regra" style="background:#EEF2FF;border:1px solid #E0E7FF;cursor:pointer;color:#4338CA;padding:5px 7px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700">
                  <i data-feather="edit-2" style="width:11px;height:11px"></i>
                </button>
              </div>
              ${sections.length ? `<div style="padding:0 16px 10px;display:flex;flex-direction:column;gap:6px">${sections.join('')}</div>` : ''}
            </div>`
        }).join('')}
      </div>

      <div style="padding:10px 16px;border-top:1px solid #F3F4F6;background:#FAFAFA">
        <button onclick="if(window.navigateTo){window.navigateTo('funnel-automations')}else{location.hash='funnel-automations'}" style="width:100%;padding:8px 12px;background:#fff;color:#4338CA;border:1px solid #E0E7FF;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-feather="external-link" style="width:11px;height:11px"></i> Abrir no Funil
        </button>
      </div>
    </div>`
}

async function renderAgendaTagsFluxos() {
  const root = document.getElementById('agenda-tags-root')
  if (!root) return

  // 1a renderizacao: carrega regras de wa_agenda_automations
  if (!_autoLoaded) {
    root.innerHTML = `<div style="padding:48px;text-align:center;color:#9CA3AF;font-size:13px">Carregando automações…</div>`
    try {
      const repo = window.AgendaAutomationsRepository
      if (repo) {
        const res = await repo.list()
        _autoRules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
      } else {
        _autoRules = []
      }
    } catch (e) {
      _autoRules = []
    }
    _autoLoaded = true
  }

  // Mantido apenas para o bloco informativo "Tags do grupo Agendamento"
  const hasTagEngine = !!window.TagEngine
  const agTags = hasTagEngine ? TagEngine.getTags().filter(t => t.group_id === 'agendamento') : []

  const mods = window.FAModules || {}
  // Tabs dinamicas: Todas + modulos carregados na ordem MODULE_ORDER
  const tabs = [{ id: 'all', label: 'Todas', color: '#6B7280', icon: 'grid', count: _autoRules.length }]
  _FA_MODULE_ORDER.forEach(id => {
    const m = mods[id]; if (!m) return
    const count = _autoRules.filter(r => m.matchesRule(r)).length
    tabs.push({ id, label: m.label, color: m.color, icon: _featherKebab(m.icon), count })
  })

  const visible = _autoRulesForActiveTab()
  const groups  = _autoGroupByTrigger(visible).filter(g => g.rules.some(r => r.is_active))
  const activeMod = _autoCatTab !== 'all' ? mods[_autoCatTab] : null
  const headerColor = activeMod ? activeMod.color : '#6B7280'
  const headerLabel = activeMod ? activeMod.label : 'Todas as fases'

  root.innerHTML = `
    <div style="max-width:1180px;margin:0 auto;padding:28px 24px">

      <!-- Header -->
      <div style="margin-bottom:18px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Tags e Fluxos da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Visao consolidada das automacoes da agenda, agrupadas pelos gatilhos do funil.</p>
        </div>
        <button onclick="if(window.navigateTo){window.navigateTo('funnel-automations')}else{location.hash='funnel-automations'}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="settings" style="width:13px;height:13px"></i> Configurar funil
        </button>
      </div>

      <!-- Tabs dos modulos do funil + Todas -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;border-bottom:1px solid #E5E7EB;padding-bottom:0">
        ${tabs.map(t => {
          const active = _autoCatTab === t.id
          return `
            <button onclick="window._agendaSetAutoTab('${t.id}')" style="
              display:inline-flex;align-items:center;gap:6px;padding:9px 14px;
              background:${active?'#fff':'transparent'};
              border:1px solid ${active?'#E5E7EB':'transparent'};
              border-bottom:2px solid ${active?t.color:'transparent'};
              border-radius:8px 8px 0 0;
              font-size:12.5px;font-weight:${active?'700':'600'};
              color:${active?t.color:'#6B7280'};
              cursor:pointer;margin-bottom:-1px">
              <i data-feather="${t.icon}" style="width:12px;height:12px"></i>
              ${t.label}
              <span style="background:${active?t.color+'18':'#F3F4F6'};color:${active?t.color:'#9CA3AF'};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">${t.count}</span>
            </button>`
        }).join('')}
      </div>

      <!-- Corpo: lista + drawer lateral -->
      <div style="display:grid;grid-template-columns:1fr ${_autoSelectedId?'380px':'0px'};gap:${_autoSelectedId?'16px':'0'};transition:grid-template-columns .2s">

        <!-- Coluna 1: grupos por trigger -->
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <div style="width:4px;height:18px;border-radius:2px;background:${headerColor}"></div>
            <div style="font-size:14px;font-weight:700;color:#111827">${_autoEsc(headerLabel)}</div>
            <div style="font-size:11px;color:#9CA3AF">· ${visible.length} regra${visible.length===1?'':'s'} · ${groups.length} gatilho${groups.length===1?'':'s'}</div>
          </div>

          ${groups.length === 0 ? `
            <div style="padding:60px 24px;text-align:center;background:#fff;border:1px dashed #E5E7EB;border-radius:12px">
              <i data-feather="inbox" style="width:28px;height:28px;color:#D1D5DB"></i>
              <div style="font-size:13px;color:#6B7280;margin-top:10px;font-weight:600">Nenhuma regra nesta fase</div>
              <div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">Crie automacoes em <b style="color:#7C3AED">Configurar funil</b>.</div>
            </div>
          ` : groups.map(g => {
            const activeN = g.rules.filter(r => r.is_active).length
            const pausedN = g.rules.length - activeN
            const chCountG = { whatsapp:0, alexa:0, task:0, alert:0 }
            for (const r of g.rules) {
              if (!r.is_active) continue
              for (const c of _autoActiveChannels(r)) chCountG[c] = (chCountG[c]||0) + 1
            }
            const chBadgesG = Object.keys(chCountG).filter(c => chCountG[c] > 0).map(c => {
              const m = _autoChannelMeta(c)
              return `<div title="${m.label}: ${chCountG[c]}" style="display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:6px;background:${m.color}18">
                <i data-feather="${_featherKebab(m.icon)}" style="width:11px;height:11px;color:${m.color}"></i>
                <span style="font-size:10px;font-weight:700;color:${m.color}">${chCountG[c]}</span>
              </div>`
            }).join('')
            return `
            <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:12px;overflow:hidden">
              <div style="padding:11px 16px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">
                <i data-feather="zap" style="width:12px;height:12px;color:${headerColor}"></i>
                <div style="font-size:12px;font-weight:700;color:#374151">${_autoEsc(g.label)}</div>
                <span style="font-size:10px;color:#166534;background:#DCFCE7;padding:2px 7px;border-radius:10px;font-weight:700">${activeN} ativa${activeN===1?'':'s'}</span>
                ${pausedN ? `<span style="font-size:10px;color:#9CA3AF;background:#F3F4F6;padding:2px 7px;border-radius:10px;font-weight:700">${pausedN} pausada${pausedN===1?'':'s'}</span>` : ''}
                <div style="flex:1"></div>
                <div style="display:flex;gap:4px;flex-shrink:0">${chBadgesG}</div>
                <button onclick="event.stopPropagation();window._agendaNewRuleInGroup('${_autoEsc(g.key)}')" title="Nova regra neste grupo" style="background:#fff;border:1px solid #E0E7FF;color:#4338CA;padding:4px 8px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700">
                  <i data-feather="plus" style="width:11px;height:11px"></i> Nova
                </button>
              </div>
              <div>
                ${g.rules.map(r => {
                  const selected = _autoSelectedId === r.id
                  const activeCh = _autoActiveChannels(r)
                  return `
                    <div style="
                      padding:11px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:10px;
                      background:${selected?'#F5F3FF':'transparent'};
                      border-left:3px solid ${selected?'#7C3AED':'transparent'}">
                      <div style="width:8px;height:8px;border-radius:50%;background:${r.is_active?'#10B981':'#D1D5DB'};flex-shrink:0"></div>
                      <div onclick="window._agendaSelectAuto('${r.id}')" style="flex:1;min-width:0;cursor:pointer">
                        <div style="font-size:12.5px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(r.name || 'Sem nome')}</div>
                        <div style="font-size:10.5px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(r.description || '—')}</div>
                      </div>
                      <div style="display:flex;gap:3px;flex-shrink:0">
                        ${activeCh.map(c => {
                          const meta = _autoChannelMeta(c)
                          return `<div title="${meta.label}" style="width:22px;height:22px;border-radius:6px;background:${meta.color}18;display:flex;align-items:center;justify-content:center">
                            <i data-feather="${meta.icon}" style="width:11px;height:11px;color:${meta.color}"></i>
                          </div>`
                        }).join('')}
                      </div>
                      <span style="font-size:9.5px;padding:2px 7px;border-radius:5px;background:${r.is_active?'#DCFCE7':'#F3F4F6'};color:${r.is_active?'#166534':'#9CA3AF'};font-weight:700;flex-shrink:0">${r.is_active?'ON':'OFF'}</span>
                      <button onclick="event.stopPropagation();window._agendaEditRule('${r.id}')" title="Editar regra" style="background:#EEF2FF;border:1px solid #E0E7FF;color:#4338CA;padding:5px 7px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;flex-shrink:0">
                        <i data-feather="edit-2" style="width:11px;height:11px"></i>
                      </button>
                    </div>`
                }).join('')}
              </div>
            </div>`
          }).join('')}
        </div>

        <!-- Coluna 2: drawer de detalhe -->
        ${_autoSelectedId ? _autoRenderDrawer() : ''}
      </div>

      <!-- Tags do grupo Agendamento (informativo) -->
      ${agTags.length ? `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden;margin-top:24px">
          <div style="padding:13px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
              <i data-feather="tag" style="width:13px;height:13px;color:#3B82F6"></i> Tags — Grupo Agendamento
            </div>
            <button onclick="if(window.renderSettingsTags){location.hash='settings-tags';renderSettingsTags()}" style="font-size:11px;color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px">
              <i data-feather="settings" style="width:11px;height:11px"></i> Configurar
            </button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0">
            ${agTags.map(tag => {
              const rulesForStatus = _autoRules.filter(r => r.is_active && r.trigger_type === 'on_status' && (r.trigger_config||{}).status === tag.id)
              const chCount = { whatsapp:0, alexa:0, task:0, alert:0 }
              for (const r of rulesForStatus) {
                for (const c of _autoActiveChannels(r)) chCount[c] = (chCount[c]||0) + 1
              }
              const badges = Object.keys(chCount).filter(c => chCount[c] > 0).map(c => {
                const m = _autoChannelMeta(c)
                return `<div title="${m.label}: ${chCount[c]}" style="width:22px;height:22px;border-radius:5px;background:${m.color}18;display:flex;align-items:center;justify-content:center">
                  <i data-feather="${_featherKebab(m.icon)}" style="width:11px;height:11px;color:${m.color}"></i>
                </div>`
              }).join('')
              return `
                <div style="padding:11px 16px;border-bottom:1px solid #F9FAFB;border-right:1px solid #F9FAFB;display:flex;align-items:center;gap:10px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${tag.cor||'#9CA3AF'};flex-shrink:0"></div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#111827">${_autoEsc(tag.nome)}</div>
                    <div style="font-size:10.5px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(tag.regras||'')}</div>
                  </div>
                  <div style="display:flex;gap:3px;flex-shrink:0">${badges || '<span style="font-size:10px;color:#D1D5DB">sem regra</span>'}</div>
                </div>`
            }).join('')}
          </div>
        </div>
      ` : ''}

    </div>`
  if (typeof featherIn === 'function') featherIn(root)
}



  // Expose (compat com onclick inline e callers externos)
  window.renderAgendaTagsFluxos = renderAgendaTagsFluxos
  window._agendaSetAutoTab      = _agendaSetAutoTab
  window._agendaSelectAuto      = _agendaSelectAuto
  window._agendaEditRule        = _agendaEditRule
  window._agendaNewRuleInGroup  = _agendaNewRuleInGroup
  if (typeof _agendaReloadAuto === 'function') {
    window._agendaReloadAuto = _agendaReloadAuto
  }

  window.AgendaModuleAutomations = Object.freeze({
    render:           renderAgendaTagsFluxos,
    setAutoTab:       _agendaSetAutoTab,
    selectAuto:       _agendaSelectAuto,
    editRule:         _agendaEditRule,
    newRuleInGroup:   _agendaNewRuleInGroup
  })
})()
