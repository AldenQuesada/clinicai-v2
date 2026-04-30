;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Tags e Fluxos
//  Hierarquia: Dashboard → Fase do Funil → Tags|Fluxos|Mensagens|Alertas|Tarefas|Kanban
// ══════════════════════════════════════════════════════════════

// ── Configuração de fases do funil ───────────────────────────
const _PHASES = [
  { id:'pre_agendamento', label:'Captação',         icon:'user-plus',   cor:'#3B82F6', desc:'Leads em captação — antes do primeiro agendamento' },
  { id:'agendamento',     label:'Agendamento',      icon:'calendar',    cor:'#8B5CF6', desc:'Consulta ou procedimento agendado' },
  { id:'paciente',        label:'Paciente',          icon:'heart',       cor:'#10B981', desc:'Procedimento realizado — paciente ativo' },
  { id:'pac_orcamento',   label:'Pac. + Orçamento',  icon:'file-text',   cor:'#F59E0B', desc:'Saiu com orçamento após consulta' },
  { id:'orcamento',       label:'Orçamentos',        icon:'dollar-sign', cor:'#EF4444', desc:'Negociações e orçamentos em aberto' },
]

// ── Estado de navegação ───────────────────────────────────────
let _activePhase = null              // null = dashboard | id da fase
let _phaseTab    = 'tags'            // tags | fluxos | mensagens | alertas | tarefas | kanban
let _tplTab      = 'msg'             // usado em forms (compatibilidade)
let _tagsTab     = 'pre_agendamento' // legado — compatibilidade com forms
let _kanbanGroup = 'pre_agendamento' // legado
let _subScreen   = 'dashboard'       // legado — apenas para compatibilidade

// Estado do modal de checkout
let _coProcs   = []
let _coBudget  = []

// ══════════════════════════════════════════════════════════════
//  RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderSettingsTags() {
  const page = document.getElementById('page-settings-tags')
  if (!page) return
  if (!window.TagEngine) return
  TagEngine.ensureSeeds()
  TagEngine.deduplicateTags()
  _ensureModal()

  const content = _activePhase === null
    ? _screenDashboard()
    : _screenPhase(_activePhase)

  page.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:24px">
      ${_mainNav()}
      ${_activePhase ? _phaseSubNav(_activePhase) : ''}
      <div id="tags-sub-content">${content}</div>
    </div>`
  featherIn(page)
}

// ── Navegação principal (fases do funil) ──────────────────────
function _mainNav() {
  const badge = TagEngine.getAlerts().filter(a=>!a.lido).length
               + TagEngine.getOpTasks().filter(t=>t.status==='aberta').length

  return `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:24px;border-bottom:1px solid #F3F4F6;padding-bottom:16px;overflow-x:auto;scrollbar-width:none">
      <div style="display:flex;gap:4px;flex:1;min-width:0">

        <button onclick="tagsSetPhase(null)"
          style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:none;border-radius:8px;font-size:12px;flex-shrink:0;white-space:nowrap;cursor:pointer;transition:.15s;
          font-weight:${_activePhase===null?'700':'600'};background:${_activePhase===null?'#7C3AED':'transparent'};color:${_activePhase===null?'#fff':'#6B7280'}">
          <i data-feather="layout" style="width:13px;height:13px"></i>Dashboard
          ${badge>0?`<span style="background:#EF4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700">${badge}</span>`:''}
        </button>

        <div style="width:1px;background:#E5E7EB;margin:4px 2px;flex-shrink:0"></div>

        ${_PHASES.map(ph => {
          const active = _activePhase === ph.id
          const count  = TagEngine.getTags().filter(t=>t.group_id===ph.id).length
          return `<button onclick="tagsSetPhase('${ph.id}')"
            style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:none;border-radius:8px;font-size:12px;flex-shrink:0;white-space:nowrap;cursor:pointer;transition:.15s;
            font-weight:${active?'700':'600'};background:${active?ph.cor:'transparent'};color:${active?'#fff':'#6B7280'}">
            <i data-feather="${ph.icon}" style="width:13px;height:13px"></i>${ph.label}
            <span style="padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;
              background:${active?'rgba(255,255,255,.25)':'#F3F4F6'};color:${active?'#fff':'#9CA3AF'}">${count}</span>
          </button>`
        }).join('')}

      </div>
      <button onclick="tagsOpenTagForm(null,tagsGetActivePhase())"
        style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:13px;height:13px"></i> Nova Tag
      </button>
    </div>`
}

// ── Sub-navegação dentro da fase ──────────────────────────────
function _phaseSubNav(phaseId) {
  const ph   = _PHASES.find(p=>p.id===phaseId) || _PHASES[0]
  const tabs = [
    { id:'tags',      icon:'tag',            label:'Tags',      count: TagEngine.getTags().filter(t=>t.group_id===phaseId).length },
    { id:'fluxos',    icon:'git-branch',     label:'Fluxos',    count: TagEngine.getFlows().filter(f=>f.group_id===phaseId).length },
    { id:'mensagens', icon:'message-circle', label:'Mensagens', count: _phaseMsgTpls(phaseId).length },
    { id:'alertas',   icon:'bell',           label:'Alertas',   count: _phaseAlertTpls(phaseId).length },
    { id:'tarefas',   icon:'check-square',   label:'Tarefas',   count: _phaseTaskTpls(phaseId).length },
    { id:'kanban',    icon:'trello',         label:'Kanban',    count: null },
  ]
  return `
    <div style="display:flex;align-items:center;gap:3px;margin-bottom:20px;padding:3px;background:#F9FAFB;border-radius:10px;overflow-x:auto;scrollbar-width:none;width:fit-content">
      ${tabs.map(t => {
        const active = _phaseTab === t.id
        return `<button onclick="tagsSetPhaseTab('${t.id}')"
          style="display:flex;align-items:center;gap:5px;padding:7px 13px;border:none;border-radius:8px;font-size:12px;white-space:nowrap;cursor:pointer;transition:.15s;
          font-weight:${active?'700':'500'};background:${active?'#fff':'transparent'};color:${active?ph.cor:'#9CA3AF'};
          box-shadow:${active?'0 1px 4px rgba(0,0,0,.08)':'none'}">
          <i data-feather="${t.icon}" style="width:12px;height:12px"></i>${t.label}
          ${t.count!==null?`<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;
            background:${active?ph.cor+'18':'#E5E7EB'};color:${active?ph.cor:'#9CA3AF'}">${t.count}</span>`:''}
        </button>`
      }).join('')}
    </div>`
}

// ── Helpers de templates por fase ────────────────────────────
function _phaseMsgTpls(phaseId) {
  const ids = new Set(TagEngine.getTags().filter(t=>t.group_id===phaseId).map(t=>t.msg_template_id).filter(Boolean))
  return TagEngine.getMsgTpls().filter(t=>ids.has(t.id))
}
function _phaseAlertTpls(phaseId) {
  const ids = new Set(TagEngine.getTags().filter(t=>t.group_id===phaseId).map(t=>t.alert_template_id).filter(Boolean))
  return TagEngine.getAlertTpls().filter(t=>ids.has(t.id))
}
function _phaseTaskTpls(phaseId) {
  const ids = new Set(TagEngine.getTags().filter(t=>t.group_id===phaseId).map(t=>t.task_template_id).filter(Boolean))
  return TagEngine.getTaskTpls().filter(t=>ids.has(t.id))
}

// ── Helper de acesso a fase ativa ─────────────────────────────
function tagsGetActivePhase() { return _activePhase || 'pre_agendamento' }

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
function _screenDashboard() {
  const groups   = TagEngine.getGroups()
  const tags     = TagEngine.getTags()
  const alerts   = TagEngine.getAlerts()
  const tasks    = TagEngine.getOpTasks()
  const logs     = TagEngine.getLogs()
  const unread   = alerts.filter(a=>!a.lido)
  const openT    = tasks.filter(t=>t.status==='aberta')
  const urgentT  = openT.filter(t=>t.prioridade==='urgente')
  const recentLg = logs.slice(0,8)

  const statCards = [
    { label:'Tags Cadastradas', value:tags.length,            icon:'tag',          cor:'#7C3AED' },
    { label:'Alertas não lidos', value:unread.length,         icon:'bell',         cor:'#EF4444' },
    { label:'Tarefas abertas',  value:openT.length,           icon:'check-square', cor:'#F59E0B' },
    { label:'Urgentes',         value:urgentT.length,          icon:'alert-circle', cor:'#DC2626' },
    { label:'Templates msg.',   value:TagEngine.getMsgTpls().length,  icon:'message-circle', cor:'#3B82F6' },
    { label:'Fluxos ativos',    value:TagEngine.getFlows().filter(f=>f.ativo).length, icon:'git-branch', cor:'#10B981' },
  ]

  const priorBadge = p => ({ urgente:'#DC2626', alta:'#EF4444', normal:'#F59E0B', baixa:'#9CA3AF' })[p]||'#9CA3AF'
  const tipoCor    = t => ({ error:'#EF4444', warning:'#F59E0B', success:'#10B981', info:'#3B82F6' })[t]||'#6B7280'
  const fmtDate    = d => { if(!d) return ''; try { return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) } catch{return d} }

  return `
    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px">
      ${statCards.map(s=>`
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:16px">
          <div style="width:34px;height:34px;border-radius:9px;background:${s.cor}15;display:flex;align-items:center;justify-content:center;margin-bottom:10px">
            <i data-feather="${s.icon}" style="width:16px;height:16px;color:${s.cor}"></i>
          </div>
          <div style="font-size:26px;font-weight:800;color:#111827">${s.value}</div>
          <div style="font-size:11px;color:#9CA3AF;font-weight:500;margin-top:2px">${s.label}</div>
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Alertas recentes -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:7px">
            <i data-feather="bell" style="width:14px;height:14px;color:#EF4444"></i> Alertas Recentes
            ${unread.length?`<span style="background:#EF4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">${unread.length} novos</span>`:''}
          </div>
          ${unread.length?`<button onclick="TagEngine.markAllAlertsRead();renderSettingsTags()" style="font-size:11px;color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:600">Marcar todos lidos</button>`:''}
        </div>
        ${alerts.slice(0,7).length ? alerts.slice(0,7).map(a=>`
          <div style="padding:10px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:flex-start;gap:10px;${!a.lido?'background:#FEFCE8':''}"
               onclick="TagEngine.markAlertRead('${a.id}');renderSettingsTags()">
            <div style="width:8px;height:8px;border-radius:50%;background:${tipoCor(a.tipo)};flex-shrink:0;margin-top:4px"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:${a.lido?'500':'700'};color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.titulo}</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${fmtDate(a.created_at)}</div>
            </div>
          </div>`).join('')
          : `<div style="padding:32px;text-align:center;color:#D1D5DB;font-size:12px">Nenhum alerta</div>`}
      </div>

      <!-- Tarefas urgentes -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6">
          <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:7px">
            <i data-feather="check-square" style="width:14px;height:14px;color:#F59E0B"></i> Tarefas Abertas
          </div>
        </div>
        ${openT.slice(0,7).length ? openT.slice(0,7).map(t=>`
          <div style="padding:10px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:10px">
            <input type="checkbox" onclick="TagEngine.updateTaskStatus('${t.id}','concluida');renderSettingsTags()"
              style="width:15px;height:15px;cursor:pointer;accent-color:#7C3AED">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.titulo}</div>
              <div style="font-size:11px;color:#9CA3AF">${(window.TAREFA_PARA_OPTS||[]).find(o=>o.id===t.para)?.nome||t.para}</div>
            </div>
            <span style="font-size:10px;padding:2px 8px;border-radius:6px;background:${priorBadge(t.prioridade)}22;color:${priorBadge(t.prioridade)};font-weight:700">${t.prioridade||'normal'}</span>
          </div>`).join('')
          : `<div style="padding:32px;text-align:center;color:#D1D5DB;font-size:12px">Nenhuma tarefa aberta</div>`}
      </div>

    </div>

    <!-- Log de automações -->
    ${recentLg.length ? `
    <div style="margin-top:16px;background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:7px">
        <i data-feather="activity" style="width:14px;height:14px;color:#7C3AED"></i> Log de Automações Recentes
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0">
        ${recentLg.map(l=>{
          const res = l.resultado==='sucesso'?'#10B981':l.resultado==='erro'?'#EF4444':'#9CA3AF'
          return `<div style="padding:10px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:8px">
            <div style="width:6px;height:6px;border-radius:50%;background:${res};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <span style="font-size:11.5px;color:#374151;font-weight:600">${l.acao}</span>
              <span style="font-size:10.5px;color:#9CA3AF;margin-left:5px">${l.tag_id||''}</span>
            </div>
            <span style="font-size:10px;color:#D1D5DB">${fmtDate(l.created_at)}</span>
          </div>`}).join('')}
      </div>
    </div>` : ''}
  `
}

// ══════════════════════════════════════════════════════════════
//  TELA DE FASE (roteador de sub-tabs)
// ══════════════════════════════════════════════════════════════
function _screenPhase(phaseId) {
  const ph  = _PHASES.find(p=>p.id===phaseId) || _PHASES[0]
  const cfg = TagEngine.getCfg()

  const banner = `
    <div style="padding:14px 18px;background:${ph.cor}0D;border:1px solid ${ph.cor}33;border-radius:12px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <div style="width:38px;height:38px;border-radius:10px;background:${ph.cor}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-feather="${ph.icon}" style="width:17px;height:17px;color:${ph.cor}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:#111827">${ph.label}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:1px">${ph.desc}</div>
      </div>
      <button onclick="tagsOpenTagForm(null,'${phaseId}')"
        style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:8px 14px;background:${ph.cor};color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:12px;height:12px"></i> Nova Tag
      </button>
    </div>`

  if (_phaseTab === 'tags')      return banner + _phaseScreenTags(phaseId, ph, cfg)
  if (_phaseTab === 'fluxos')    return banner + _phaseScreenFluxos(phaseId, ph)
  if (_phaseTab === 'mensagens') return banner + _phaseScreenTemplates(phaseId, ph, 'msg')
  if (_phaseTab === 'alertas')   return banner + _phaseScreenTemplates(phaseId, ph, 'alert')
  if (_phaseTab === 'tarefas')   return banner + _phaseScreenTemplates(phaseId, ph, 'task')
  if (_phaseTab === 'kanban')    return banner + _phaseScreenKanban(phaseId, ph)
  return banner + _phaseScreenTags(phaseId, ph, cfg)
}

// ── Sub-tela: Tags da fase ────────────────────────────────────
const _TEMP_TAG_IDS = new Set(['lead_frio', 'lead_morno', 'lead_quente'])

function _phaseScreenTags(phaseId, ph, cfg) {
  const allTags    = TagEngine.getTags().filter(t=>t.group_id===phaseId).sort((a,b)=>(a.ordem||0)-(b.ordem||0))
  const tags       = allTags.filter(t => !_TEMP_TAG_IDS.has(t.id))
  const tempTags   = allTags.filter(t =>  _TEMP_TAG_IDS.has(t.id))

  const autoCfg = `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 18px;margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i data-feather="sliders" style="width:13px;height:13px;color:${ph.cor}"></i>
        Automações Globais
        <span style="font-weight:400;color:#9CA3AF">— o que acontece quando uma tag é aplicada</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${[
          {key:'auto_mensagens',  icon:'message-circle', label:'Mensagens',  cor:'#3B82F6'},
          {key:'auto_tarefas',    icon:'check-square',   label:'Tarefas',    cor:'#10B981'},
          {key:'auto_kanban',     icon:'trello',         label:'Kanban',     cor:'#8B5CF6'},
          {key:'auto_alertas',    icon:'bell',           label:'Alertas',    cor:'#F59E0B'},
          {key:'auto_cor_agenda', icon:'calendar',       label:'Cor Agenda', cor:'#6366F1'},
          {key:'auto_popups',     icon:'layers',         label:'Popups',     cor:'#EF4444'},
        ].map(opt=>`
          <label style="display:flex;align-items:center;gap:6px;padding:6px 11px;border:1.5px solid ${cfg[opt.key]?opt.cor+'55':'#E5E7EB'};
            border-radius:8px;cursor:pointer;background:${cfg[opt.key]?opt.cor+'0D':'#fff'};transition:.15s;user-select:none">
            <input type="checkbox" ${cfg[opt.key]?'checked':''} onchange="tagsToggleCfg('${opt.key}',this.checked)"
              style="accent-color:${opt.cor};width:13px;height:13px;cursor:pointer">
            <i data-feather="${opt.icon}" style="width:12px;height:12px;color:${cfg[opt.key]?opt.cor:'#9CA3AF'}"></i>
            <span style="font-size:11.5px;font-weight:600;color:${cfg[opt.key]?'#374151':'#9CA3AF'}">${opt.label}</span>
          </label>`).join('')}
      </div>
    </div>`

  const tagGrid = tags.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
        ${tags.map(tag=>_tagCard(tag, cfg)).join('')}
      </div>`
    : `<div style="padding:52px 24px;text-align:center;background:#fff;border:1.5px dashed #E5E7EB;border-radius:14px">
        <i data-feather="${ph.icon}" style="width:40px;height:40px;color:#E5E7EB;display:block;margin:0 auto 12px"></i>
        <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:6px">Nenhuma tag em ${ph.label}</div>
        <div style="font-size:12px;color:#9CA3AF;margin-bottom:18px">Crie a primeira tag para esta fase do funil</div>
        <button onclick="tagsOpenTagForm(null,'${phaseId}')"
          style="padding:9px 18px;background:${ph.cor};color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          <i data-feather="plus" style="width:13px;height:13px"></i> Criar primeira tag
        </button>
      </div>`

  const tempGrid = tempTags.length ? `
    <div style="margin-top:24px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="height:1px;flex:1;background:#f3f4f6"></div>
        <div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:20px;white-space:nowrap">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
          <span style="font-size:11px;font-weight:700;color:#92400e">Temperatura</span>
          <span style="font-size:11px;color:#b45309">— gerenciada pelo seletor de temperatura nos leads</span>
        </div>
        <div style="height:1px;flex:1;background:#f3f4f6"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;opacity:0.75">
        ${tempTags.map(tag=>_tagCard(tag, cfg)).join('')}
      </div>
    </div>` : ''

  return autoCfg + tagGrid + tempGrid
}

// ── Sub-tela: Fluxos da fase ──────────────────────────────────
function _phaseScreenFluxos(phaseId, ph) {
  const flows = TagEngine.getFlows().filter(f=>f.group_id===phaseId)

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111827">Fluxos de Automação</div>
        <div style="font-size:12px;color:#9CA3AF">Sequências disparadas pelas tags de ${ph.label}</div>
      </div>
      <button onclick="tagsOpenFlowForm(null)"
        style="display:flex;align-items:center;gap:5px;padding:9px 15px;background:${ph.cor};color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:13px;height:13px"></i> Novo fluxo
      </button>
    </div>
    ${flows.length ? `<div style="display:grid;gap:10px">
      ${flows.map(f=>`
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;display:flex;align-items:center;gap:14px">
          <div style="width:40px;height:40px;border-radius:10px;background:${ph.cor}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="${ph.icon}" style="width:17px;height:17px;color:${ph.cor}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-size:13px;font-weight:700;color:#111827">${f.nome}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600;background:${f.ativo?'#DCFCE7':'#F3F4F6'};color:${f.ativo?'#166534':'#9CA3AF'}">${f.ativo?'Ativo':'Pausado'}</span>
            </div>
            <div style="font-size:11.5px;color:#6B7280">${f.descricao||''}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:3px">Delay entre etapas: <strong style="color:#374151">${f.delay_entre_steps||0}h</strong></div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="tagsToggleFlow('${f.id}',${!f.ativo})"
              style="padding:6px 12px;border:1px solid #E5E7EB;background:#fff;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;color:${f.ativo?'#EF4444':'#10B981'}">
              ${f.ativo?'Pausar':'Ativar'}
            </button>
            <button onclick="tagsOpenFlowForm('${f.id}')"
              style="padding:6px 10px;border:1px solid #E5E7EB;background:#fff;border-radius:7px;cursor:pointer;display:flex;align-items:center">
              <i data-feather="edit-2" style="width:12px;height:12px;color:#6B7280"></i>
            </button>
          </div>
        </div>`).join('')}
    </div>` : `
    <div style="padding:48px 24px;text-align:center;background:#fff;border:1.5px dashed #E5E7EB;border-radius:14px">
      <i data-feather="git-branch" style="width:38px;height:38px;color:#E5E7EB;display:block;margin:0 auto 12px"></i>
      <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:6px">Nenhum fluxo em ${ph.label}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:16px">Crie fluxos de automação para esta fase</div>
      <button onclick="tagsOpenFlowForm(null)"
        style="padding:9px 18px;background:${ph.cor};color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        <i data-feather="plus" style="width:13px;height:13px"></i> Criar primeiro fluxo
      </button>
    </div>`}`
}

// ── Sub-tela: Templates (msg | alert | task) por fase ─────────
function _phaseScreenTemplates(phaseId, ph, type) {
  const typeConf = {
    msg:   { label:'Mensagens WA', icon:'message-circle', cor:'#3B82F6', linked:_phaseMsgTpls(phaseId),   all:TagEngine.getMsgTpls()   },
    alert: { label:'Alertas',      icon:'bell',           cor:'#F59E0B', linked:_phaseAlertTpls(phaseId), all:TagEngine.getAlertTpls() },
    task:  { label:'Tarefas',      icon:'check-square',   cor:'#10B981', linked:_phaseTaskTpls(phaseId),  all:TagEngine.getTaskTpls()  },
  }
  const tc       = typeConf[type]
  const linked   = tc.linked
  const unlinked = tc.all.filter(t=>!linked.find(l=>l.id===t.id))

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111827">${tc.label}</div>
        <div style="font-size:12px;color:#9CA3AF">${linked.length} vinculados a tags desta fase · ${unlinked.length} disponíveis</div>
      </div>
      <button onclick="tagsOpenTplForm('${type}',null)"
        style="display:flex;align-items:center;gap:5px;padding:9px 15px;background:${ph.cor};color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:13px;height:13px"></i> Novo template
      </button>
    </div>

    ${linked.length ? `
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:5px">
        <i data-feather="link" style="width:11px;height:11px;color:${ph.cor}"></i>
        Vinculados a tags de ${ph.label}
      </div>
      <div style="display:grid;gap:10px;margin-bottom:20px">
        ${linked.map(t=>_tplRow(t,type,tc.cor,true)).join('')}
      </div>` : ''}

    ${unlinked.length ? `
      <div style="font-size:11px;font-weight:700;color:#9CA3AF;margin-bottom:10px;display:flex;align-items:center;gap:5px">
        <i data-feather="layers" style="width:11px;height:11px"></i>
        Outros templates disponíveis
      </div>
      <div style="display:grid;gap:8px">
        ${unlinked.map(t=>_tplRow(t,type,'#9CA3AF',false)).join('')}
      </div>` : ''}

    ${!linked.length && !unlinked.length ? `
      <div style="padding:48px 24px;text-align:center;background:#fff;border:1.5px dashed #E5E7EB;border-radius:14px">
        <i data-feather="${tc.icon}" style="width:38px;height:38px;color:#E5E7EB;display:block;margin:0 auto 12px"></i>
        <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:6px">Nenhum template de ${tc.label.toLowerCase()}</div>
        <button onclick="tagsOpenTplForm('${type}',null)"
          style="padding:9px 18px;background:${ph.cor};color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-top:12px">
          <i data-feather="plus" style="width:13px;height:13px"></i> Criar template
        </button>
      </div>` : ''}`
}

function _tplRow(tpl, type, accentCor, isLinked) {
  const tipoCor = t=>({error:'#EF4444',warning:'#F59E0B',success:'#10B981',info:'#3B82F6'})[t]||'#6B7280'
  const prCor   = p=>({urgente:'#DC2626',alta:'#EF4444',normal:'#F59E0B',baixa:'#9CA3AF'})[p]||'#9CA3AF'

  let badge='', detail=''
  if (type==='msg') {
    badge  = `<span style="font-size:10px;padding:2px 8px;background:#ECFDF5;color:#059669;border-radius:6px;font-weight:600">${tpl.canal||'whatsapp'}</span>`
    detail = `<div style="font-size:11.5px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${tpl.corpo||''}</div>`
  } else if (type==='alert') {
    badge  = `<span style="font-size:10px;padding:2px 8px;background:${tipoCor(tpl.tipo)}15;color:${tipoCor(tpl.tipo)};border-radius:6px;font-weight:600">${tpl.tipo||'info'}</span>`
    detail = `<div style="font-size:11.5px;color:#6B7280">${tpl.titulo||''}</div>`
  } else {
    badge  = `<span style="font-size:10px;padding:2px 8px;background:${prCor(tpl.prioridade)}18;color:${prCor(tpl.prioridade)};border-radius:6px;font-weight:700">${tpl.prioridade||'normal'}</span>`
    detail = `<div style="font-size:11px;color:#9CA3AF">Para: ${(window.TAREFA_PARA_OPTS||[]).find(o=>o.id===tpl.para)?.nome||tpl.para||''} · Prazo: ${tpl.prazo_horas||0}h</div>`
  }

  return `
    <div style="background:#fff;border:1px solid ${isLinked?accentCor+'55':'#E5E7EB'};border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:34px;height:34px;border-radius:9px;background:${accentCor}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-feather="${type==='msg'?'message-circle':type==='alert'?'bell':'check-square'}" style="width:14px;height:14px;color:${accentCor}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700;color:#111827">${tpl.nome||''}</span>
          ${badge}
        </div>
        ${detail}
      </div>
      <button onclick="tagsOpenTplForm('${type}','${tpl.id}')"
        style="padding:5px 9px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;flex-shrink:0">
        <i data-feather="edit-2" style="width:11px;height:11px;color:#6B7280"></i>
      </button>
    </div>`
}

// ── Sub-tela: Kanban da fase ──────────────────────────────────
function _phaseScreenKanban(phaseId, ph) {
  const columns = (window.KANBAN_COLUMNS||{})[phaseId] || []

  return `
    <div style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:#111827">Kanban — ${ph.label}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-top:2px">Colunas e mapeamento de tags desta fase</div>
    </div>
    ${columns.length ? `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;min-height:380px">
      ${columns.map(col=>`
        <div style="flex-shrink:0;width:220px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden">
          <div style="padding:11px 13px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #E5E7EB">
            <div style="display:flex;align-items:center;gap:7px">
              <div style="width:9px;height:9px;border-radius:50%;background:${col.cor};flex-shrink:0"></div>
              <span style="font-size:11.5px;font-weight:700;color:#374151">${col.nome}</span>
            </div>
            <span style="font-size:10px;font-weight:700;background:#E5E7EB;color:#6B7280;border-radius:10px;padding:1px 7px">0</span>
          </div>
          <div style="padding:10px;min-height:280px">
            <div style="border:1.5px dashed #E5E7EB;border-radius:8px;padding:16px 12px;text-align:center">
              <i data-feather="plus" style="width:16px;height:16px;color:#D1D5DB;display:block;margin:0 auto 6px"></i>
              <span style="font-size:10.5px;color:#D1D5DB">Arraste cards aqui</span>
            </div>
          </div>
        </div>`).join('')}
    </div>` : `
    <div style="padding:48px 24px;text-align:center;background:#fff;border:1.5px dashed #E5E7EB;border-radius:14px">
      <i data-feather="trello" style="width:38px;height:38px;color:#E5E7EB;display:block;margin:0 auto 12px"></i>
      <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:6px">Kanban não configurado para ${ph.label}</div>
      <div style="font-size:12px;color:#9CA3AF">Configure em Configurações > Kanbans e Etapas</div>
    </div>`}
    <div style="margin-top:12px;padding:12px 16px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:10px;font-size:12px;color:#4338CA;display:flex;align-items:center;gap:8px">
      <i data-feather="info" style="width:14px;height:14px;flex-shrink:0"></i>
      <span>Cards de leads e pacientes serão integrados quando o módulo de Leads estiver conectado.</span>
    </div>`
}

// ── Card de tag ───────────────────────────────────────────────
function _tagCard(tag, cfg) {
  const a      = tag.acoes || {}
  const group  = TagEngine.findGroup(tag.group_id) || { cor:'#6B7280', nome:'' }
  const isDef  = TagEngine.isDefaultTag(tag.id)

  const automations = [
    tag.msg_template_id   && cfg.auto_mensagens   ? {icon:'message-circle',cor:'#3B82F6',tip:'Mensagem: '+tag.msg_template_id} : null,
    tag.task_template_id  && cfg.auto_tarefas     ? {icon:'check-square',  cor:'#10B981',tip:'Tarefa automática'} : null,
    tag.kanban_coluna     && cfg.auto_kanban       ? {icon:'trello',        cor:'#8B5CF6',tip:'Kanban → '+tag.kanban_coluna} : null,
    tag.alert_template_id && cfg.auto_alertas      ? {icon:'bell',          cor:'#F59E0B',tip:'Alerta: '+tag.alert_template_id} : null,
    tag.cor_calendario    && cfg.auto_cor_agenda   ? {icon:'calendar',      cor:tag.cor_calendario,tip:'Cor na agenda'} : null,
  ].filter(Boolean)

  return `
    <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;transition:.15s"
         onmouseenter="this.style.borderColor='${tag.cor}';this.style.boxShadow='0 4px 16px ${tag.cor}22'"
         onmouseleave="this.style.borderColor='#E5E7EB';this.style.boxShadow='none'">
      <div style="height:3px;background:${tag.cor}"></div>
      <div style="padding:14px 15px">

        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:9px">
            <div style="width:36px;height:36px;border-radius:9px;background:${tag.cor}18;color:${tag.cor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i data-feather="${tag.icone||'tag'}" style="width:15px;height:15px"></i>
            </div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#111827">${tag.nome}</div>
              <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
                <div style="width:7px;height:7px;border-radius:50%;background:${group.cor}"></div>
                <span style="font-size:10px;color:#9CA3AF;font-weight:500">${group.nome}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button onclick="tagsOpenTagForm('${tag.id}',null)"
              style="padding:4px 8px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center">
              <i data-feather="edit-2" style="width:11px;height:11px;color:#6B7280"></i>
            </button>
            ${!isDef?`<button onclick="tagsDeleteTag('${tag.id}')"
              style="padding:4px 8px;border:1px solid #FEE2E2;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center">
              <i data-feather="trash-2" style="width:11px;height:11px;color:#EF4444"></i>
            </button>`:''}
          </div>
        </div>

        ${tag.descricao?`<p style="font-size:11.5px;color:#6B7280;line-height:1.5;margin:0 0 7px">${tag.descricao}</p>`:''}

        ${tag.regras?`
          <div style="padding:5px 9px;background:#FAFAFA;border-left:2px solid ${tag.cor};border-radius:0 6px 6px 0;margin-bottom:8px">
            <div style="font-size:9.5px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1px">Regra de aplicação</div>
            <div style="font-size:11.5px;color:#374151;line-height:1.4">${tag.regras}</div>
          </div>`:''}

        ${tag.proxima_acao?`
          <div style="font-size:11px;color:#7C3AED;display:flex;align-items:center;gap:4px;margin-bottom:8px">
            <i data-feather="arrow-right" style="width:10px;height:10px"></i>${tag.proxima_acao}
          </div>`:''}

        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${automations.map(b=>`
            <div title="${b.tip}" style="display:flex;align-items:center;gap:3px;padding:3px 8px;background:${b.cor}0F;border:1px solid ${b.cor}33;border-radius:6px">
              <i data-feather="${b.icon}" style="width:10px;height:10px;color:${b.cor}"></i>
            </div>`).join('')}
          ${!automations.length?`<span style="font-size:11px;color:#D1D5DB;font-style:italic">Sem automações configuradas</span>`:''}
        </div>

        ${tag.kanban_coluna?`
          <div style="margin-top:7px;font-size:10.5px;color:#8B5CF6;display:flex;align-items:center;gap:4px">
            <i data-feather="trello" style="width:10px;height:10px"></i>Kanban: ${tag.kanban_coluna}
          </div>`:''}

        ${tag.incompativeis&&tag.incompativeis.length?`
          <div style="margin-top:4px;font-size:10.5px;color:#9CA3AF;display:flex;align-items:center;gap:4px">
            <i data-feather="alert-triangle" style="width:10px;height:10px"></i>
            Incompatível com: ${tag.incompativeis.map(id=>TagEngine.findTag(id)?.nome||id).join(', ')}
          </div>`:''}
      </div>
    </div>`
}

// ══════════════════════════════════════════════════════════════
//  TELAS LEGADAS (mantidas para compatibilidade de import direto)
// ══════════════════════════════════════════════════════════════
function _screenTemplates() {
  const tabs = [
    {id:'msg',   label:'Mensagens',  icon:'message-circle', count:TagEngine.getMsgTpls().length,   cor:'#3B82F6'},
    {id:'alert', label:'Alertas',    icon:'bell',           count:TagEngine.getAlertTpls().length, cor:'#F59E0B'},
    {id:'task',  label:'Tarefas',    icon:'check-square',   count:TagEngine.getTaskTpls().length,  cor:'#10B981'},
  ]

  const tabHtml = `
    <div style="display:flex;gap:4px;margin-bottom:20px">
      ${tabs.map(t=>{
        const active = _tplTab === t.id
        return `<button onclick="tagsSetTplTab('${t.id}')"
          style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:12px;
          font-weight:${active?'700':'600'};background:${active?t.cor+'22':'#F3F4F6'};color:${active?t.cor:'#6B7280'};transition:.15s">
          <i data-feather="${t.icon}" style="width:12px;height:12px"></i>${t.label}
          <span style="padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;background:${active?t.cor+'33':'#E5E7EB'};color:${active?t.cor:'#9CA3AF'}">${t.count}</span>
        </button>`}).join('')}
      <button onclick="tagsOpenTplForm('${_tplTab}',null)"
        style="margin-left:auto;display:flex;align-items:center;gap:5px;padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:12px;height:12px"></i> Novo template
      </button>
    </div>`

  if (_tplTab === 'msg')   return tabHtml + _tplListMsg()
  if (_tplTab === 'alert') return tabHtml + _tplListAlert()
  return tabHtml + _tplListTask()
}

function _tplListMsg() {
  const tpls = TagEngine.getMsgTpls()
  return `<div style="display:grid;gap:10px">
    ${tpls.map(t=>`
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">
        <div style="width:36px;height:36px;border-radius:9px;background:#3B82F615;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="message-circle" style="width:15px;height:15px;color:#3B82F6"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;color:#111827">${t.nome}</span>
            <span style="font-size:10px;padding:2px 8px;background:#ECFDF5;color:#059669;border-radius:6px;font-weight:600">${t.canal||'whatsapp'}</span>
          </div>
          <div style="font-size:11.5px;color:#6B7280;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.corpo}</div>
          ${t.variaveis&&t.variaveis.length?`<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">
            ${t.variaveis.map(v=>`<span style="font-size:10px;background:#EEF2FF;color:#6366F1;border-radius:5px;padding:1px 6px;font-family:monospace">{{${v}}}</span>`).join('')}
          </div>`:''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="tagsOpenTplForm('msg','${t.id}')" style="padding:5px 9px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center">
            <i data-feather="edit-2" style="width:11px;height:11px;color:#6B7280"></i>
          </button>
        </div>
      </div>`).join('')}
  </div>`
}

function _tplListAlert() {
  const tpls = TagEngine.getAlertTpls()
  const tipoCor = t => ({error:'#EF4444',warning:'#F59E0B',success:'#10B981',info:'#3B82F6'})[t]||'#6B7280'
  return `<div style="display:grid;gap:10px">
    ${tpls.map(t=>`
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">
        <div style="width:36px;height:36px;border-radius:9px;background:${tipoCor(t.tipo)}15;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="bell" style="width:15px;height:15px;color:${tipoCor(t.tipo)}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;color:#111827">${t.nome}</span>
            <span style="font-size:10px;padding:2px 8px;background:${tipoCor(t.tipo)}15;color:${tipoCor(t.tipo)};border-radius:6px;font-weight:600">${t.tipo}</span>
            <span style="font-size:10px;padding:2px 8px;background:#F3F4F6;color:#6B7280;border-radius:6px;font-weight:600">${t.para}</span>
          </div>
          <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:2px">${t.titulo}</div>
          <div style="font-size:11.5px;color:#6B7280">${t.corpo}</div>
        </div>
        <button onclick="tagsOpenTplForm('alert','${t.id}')" style="padding:5px 9px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;flex-shrink:0">
          <i data-feather="edit-2" style="width:11px;height:11px;color:#6B7280"></i>
        </button>
      </div>`).join('')}
  </div>`
}

function _tplListTask() {
  const tpls   = TagEngine.getTaskTpls()
  const prCor  = p => ({urgente:'#DC2626',alta:'#EF4444',normal:'#F59E0B',baixa:'#9CA3AF'})[p]||'#9CA3AF'
  return `<div style="display:grid;gap:10px">
    ${tpls.map(t=>`
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">
        <div style="width:36px;height:36px;border-radius:9px;background:#10B98115;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="check-square" style="width:15px;height:15px;color:#10B981"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;color:#111827">${t.nome}</span>
            <span style="font-size:10px;padding:2px 8px;background:${prCor(t.prioridade)}18;color:${prCor(t.prioridade)};border-radius:6px;font-weight:700">${t.prioridade||'normal'}</span>
          </div>
          <div style="font-size:11.5px;color:#374151;margin-bottom:3px">${t.titulo}</div>
          <div style="font-size:11px;color:#9CA3AF">
            Para: ${(window.TAREFA_PARA_OPTS||[]).find(o=>o.id===t.para)?.nome||t.para}
            · Prazo: ${t.prazo_horas||0}h
          </div>
        </div>
        <button onclick="tagsOpenTplForm('task','${t.id}')" style="padding:5px 9px;border:1px solid #E5E7EB;background:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;flex-shrink:0">
          <i data-feather="edit-2" style="width:11px;height:11px;color:#6B7280"></i>
        </button>
      </div>`).join('')}
  </div>`
}

// ══════════════════════════════════════════════════════════════
//  FLUXOS
// ══════════════════════════════════════════════════════════════
function _screenFluxos() {
  const flows  = TagEngine.getFlows()
  const groups = TagEngine.getGroups()

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111827">Fluxos de Automação</div>
        <div style="font-size:12px;color:#9CA3AF">Sequências de ações disparadas pelas tags</div>
      </div>
      <button onclick="tagsOpenFlowForm(null)"
        style="display:flex;align-items:center;gap:5px;padding:9px 15px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
        <i data-feather="plus" style="width:13px;height:13px"></i> Novo fluxo
      </button>
    </div>
    <div style="display:grid;gap:10px">
      ${flows.map(f=>{
        const g = groups.find(x=>x.id===f.group_id)||{nome:'Geral',cor:'#6B7280',icone:'git-branch'}
        return `
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;display:flex;align-items:center;gap:14px">
            <div style="width:40px;height:40px;border-radius:10px;background:${g.cor}15;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i data-feather="${g.icone}" style="width:17px;height:17px;color:${g.cor}"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                <span style="font-size:13px;font-weight:700;color:#111827">${f.nome}</span>
                <span style="font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600;background:${f.ativo?'#DCFCE7':'#F3F4F6'};color:${f.ativo?'#166534':'#9CA3AF'}">${f.ativo?'Ativo':'Pausado'}</span>
              </div>
              <div style="font-size:11.5px;color:#6B7280">${f.descricao||''}</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:3px">
                Grupo: <strong style="color:#374151">${g.nome}</strong>
                · Delay entre etapas: <strong style="color:#374151">${f.delay_entre_steps||0}h</strong>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button onclick="tagsToggleFlow('${f.id}',${!f.ativo})"
                style="padding:6px 12px;border:1px solid #E5E7EB;background:#fff;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;color:${f.ativo?'#EF4444':'#10B981'}">
                ${f.ativo?'Pausar':'Ativar'}
              </button>
              <button onclick="tagsOpenFlowForm('${f.id}')"
                style="padding:6px 10px;border:1px solid #E5E7EB;background:#fff;border-radius:7px;cursor:pointer;display:flex;align-items:center">
                <i data-feather="edit-2" style="width:12px;height:12px;color:#6B7280"></i>
              </button>
            </div>
          </div>`}).join('')}
    </div>`
}

// ══════════════════════════════════════════════════════════════
//  KANBAN
// ══════════════════════════════════════════════════════════════
function _screenKanban() {
  const groups  = TagEngine.getGroups()
  const columns = (window.KANBAN_COLUMNS||{})[_kanbanGroup] || []
  const group   = groups.find(g=>g.id===_kanbanGroup)||groups[0]

  return `
    <!-- Seletor de grupo -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      ${groups.map(g=>{
        const active = _kanbanGroup===g.id
        return `<button onclick="tagsSetKanbanGroup('${g.id}')"
          style="display:flex;align-items:center;gap:6px;padding:7px 13px;border:none;border-radius:8px;cursor:pointer;font-size:12px;
          font-weight:${active?'700':'600'};background:${active?g.cor:'#F3F4F6'};color:${active?'#fff':'#6B7280'};transition:.15s">
          <i data-feather="${g.icone}" style="width:12px;height:12px"></i>${g.nome}
        </button>`}).join('')}
      <div style="margin-left:auto;font-size:11px;color:#9CA3AF;display:flex;align-items:center;gap:5px">
        <i data-feather="info" style="width:12px;height:12px"></i>
        Conexão com leads/pacientes na próxima versão
      </div>
    </div>

    <!-- Colunas -->
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;min-height:420px">
      ${columns.map(col=>`
        <div style="flex-shrink:0;width:220px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden">
          <div style="padding:11px 13px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #E5E7EB">
            <div style="display:flex;align-items:center;gap:7px">
              <div style="width:9px;height:9px;border-radius:50%;background:${col.cor};flex-shrink:0"></div>
              <span style="font-size:11.5px;font-weight:700;color:#374151">${col.nome}</span>
            </div>
            <span style="font-size:10px;font-weight:700;background:#E5E7EB;color:#6B7280;border-radius:10px;padding:1px 7px">0</span>
          </div>
          <div style="padding:10px;min-height:300px">
            <div style="border:1.5px dashed #E5E7EB;border-radius:8px;padding:18px 12px;text-align:center">
              <i data-feather="plus" style="width:18px;height:18px;color:#D1D5DB;display:block;margin:0 auto 6px"></i>
              <span style="font-size:10.5px;color:#D1D5DB">Arraste cards aqui</span>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:12px;padding:12px 16px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:10px;font-size:12px;color:#4338CA;display:flex;align-items:center;gap:8px">
      <i data-feather="info" style="width:14px;height:14px;flex-shrink:0"></i>
      <span>O Kanban completo com cards de leads e pacientes será ativado quando o módulo de Leads for integrado. As colunas e configurações já estão prontas.</span>
    </div>`
}

// ══════════════════════════════════════════════════════════════
//  MODAL SISTEMA
// ══════════════════════════════════════════════════════════════
function _ensureModal() {
  if (document.getElementById('tags-modal')) return
  const ov = document.createElement('div')
  ov.id = 'tags-modal'
  ov.onclick = function(e) { if (e.target === this) tagsCloseModal() }
  ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;align-items:center;justify-content:center;padding:20px'
  ov.innerHTML = `<div id="tags-modal-box" style="background:#fff;border-radius:18px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
    <div id="tags-modal-body"></div>
  </div>`
  document.body.appendChild(ov)
}

function _openModal(html) {
  _ensureModal()
  const ov = document.getElementById('tags-modal')
  if (!ov) return
  const body = document.getElementById('tags-modal-body')
  if (body) body.innerHTML = html
  ov.style.display = 'flex'
  featherIn(ov)
}

function tagsCloseModal() {
  const ov = document.getElementById('tags-modal')
  if (ov) ov.style.display = 'none'
}

// ══════════════════════════════════════════════════════════════
//  FORM: TAG
// ══════════════════════════════════════════════════════════════
function tagsOpenTagForm(id, groupId) {
  const tag      = id ? TagEngine.findTag(id) : null
  const groups   = TagEngine.getGroups()
  const msgTpls  = TagEngine.getMsgTpls()
  const alertTpls= TagEngine.getAlertTpls()
  const taskTpls = TagEngine.getTaskTpls()
  const gid      = groupId || tag?.group_id || groups[0]?.id || 'pre_agendamento'
  const allTags  = TagEngine.getTags()

  const selStyle = 'width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const inpStyle = 'width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const lbl = (text) => `<label style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">${text}</label>`

  _openModal(`
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #F3F4F6">
        <div style="font-size:15px;font-weight:700;color:#111">${tag?'Editar Tag':'Nova Tag'}</div>
        <button onclick="tagsCloseModal()" style="width:28px;height:28px;border:none;background:#F3F4F6;border-radius:7px;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
      </div>

      <div style="display:grid;gap:14px">

        <!-- Nome + Cor + Ícone -->
        <div style="display:grid;grid-template-columns:1fr 50px 90px;gap:10px;align-items:end">
          <div>${lbl('Nome *')}<input id="tf_nome" type="text" value="${tag?.nome||''}" placeholder="Ex: Lead Quente" style="${inpStyle}"></div>
          <div>${lbl('Cor')}<input id="tf_cor" type="color" value="${tag?.cor||'#7C3AED'}" style="width:50px;height:38px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;padding:2px"></div>
          <div>${lbl('Ícone Feather')}
            <input id="tf_icone" type="text" value="${tag?.icone||'tag'}" placeholder="tag"
              style="width:90px;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box">
          </div>
        </div>

        <!-- Grupo -->
        <div>${lbl('Grupo')}<select id="tf_group" style="${selStyle}">
          ${groups.map(g=>`<option value="${g.id}" ${gid===g.id?'selected':''}>${g.nome}</option>`).join('')}
        </select></div>

        <!-- Descrição + Regra -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${lbl('Descrição')}
            <textarea id="tf_desc" rows="2" placeholder="O que esta tag representa..." style="${selStyle};resize:vertical">${tag?.descricao||''}</textarea>
          </div>
          <div>${lbl('Regra / Quando aplicar')}
            <textarea id="tf_regra" rows="2" placeholder="Condição de aplicação..." style="${selStyle};resize:vertical">${tag?.regras||''}</textarea>
          </div>
        </div>

        <!-- Próxima ação -->
        <div>${lbl('Próxima Ação Esperada')}
          <input id="tf_prox" type="text" value="${tag?.proxima_acao||''}" placeholder="Ex: Ligar em 24h" style="${inpStyle}">
        </div>

        <!-- Kanban + Cor Calendário -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${lbl('Coluna no Kanban')}
            <input id="tf_kanban" type="text" value="${tag?.kanban_coluna||''}" placeholder="Ex: Quente" style="${inpStyle}">
          </div>
          <div>${lbl('Cor no Calendário')}
            <div style="display:flex;gap:8px;align-items:center">
              <input id="tf_cal_cor" type="color" value="${tag?.cor_calendario||'#7C3AED'}" style="width:38px;height:38px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;padding:2px">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
                <input type="checkbox" id="tf_cal_on" ${tag?.cor_calendario?'checked':''} style="accent-color:#7C3AED;width:13px;height:13px">
                Usar cor no calendário
              </label>
            </div>
          </div>
        </div>

        <!-- Templates automáticos -->
        <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">
          <div style="padding:10px 14px;background:#F9FAFB;font-size:11.5px;font-weight:700;color:#374151;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:5px">
            <i data-feather="zap" style="width:13px;height:13px;color:#7C3AED"></i> Automações ao aplicar esta tag
          </div>
          <div style="padding:14px;display:grid;gap:10px">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>${lbl('Template de Mensagem')}
                <select id="tf_msg_tpl" style="${selStyle}">
                  <option value="">— Nenhum —</option>
                  ${msgTpls.map(t=>`<option value="${t.id}" ${tag?.msg_template_id===t.id?'selected':''}>${t.nome}</option>`).join('')}
                </select>
              </div>
              <div>${lbl('Template de Alerta')}
                <select id="tf_alert_tpl" style="${selStyle}">
                  <option value="">— Nenhum —</option>
                  ${alertTpls.map(t=>`<option value="${t.id}" ${tag?.alert_template_id===t.id?'selected':''}>${t.nome}</option>`).join('')}
                </select>
              </div>
            </div>

            <div>${lbl('Template de Tarefa')}
              <select id="tf_task_tpl" style="${selStyle}">
                <option value="">— Nenhum —</option>
                ${taskTpls.map(t=>`<option value="${t.id}" ${tag?.task_template_id===t.id?'selected':''}>${t.nome}</option>`).join('')}
              </select>
            </div>

          </div>
        </div>

        <!-- Incompatíveis -->
        <div>${lbl('Tags Incompatíveis (separadas por vírgula)')}
          <input id="tf_incomp" type="text" value="${(tag?.incompativeis||[]).join(', ')}" placeholder="Ex: lead_frio, lead_morno"
            style="${inpStyle}">
          <div style="font-size:10.5px;color:#9CA3AF;margin-top:4px">Use os IDs das tags. Sistema bloqueará a aplicação simultânea.</div>
        </div>

        <!-- Botões -->
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid #F3F4F6">
          <button onclick="tagsCloseModal()" style="padding:9px 18px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;color:#374151;cursor:pointer">Cancelar</button>
          <button onclick="tagsSaveTagForm('${id||''}')" style="padding:9px 20px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">
            ${tag?'Salvar alterações':'Criar tag'}
          </button>
        </div>

      </div>
    </div>`)
}

function tagsSaveTagForm(existingId) {
  try {
    const nome  = document.getElementById('tf_nome')?.value?.trim()
    if (!nome) { _toastWarn('Informe o nome da tag.'); return }

    const calOn  = document.getElementById('tf_cal_on')?.checked
    const incomp = (document.getElementById('tf_incomp')?.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    const gid    = document.getElementById('tf_group')?.value || 'pre_agendamento'

    // Se não tem existingId, verifica se já existe tag com mesmo nome no grupo (evita duplicata)
    const byNome = !existingId
      ? TagEngine.getTags().find(function(t) { return t.group_id === gid && (t.nome||'').toLowerCase().trim() === nome.toLowerCase().trim() })
      : null

    const tag = {
      id:             existingId || (byNome ? byNome.id : 'tag_'+nome.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,30)+'_'+Date.now().toString(36)),
      group_id:       gid,
      nome,
      cor:            document.getElementById('tf_cor')?.value || '#7C3AED',
      icone:          document.getElementById('tf_icone')?.value?.trim() || 'tag',
      descricao:      document.getElementById('tf_desc')?.value?.trim() || '',
      regras:         document.getElementById('tf_regra')?.value?.trim() || '',
      proxima_acao:   document.getElementById('tf_prox')?.value?.trim() || '',
      kanban_coluna:  document.getElementById('tf_kanban')?.value?.trim() || '',
      cor_calendario: calOn ? document.getElementById('tf_cal_cor')?.value : null,
      msg_template_id:   document.getElementById('tf_msg_tpl')?.value   || null,
      alert_template_id: document.getElementById('tf_alert_tpl')?.value || null,
      task_template_id:  document.getElementById('tf_task_tpl')?.value  || null,
      incompativeis:  incomp,
      ativo:          true,
      ordem:          TagEngine.getTags().filter(t=>t.group_id===gid).length + 1,
    }

    TagEngine.saveTag(tag)
    tagsCloseModal()
    _tagsTab     = gid
    _activePhase = gid
    _phaseTab    = 'tags'
    renderSettingsTags()
  } catch(err) {
    console.error('[tagsSaveTagForm] erro ao salvar tag:', err)
  }
}

function tagsDeleteTag(id) {
  if (!confirm('Remover esta tag? Esta ação não pode ser desfeita.')) return
  TagEngine.deleteTag(id)
  renderSettingsTags()
}

// ══════════════════════════════════════════════════════════════
//  FORM: TEMPLATE
// ══════════════════════════════════════════════════════════════
function tagsOpenTplForm(type, id) {
  const getters = {msg:TagEngine.getMsgTpls, alert:TagEngine.getAlertTpls, task:TagEngine.getTaskTpls}
  const tpl = id ? (getters[type]||TagEngine.getMsgTpls)().find(t=>t.id===id) : null
  const inpStyle = 'width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const lbl = text => `<label style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">${text}</label>`

  let extra = ''
  if (type === 'msg') {
    extra = `
      <div>${lbl('Canal')}
        <select id="ttf_canal" style="${inpStyle}">
          <option value="whatsapp" ${tpl?.canal==='whatsapp'?'selected':''}>WhatsApp</option>
          <option value="email" ${tpl?.canal==='email'?'selected':''}>E-mail</option>
          <option value="sms" ${tpl?.canal==='sms'?'selected':''}>SMS</option>
        </select>
      </div>
      <div>${lbl('Variáveis (separadas por vírgula)')}
        <input id="ttf_vars" type="text" value="${(tpl?.variaveis||[]).join(', ')}" placeholder="nome, data, hora..." style="${inpStyle}">
        <div style="font-size:10.5px;color:#9CA3AF;margin-top:4px">Use {{nome}} no corpo para inserir variáveis automaticamente.</div>
      </div>`
  } else if (type === 'alert') {
    extra = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>${lbl('Tipo')}
          <select id="ttf_tipo" style="${inpStyle}">
            ${['info','warning','success','error'].map(t=>`<option value="${t}" ${tpl?.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>${lbl('Destinatário')}
          <select id="ttf_para" style="${inpStyle}">
            ${(window.TAREFA_PARA_OPTS||[]).map(o=>`<option value="${o.id}" ${tpl?.para===o.id?'selected':''}>${o.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>${lbl('Título')}
        <input id="ttf_titulo" type="text" value="${tpl?.titulo||''}" style="${inpStyle}">
      </div>`
  } else {
    extra = `
      <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:10px">
        <div>${lbl('Destinatário')}
          <select id="ttf_para" style="${inpStyle}">
            ${(window.TAREFA_PARA_OPTS||[]).map(o=>`<option value="${o.id}" ${tpl?.para===o.id?'selected':''}>${o.nome}</option>`).join('')}
          </select>
        </div>
        <div>${lbl('Prioridade')}
          <select id="ttf_prio" style="${inpStyle}">
            ${['urgente','alta','normal','baixa'].map(p=>`<option value="${p}" ${tpl?.prioridade===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div>${lbl('Prazo (h)')}
          <input id="ttf_prazo" type="number" value="${tpl?.prazo_horas||24}" min="0" style="${inpStyle}">
        </div>
      </div>`
  }

  const typeLabel = {msg:'Mensagem',alert:'Alerta',task:'Tarefa'}[type]

  _openModal(`
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #F3F4F6">
        <div style="font-size:15px;font-weight:700;color:#111">${tpl?'Editar':'Novo'} Template de ${typeLabel}</div>
        <button onclick="tagsCloseModal()" style="width:28px;height:28px;border:none;background:#F3F4F6;border-radius:7px;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
      </div>
      <div style="display:grid;gap:14px">
        <div>${lbl('Nome do Template *')}
          <input id="ttf_nome" type="text" value="${tpl?.nome||''}" placeholder="Ex: Confirmação de Agendamento" style="${inpStyle}">
        </div>
        ${extra}
        <div>${lbl('Corpo')}
          <textarea id="ttf_corpo" rows="4" style="${inpStyle};resize:vertical" placeholder="Texto da mensagem. Use {{nome}}, {{data}}, etc.">${tpl?.corpo||''}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid #F3F4F6">
          <button onclick="tagsCloseModal()" style="padding:9px 18px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;cursor:pointer">Cancelar</button>
          <button onclick="tagsSaveTplForm('${type}','${id||''}')" style="padding:9px 20px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">
            ${tpl?'Salvar':'Criar'}
          </button>
        </div>
      </div>
    </div>`)
}

function tagsSaveTplForm(type, existingId) {
  const nome = document.getElementById('ttf_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome.'); return }
  const corpo = document.getElementById('ttf_corpo')?.value?.trim()
  if (!corpo) { _toastWarn('Informe o corpo.'); return }

  const id = existingId || ('tpl_'+nome.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,30)+'_'+Date.now().toString(36))

  if (type === 'msg') {
    TagEngine.saveMsgTpl({ id, nome, canal: document.getElementById('ttf_canal')?.value||'whatsapp', corpo, variaveis:(document.getElementById('ttf_vars')?.value||'').split(',').map(s=>s.trim()).filter(Boolean), ativo:true })
  } else if (type === 'alert') {
    TagEngine.saveAlertTpl({ id, nome, tipo:document.getElementById('ttf_tipo')?.value||'info', titulo:document.getElementById('ttf_titulo')?.value?.trim()||nome, corpo, para:document.getElementById('ttf_para')?.value||'sdr', ativo:true })
  } else {
    TagEngine.saveTaskTpl({ id, nome, titulo:corpo.slice(0,80), descricao:corpo, para:document.getElementById('ttf_para')?.value||'sdr', prazo_horas:parseInt(document.getElementById('ttf_prazo')?.value)||24, prioridade:document.getElementById('ttf_prio')?.value||'normal', ativo:true })
  }

  tagsCloseModal()
  _tplTab   = type
  _phaseTab = type === 'msg' ? 'mensagens' : type === 'alert' ? 'alertas' : 'tarefas'
  renderSettingsTags()
}

// ══════════════════════════════════════════════════════════════
//  FORM: FLUXO
// ══════════════════════════════════════════════════════════════
function tagsOpenFlowForm(id) {
  const flow   = id ? TagEngine.getFlows().find(f=>f.id===id) : null
  const groups = TagEngine.getGroups()
  const inpStyle = 'width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const lbl = text => `<label style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">${text}</label>`

  _openModal(`
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #F3F4F6">
        <div style="font-size:15px;font-weight:700;color:#111">${flow?'Editar Fluxo':'Novo Fluxo'}</div>
        <button onclick="tagsCloseModal()" style="width:28px;height:28px;border:none;background:#F3F4F6;border-radius:7px;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
      </div>
      <div style="display:grid;gap:14px">
        <div>${lbl('Nome do Fluxo *')}
          <input id="ffm_nome" type="text" value="${flow?.nome||''}" style="${inpStyle}">
        </div>
        <div>${lbl('Grupo / Etapa')}
          <select id="ffm_group" style="${inpStyle}">
            ${groups.map(g=>`<option value="${g.id}" ${flow?.group_id===g.id?'selected':''}>${g.nome}</option>`).join('')}
          </select>
        </div>
        <div>${lbl('Descrição')}
          <textarea id="ffm_desc" rows="2" style="${inpStyle};resize:vertical">${flow?.descricao||''}</textarea>
        </div>
        <div>${lbl('Delay entre etapas (horas)')}
          <input id="ffm_delay" type="number" value="${flow?.delay_entre_steps||24}" min="0" style="${inpStyle}">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid #F3F4F6">
          <button onclick="tagsCloseModal()" style="padding:9px 18px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;cursor:pointer">Cancelar</button>
          <button onclick="tagsSaveFlowForm('${id||''}')" style="padding:9px 20px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">
            ${flow?'Salvar':'Criar'}
          </button>
        </div>
      </div>
    </div>`)
}

function tagsSaveFlowForm(existingId) {
  const nome = document.getElementById('ffm_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome.'); return }
  const flow = {
    id:         existingId || ('flow_'+nome.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,25)+'_'+Date.now().toString(36)),
    nome,
    group_id:   document.getElementById('ffm_group')?.value || 'pre_agendamento',
    descricao:  document.getElementById('ffm_desc')?.value?.trim() || '',
    delay_entre_steps: parseInt(document.getElementById('ffm_delay')?.value)||24,
    ativo:      true,
  }
  TagEngine.saveFlow(flow)
  tagsCloseModal()
  _activePhase = flow.group_id
  _phaseTab    = 'fluxos'
  renderSettingsTags()
}

// ══════════════════════════════════════════════════════════════
//  CONTROLES DE ESTADO
// ══════════════════════════════════════════════════════════════
function tagsSetPhase(phaseId)   { _activePhase = phaseId; _phaseTab = 'tags'; renderSettingsTags() }
function tagsSetPhaseTab(tab)    { _phaseTab = tab; renderSettingsTags() }
// Legado — mantidos para compatibilidade com código externo
function tagsSetSub(s)          { _subScreen = s; if (s==='tags') { _activePhase=_tagsTab } else if (s==='fluxos') { _phaseTab='fluxos' } else if (s==='kanban') { _phaseTab='kanban' } renderSettingsTags() }
function tagsSetTab(t)          { _tagsTab = t; _activePhase = t; _phaseTab = 'tags'; renderSettingsTags() }
function tagsSetTplTab(t)       { _tplTab = t; renderSettingsTags() }
function tagsSetKanbanGroup(g)  { _kanbanGroup = g; _activePhase = g; _phaseTab = 'kanban'; renderSettingsTags() }

function tagsToggleCfg(key, val) {
  const cfg   = TagEngine.getCfg()
  cfg[key]    = val
  TagEngine.saveCfg(cfg)
  renderSettingsTags()
}

function tagsToggleFlow(id, ativo) {
  const flow = TagEngine.getFlows().find(f=>f.id===id)
  if (flow) { flow.ativo = ativo; TagEngine.saveFlow(flow) }
  renderSettingsTags()
}

// ══════════════════════════════════════════════════════════════
//  PÁGINA: PACIENTE + ORÇAMENTO
// ══════════════════════════════════════════════════════════════
function renderPatientsBudget() {
  const page = document.getElementById('page-patients-budget')
  if (!page) return
  page.innerHTML = `
    <div style="max-width:960px;margin:0 auto;padding:28px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Paciente + Orçamento</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Gerencie orçamentos e acompanhe o pipeline de conversão</p>
        </div>
        <button onclick="tagsOpenBudgetForm()"
          style="display:flex;align-items:center;gap:6px;padding:9px 16px;background:#8B5CF6;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">
          <i data-feather="plus" style="width:14px;height:14px"></i> Novo Orçamento
        </button>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        ${[
          {label:'Abertos',     value:TagEngine.getBudgets().filter(b=>b.status==='aberto'||b.status==='enviado').length,       cor:'#A78BFA', icon:'file-plus'},
          {label:'Em Negociação',value:TagEngine.getBudgets().filter(b=>b.status==='em_negociacao').length,                     cor:'#F59E0B', icon:'git-merge'},
          {label:'Fechados',    value:TagEngine.getBudgets().filter(b=>b.status==='fechado').length,                             cor:'#059669', icon:'check-circle'},
          {label:'Perdidos',    value:TagEngine.getBudgets().filter(b=>b.status==='perdido').length,                             cor:'#9CA3AF', icon:'x-circle'},
        ].map(s=>`
          <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:16px">
            <div style="width:34px;height:34px;border-radius:9px;background:${s.cor}15;display:flex;align-items:center;justify-content:center;margin-bottom:10px">
              <i data-feather="${s.icon}" style="width:16px;height:16px;color:${s.cor}"></i>
            </div>
            <div style="font-size:26px;font-weight:800;color:#111827">${s.value}</div>
            <div style="font-size:11px;color:#9CA3AF;font-weight:500">${s.label}</div>
          </div>`).join('')}
      </div>

      <!-- Lista de orçamentos -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;font-size:13px;font-weight:700;color:#374151">
          Orçamentos Recentes
        </div>
        ${TagEngine.getBudgets().length ? TagEngine.getBudgets().slice(0,20).map(b=>{
          const stCor = {aberto:'#A78BFA',enviado:'#8B5CF6',em_negociacao:'#F59E0B',followup:'#C4B5FD',fechado:'#059669',perdido:'#9CA3AF'}[b.status]||'#9CA3AF'
          return `<div style="padding:12px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:12px">
            <div style="width:8px;height:8px;border-radius:50%;background:${stCor};flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:12.5px;font-weight:600;color:#111827">${b.entity_id||'Paciente'}</div>
              <div style="font-size:11px;color:#9CA3AF">
                ${b.status} · ${b.objecao_principal?'Objeção: '+b.objecao_principal:''} · ${new Date(b.created_at||Date.now()).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div style="font-size:14px;font-weight:700;color:#111827">R$ ${(b.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>`}).join('')
          : `<div style="padding:40px;text-align:center;color:#D1D5DB;font-size:12px">Nenhum orçamento cadastrado</div>`}
      </div>
    </div>`
  featherIn(document.getElementById('page-patients-budget'))
}

function tagsOpenBudgetForm() {
  const objections = TagEngine.getObjections()
  const inpStyle   = 'width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const lbl        = text => `<label style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">${text}</label>`

  _ensureModal()
  _openModal(`
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #F3F4F6">
        <div style="font-size:15px;font-weight:700;color:#111">Novo Orçamento</div>
        <button onclick="tagsCloseModal()" style="width:28px;height:28px;border:none;background:#F3F4F6;border-radius:7px;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
      </div>
      <div style="display:grid;gap:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${lbl('Paciente / Lead')}
            <input id="bdf_entity" type="text" placeholder="Nome do paciente" style="${inpStyle}">
          </div>
          <div>${lbl('Valor Total (R$)')}
            <input id="bdf_valor" type="number" placeholder="0.00" step="0.01" style="${inpStyle}">
          </div>
        </div>
        <div>${lbl('Objeção Principal')}
          <select id="bdf_obj" style="${inpStyle}">
            <option value="">— Nenhuma —</option>
            ${objections.map(o=>`<option value="${o.id}">${o.nome}</option>`).join('')}
          </select>
        </div>
        <div>${lbl('Observações')}
          <textarea id="bdf_obs" rows="2" style="${inpStyle};resize:vertical" placeholder="Anotações sobre o orçamento..."></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid #F3F4F6">
          <button onclick="tagsCloseModal()" style="padding:9px 18px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;cursor:pointer">Cancelar</button>
          <button onclick="tagsSaveBudgetForm()" style="padding:9px 20px;background:#8B5CF6;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">Criar Orçamento</button>
        </div>
      </div>
    </div>`)
}

function tagsSaveBudgetForm() {
  const entity = document.getElementById('bdf_entity')?.value?.trim()
  if (!entity) { _toastWarn('Informe o paciente.'); return }
  const budget = {
    id:                 TagEngine.uid(),
    entity_id:          entity,
    entity_type:        'patient',
    status:             'aberto',
    valor_total:        parseFloat(document.getElementById('bdf_valor')?.value)||0,
    objecao_principal:  document.getElementById('bdf_obj')?.value||'',
    observacoes:        document.getElementById('bdf_obs')?.value?.trim()||'',
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }
  TagEngine.saveBudget(budget)
  // Aplicar tag de orçamento aberto
  TagEngine.applyTag(entity, 'patient', 'orcamento_aberto', 'sistema', { nome:entity })
  tagsCloseModal()
  renderPatientsBudget()
}

// ══════════════════════════════════════════════════════════════
//  PÁGINA: ORÇAMENTOS (consulta sem procedimento + orçamento)
// ══════════════════════════════════════════════════════════════
function renderOrcamentos() {
  const page = document.getElementById('page-orcamentos')
  if (!page) return
  if (!window.TagEngine) return
  TagEngine.ensureSeeds()
  _ensureModal()

  const budgets    = TagEngine.getBudgets().filter(b => b.budget_type === 'consulta_only')
  const allBudgets = TagEngine.getBudgets()
  const objections = TagEngine.getObjections()

  const stLabel = { aberto:'Em aberto', enviado:'Enviado', em_negociacao:'Em negociação', followup:'Follow-up', aprovado:'Aprovado', perdido:'Perdido' }
  const stCor   = { aberto:'#FCD34D', enviado:'#F59E0B', em_negociacao:'F97316', followup:'#FDE68A', aprovado:'#059669', perdido:'#9CA3AF' }
  const fmtDate = d => { try { return new Date(d).toLocaleDateString('pt-BR') } catch{ return '' } }
  const fmtBRL  = v => 'R$ ' + (parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

  const tabs = [
    { id:'aberto',        label:'Em aberto',      cor:'#FCD34D' },
    { id:'enviado',       label:'Enviado',         cor:'#F59E0B' },
    { id:'em_negociacao', label:'Em negociação',   cor:'#F97316' },
    { id:'aprovado',      label:'Aprovados',       cor:'#059669' },
    { id:'perdido',       label:'Perdidos',        cor:'#9CA3AF' },
  ]

  const statData = [
    { label:'Em aberto',      value: budgets.filter(b=>b.status==='aberto'||b.status==='enviado').length,      cor:'#FCD34D', icon:'clipboard' },
    { label:'Em negociação',  value: budgets.filter(b=>b.status==='em_negociacao').length,                     cor:'#F97316', icon:'git-merge' },
    { label:'Aprovados',      value: budgets.filter(b=>b.status==='aprovado').length,                          cor:'#059669', icon:'check-circle' },
    { label:'Perdidos',       value: budgets.filter(b=>b.status==='perdido').length,                           cor:'#9CA3AF', icon:'x-circle' },
    { label:'Total gerado',   value: fmtBRL(budgets.reduce((s,b)=>s+(parseFloat(b.valor_total)||0),0)),        cor:'#7C3AED', icon:'trending-up', noNum:true },
  ]

  page.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">

      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Orçamentos</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Pessoas que fizeram consulta, não realizaram procedimento e saíram com orçamento</p>
        </div>
        <button onclick="tagsOpenCheckoutModal(null,null,[])"
          style="display:flex;align-items:center;gap:6px;padding:9px 16px;background:#F59E0B;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">
          <i data-feather="log-out" style="width:14px;height:14px"></i> Registrar Saída
        </button>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
        ${statData.map(s=>`
          <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:14px 16px">
            <div style="width:32px;height:32px;border-radius:9px;background:${s.cor}18;display:flex;align-items:center;justify-content:center;margin-bottom:9px">
              <i data-feather="${s.icon}" style="width:15px;height:15px;color:${s.cor}"></i>
            </div>
            <div style="font-size:${s.noNum?'16px':'24px'};font-weight:800;color:#111827">${s.value}</div>
            <div style="font-size:11px;color:#9CA3AF;font-weight:500;margin-top:1px">${s.label}</div>
          </div>`).join('')}
      </div>

      <!-- Diferença explicada -->
      <div style="padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
        <i data-feather="info" style="width:14px;height:14px;color:#D97706;flex-shrink:0"></i>
        <span style="font-size:12px;color:#92400E">
          <strong>Orçamento</strong> = realizou consulta, <u>não fez procedimento</u>, saiu com proposta.
          <strong style="margin-left:12px">Paciente + Orçamento</strong> = fez procedimento E saiu com orçamento para outro tratamento.
        </span>
      </div>

      <!-- Lista de orçamentos -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:13px;font-weight:700;color:#374151">Todos os orçamentos deste fluxo</div>
          <span style="font-size:11px;color:#9CA3AF">${budgets.length} registros</span>
        </div>

        ${budgets.length ? budgets.slice(0,30).map(b=>{
          const objLabel = objections.find(o=>o.id===b.objecao_principal)?.nome || b.objecao_principal || '—'
          const stC      = {aberto:'#FCD34D',enviado:'#F59E0B',em_negociacao:'#F97316',followup:'#FDE68A',aprovado:'#059669',perdido:'#9CA3AF'}[b.status]||'#9CA3AF'
          return `
            <div style="padding:12px 18px;border-bottom:1px solid #F9FAFB;display:grid;grid-template-columns:28px 1fr 120px 130px 90px 80px;align-items:center;gap:12px">
              <div style="width:10px;height:10px;border-radius:50%;background:${stC}"></div>
              <div>
                <div style="font-size:12.5px;font-weight:700;color:#111827">${b.entity_name||b.entity_id||'—'}</div>
                <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${fmtDate(b.created_at)}</div>
              </div>
              <div style="font-size:12px;color:#6B7280">${b.procedure_consulta||'Consulta'}</div>
              <div style="font-size:11px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${objLabel}">
                ${b.objecao_principal?`<i data-feather="alert-circle" style="width:10px;height:10px;vertical-align:middle;color:#F59E0B"></i> ${objLabel}`:'—'}
              </div>
              <div style="font-size:13px;font-weight:700;color:#111827">${fmtBRL(b.valor_total)}</div>
              <div>
                <select onchange="orcUpdateStatus('${b.id}',this.value)"
                  style="font-size:11px;padding:4px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#374151">
                  ${['aberto','enviado','em_negociacao','followup','aprovado','perdido'].map(s=>`<option value="${s}" ${b.status===s?'selected':''}>${stLabel[s]||s}</option>`).join('')}
                </select>
              </div>
            </div>`}).join('')
          : `<div style="padding:52px;text-align:center;color:#D1D5DB;font-size:12px">
              <i data-feather="clipboard" style="width:40px;height:40px;display:block;margin:0 auto 12px;color:#E5E7EB"></i>
              Nenhum orçamento cadastrado neste fluxo.<br>
              <button onclick="tagsOpenCheckoutModal(null,null,[])"
                style="margin-top:16px;padding:8px 18px;background:#F59E0B;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px">
                <i data-feather="plus" style="width:12px;height:12px"></i> Registrar primeira saída
              </button>
            </div>`}
      </div>
    </div>`
  featherIn(document.getElementById('page-orcamentos'))
}

function orcUpdateStatus(budgetId, newStatus) {
  const all = TagEngine.getBudgets()
  const b   = all.find(x => x.id === budgetId)
  if (!b) return
  b.status     = newStatus
  b.updated_at = new Date().toISOString()
  TagEngine.saveBudget(b)
  // Aplicar tag correspondente ao novo status
  const tagMap = { em_negociacao:'orc_em_negociacao', followup:'orc_followup', aprovado:'orc_aprovado', perdido:'orc_perdido' }
  if (tagMap[newStatus] && b.entity_id) {
    const _slug  = tagMap[newStatus]
    const _eType = b.entity_type || 'lead'
    if (_eType === 'lead' && window.SdrService) {
      window.SdrService.assignTag(_slug, _eType, b.entity_id, 'secretaria').catch(function(e) { console.warn("[tags]", e.message || e) })
    } else {
      TagEngine.applyTag(b.entity_id, _eType, _slug, 'secretaria', { nome: b.entity_name||b.entity_id })
    }
  }
  renderOrcamentos()
}

// ══════════════════════════════════════════════════════════════
//  MODAL: SAÍDA DO PACIENTE (checkout)
//  Determina roteamento automático:
//  procedimento feito + orçamento  → Paciente + Orçamento
//  procedimento feito + sem orçamento → Paciente
//  sem procedimento + orçamento    → Orçamento (novo grupo)
// ══════════════════════════════════════════════════════════════
function tagsOpenCheckoutModal(entityId, entityName, preScheduledProcs) {
  _coProcs  = (preScheduledProcs || []).map(p => ({ nome: p.nome||p, valor: p.valor||0, feito: false, preAgendado: true }))
  _coBudget = []
  _ensureModal()
  _renderCheckoutModal(entityId||'', entityName||'')
}

function _renderCheckoutModal(entityId, entityName) {
  const objections = TagEngine.getObjections()
  const inp = 'padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box'
  const lbl = text => `<label style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">${text}</label>`

  const procsHtml = _coProcs.length ? _coProcs.map((p,i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${p.feito?'#ECFDF5':'#FAFAFA'};border:1px solid ${p.feito?'#6EE7B7':'#E5E7EB'};border-radius:8px;transition:.15s">
      <input type="checkbox" id="cop_${i}" ${p.feito?'checked':''} onchange="coToggleProc(${i},this.checked)"
        style="width:15px;height:15px;cursor:pointer;accent-color:#10B981;flex-shrink:0">
      <div style="flex:1">
        <div style="font-size:12.5px;font-weight:600;color:#111827">${p.nome}</div>
        ${p.preAgendado?'<div style="font-size:10.5px;color:#9CA3AF">Pré-agendado</div>':''}
      </div>
      <input type="number" value="${p.valor}" min="0" step="0.01" placeholder="R$ 0,00"
        onchange="coUpdateProcVal(${i},this.value)"
        style="width:100px;${inp}" placeholder="Valor">
      <button onclick="coRemoveProc(${i})" style="padding:4px 8px;border:1px solid #FEE2E2;background:#fff;border-radius:6px;cursor:pointer">
        <i data-feather="x" style="width:11px;height:11px;color:#EF4444"></i>
      </button>
    </div>`).join('') : ''

  const budgetItemsHtml = _coBudget.map((item,i) => `
    <div style="display:grid;grid-template-columns:1fr 60px 100px 32px;gap:8px;align-items:center">
      <input type="text" value="${item.nome}" onchange="coBudgetItemUpdate(${i},'nome',this.value)"
        placeholder="Procedimento / serviço" style="${inp};width:100%">
      <input type="number" value="${item.qtd}" min="1" onchange="coBudgetItemUpdate(${i},'qtd',this.value)"
        style="${inp};width:60px;text-align:center">
      <input type="number" value="${item.valor}" min="0" step="0.01" onchange="coBudgetItemUpdate(${i},'valor',this.value)"
        placeholder="Valor" style="${inp};width:100px">
      <button onclick="coBudgetItemRemove(${i})" style="padding:4px 8px;border:1px solid #FEE2E2;background:#fff;border-radius:6px;cursor:pointer">
        <i data-feather="x" style="width:11px;height:11px;color:#EF4444"></i>
      </button>
    </div>`).join('')

  const totalProcs   = _coProcs.filter(p=>p.feito).reduce((s,p)=>s+(parseFloat(p.valor)||0),0)
  const totalBudget  = _coBudget.reduce((s,i)=>s+(parseFloat(i.valor)||0)*(parseInt(i.qtd)||1),0)
  const fmtBRL       = v => 'R$ ' + (parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

  _openModal(`
    <div style="padding:0">

      <!-- Header -->
      <div style="padding:20px 24px 16px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:15px;font-weight:800;color:#111827;display:flex;align-items:center;gap:8px">
            <i data-feather="log-out" style="width:16px;height:16px;color:#10B981"></i>
            Saída do Paciente
          </div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">Registre o que aconteceu para rotear automaticamente</div>
        </div>
        <button onclick="tagsCloseModal()" style="width:28px;height:28px;border:none;background:#F3F4F6;border-radius:7px;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
      </div>

      <div style="padding:20px 24px;display:grid;gap:18px">

        <!-- Paciente -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${lbl('Nome do Paciente')}
            <input id="co_name" type="text" value="${entityName}" placeholder="Nome completo"
              style="${inp};width:100%">
          </div>
          <div>${lbl('Tipo de visita')}
            <select id="co_tipo" style="${inp};width:100%">
              <option value="consulta">Consulta</option>
              <option value="retorno">Retorno</option>
              <option value="procedimento">Procedimento agendado</option>
              <option value="avaliacao">Avaliação</option>
            </select>
          </div>
        </div>

        <!-- Procedimentos -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:12px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
              <i data-feather="activity" style="width:13px;height:13px;color:#10B981"></i>
              Procedimentos realizados hoje
              <span style="font-size:10px;font-weight:400;color:#9CA3AF">— marque os que foram feitos</span>
            </div>
            <button onclick="coAddProc()" style="font-size:11px;font-weight:700;color:#7C3AED;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px">
              <i data-feather="plus" style="width:11px;height:11px"></i> Adicionar
            </button>
          </div>
          <div id="co-procs-list" style="display:grid;gap:6px">
            ${procsHtml || `<div style="padding:14px;background:#FAFAFA;border:1.5px dashed #E5E7EB;border-radius:8px;text-align:center;font-size:12px;color:#9CA3AF">
              Nenhum procedimento pré-agendado.
              <button onclick="coAddProc()" style="color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:700;font-size:12px">Adicionar</button>
            </div>`}
          </div>
          ${_coProcs.filter(p=>p.feito).length?`
            <div style="margin-top:8px;padding:8px 12px;background:#ECFDF5;border-radius:8px;font-size:12px;font-weight:700;color:#065F46;display:flex;align-items:center;gap:6px">
              <i data-feather="check-circle" style="width:13px;height:13px"></i>
              ${_coProcs.filter(p=>p.feito).length} procedimento(s) feito(s) · Total: ${fmtBRL(totalProcs)}
            </div>`:``}
        </div>

        <!-- Pagamento -->
        <div>
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <i data-feather="credit-card" style="width:13px;height:13px;color:#3B82F6"></i> Pagamento (se aplicável)
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>${lbl('Forma de pagamento')}
              <select id="co_pgto" style="${inp};width:100%">
                <option value="">— Nenhum (só consulta) —</option>
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="credito_1x">Cartão crédito à vista</option>
                <option value="credito_parc">Cartão crédito parcelado</option>
                <option value="debito">Cartão débito</option>
                <option value="transferencia">Transferência</option>
              </select>
            </div>
            <div>${lbl('Valor pago (R$)')}
              <input id="co_valor_pgto" type="number" placeholder="0,00" step="0.01" style="${inp};width:100%">
            </div>
          </div>
        </div>

        <!-- Orçamento -->
        <div style="border:1.5px solid #FDE68A;border-radius:12px;overflow:hidden">
          <div style="padding:12px 16px;background:#FFFBEB;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:12px;font-weight:700;color:#92400E;display:flex;align-items:center;gap:6px">
              <i data-feather="clipboard" style="width:13px;height:13px;color:#D97706"></i>
              Saiu com orçamento?
            </div>
            <div style="display:flex;gap:12px">
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:700;color:#374151">
                <input type="radio" name="co_has_budget" value="sim" onchange="coToggleBudgetSection(true)"
                  style="accent-color:#F59E0B;cursor:pointer"> Sim
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:700;color:#374151">
                <input type="radio" name="co_has_budget" value="nao" checked onchange="coToggleBudgetSection(false)"
                  style="accent-color:#F59E0B;cursor:pointer"> Não
              </label>
            </div>
          </div>

          <div id="co-budget-section" style="display:none;padding:14px 16px;background:#fff;border-top:1px solid #FDE68A">
            <div style="margin-bottom:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em">Itens do orçamento</div>
                <button onclick="coBudgetItemAdd()" style="font-size:11px;font-weight:700;color:#F59E0B;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px">
                  <i data-feather="plus" style="width:11px;height:11px"></i> Adicionar item
                </button>
              </div>
              <div style="display:grid;gap:7px" id="co-budget-items">
                ${budgetItemsHtml || `<div style="font-size:12px;color:#9CA3AF;padding:8px 0">Clique em "Adicionar item" para incluir os procedimentos do orçamento.</div>`}
              </div>
              ${totalBudget > 0 ? `
                <div style="margin-top:10px;padding:8px 12px;background:#FFFBEB;border-radius:8px;font-size:12px;font-weight:700;color:#92400E;display:flex;align-items:center;gap:6px">
                  <i data-feather="tag" style="width:12px;height:12px"></i> Total do orçamento: ${fmtBRL(totalBudget)}
                </div>` : ''}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>${lbl('Objeção principal')}
                <select id="co_objecao" style="${inp};width:100%">
                  <option value="">— Nenhuma por enquanto —</option>
                  ${objections.map(o=>`<option value="${o.id}">${o.nome}</option>`).join('')}
                </select>
              </div>
              <div>${lbl('Validade do orçamento')}
                <input id="co_validade" type="date" value="${new Date(Date.now()+15*86400000).toISOString().split('T')[0]}"
                  style="${inp};width:100%">
              </div>
            </div>

            <div style="margin-top:10px">${lbl('Observações do orçamento')}
              <textarea id="co_orc_obs" rows="2" placeholder="Condições especiais, parcelamento combinado, etc..."
                style="${inp};width:100%;resize:vertical"></textarea>
            </div>
          </div>
        </div>

        <!-- Pós-saída -->
        <div>
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <i data-feather="send" style="width:13px;height:13px;color:#7C3AED"></i> Ações pós-saída
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <label style="display:flex;align-items:center;gap:7px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="co_wpp" checked style="accent-color:#25D366;width:14px;height:14px">
              <i data-feather="message-circle" style="width:12px;height:12px;color:#25D366"></i>
              <span style="font-size:12px;font-weight:600;color:#374151">Enviar orientações WhatsApp</span>
            </label>
            <label style="display:flex;align-items:center;gap:7px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="co_review" checked style="accent-color:#F59E0B;width:14px;height:14px">
              <i data-feather="star" style="width:12px;height:12px;color:#F59E0B"></i>
              <span style="font-size:12px;font-weight:600;color:#374151">Solicitar avaliação (D+3)</span>
            </label>
            <label style="display:flex;align-items:center;gap:7px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;user-select:none">
              <input type="checkbox" id="co_print" style="accent-color:#6B7280;width:14px;height:14px">
              <i data-feather="printer" style="width:12px;height:12px;color:#6B7280"></i>
              <span style="font-size:12px;font-weight:600;color:#374151">Imprimir orientações</span>
            </label>
          </div>
        </div>

        <!-- Observações gerais -->
        <div>${lbl('Observações gerais')}
          <textarea id="co_obs" rows="2" placeholder="Anotações sobre a consulta, queixas, próximos passos..."
            style="${inp};width:100%;resize:vertical"></textarea>
        </div>

        <!-- Roteamento automático preview -->
        <div id="co-route-preview" style="padding:10px 14px;background:#F0FDF4;border:1px solid #6EE7B7;border-radius:10px;font-size:12px;color:#065F46;display:flex;align-items:center;gap:8px">
          <i data-feather="info" style="width:13px;height:13px;flex-shrink:0"></i>
          <span>Marque os procedimentos realizados e o orçamento para ver o roteamento automático.</span>
        </div>

        <!-- Botões -->
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:6px;border-top:1px solid #F3F4F6">
          <button onclick="tagsCloseModal()" style="padding:10px 20px;border:1px solid #E5E7EB;background:#fff;border-radius:9px;font-size:13px;color:#374151;cursor:pointer">Cancelar</button>
          <button onclick="tagsFinalizeCheckout('${entityId}')"
            style="padding:10px 22px;background:#10B981;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
            <i data-feather="check" style="width:14px;height:14px"></i> Finalizar e registrar
          </button>
        </div>

      </div>
    </div>`)
}

// ── Controles do checkout ─────────────────────────────────────
function coAddProc() {
  _coProcs.push({ nome:'', valor:0, feito:true, preAgendado:false })
  const eid   = document.getElementById('co_name')?.value || ''
  const ename = document.getElementById('co_name')?.value || ''
  _renderCheckoutModal(eid, ename)
}

function coRemoveProc(i) {
  _coProcs.splice(i,1)
  const eid = document.getElementById('co_name')?.value || ''
  _renderCheckoutModal(eid, eid)
}

function coToggleProc(i, val) {
  if (_coProcs[i]) _coProcs[i].feito = val
  _coUpdateRoutePreview()
}

function coUpdateProcVal(i, val) {
  if (_coProcs[i]) _coProcs[i].valor = parseFloat(val)||0
}

function coToggleBudgetSection(show) {
  const sec = document.getElementById('co-budget-section')
  if (sec) sec.style.display = show ? 'block' : 'none'
  _coUpdateRoutePreview()
}

function coBudgetItemAdd() {
  _coBudget.push({ nome:'', qtd:1, valor:0 })
  const eid = document.getElementById('co_name')?.value || ''
  _renderCheckoutModal(eid, eid)
}

function coBudgetItemRemove(i) {
  _coBudget.splice(i,1)
  const eid = document.getElementById('co_name')?.value || ''
  _renderCheckoutModal(eid, eid)
}

function coBudgetItemUpdate(i, field, val) {
  if (_coBudget[i]) _coBudget[i][field] = field==='qtd'?parseInt(val)||1:field==='valor'?parseFloat(val)||0:val
}

function _coUpdateRoutePreview() {
  const el   = document.getElementById('co-route-preview')
  if (!el) return
  const hasProcsDone = _coProcs.filter(p=>p.feito).length > 0
  const hasBudget    = document.querySelector('input[name="co_has_budget"]:checked')?.value === 'sim'

  let msg = '', cor = '#F0FDF4', borderCor = '#6EE7B7', textCor = '#065F46', icon = 'arrow-right'
  if (hasProcsDone && hasBudget) {
    msg = 'Paciente + Orçamento — fez procedimento e saiu com orçamento para outro tratamento.'
    cor = '#F5F3FF'; borderCor = '#C4B5FD'; textCor = '#5B21B6'; icon = 'file-text'
  } else if (hasProcsDone && !hasBudget) {
    msg = 'Paciente — procedimento realizado. Iniciará fluxo de pós-procedimento.'
    cor = '#ECFDF5'; borderCor = '#6EE7B7'; textCor = '#065F46'; icon = 'heart'
  } else if (!hasProcsDone && hasBudget) {
    msg = 'Orçamento — realizou consulta, saiu com proposta. Fluxo de conversão será iniciado.'
    cor = '#FFFBEB'; borderCor = '#FDE68A'; textCor = '#92400E'; icon = 'clipboard'
  } else {
    msg = 'Marque os procedimentos realizados e/ou o orçamento para ver o roteamento automático.'
    cor = '#F9FAFB'; borderCor = '#E5E7EB'; textCor = '#9CA3AF'; icon = 'info'
  }
  el.style.background   = cor
  el.style.borderColor  = borderCor
  el.style.color        = textCor
  el.innerHTML = `<i data-feather="${icon}" style="width:13px;height:13px;flex-shrink:0"></i><span>${msg}</span>`
  featherIn(el)
}

// ── Finalizar checkout ────────────────────────────────────────
function tagsFinalizeCheckout(entityId) {
  const entityName = document.getElementById('co_name')?.value?.trim()
  if (!entityName) { _toastWarn('Informe o nome do paciente.'); return }

  const hasProcsDone = _coProcs.filter(p=>p.feito).length > 0
  const hasBudget    = document.querySelector('input[name="co_has_budget"]:checked')?.value === 'sim'
  const pgto         = document.getElementById('co_pgto')?.value || ''
  const valorPgto    = parseFloat(document.getElementById('co_valor_pgto')?.value)||0
  const objecao      = document.getElementById('co_objecao')?.value || ''
  const validade     = document.getElementById('co_validade')?.value || ''
  const orcObs       = document.getElementById('co_orc_obs')?.value?.trim()||''
  const obs          = document.getElementById('co_obs')?.value?.trim()||''
  const sendWpp      = document.getElementById('co_wpp')?.checked
  const askReview    = document.getElementById('co_review')?.checked

  const eid  = entityId || TagEngine.uid()
  const etype = 'patient'
  const vars  = { nome: entityName }

  if (!hasProcsDone && !hasBudget) {
    _toastWarn('Marque pelo menos um procedimento realizado ou indique que saiu com orçamento.')
    return
  }

  // Registrar orçamento se houver
  if (hasBudget) {
    const totalOrc = _coBudget.reduce((s,i)=>s+(parseFloat(i.valor)||0)*(parseInt(i.qtd)||1),0)
    const budget = {
      id:                 TagEngine.uid(),
      entity_id:          eid,
      entity_name:        entityName,
      entity_type:        etype,
      budget_type:        hasProcsDone ? 'pac_orcamento' : 'consulta_only',
      status:             'aberto',
      valor_total:        totalOrc,
      objecao_principal:  objecao,
      observacoes:        orcObs,
      valido_ate:         validade,
      itens:              _coBudget,
      procedure_consulta: document.getElementById('co_tipo')?.value || 'consulta',
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }
    TagEngine.saveBudget(budget)
  }

  // Roteamento automático de tags
  if (hasProcsDone && hasBudget) {
    // → Paciente + Orçamento
    TagEngine.applyTag(eid, etype, 'procedimento_realizado', 'secretaria', vars)
    TagEngine.applyTag(eid, etype, 'orcamento_aberto',       'secretaria', vars)
  } else if (hasProcsDone && !hasBudget) {
    // → Paciente
    TagEngine.applyTag(eid, etype, 'procedimento_realizado', 'secretaria', vars)
    if (askReview) TagEngine.applyTag(eid, etype, 'avaliacao_pendente', 'sistema', vars)
  } else if (!hasProcsDone && hasBudget) {
    // → Orçamento (novo grupo)
    TagEngine.applyTag(eid, etype, 'orc_em_aberto', 'secretaria', vars)
  }

  // Log automações extras
  if (sendWpp) {
    console.info('[ClinicAI] WhatsApp pós-saída enfileirado para:', entityName)
  }

  tagsCloseModal()

  // Feedback visual e redirecionar para a tela correta
  const destGroup = hasProcsDone && hasBudget ? 'Paciente + Orçamento'
                  : hasProcsDone && !hasBudget ? 'Paciente'
                  : 'Orçamento'

  setTimeout(() => {
    _toastWarn(`Saída registrada!\n${entityName} movido(a) para: ${destGroup}.`)
    if (!hasProcsDone && hasBudget && window.loadOrcamentos) loadOrcamentos()
    else if (hasProcsDone && hasBudget && window.renderPatientsBudget) renderPatientsBudget()
  }, 100)
}

// ══════════════════════════════════════════════════════════════
//  EXPOSE
// ══════════════════════════════════════════════════════════════
window.renderSettingsTags  = renderSettingsTags
window.renderPatientsBudget= renderPatientsBudget
window.tagsSetPhase        = tagsSetPhase
window.tagsSetPhaseTab     = tagsSetPhaseTab
window.tagsGetActivePhase  = tagsGetActivePhase
window.tagsSetSub          = tagsSetSub
window.tagsSetTab          = tagsSetTab
window.tagsSetTplTab       = tagsSetTplTab
window.tagsSetKanbanGroup  = tagsSetKanbanGroup
window.tagsToggleCfg       = tagsToggleCfg
window.tagsToggleFlow      = tagsToggleFlow
window.tagsOpenTagForm     = tagsOpenTagForm
window.tagsSaveTagForm     = tagsSaveTagForm
window.tagsDeleteTag       = tagsDeleteTag
window.tagsOpenTplForm     = tagsOpenTplForm
window.tagsSaveTplForm     = tagsSaveTplForm
window.tagsOpenFlowForm    = tagsOpenFlowForm
window.tagsSaveFlowForm    = tagsSaveFlowForm
window.tagsCloseModal          = tagsCloseModal
window.tagsOpenBudgetForm      = tagsOpenBudgetForm
window.tagsSaveBudgetForm      = tagsSaveBudgetForm
// Desativado: orcamentos gerenciado por orcamentos.js
// window.renderOrcamentos        = renderOrcamentos
window.orcUpdateStatus         = orcUpdateStatus
window.tagsOpenCheckoutModal   = tagsOpenCheckoutModal
window.tagsFinalizeCheckout    = tagsFinalizeCheckout
window.coAddProc               = coAddProc
window.coRemoveProc            = coRemoveProc
window.coToggleProc            = coToggleProc
window.coUpdateProcVal         = coUpdateProcVal
window.coToggleBudgetSection   = coToggleBudgetSection
window.coBudgetItemAdd         = coBudgetItemAdd
window.coBudgetItemRemove      = coBudgetItemRemove
window.coBudgetItemUpdate      = coBudgetItemUpdate

})()
