/**
 * ClinicAI — UI Layer: Salas, Tecnologias, Agenda, SDR
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  MÓDULOS NESTE ARQUIVO (após divisão em módulos)             ║
 * ║                                                              ║
 * ║  • Procedimentos  — loadProceduresList, saveProcedure,       ║
 * ║                     deleteProcedure (API backend)            ║
 * ║  • Agenda Core    — APPT_KEY, renderAgenda, openApptModal,   ║
 * ║                     saveAppt, deleteAppt, drag&drop,         ║
 * ║                     finalização, WhatsApp, anamnese          ║
 * ║  • Notificações   — _renderNotificationBell, _showToast      ║
 * ║  • Registro       — showRegisterModal, doRegister,           ║
 * ║                     aprovarUsuario, rejeitarUsuario           ║
 * ║  • Boot/Init      — DOMContentLoaded (verifica login)        ║
 * ║                                                              ║
 * ║  Módulos extraídos para arquivos próprios:                   ║
 * ║    rooms.js · technologies.js · inj-catalog.js               ║
 * ║    agenda-overview.js · sdr.js                               ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  ⚠ GLOBALS OWNED BY OTHER FILES — NÃO DECLARAR AQUI:        ║
 * ║    API_BASE, apiFetch, getToken  → auth.js                   ║
 * ║    STATUS_LABELS, STATUS_COLORS  → agenda-smart.js           ║
 * ║    setText, formatCurrency, formatDate → utils.js            ║
 * ║    getRooms, renderRoomsList     → rooms.js                  ║
 * ║    getTechnologies               → technologies.js           ║
 * ║    loadAgendaOverview, aoSetPeriod → agenda-overview.js      ║
 * ║    sdrLoadFunnel, sdrSaveResp    → sdr.js                    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  REGRA DE PERSISTÊNCIA:                                      ║
 * ║    Use store.set(KEY, data) — nunca localStorage.setItem()   ║
 * ║    store.set() faz localStorage + Supabase atomicamente      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ─── Helpers ─────────────────────────────────────────────────
// setText · formatCurrency · formatDate → definidos em utils.js (carrega antes deste arquivo)

/** Escapa HTML para prevenir XSS — funcao global unica */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
window.escHtml = escHtml

/** Normaliza campos de lead — garantir valores validos para phase, temperature, source_type */
var LEAD_DEFAULTS = {
  VALID_PHASES: ['lead','agendado','reagendado','compareceu','paciente','orcamento','cancelado','perdido'],
  VALID_TEMPS:  ['hot','warm','cold'],
  VALID_SOURCES:['quiz','manual','import','referral','social'],
  DEFAULT_PHASE: 'lead',
  DEFAULT_TEMP:  'hot',
  DEFAULT_SOURCE:'manual',
}
function normalizeLead(lead) {
  if (!lead) return lead
  // Phase
  if (!lead.phase || LEAD_DEFAULTS.VALID_PHASES.indexOf(lead.phase) === -1) lead.phase = LEAD_DEFAULTS.DEFAULT_PHASE
  // Temperature
  if (!lead.temperature || LEAD_DEFAULTS.VALID_TEMPS.indexOf(lead.temperature) === -1) lead.temperature = LEAD_DEFAULTS.DEFAULT_TEMP
  // Source
  if (!lead.source_type || LEAD_DEFAULTS.VALID_SOURCES.indexOf(lead.source_type) === -1) lead.source_type = LEAD_DEFAULTS.DEFAULT_SOURCE
  // Field name normalization: garantir campos canonicos
  if (!lead.name && lead.nome) lead.name = lead.nome
  if (!lead.phone && lead.telefone) lead.phone = lead.telefone
  if (!lead.phone && lead.whatsapp) lead.phone = lead.whatsapp
  if (!lead.created_at && lead.createdAt) lead.created_at = lead.createdAt
  return lead
}
window.normalizeLead = normalizeLead
window.LEAD_DEFAULTS = LEAD_DEFAULTS

/** Normaliza telefone para WhatsApp (garante 55 + DDD + numero, sem duplicar) */
function formatWaPhone(phone) {
  if (!phone) return ''
  var digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}
window.formatWaPhone = formatWaPhone

// ── Rooms → rooms.js | Technologies → technologies.js | Injectables → inj-catalog.js

// ── Procedimentos (API backend) ───────────────────────────────
async function loadProceduresList() {
  const list = document.getElementById('proceduresList')
  if (!list) return
  list.innerHTML = window.Skeleton ? Skeleton.rows(3, 3) : '<div class="sk sk-line sk-w60" style="margin:24px auto"></div>'

  try {
    const data = await apiFetch('/procedures?active=all')
    const procs = Array.isArray(data) ? data : []
    _cachedProcedures = procs.filter(p => p.active !== false)

    if (!procs.length) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:12px">Nenhum procedimento cadastrado</div>`
      return
    }

    // Agrupar por categoria
    const byCategory = {}
    procs.forEach(p => {
      const cat = p.category || 'Sem categoria'
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(p)
    })

    list.innerHTML = Object.entries(byCategory).map(([cat, items]) => `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;padding:0 4px">${cat}</div>
        ${items.map(p => `
          <div style="background:#fff;border:1px solid #F3F4F6;border-radius:10px;padding:14px 16px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:600;color:${p.active?'#111':'#9CA3AF'};${p.active?'':'text-decoration:line-through'}">${p.name}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:2px">
                ${p.durationMinutes ? p.durationMinutes + ' min' : ''}
                ${p.description ? ' · ' + p.description : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div>
                <div style="font-size:14px;font-weight:700;color:#10B981">${formatCurrency(p.price)}</div>
                ${p.promoPrice ? `<div style="font-size:11px;font-weight:600;color:#F59E0B">Promo: ${formatCurrency(p.promoPrice)}</div>` : ''}
              </div>
              <button data-edit-proc="${p.id}" style="display:flex;align-items:center;gap:5px;background:#F3F4F6;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;color:#374151;cursor:pointer"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver</button>
              <button data-delete-proc="${p.id}" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px;display:inline-flex;align-items:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>`).join('')}
      </div>`).join('')

    // Event delegation para edit/delete
    list.addEventListener('click', function(e) {
      var editBtn = e.target.closest('[data-edit-proc]')
      if (editBtn) {
        var proc = procs.find(function(p) { return p.id === editBtn.dataset.editProc })
        if (proc) editProcedure(proc.id, proc.name, proc.category || '', proc.price, proc.durationMinutes || 60, proc.description || '', proc.promoPrice || 0)
        return
      }
      var delBtn = e.target.closest('[data-delete-proc]')
      if (delBtn) {
        deleteProcedure(delBtn.dataset.deleteProc)
      }
    })
  } catch (e) {
    list.innerHTML = `<div style="color:#EF4444;padding:16px">Erro ao carregar procedimentos</div>`
  }
}

function showAddProcedureForm() {
  document.getElementById('sprc_id').value = ''
  document.getElementById('addProcedureFormTitle').textContent = 'Novo Procedimento'
  document.getElementById('saveProcedureBtn').textContent = 'Salvar'
  ;['sprc_nome','sprc_categoria','sprc_preco','sprc_preco_promo','sprc_duracao','sprc_descricao'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = id === 'sprc_duracao' ? '60' : ''
  })
  document.getElementById('addProcedureForm').style.display = 'block'
  document.getElementById('addProcedureForm').scrollIntoView({ behavior: 'smooth' })
}

function editProcedure(id, nome, categoria, preco, duracao, descricao, precoPromo) {
  document.getElementById('sprc_id').value             = id
  document.getElementById('sprc_nome').value            = nome
  document.getElementById('sprc_categoria').value       = categoria
  document.getElementById('sprc_preco').value           = preco
  document.getElementById('sprc_preco_promo').value     = precoPromo || ''
  document.getElementById('sprc_duracao').value         = duracao
  document.getElementById('sprc_descricao').value       = descricao
  document.getElementById('addProcedureFormTitle').textContent = 'Editar Procedimento'
  document.getElementById('saveProcedureBtn').textContent = 'Atualizar'
  document.getElementById('addProcedureForm').style.display = 'block'
  document.getElementById('addProcedureForm').scrollIntoView({ behavior: 'smooth' })
}

async function saveProcedure() {
  const nome      = document.getElementById('sprc_nome')?.value?.trim()
  const categoria = document.getElementById('sprc_categoria')?.value?.trim()
  const preco     = parseFloat(document.getElementById('sprc_preco')?.value || '0')
  const precoPromo = parseFloat(document.getElementById('sprc_preco_promo')?.value || '0') || undefined
  const duracao   = parseInt(document.getElementById('sprc_duracao')?.value || '60')
  const desc      = document.getElementById('sprc_descricao')?.value?.trim()
  const id        = document.getElementById('sprc_id')?.value

  if (!nome) { _showToast('Atenção', 'Informe o nome do procedimento', 'warn'); return }
  if (!categoria) { _showToast('Atenção', 'Informe a categoria', 'warn'); return }

  const btn = document.getElementById('saveProcedureBtn')
  btn.textContent = 'Salvando...'
  btn.disabled = true

  try {
    if (id) {
      await apiFetch(`/procedures/${id}`, {
        method: 'PUT',
        body: { name: nome, category: categoria, price: preco, promoPrice: precoPromo, durationMinutes: duracao, description: desc || undefined },
      })
    } else {
      await apiFetch('/procedures', {
        method: 'POST',
        body: { name: nome, category: categoria, price: preco, promoPrice: precoPromo, durationMinutes: duracao, description: desc || undefined },
      })
    }
    cancelProcedureForm()
    loadProceduresList()
  } catch (e) {
    btn.textContent = id ? 'Atualizar' : 'Salvar'
    btn.disabled = false
    _showToast('Erro', e.message, 'error')
  }
}

async function deleteProcedure(id) {
  if (!confirm('Remover este procedimento?')) return
  await apiFetch(`/procedures/${id}`, { method: 'DELETE' })
  loadProceduresList()
}

function cancelProcedureForm() {
  document.getElementById('addProcedureForm').style.display = 'none'
  document.getElementById('saveProcedureBtn').disabled = false
}

window.showAddProcedureForm = showAddProcedureForm
window.editProcedure        = editProcedure
window.saveProcedure        = saveProcedure
window.deleteProcedure      = deleteProcedure
window.cancelProcedureForm  = cancelProcedureForm

// ─── Interceptar navegação para carregar dados da página ─────
// Sub-páginas de leads redirecionam todas para leads-all (filtros são na própria página)
const _LEAD_SUBPAGES = new Set([
  'leads-new', 'leads-scheduled', 'leads-attending', 'leads-qualified', 'leads-reactivation',
])

const originalNavigateTo = window.navigateTo
window.navigateTo = function(pageId) {
  // Sub-páginas de leads: redireciona para leads-all sem filtro
  if (_LEAD_SUBPAGES.has(pageId)) {
    originalNavigateTo('leads-all')
    loadLeads()
    return
  }

  originalNavigateTo(pageId)
  if (pageId === 'leads-all') {
    loadLeads()
    if (window.leadsInitTagsFilter) leadsInitTagsFilter()
  }
  if (pageId === 'patients-all')    loadPatients()
  // Orcamentos gerenciado por orcamentos.js via sidebar hook
  // if (pageId === 'orcamentos')      { if (window.renderOrcamentos)     renderOrcamentos() }
  if (pageId === 'patients-budget') { if (window.renderPatientsBudget) renderPatientsBudget() }
  if (pageId === 'settings-tags')   { if (window.renderSettingsTags)   renderSettingsTags() }
  if (pageId === 'settings-backups'){ if (window.renderSettingsBackups) renderSettingsBackups() }
  if (pageId === 'settings-clinic') {
    settingsTab('clinic')
    loadClinicSettings()
  }
  // team-users/profiles/comercial/cs removido: team.js deletado (fluxo unificado em
  // settings-clinic > tabs professionals/users).
}

// ══════════════════════════════════════════════════════════════
//  SISTEMA DE AGENDA — Mês / Semana / Hoje + Drag & Drop
// ══════════════════════════════════════════════════════════════

const APPT_KEY = 'clinicai_appointments'

// Multi-tenant safe: se ClinicStorage disponivel, usa chave namespaced
// por clinic_id (evita leak entre operadores do mesmo device — code-review/agenda.md C4)
function _apptStorageKey() {
  return window.ClinicStorage ? window.ClinicStorage.nsKey(APPT_KEY) : APPT_KEY
}

const AGENDA_SLOTS = (() => {
  const s = []
  for (let h = 7; h <= 20; h++) {
    s.push(`${String(h).padStart(2,'0')}:00`)
    if (h < 20) s.push(`${String(h).padStart(2,'0')}:30`)
  }
  return s
})()

const APPT_STATUS_CFG = {
  agendado:               { label:'Agendado',            color:'#3B82F6', bg:'#EFF6FF', dot:'●' },
  aguardando_confirmacao: { label:'Aguard. Confirmação', color:'#F59E0B', bg:'#FFFBEB', dot:'●' },
  confirmado:             { label:'Confirmado',          color:'#10B981', bg:'#ECFDF5', dot:'●' },
  aguardando:             { label:'Aguardando',          color:'#8B5CF6', bg:'#EDE9FE', dot:'●' },
  na_clinica:             { label:'Na Clínica',          color:'#06B6D4', bg:'#ECFEFF', dot:'●' },
  em_consulta:            { label:'Em Consulta',         color:'#7C3AED', bg:'#F5F3FF', dot:'●' },
  em_atendimento:         { label:'Em Atendimento',      color:'#7C3AED', bg:'#EDE9FE', dot:'●' },
  finalizado:             { label:'Finalizado',          color:'#374151', bg:'#F3F4F6', dot:'●' },
  remarcado:              { label:'Remarcado',           color:'#F97316', bg:'#FFF7ED', dot:'●' },
  cancelado:              { label:'Cancelado',           color:'#EF4444', bg:'#FEF2F2', dot:'●' },
  no_show:                { label:'No-show',             color:'#DC2626', bg:'#FEF2F2', dot:'●' },
}

const MESES_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_PT    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DIAS_GRID  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

// Estado global da agenda
let _agendaView      = 'semana'   // 'mes' | 'semana' | 'hoje'
let _agendaDate      = new Date()
let _activeAgendaCnt = 'agendaRoot'
let _draggedApptId   = null
let _pendingDrag     = null
let _finishProducts  = []

// ── Helpers ───────────────────────────────────────────────────
function getAppointments() {
  try { return JSON.parse(localStorage.getItem(_apptStorageKey()) || '[]') }
  catch (e) { return [] }
}
function saveAppointments(arr) {
  // Escreve na chave namespaced. store.set usa localStorage.setItem.
  try { localStorage.setItem(_apptStorageKey(), JSON.stringify(arr)) }
  catch (e) { /* quota — silencia */ }
  // Fire-and-forget: não bloqueia UI — falhas são silenciosas
  // O serviço já tem o array completo; para identificar o(s) registro(s)
  // que mudaram sem diff complexo, o chamador deve usar AppointmentsService.syncOne()
  // diretamente quando conhece o objeto. Esta função é o fallback geral.
}
function genApptId() {
  // 2026-04-23: appointments.id virou uuid (mig 809). Servidor agora exige
  // UUID puro (mig 811 tem fallback que gera novo se vier formato legado,
  // mas isso causa "id_remapped" no payload e duplica esforco de sync).
  // Aqui na fonte usamos crypto.randomUUID() — disponivel em todos browsers
  // modernos (Chrome 92+, Safari 15.4+, FF 95+). Fallback UUIDv4 manual
  // pra ambientes muito antigos (raro).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0
    var v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}
function dateToISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}
function fmtDate(iso) {
  const [y,m,d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
}

// ── Conflito de horário ───────────────────────────────────────
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function checkConflict(appt, allAppts) {
  const aStart = timeToMin(appt.horaInicio)
  const aEnd   = timeToMin(appt.horaFim)
  for (const b of allAppts) {
    if (b.id === appt.id) continue
    if (b.data !== appt.data) continue
    if (['cancelado','no_show'].includes(b.status)) continue
    const bStart = timeToMin(b.horaInicio)
    const bEnd   = timeToMin(b.horaFim)
    if (aStart >= bEnd || aEnd <= bStart) continue  // sem sobreposição
    const sameProf = appt.profissionalIdx !== undefined && appt.profissionalIdx !== null &&
                     b.profissionalIdx !== undefined && b.profissionalIdx !== null &&
                     String(appt.profissionalIdx) === String(b.profissionalIdx)
    const sameSala = appt.salaIdx !== undefined && appt.salaIdx !== null &&
                     b.salaIdx !== undefined && b.salaIdx !== null &&
                     String(appt.salaIdx) === String(b.salaIdx)
    if (sameProf) return { conflict: true, reason: `Profissional já tem consulta às ${b.horaInicio} (${b.pacienteNome})` }
    if (sameSala) return { conflict: true, reason: `Sala já ocupada às ${b.horaInicio} (${b.pacienteNome})` }
  }
  return { conflict: false }
}

// ── Render unificado ─────────────────────────────────────────
function renderAgenda() {
  const root = document.getElementById('agendaRoot')
  if (!root) return
  const todayIso = dateToISO(new Date())
  const curIso   = dateToISO(_agendaDate)

  // ── Toolbar
  let navLabel = ''
  if (_agendaView === 'mes') {
    navLabel = `${MESES_PT[_agendaDate.getMonth()]} ${_agendaDate.getFullYear()}`
  } else if (_agendaView === 'semana') {
    const ws = _getWeekStart(_agendaDate)
    const we = new Date(ws); we.setDate(ws.getDate() + 6)
    navLabel = `${fmtDate(dateToISO(ws))} — ${fmtDate(dateToISO(we))}`
  } else {
    navLabel = `${fmtDate(curIso)} · ${DIAS_PT[_agendaDate.getDay()]}`
  }

  const viewBtn = (v, label) => {
    const active = _agendaView === v
    return `<button onclick="setAgendaView('${v}')" style="padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid ${active?'#7C3AED':'#E5E7EB'};background:${active?'#7C3AED':'#fff'};color:${active?'#fff':'#374151'}">${label}</button>`
  }

  _updateAgendaKpis()

  const toolbar = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <button onclick="navAgenda(-1)" style="${btnOutline()}">‹</button>
      <div style="font-size:14px;font-weight:700;color:#111;min-width:200px;text-align:center">${navLabel}</div>
      <button onclick="navAgenda(1)"  style="${btnOutline()}">›</button>
      <div id="agendaToolbarAlerts" style="flex:1;display:flex;gap:6px;justify-content:center;align-items:center;overflow:hidden"></div>
      <button onclick="openAgendaHoursQuickEdit()" title="Editar horários de funcionamento" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #E5E7EB;background:#fff;color:#374151;display:inline-flex;align-items:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Horários
      </button>
      <button onclick="if(window.openFinalizarDiaModal)openFinalizarDiaModal()" title="Validar pendências e encerrar o dia" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid #10B981;background:#fff;color:#047857;display:inline-flex;align-items:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Finalizar Dia
      </button>
      <div style="display:flex;gap:4px;background:#F3F4F6;padding:4px;border-radius:10px">
        ${viewBtn('mes','Mês')}${viewBtn('semana','Semana')}${viewBtn('hoje','Hoje')}
      </div>
    </div>`

  const legend = `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
    ${Object.entries(APPT_STATUS_CFG).map(([,s])=>
      `<span style="font-size:11px;font-weight:600;color:${s.color};background:${s.bg};padding:3px 8px;border-radius:20px">${s.dot} ${s.label}</span>`
    ).join('')}
  </div>`

  let body = ''
  if (_agendaView === 'mes')    body = buildMesGrid()
  if (_agendaView === 'semana') body = buildSemanaGrid()
  if (_agendaView === 'hoje')   body = buildHojeGrid()

  const filterBar = window.renderAgendaFilterBar ? renderAgendaFilterBar() : ''
  root.innerHTML = toolbar + filterBar + legend + body
}

// ── KPIs da Agenda — calculados pelo periodo visivel ─────────
function _updateAgendaKpis() {
  var kpiRow = document.getElementById('agendaKpiRow')
  if (!kpiRow) return
  var appts = window.getFilteredAppointments ? getFilteredAppointments() : getAppointments()

  // Determinar range de datas do periodo visivel
  var startIso, endIso
  if (_agendaView === 'hoje') {
    startIso = endIso = dateToISO(_agendaDate)
  } else if (_agendaView === 'semana') {
    var ws = _getWeekStart(_agendaDate)
    var we = new Date(ws); we.setDate(ws.getDate() + 6)
    startIso = dateToISO(ws); endIso = dateToISO(we)
  } else {
    var y = _agendaDate.getFullYear(), m = _agendaDate.getMonth()
    startIso = dateToISO(new Date(y, m, 1))
    endIso = dateToISO(new Date(y, m + 1, 0))
  }

  var inRange = appts.filter(function(a) { return a.data >= startIso && a.data <= endIso })

  var total = inRange.length
  var confirmados = inRange.filter(function(a) { return ['confirmado','aguardando','na_clinica','em_consulta','em_atendimento','finalizado'].includes(a.status) }).length
  var semConfirm = inRange.filter(function(a) { return ['agendado','aguardando_confirmacao'].includes(a.status) }).length
  var noshow = inRange.filter(function(a) { return a.status === 'no_show' }).length
  var noshowPct = total > 0 ? Math.round(noshow / total * 100) : 0
  var finalizados = inRange.filter(function(a) { return a.status === 'finalizado' })
  var faturamento = finalizados.reduce(function(s, a) { return s + (parseFloat(a.valor) || 0) }, 0)
  var previsao = inRange.reduce(function(s, a) { return s + (parseFloat(a.valor) || 0) }, 0)
  var fmtR = function(v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR') }

  kpiRow.innerHTML =

    // Card 1: Agendados | Confirmados
    '<div style="flex:1;background:#fff;border:1px solid #F3F4F6;border-radius:10px;padding:8px 18px;display:flex;align-items:center;gap:8px">' +
      '<div style="width:22px;height:22px;border-radius:6px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>' +
      '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;white-space:nowrap">Agendados</span>' +
      '<span style="font-size:18px;font-weight:800;color:#3B82F6">' + total + '</span>' +
      '<span style="width:1px;height:16px;background:#E5E7EB"></span>' +
      '<span style="font-size:12px;font-weight:600;color:#10B981;white-space:nowrap">' + confirmados + ' conf.</span>' +
    '</div>' +

    // Card 2: Sem Confirmacao
    '<div style="flex:1;background:#fff;border:1px solid ' + (semConfirm > 0 ? '#FDE68A' : '#F3F4F6') + ';border-radius:10px;padding:8px 18px;display:flex;align-items:center;gap:8px">' +
      '<div style="width:22px;height:22px;border-radius:6px;background:#FFFBEB;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>' +
      '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;white-space:nowrap">Sem Confirm.</span>' +
      '<span style="font-size:18px;font-weight:800;color:#D97706">' + semConfirm + '</span>' +
    '</div>' +

    // Card 3: No-show | %
    '<div style="flex:1;background:#fff;border:1px solid ' + (noshow > 0 ? '#FECACA' : '#F3F4F6') + ';border-radius:10px;padding:8px 18px;display:flex;align-items:center;gap:8px">' +
      '<div style="width:22px;height:22px;border-radius:6px;background:#FEF2F2;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>' +
      '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;white-space:nowrap">No-show</span>' +
      '<span style="font-size:18px;font-weight:800;color:#EF4444">' + noshow + '</span>' +
      '<span style="width:1px;height:16px;background:#E5E7EB"></span>' +
      '<span style="font-size:12px;font-weight:600;color:#EF4444">' + noshowPct + '%</span>' +
    '</div>' +

    // Card 4: Previsao | Faturamento
    '<div style="flex:1;background:#fff;border:1px solid #F3F4F6;border-radius:10px;padding:8px 18px;display:flex;align-items:center;gap:8px">' +
      '<div style="width:22px;height:22px;border-radius:6px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>' +
      '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;white-space:nowrap">Prev. | Fat.</span>' +
      '<span style="font-size:13px;font-weight:700;color:#6B7280;white-space:nowrap">' + fmtR(previsao) + '</span>' +
      '<span style="width:1px;height:16px;background:#E5E7EB"></span>' +
      '<span style="font-size:13px;font-weight:800;color:#10B981;white-space:nowrap">' + fmtR(faturamento) + '</span>' +
    '</div>'
}

function _getWeekStart(d) {
  const ws = new Date(d)
  const day = ws.getDay()
  ws.setDate(ws.getDate() - (day === 0 ? 6 : day - 1))
  ws.setHours(0,0,0,0)
  return ws
}

// ── Vista Mês ─────────────────────────────────────────────────
function buildMesGrid() {
  const year  = _agendaDate.getFullYear()
  const month = _agendaDate.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const todayIso = dateToISO(new Date())
  const appts = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments())

  const byDate = {}
  appts.forEach(a => {
    if (!byDate[a.data]) byDate[a.data] = []
    byDate[a.data].push(a)
  })

  const startDay = new Date(first)
  const d0 = startDay.getDay()
  startDay.setDate(startDay.getDate() - (d0 === 0 ? 6 : d0 - 1))

  const cells = []
  const cur = new Date(startDay)
  while (cur <= last || cells.length % 7 !== 0 || cells.length < 35) {
    cells.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
    if (cells.length > 42) break
  }

  const numWeeks = Math.ceil(cells.length / 7)
  // Altura de cada célula para preencher a primeira dobra da página
  const cellH = `calc((100vh - 260px) / ${numWeeks})`

  const header = DIAS_GRID.map(d =>
    `<th style="padding:8px 4px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;text-align:center;border-bottom:2px solid #E5E7EB">${d}</th>`
  ).join('')

  const rows = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    const tds = week.map(day => {
      const iso = dateToISO(day)
      const inMonth = day.getMonth() === month
      const isToday = iso === todayIso
      const count = (byDate[iso] || []).length

      const dayNum = `<div style="font-size:13px;font-weight:${isToday?'800':'600'};${isToday?'background:#7C3AED;color:#fff;width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;':'color:'+(inMonth?'#374151':'#D1D5DB')}">${day.getDate()}</div>`

      const countBubble = count > 0
        ? `<div
            onmouseenter="_mesHoverShow('${iso}',event)"
            onmouseleave="_mesHoverTimer=setTimeout(_mesHoverHide,300)"
            onclick="event.stopPropagation();agendaMesModal('${iso}')"
            style="margin-top:10px;width:36px;height:36px;border-radius:50%;background:#7C3AED;color:#fff;font-size:15px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(124,58,237,.35);transition:transform .15s,box-shadow .15s"
            onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(124,58,237,.5)'"
            onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(124,58,237,.35)'">${count}</div>`
        : ''

      const isPastDay = iso < todayIso
      const canClickDay = !isPastDay || count > 0
      return `<td ${canClickDay?'onclick="setAgendaView(\'hoje\');_agendaDate=new Date(\''+iso+'T12:00\');renderAgenda()"':''}
        ${canClickDay?'ondragover="agendaDragOver(event)" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\'08:00\',0)"':''}
        style="padding:10px 8px;vertical-align:top;border:1px solid #F3F4F6;min-height:${cellH};cursor:${canClickDay?'pointer':'default'};background:${isToday?'#F5F3FF':inMonth?'#fff':'#FAFAFA'};transition:background .1s;${isPastDay&&!count?'opacity:0.4;':''}"
        >
        ${dayNum}
        ${countBubble}
      </td>`
    }).join('')
    rows.push(`<tr>${tds}</tr>`)
  }

  return `<div style="border-radius:12px;border:1px solid #E5E7EB;overflow:hidden">
    <table style="border-collapse:collapse;width:100%;table-layout:fixed">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`
}

// ── Hover Popover: Agendamentos do dia (Vista Mês) ────────────

var _mesHoverTimer = null

function _mesHoverShow(iso, e) {
  clearTimeout(_mesHoverTimer)
  var old = document.getElementById('_mesHoverPop')
  if (old) old.remove()

  var appts = getAppointments().filter(function(a) { return a.data === iso })
    .sort(function(a, b) { return a.horaInicio.localeCompare(b.horaInicio) })
  if (!appts.length) return

  var pop = document.createElement('div')
  pop.id = '_mesHoverPop'
  pop.style.cssText = 'position:fixed;z-index:9998;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1px solid #E5E7EB;min-width:280px;max-width:340px;overflow:hidden'

  var rows = appts.map(function(a) {
    var s = (window.APPT_STATUS_CFG || {})[a.status] || { color:'#6B7280', bg:'#F9FAFB', label:a.status }
    var recBadge = (a.recurrenceGroupId && a.recurrenceIndex && a.recurrenceTotal)
      ? ' <span style="display:inline-block;padding:0 5px;background:#EDE9FE;color:#6D28D9;border-radius:6px;font-size:8px;font-weight:800">' + a.recurrenceIndex + '/' + a.recurrenceTotal + '</span>'
      : ''
    return '<div onclick="_mesHoverHide();openApptDetail(\'' + a.id + '\')" ' +
      'onmouseenter="this.style.background=\'#F5F3FF\'" onmouseleave="this.style.background=\'\'" ' +
      'style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer">' +
        '<div style="flex-shrink:0;min-width:38px;text-align:center">' +
          '<div style="font-size:11px;font-weight:700;color:#374151">' + a.horaInicio + '</div>' +
          '<div style="font-size:10px;color:#9CA3AF">' + (a.horaFim || '') + '</div>' +
        '</div>' +
        '<div style="width:7px;height:7px;border-radius:50%;background:' + s.color + ';flex-shrink:0"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.pacienteNome || 'Paciente') + recBadge + '</div>' +
          '<div style="font-size:10px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.procedimento || '—') + '</div>' +
        '</div>' +
        '<span style="font-size:9px;font-weight:700;color:' + s.color + ';background:' + s.bg + ';padding:2px 7px;border-radius:20px;flex-shrink:0">' + (s.label || a.status) + '</span>' +
    '</div>'
  }).join('')

  pop.innerHTML =
    '<div style="padding:9px 12px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:12px;font-weight:700;color:#374151">' + fmtDate(iso) + '</div>' +
      '<div style="font-size:11px;color:#9CA3AF">' + appts.length + ' agendamento' + (appts.length !== 1 ? 's' : '') + '</div>' +
    '</div>' +
    '<div style="padding:6px 4px;max-height:300px;overflow-y:auto">' + rows + '</div>'

  pop.addEventListener('mouseenter', function() { clearTimeout(_mesHoverTimer) })
  pop.addEventListener('mouseleave', function() { _mesHoverTimer = setTimeout(_mesHoverHide, 300) })

  // Posiciona imediatamente abaixo do cursor do mouse
  document.body.appendChild(pop)
  var pw = pop.offsetWidth  || 300
  var ph = pop.offsetHeight || 200
  var cx = (e && e.clientX) ? e.clientX : 0
  var cy = (e && e.clientY) ? e.clientY : 0
  var left = cx - pw / 2
  var top  = cy + 2
  if (left + pw > window.innerWidth  - 8) left = window.innerWidth  - pw - 8
  if (left < 8) left = 8
  if (top  + ph > window.innerHeight - 8) top  = cy - ph - 2
  pop.style.left = left + 'px'
  pop.style.top  = top  + 'px'
}

function _mesHoverHide() {
  clearTimeout(_mesHoverTimer)
  var pop = document.getElementById('_mesHoverPop')
  if (pop) pop.remove()
}

// ── Modal: Agendamentos do dia (Vista Mês) ─────────────────────
function agendaMesModal(iso) {
  const appts = getAppointments().filter(a => a.data === iso)
    .sort((a,b) => a.horaInicio.localeCompare(b.horaInicio))
  const dateStr = fmtDate(iso)

  const rows = appts.length === 0
    ? `<div style="text-align:center;color:#9CA3AF;padding:32px 20px;font-size:13px">Nenhum agendamento neste dia</div>`
    : appts.map(a => {
        const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
        return `<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #F3F4F6">
          <div style="flex-shrink:0;width:48px;text-align:center">
            <div style="font-size:12px;font-weight:700;color:#374151">${a.horaInicio}</div>
            <div style="font-size:10px;color:#9CA3AF">${a.horaFim}</div>
          </div>
          <div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:${s.color}"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.pacienteNome||'Paciente'}</div>
            <div style="font-size:11px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.procedimento||'—'}</div>
          </div>
          <span style="flex-shrink:0;font-size:10px;font-weight:700;color:${s.color};background:${s.bg};padding:3px 9px;border-radius:20px">${s.label||a.status}</span>
          <button onclick="document.getElementById('agendaMesDlg').remove();openApptDetail('${a.id}')"
            style="flex-shrink:0;font-size:11px;padding:5px 11px;background:#7C3AED;color:#fff;border:none;border-radius:7px;cursor:pointer;font-weight:600">Perfil</button>
        </div>`
      }).join('')

  const dlg = document.createElement('div')
  dlg.id = 'agendaMesDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:520px;max-height:78vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB;flex-shrink:0">
        <div>
          <div style="font-size:16px;font-weight:800;color:#111827">Agendamentos do Dia</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">${dateStr} &mdash; ${appts.length} agendamento${appts.length!==1?'s':''}</div>
        </div>
        <button onclick="document.getElementById('agendaMesDlg').remove()"
          style="width:32px;height:32px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280;flex-shrink:0">&times;</button>
      </div>
      <div style="overflow-y:auto;padding:0 20px 12px;flex:1">${rows}</div>
    </div>`
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  const existing = document.getElementById('agendaMesDlg')
  if (existing) existing.remove()
  document.body.appendChild(dlg)
}

// ── Vista Semana ──────────────────────────────────────────────
function buildSemanaGrid() {
  const ws = _getWeekStart(_agendaDate)
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d
  })
  const todayIso = dateToISO(new Date())
  const appts = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments())

  const cellMap = {}
  appts.forEach(a => {
    const key = `${a.data}_${a.horaInicio}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(a)
  })

  const colW = `calc((100% - 72px) / 7)`

  const ths = days.map(d => {
    const iso = dateToISO(d)
    const isToday = iso === todayIso
    return `<th style="width:${colW};padding:8px 6px;font-size:12px;font-weight:700;color:${isToday?'#7C3AED':'#374151'};border-right:1px solid #E5E7EB;text-align:center;background:${isToday?'#F5F3FF':'#F9FAFB'}">
      <div>${DIAS_PT[d.getDay()]}</div>
      <div style="font-size:16px;font-weight:800">${d.getDate()}</div>
    </th>`
  }).join('')

  const bodyRows = AGENDA_SLOTS.map(slot => {
    const isHour = slot.endsWith(':00')
    const tds = days.map(d => {
      const iso = dateToISO(d)
      const key = `${iso}_${slot}`
      const isToday = iso === todayIso
      const cellAppts = cellMap[key] || []
      const cards = cellAppts.map((a, ci) => apptCardSmall(a, ci, cellAppts.length)).join('')
      const isPast = iso < todayIso
      const hasCards = cards.length > 0
      // Marcações de horário (almoço/fechado/fora)
      const slotInfo = (window.AgendaValidator && AgendaValidator.isSlotBlocked)
        ? AgendaValidator.isSlotBlocked(iso, slot, 15) : { blocked: false }
      const blockedBg = slotInfo.blocked
        ? (slotInfo.kind === 'lunch'
            ? 'background-image:repeating-linear-gradient(45deg,#FEF3C7,#FEF3C7 4px,#FDE68A 4px,#FDE68A 8px);'
            : 'background-image:repeating-linear-gradient(45deg,#F3F4F6,#F3F4F6 4px,#E5E7EB 4px,#E5E7EB 8px);')
        : ''
      const clickable = (!isPast && !slotInfo.blocked) || hasCards
      const title = slotInfo.blocked && !hasCards ? `title="${slotInfo.reason || 'Bloqueado'}"` : ''
      return `<td ${title} ${clickable?'ondragover="agendaDragOver(event,\''+iso+'\',\''+slot+'\')" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\''+slot+'\',0)"':''}
        ${clickable&&!slotInfo.blocked?'onclick="if(!event.target.closest(\'[data-apptid]\'))openApptModal(null,\''+iso+'\',\''+slot+'\',null)"':''}
        data-slot-blocked="${slotInfo.blocked?'1':'0'}" data-slot-kind="${slotInfo.kind||''}"
        style="width:${colW};padding:2px 3px;border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};height:34px;vertical-align:top;cursor:${clickable?(slotInfo.blocked?'not-allowed':'pointer'):'default'};position:relative;background:${isToday?'#FEFCE8':isPast&&!hasCards?'#F9FAFB':''};${blockedBg}${isPast&&!hasCards?'opacity:0.5;':''}"
        >${cards}</td>`
    }).join('')
    return `<tr style="background:${isHour?'#FAFAFA':'#fff'}">
      <td style="width:72px;padding:4px 10px;font-size:11px;font-weight:${isHour?'700':'400'};color:${isHour?'#374151':'#9CA3AF'};border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};white-space:nowrap;position:sticky;left:0;background:${isHour?'#FAFAFA':'#fff'};z-index:1">${slot}</td>
      ${tds}
    </tr>`
  }).join('')

  return `<div style="width:100%;overflow-x:auto;border-radius:12px;border:1px solid #E5E7EB;box-sizing:border-box">
    <table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:600px">
      <thead><tr style="background:#F9FAFB">
        <th style="width:72px;padding:10px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;border-right:1px solid #E5E7EB;position:sticky;left:0;background:#F9FAFB;z-index:2">Hora</th>
        ${ths}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`
}

// ── Vista Hoje (por profissional) ─────────────────────────────
function buildHojeGrid() {
  const iso      = dateToISO(_agendaDate)
  const todayIso = dateToISO(new Date())
  const profs    = getProfessionals()
  const appts    = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments()).filter(a => a.data === iso)

  const cellMap = {}
  appts.forEach(a => {
    const key = `${a.horaInicio}_${a.profissionalIdx ?? 0}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(a)
  })

  // Filtrar profissionais sem espaco na agenda, preservando o indice original
  // em _origIdx (appointments.profissionalIdx referencia getProfessionals() completo).
  const visibleProfs = profs
    .map((p, origIdx) => ({ ...p, _origIdx: origIdx }))
    .filter(p => p.agenda_enabled !== false)
  const cols = visibleProfs.length ? visibleProfs : [{ nome: 'Sem profissional', _origIdx: 0 }]
  const profColW = cols.length > 0 ? `calc((100% - 72px) / ${cols.length})` : '100%'

  // Horario da clinica no dia
  const day = (window.AgendaValidator && AgendaValidator.getClinicDay) ? AgendaValidator.getClinicDay(iso) : { aberto: true, periods: [] }

  // Se dia fechado — mostra aviso acima da tabela e pinta tudo cinza
  const closedBanner = !day.aberto
    ? '<div style="background:#F3F4F6;border:1px dashed #D1D5DB;border-radius:10px;padding:14px 18px;margin-bottom:10px;text-align:center;color:#6B7280;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Clínica fechada neste dia. Configure em <a href="#" onclick="openAgendaHoursQuickEdit();return false" style="color:#7C3AED;text-decoration:underline;font-weight:700">Horários</a>.</div>'
    : ''

  const ths = cols.map((p,i) =>
    `<th style="width:${profColW};padding:10px 12px;font-size:12px;font-weight:700;color:#374151;border-right:1px solid #E5E7EB;text-align:center">
      <div>${p.nome}</div>
      ${p.especialidade?`<div style="font-size:10px;font-weight:400;color:#9CA3AF">${p.especialidade}</div>`:''}
    </th>`
  ).join('')

  const bodyRows = AGENDA_SLOTS.map(slot => {
    const isHour = slot.endsWith(':00')
    // Verificar se esse slot cai em horario bloqueado (almoco / fora / fechado)
    const slotInfo = (window.AgendaValidator && AgendaValidator.isSlotBlocked)
      ? AgendaValidator.isSlotBlocked(iso, slot, 15)
      : { blocked: false }
    const isBlocked = slotInfo.blocked
    const blockKind = slotInfo.kind // 'closed' | 'lunch' | 'out'
    // Estilo do slot bloqueado
    const blockedBg = isBlocked
      ? (blockKind === 'lunch'
          ? 'background-image:repeating-linear-gradient(45deg,#FEF3C7,#FEF3C7 5px,#FDE68A 5px,#FDE68A 10px);'
          : 'background-image:repeating-linear-gradient(45deg,#F3F4F6,#F3F4F6 5px,#E5E7EB 5px,#E5E7EB 10px);')
      : ''
    const tds = cols.map((c) => {
      // pi usa o indice original do profissional, nao a posicao na tabela filtrada
      const pi = c._origIdx
      const key = `${slot}_${pi}`
      const cards = (cellMap[key] || []).map(a => apptCard(a, pi)).join('')
      const isPastDay = iso < todayIso
      const hasAppts = cards.length > 0
      // Slot bloqueado so permite click se tem appts existentes (pra editar)
      const canClick = (!isPastDay && !isBlocked) || hasAppts
      const title = isBlocked && !hasAppts ? `title="${slotInfo.reason || 'Horário bloqueado'}"` : ''
      return `<td ${title} ${canClick?'ondragover="agendaDragOver(event,\''+iso+'\',\''+slot+'\')" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\''+slot+'\','+pi+')"':''}
        ${canClick&&!isBlocked?'onclick="if(!event.target.closest(\'[data-apptid]\'))openApptModal(null,\''+iso+'\',\''+slot+'\','+pi+')"':''}
        data-slot-blocked="${isBlocked?'1':'0'}" data-slot-kind="${blockKind||''}"
        style="width:${profColW};padding:3px 4px;border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};height:38px;vertical-align:top;cursor:${canClick?(isBlocked?'not-allowed':'pointer'):'default'};transition:background .1s;position:relative;${blockedBg}${isPastDay&&!hasAppts?'opacity:0.5;':''}"
        >${cards}</td>`
    }).join('')
    // Label inline no horario (ex: "ALMOCO" no primeiro slot da faixa)
    const lunchBadge = isBlocked && blockKind === 'lunch' && slot.endsWith(':00')
      ? '<span style="position:absolute;right:6px;font-size:9px;font-weight:700;color:#D97706;letter-spacing:0.04em">ALMOÇO</span>'
      : ''
    return `<tr style="background:${isHour?'#FAFAFA':'#fff'}">
      <td style="width:72px;padding:6px 10px;font-size:11px;font-weight:${isHour?'700':'400'};color:${isHour?'#374151':'#9CA3AF'};border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};white-space:nowrap;position:sticky;left:0;background:${isHour?'#FAFAFA':'#fff'};z-index:1;position:relative">${slot}${lunchBadge}</td>
      ${tds}
    </tr>`
  }).join('')

  return closedBanner + `<div style="width:100%;overflow-x:auto;border-radius:12px;border:1px solid #E5E7EB;box-sizing:border-box;${!day.aberto?'opacity:0.55;':''}">
    <table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:${72 + cols.length * 140}px">
      <thead><tr style="background:#F9FAFB">
        <th style="width:72px;padding:10px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;border-right:1px solid #E5E7EB;position:sticky;left:0;background:#F9FAFB;z-index:2">Hora</th>
        ${ths}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`
}

// ── Cards ─────────────────────────────────────────────────────
// ── Tooltip de hover nos cards ────────────────────────────────

function _apptTip(e, id) {
  var appts = getAppointments()
  var a = appts.find(function(x) { return x.id === id })
  if (!a) return
  var tip = document.getElementById('_apptHoverTip')
  if (!tip) {
    tip = document.createElement('div')
    tip.id = '_apptHoverTip'
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;background:#1F2937;color:#fff;border-radius:12px;padding:0;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);min-width:240px;max-width:290px;transition:opacity .15s;overflow:hidden'
    document.body.appendChild(tip)
  }
  var s = (window.APPT_STATUS_CFG || {})[a.status] || { label: a.status, color: '#9CA3AF' }
  var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
  var rooms = typeof getRooms === 'function' ? getRooms() : []
  var profNome = a.profissionalNome || (profs[a.profissionalIdx] && profs[a.profissionalIdx].nome) || ''
  var salaNome = (a.salaIdx !== null && a.salaIdx !== undefined && rooms[a.salaIdx]) ? rooms[a.salaIdx].nome : ''
  var phone = a.pacientePhone || ''
  if (!phone) {
    var leads = window.LeadsService ? LeadsService.getLocal() : []
    var lead = a.pacienteId ? leads.find(function(l) { return l.id === a.pacienteId }) : null
    if (lead) phone = lead.phone || lead.whatsapp || ''
  }
  var fmtPhone = phone ? phone.replace(/\D/g,'') : ''
  if (fmtPhone.length === 13) fmtPhone = '(' + fmtPhone.slice(2,4) + ') ' + fmtPhone.slice(4,9) + '-' + fmtPhone.slice(9)
  else if (fmtPhone.length === 12) fmtPhone = '(' + fmtPhone.slice(2,4) + ') ' + fmtPhone.slice(4,8) + '-' + fmtPhone.slice(8)

  var tipoLabel = a.tipoPaciente === 'retorno' ? 'Retorno' : 'Novo'
  var tipoConsLabel = a.tipoConsulta === 'avaliacao' ? 'Avaliacao' : a.tipoConsulta === 'procedimento' ? 'Procedimento' : a.tipoConsulta || ''
  var origemLabel = { whatsapp:'WhatsApp', instagram:'Instagram', indicacao:'Indicacao', site:'Site', direto:'Direto' }[a.origem] || a.origem || ''
  var valor = a.valor ? 'R$ ' + parseFloat(a.valor).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : ''

  // Pre-consulta checks
  var ckAnamnese = a.anamneseRespondida ? 'ok' : 'pendente'
  var ckConsImg = (a.consentimentoImagem === 'assinado' || a.consentimentoImagem === true) ? 'ok' : 'pendente'
  var ckConfirmacao = a.confirmacaoEnviada ? 'ok' : 'pendente'
  var ckConsentProc = (a.consentimentoProcedimento === 'assinado') ? 'ok' : 'pendente'

  function _ckDot(st) {
    return st === 'ok'
      ? '<span style="width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;margin-right:4px"></span>'
      : '<span style="width:7px;height:7px;border-radius:50%;background:#F59E0B;display:inline-block;margin-right:4px;animation:pulse 1.5s infinite"></span>'
  }
  function _ckLabel(st) { return st === 'ok' ? 'color:#6EE7B7' : 'color:#FCD34D' }

  var tipRecBadge = (a.recurrenceGroupId && a.recurrenceIndex && a.recurrenceTotal)
    ? ' <span style="display:inline-block;padding:1px 6px;background:rgba(167,139,250,.2);color:#C4B5FD;border-radius:6px;font-size:9px;font-weight:800;margin-left:4px">Sessao ' + a.recurrenceIndex + '/' + a.recurrenceTotal + '</span>'
    : ''

  tip.innerHTML =
    // Secao 1: Paciente
    '<div style="padding:10px 13px;border-bottom:1px solid #374151">' +
      '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.pacienteNome || 'Paciente') + tipRecBadge + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">' +
        (fmtPhone ? '<span style="font-size:10px;color:#9CA3AF">' + fmtPhone + '</span>' : '<span></span>') +
        '<span style="font-size:9px;font-weight:700;color:#A78BFA;background:rgba(167,139,250,.15);padding:1px 7px;border-radius:10px">' + tipoLabel + '</span>' +
      '</div>' +
    '</div>' +
    // Secao 2: Consulta
    '<div style="padding:8px 13px;border-bottom:1px solid #374151">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:11px;font-weight:600;color:#E5E7EB">' + (a.procedimento || tipoConsLabel || '—') + '</span>' +
        (tipoConsLabel ? '<span style="font-size:9px;color:#9CA3AF">' + tipoConsLabel + '</span>' : '') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">' +
        '<span style="font-size:10px;color:#9CA3AF">' + (a.horaInicio || '') + (a.horaFim ? ' – ' + a.horaFim : '') + '</span>' +
        (salaNome ? '<span style="font-size:9px;color:#6B7280">' + salaNome + '</span>' : '') +
      '</div>' +
      (profNome ? '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">' + profNome + (origemLabel ? ' · ' + origemLabel : '') + '</div>' : '') +
    '</div>' +
    // Secao 3: Pre-consulta checks
    '<div style="padding:8px 13px;border-bottom:1px solid #374151">' +
      '<div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Pre-consulta</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">' +
        '<div style="font-size:10px;' + _ckLabel(ckAnamnese) + '">' + _ckDot(ckAnamnese) + 'Anamnese</div>' +
        '<div style="font-size:10px;' + _ckLabel(ckConsImg) + '">' + _ckDot(ckConsImg) + 'Consent. Imagem</div>' +
        '<div style="font-size:10px;' + _ckLabel(ckConfirmacao) + '">' + _ckDot(ckConfirmacao) + 'Confirmacao</div>' +
        '<div style="font-size:10px;' + _ckLabel(ckConsentProc) + '">' + _ckDot(ckConsentProc) + 'Consent. Proced.</div>' +
      '</div>' +
    '</div>' +
    // Secao 4: Status + Valor
    '<div style="padding:8px 13px;display:flex;justify-content:space-between;align-items:center">' +
      (valor ? '<span style="font-size:12px;font-weight:700;color:#10B981">' + valor + '</span>' : '<span></span>') +
      '<span style="font-size:10px;font-weight:700;color:' + s.color + ';background:rgba(255,255,255,.1);padding:2px 8px;border-radius:20px">' + (s.label || a.status) + '</span>' +
    '</div>'

  var rect = e.currentTarget.getBoundingClientRect()
  var left = rect.right + 8
  if (left + 300 > window.innerWidth) left = rect.left - 300
  if (left < 8) left = 8
  var top = rect.top
  if (top + 220 > window.innerHeight) top = window.innerHeight - 230
  tip.style.left    = left + 'px'
  tip.style.top     = top + 'px'
  tip.style.opacity = '1'
  tip.style.display = 'block'
}

function _apptTipHide() {
  var tip = document.getElementById('_apptHoverTip')
  if (tip) tip.style.display = 'none'
}

function _apptDurationSlots(a) {
  if (!a.horaInicio || !a.horaFim) return 1
  var sp = a.horaInicio.split(':'), ep = a.horaFim.split(':')
  var mins = (parseInt(ep[0])*60+parseInt(ep[1])) - (parseInt(sp[0])*60+parseInt(sp[1]))
  return Math.max(1, Math.round(mins / 30))
}

function apptCard(a, profIdx) {
  const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const isCancelado = ['cancelado','no_show','finalizado'].includes(a.status)
  const canDrag  = window.AgendaValidator ? AgendaValidator.canDrag(a) : !isCancelado
  const isLocked = ['finalizado','em_consulta','na_clinica'].includes(a.status)
  const cardOpacity = ['cancelado','no_show'].includes(a.status) ? 'opacity:0.55;' : ''

  // Altura proporcional a duracao (cada slot = 38px)
  const slots = _apptDurationSlots(a)
  const cardHeight = (slots * 38) - 4 // -4px para margem

  const tipoLabel = a.tipoConsulta === 'avaliacao' ? 'Avaliacao' : a.tipoConsulta === 'procedimento' ? 'Procedimento' : a.procedimento || '—'

  const allowed = window.STATE_MACHINE ? (window.STATE_MACHINE[a.status] || []) : []
  const statusLabels = window.STATUS_LABELS || {}
  const statusColors = window.STATUS_COLORS || {}
  const optionsHtml = allowed.map(function(ns) {
    return `<option value="${ns}" style="color:${(statusColors[ns]||{}).color||'#374151'}">${statusLabels[ns]||ns}</option>`
  }).join('')

  const recBadge = (a.recurrenceGroupId && a.recurrenceIndex && a.recurrenceTotal)
    ? `<span title="Serie recorrente${a.recurrenceProcedure?' · '+a.recurrenceProcedure:''}" style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#EDE9FE;color:#6D28D9;border-radius:8px;font-size:8px;font-weight:800;margin-left:4px;vertical-align:1px"><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>${a.recurrenceIndex}/${a.recurrenceTotal}</span>`
    : ''

  return `<div data-apptid="${a.id}" draggable="${canDrag}"
    ondragstart="${canDrag ? `agendaDragStart(event,'${a.id}')` : `agendaDragStartBlocked(event,'${a.id}')`}"
    onclick="event.stopPropagation();openApptDetail('${a.id}')"
    onmouseenter="_apptTip(event,'${a.id}')" onmouseleave="_apptTipHide()"
    style="background:${s.bg};border-left:3px solid ${s.color};border-radius:7px;padding:6px 8px;cursor:${canDrag?'grab':'default'};min-width:140px;${cardOpacity}${['cancelado','no_show'].includes(a.status)?'border-left-style:dashed;':''}position:absolute;top:0;left:2px;right:2px;height:${cardHeight}px;z-index:2;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <div style="font-size:11px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.pacienteNome || 'Paciente'}${recBadge}</div>
    <div style="font-size:10px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${tipoLabel}</div>
    <div style="font-size:9px;color:#9CA3AF;margin-top:2px">${a.horaInicio||''}${a.horaFim?' – '+a.horaFim:''}</div>

    ${!isCancelado && allowed.length ? `<select onclick="event.stopPropagation()" onchange="event.stopPropagation();_apptCardStatusChange('${a.id}',this.value);this.value=''" style="width:100%;margin-top:4px;padding:4px 6px;font-size:10px;font-weight:700;color:${s.color};background:${s.bg};border:1.5px solid ${s.color};border-radius:5px;cursor:pointer;outline:none;appearance:auto">
      <option value="">${s.label}</option>
      ${optionsHtml}
    </select>` : `<div style="margin-top:4px;padding:3px 6px;font-size:10px;font-weight:700;color:${s.color};background:${s.bg};border:1px solid ${s.color}33;border-radius:5px;text-align:center">${isLocked?'<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>':''}${s.label}</div>`}

  </div>`
}

// ── Card status change handler ───────────────────────────────
function _apptCardStatusChange(id, newStatus) {
  if (!newStatus) return
  // Cancelar/No-show exigem modal com motivo obrigatorio
  if (newStatus === 'cancelado' || newStatus === 'no_show') {
    if (window.openCancelModal) openCancelModal(id, newStatus)
    return
  }
  // Finalizar tem modal proprio
  if (newStatus === 'finalizado') {
    if (window.openFinalizeModal) openFinalizeModal(id)
    return
  }
  // Transicoes normais via smartTransition (valida + executa + side effects)
  if (window.smartTransition) {
    smartTransition(id, newStatus)
  }
  if (window.renderAgenda) renderAgenda()
}
window._apptCardStatusChange = _apptCardStatusChange

// ── Helpers de nome/clinica (expostos em window para outros modulos) ─────
function _nomeEnxuto(nomeCompleto) {
  // Retorna apenas o primeiro nome. Truncar no 2o nome quebrava casos
  // como "Mirian de Paula" → "Mirian de" (markdown WA ficava "*Mirian de*")
  // ou "Alden Julio Quesada" → "Alden Julio". Primeiro nome é sempre
  // pessoal e não quebra template.
  if (!nomeCompleto) return ''
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] || ''
  return primeiro
}

function _getClinicaNome() {
  try {
    var cfg = JSON.parse(localStorage.getItem('clinicai_clinic_settings') || '{}')
    if (cfg.nome) return cfg.nome
    cfg = JSON.parse(localStorage.getItem('clinic_settings') || '{}')
    return cfg.nome || cfg.clinicName || 'Clinica Mirian de Paula'
  } catch { return 'Clinica Mirian de Paula' }
}

function apptCardSmall(a, colIndex, colTotal) {
  const s        = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const isCancelado = ['cancelado','no_show','finalizado'].includes(a.status)
  const isLocked = ['finalizado','em_consulta','na_clinica'].includes(a.status)
  const canDrag  = window.AgendaValidator ? AgendaValidator.canDrag(a) : !isCancelado
  const cardOpacity = ['cancelado','no_show'].includes(a.status) ? 'opacity:0.55;' : ''

  const slots = _apptDurationSlots(a)
  const cardHeight = (slots * 34) - 4

  // Posicao horizontal: lado a lado quando multiplos no mesmo slot
  const ci = colIndex || 0
  const ct = colTotal || 1
  const widthPct = (100 / ct)
  const leftPct = ci * widthPct

  const allowed = window.STATE_MACHINE ? (window.STATE_MACHINE[a.status] || []) : []
  const statusLabels = window.STATUS_LABELS || {}
  const optionsHtml = allowed.map(function(ns) {
    return `<option value="${ns}">${statusLabels[ns]||ns}</option>`
  }).join('')

  return `<div data-apptid="${a.id}" draggable="${canDrag}"
    ondragstart="${canDrag ? `agendaDragStart(event,'${a.id}')` : `agendaDragStartBlocked(event,'${a.id}')`}"
    onclick="event.stopPropagation();openApptDetail('${a.id}')"
    onmouseenter="_apptTip(event,'${a.id}')" onmouseleave="_apptTipHide()"
    style="background:${s.bg};border-left:3px solid ${s.color}${['cancelado','no_show'].includes(a.status)?';border-left-style:dashed':''};border-radius:6px;padding:4px 5px;cursor:${canDrag?'grab':'default'};${cardOpacity}position:absolute;top:0;left:${leftPct}%;width:calc(${widthPct}% - 4px);height:${cardHeight}px;z-index:2;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:10px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.pacienteNome||'Paciente'}</div>
    <div style="font-size:9px;color:#4B5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.procedimento || (a.tipoConsulta==='avaliacao'?'Avaliacao':a.tipoConsulta||'—')}</div>
    <div style="font-size:8px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.horaInicio||''}${a.horaFim?' – '+a.horaFim:''}</div>
    ${!isCancelado && allowed.length ? `<select onclick="event.stopPropagation()" onchange="event.stopPropagation();_apptCardStatusChange('${a.id}',this.value);this.value=''" style="width:100%;margin-top:2px;padding:2px 3px;font-size:8px;font-weight:700;color:${s.color};background:${s.bg};border:1px solid ${s.color};border-radius:4px;cursor:pointer;outline:none;appearance:auto">
      <option value="">${s.label}</option>
      ${optionsHtml}
    </select>` : `<div style="margin-top:2px;font-size:8px;font-weight:700;color:${s.color};text-align:center">${isLocked?'<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2.5" style="vertical-align:-1px;margin-right:2px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>':''}${s.label}</div>`}
  </div>`
}

// ── Drag & Drop com validação ─────────────────────────────────
function agendaDragStart(e, id) {
  _draggedApptId = id
  e.dataTransfer.effectAllowed = 'move'
  e.currentTarget.style.opacity = '0.5'
}

function agendaDragStartBlocked(e, id) {
  e.preventDefault()
  e.stopPropagation()
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  const SL = window.STATUS_LABELS || {}
  const statusLabel = a ? (SL[a.status] || a.status) : 'desconhecido'
  if (window.showErrorToast) {
    showErrorToast(`Não é possível mover: status "${statusLabel}" está bloqueado.`)
  }
  return false
}

function agendaDragOver(e, iso, slot) {
  e.preventDefault()
  // Se celula esta marcada como bloqueada, mostrar drop-effect "none" + vermelho
  var td = e.currentTarget
  var blocked = td && td.dataset && td.dataset.slotBlocked === '1'
  if (blocked) {
    e.dataTransfer.dropEffect = 'none'
    td.style.outline = '2px solid #EF4444'
    td.style.outlineOffset = '-2px'
    return
  }
  e.dataTransfer.dropEffect = 'move'
  td.style.background = '#EDE9FE'
}
function agendaDragLeave(e) {
  var td = e.currentTarget
  td.style.background = ''
  td.style.outline = ''
}
function agendaDrop(e, iso, slot, profIdx) {
  e.preventDefault()
  var td = e.currentTarget
  td.style.background = ''
  td.style.outline = ''
  // Se slot bloqueado, abortar com toast
  if (td.dataset && td.dataset.slotBlocked === '1') {
    if (window.showErrorToast) showErrorToast('Slot bloqueado (' + (td.dataset.slotKind === 'lunch' ? 'horário de almoço' : td.dataset.slotKind === 'closed' ? 'clínica fechada' : 'fora do expediente') + ')')
    _draggedApptId = null
    return
  }
  if (!_draggedApptId) return
  const appts = getAppointments()
  const a = appts.find(x => x.id === _draggedApptId)
  if (!a) return

  // Calcular nova hora fim mantendo a duração
  const oldStart = a.horaInicio.split(':').map(Number)
  const oldEnd   = a.horaFim.split(':').map(Number)
  const duration = (oldEnd[0]*60+oldEnd[1]) - (oldStart[0]*60+oldStart[1])
  const newFim   = addMinutes(slot, duration)

  // Guardar pendência e mostrar confirmação
  _pendingDrag = { id: a.id, iso, slot, newFim, profIdx, duration,
    oldData: a.data, oldInicio: a.horaInicio, oldFim: a.horaFim, oldProfIdx: a.profissionalIdx }
  _draggedApptId = null
  showDragConfirm(a, iso, slot, newFim, profIdx)
}

function showDragConfirm(a, iso, slot, newFim, profIdx) {
  const m = document.getElementById('agendaDragConfirmModal')
  if (!m) {
    if (_pendingDrag) { _applyDrag(_pendingDrag); _pendingDrag = null }
    return
  }
  const profs = getProfessionals()
  const profNome = profs[profIdx]?.nome || `Prof. ${profIdx}`

  setText('dragConfirmPatient', a.pacienteNome || 'Paciente')
  setText('dragConfirmProc',    a.procedimento || '—')
  setText('dragConfirmFrom',    `${fmtDate(a.data)} ${a.horaInicio}–${a.horaFim}`)
  setText('dragConfirmTo',      `${fmtDate(iso)} ${slot}–${newFim} · ${profNome}`)

  const alert = document.getElementById('dragConflictAlert')
  if (alert) alert.style.display = 'none'

  m.style.display = 'flex'
}

function cancelDragConfirm() {
  _pendingDrag = null
  const m = document.getElementById('agendaDragConfirmModal')
  if (m) m.style.display = 'none'
  refreshCurrentAgenda()
}

function confirmDragReschedule() {
  const m = document.getElementById('agendaDragConfirmModal')
  if (m) m.style.display = 'none'
  if (!_pendingDrag) return
  _applyDrag(_pendingDrag)
  _pendingDrag = null
}

function _applyDrag(pd) {
  const appts = getAppointments()
  const idx   = appts.findIndex(x => x.id === pd.id)
  if (idx < 0) return
  const a = appts[idx]

  // ── Validação via AgendaValidator (camada 1) ──────────────────
  if (window.AgendaValidator) {
    const errs = AgendaValidator.validateDragDrop(a, pd.iso, pd.slot, pd.newFim)
    if (errs.length) {
      if (window.showValidationErrors) showValidationErrors(errs, 'Remarcação não permitida')
      else _showToast('Atenção', errs[0], 'warn')
      refreshCurrentAgenda()
      return
    }
  } else {
    // Fallback: validação de conflito legada
    const provisional = { ...a, data: pd.iso, horaInicio: pd.slot, horaFim: pd.newFim, profissionalIdx: pd.profIdx }
    const { conflict, reason } = checkConflict(provisional, appts)
    if (conflict) {
      _showToast('Atenção', 'Conflito de horario: ' + reason, 'warn')
      refreshCurrentAgenda()
      return
    }
  }

  // Registrar audit log da remarcação
  if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
  appts[idx].historicoAlteracoes.push({
    action_type: 'remarcacao_drag',
    old_value:   { data: a.data, horaInicio: a.horaInicio, horaFim: a.horaFim, profissionalIdx: a.profissionalIdx },
    new_value:   { data: pd.iso, horaInicio: pd.slot, horaFim: pd.newFim, profissionalIdx: pd.profIdx },
    changed_by:  'secretaria',
    changed_at:  new Date().toISOString(),
    reason:      'Remarcação por drag & drop',
  })

  // Registrar histórico de status se necessário
  if (!appts[idx].historicoStatus) appts[idx].historicoStatus = []
  appts[idx].historicoStatus.push({
    status: appts[idx].status,
    at:     new Date().toISOString(),
    by:     'drag_drop',
    motivo: `Remarcado de ${a.data} ${a.horaInicio} para ${pd.iso} ${pd.slot}`,
  })

  // Aplicar nova data/hora/profissional
  appts[idx].data          = pd.iso
  appts[idx].horaInicio    = pd.slot
  appts[idx].horaFim       = pd.newFim
  appts[idx].lastRescheduledAt = new Date().toISOString()
  appts[idx].rescheduledCount  = (appts[idx].rescheduledCount || 0) + 1
  if (pd.profIdx !== undefined) appts[idx].profissionalIdx = pd.profIdx

  saveAppointments(appts)

  // Sync Supabase (fire-and-forget)
  if (window.AppointmentsService?.syncOne) {
    AppointmentsService.syncOne(appts[idx])
  }

  // Recalcular automações com os novos dados
  if (window.scheduleAutomations) scheduleAutomations(appts[idx])

  // Aplicar tag de reagendado
  if (window._applyStatusTag && appts[idx].pacienteId) {
    _applyStatusTag(appts[idx], 'reagendado', 'drag_drop')
  }

  // Hook SDR: registrar reagendamento no historico do lead
  if (window.SdrService && appts[idx].pacienteId) {
    SdrService.onLeadScheduled(appts[idx].pacienteId, appts[idx])
  }

  refreshCurrentAgenda()
}

// ── Navegação unificada ───────────────────────────────────────
function setAgendaView(v) {
  _agendaView = v
  renderAgenda()
}

function navAgenda(dir) {
  if (dir === 0) { _agendaDate = new Date(); renderAgenda(); return }
  if (_agendaView === 'mes') {
    _agendaDate.setMonth(_agendaDate.getMonth() + dir)
  } else if (_agendaView === 'semana') {
    _agendaDate.setDate(_agendaDate.getDate() + dir * 7)
  } else {
    _agendaDate.setDate(_agendaDate.getDate() + dir)
  }
  renderAgenda()
}

function refreshCurrentAgenda() {
  const root = document.getElementById('agendaRoot')
  if (root) { renderAgenda(); return }
  // Fallback compatibilidade com IDs antigos
  if (document.getElementById('agendaRoot')?.isConnected) renderAgenda()
}

// ── Style helpers ─────────────────────────────────────────────
function btnOutline() {
  return 'padding:7px 14px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer'
}
function btnPrimary() {
  return 'padding:8px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer'
}

// Nota: openApptModal canonical esta em js/agenda-modal.js (IIFE, expoe via
// window.openApptModal). A versao legada desta posicao foi removida pra
// eliminar conflito de hoisting que fazia onclicks inline resolverem na
// versao obsoleta (sem sync, pre-selecao, skipFields do draft etc.).

function closeApptModal() {
  const m = document.getElementById('apptModal')
  if (m) m.style.display = 'none'
  document.body.style.overflow = ''
}

// Auto-preenche duração ao selecionar procedimento
function apptProcAutofill(procNome) {
  if (!procNome) return
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  const tech = techs.find(t => t.nome === procNome)
  if (tech?.duracao) {
    const dur = parseInt(tech.duracao)
    if (!isNaN(dur) && dur > 0) {
      const el = document.getElementById('appt_duracao')
      if (el) el.value = dur
    }
  }
}

// Mostra/oculta campos de avaliação
function apptTipoChange() {
  const tipo = document.getElementById('appt_tipo')?.value
  const row  = document.getElementById('apptTipoAvalRow')
  if (row) row.style.display = tipo === 'avaliacao' ? '' : 'none'
}

// Busca de pacientes no modal
function apptSearchPatient(q) {
  const drop = document.getElementById('apptPatientDrop')
  const warn = document.getElementById('appt_paciente_warn')
  if (!q.trim()) { drop.style.display = 'none'; warn.style.display = 'none'; return }

  const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
  const matches = leads.filter(l => (l.nome||l.name||'').toLowerCase().includes(q.toLowerCase())).slice(0,8)

  if (!matches.length) {
    drop.style.display = 'none'
    warn.style.display = 'block'
    return
  }

  warn.style.display = 'none'
  drop.innerHTML = matches.map(l => {
    const nome = l.nome || l.name || 'Paciente'
    return `<div data-select-lead="${l.id||''}" data-select-name="${nome.replace(/"/g,'&quot;')}"
      style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #F3F4F6"
      onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
      <div style="font-weight:600;color:#111">${nome.replace(/</g,'&lt;')}</div>
      ${l.phone||l.whatsapp?`<div style="font-size:11px;color:#9CA3AF">${(l.phone||l.whatsapp||'').replace(/</g,'&lt;')}</div>`:''}
    </div>`
  }).join('')
  drop.addEventListener('click', function(e) {
    var el = e.target.closest('[data-select-lead]')
    if (el) selectApptPatient(el.dataset.selectLead, el.dataset.selectName)
  })
  drop.style.display = 'block'
}

function selectApptPatient(id, nome) {
  document.getElementById('appt_paciente_q').value = nome
  document.getElementById('appt_paciente_id').value = id
  document.getElementById('apptPatientDrop').style.display = 'none'
  document.getElementById('appt_paciente_warn').style.display = 'none'
}

function saveAppt() {
  const nome = document.getElementById('appt_paciente_q')?.value?.trim()
  if (!nome) { _showToast('Atenção', 'Selecione o paciente', 'warn'); return }
  const data  = document.getElementById('appt_data')?.value
  const inicio = document.getElementById('appt_inicio')?.value
  if (!data || !inicio) { _showToast('Atenção', 'Informe data e horario', 'warn'); return }

  const duracao = parseInt(document.getElementById('appt_duracao')?.value || '60')
  const fim     = addMinutes(inicio, duracao)
  const profIdx = parseInt(document.getElementById('appt_prof')?.value ?? '0') || 0
  const salaIdx = parseInt(document.getElementById('appt_sala')?.value ?? '')
  const profs   = getProfessionals()

  const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
  const apptData = {
    pacienteId:          document.getElementById('appt_paciente_id')?.value || '',
    pacienteNome:        nome,
    pacientePhone:       document.getElementById('appt_paciente_phone')?.value || '',
    profissionalIdx:     profIdx,
    profissionalNome:    profs[profIdx]?.nome || '',
    salaIdx:             isNaN(salaIdx) ? null : salaIdx,
    procedimento:        document.getElementById('appt_proc')?.value?.trim() || '',
    data,
    horaInicio:          inicio,
    horaFim:             fim,
    status:              document.getElementById('appt_status')?.value || 'agendado',
    tipoConsulta:        document.getElementById('appt_tipo')?.value || '',
    tipoAvaliacao:       tipoAvalEl?.value || '',
    origem:              document.getElementById('appt_origem')?.value || '',
    valor:               parseFloat(document.getElementById('appt_valor')?.value || '0') || 0,
    formaPagamento:      document.getElementById('appt_forma_pag')?.value || '',
    statusPagamento:     'pendente',
    confirmacaoEnviada:  document.getElementById('appt_confirmacao')?.checked || false,
    consentimentoImagem: document.getElementById('appt_consentimento')?.checked || false,
    obs:                 document.getElementById('appt_obs')?.value?.trim() || '',
  }

  const appts = getAppointments()
  const editId = document.getElementById('appt_id')?.value

  // ── Validação completa via AgendaValidator (camada 1) ────────────
  if (window.AgendaValidator) {
    const vResult = AgendaValidator.validateSave(apptData, editId || null)
    if (!vResult.ok) {
      showValidationErrors(vResult.errors, editId ? 'Não foi possível editar' : 'Não foi possível agendar')
      return
    }
  } else {
    // Fallback: validação básica legada
    const provisional = { ...apptData, id: editId || '__new__' }
    const { conflict, reason: confReason } = checkConflict(provisional, appts)
    if (conflict) { _showToast('Atenção', 'Conflito de horario: ' + confReason, 'warn'); return }
  }

  // Verificar se edição é permitida
  if (editId && window.AgendaValidator) {
    const existing = appts.find(a => a.id === editId)
    if (existing) {
      const canEdit = AgendaValidator.canEdit(existing)
      if (!canEdit.ok) { showValidationErrors(canEdit.errors, 'Edição não permitida'); return }
    }
  }

  let isNew = false
  let novoId = null

  if (editId) {
    const idx = appts.findIndex(a => a.id === editId)
    if (idx >= 0) {
      const old = { ...appts[idx] }
      appts[idx] = { ...appts[idx], ...apptData }
      // Audit log de edição
      if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
      appts[idx].historicoAlteracoes.push({
        action_type: 'edicao',
        old_value:   { data: old.data, horaInicio: old.horaInicio, horaFim: old.horaFim, profissionalIdx: old.profissionalIdx, salaIdx: old.salaIdx },
        new_value:   { data: apptData.data, horaInicio: apptData.horaInicio, horaFim: apptData.horaFim, profissionalIdx: apptData.profissionalIdx, salaIdx: apptData.salaIdx },
        changed_by:  'secretaria',
        changed_at:  new Date().toISOString(),
        reason:      'Edição manual',
      })
      // Recalcular automações se data/hora mudou
      if ((old.data !== apptData.data || old.horaInicio !== apptData.horaInicio) && window.scheduleAutomations) {
        scheduleAutomations(appts[idx])
      }
    }
  } else {
    novoId = genApptId()
    appts.push({ id: novoId, createdAt: new Date().toISOString(), historicoAlteracoes: [], ...apptData })
    isNew = true
  }

  saveAppointments(appts)
  closeApptModal()
  refreshCurrentAgenda()

  // ── Sync Supabase (fire-and-forget) ──────────────────────────────
  if (window.AppointmentsService) {
    if (editId) {
      const saved = appts.find(a => a.id === editId)
      if (saved) AppointmentsService.syncOne(saved)
    } else if (novoId) {
      const saved = appts.find(a => a.id === novoId)
      if (saved) AppointmentsService.syncOne(saved)
    }
  }

  // ── Ao criar novo agendamento: iniciar loop fechado ──────────────
  if (isNew) {
    const apptCompleto = { ...apptData, id: novoId, profissionalNome: profs[profIdx]?.nome||'' }
    // Gera link de anamnese (paciente novo) e injeta no appt antes do engine disparar,
    // para que {{link_anamnese}} seja substituido no content_template. Fire-and-forget.
    const isNovo = (apptCompleto.tipoPaciente || 'novo') !== 'retorno'
    const linkPromise = isNovo
      ? _gerarLinkAnamnese(apptCompleto.id, apptCompleto.pacienteId).catch(function(e) { console.warn('[Agenda] falha link anamnese:', e); return null })
      : Promise.resolve(null)
    linkPromise.then(function(link) {
      if (link) apptCompleto.link_anamnese = link
      // Engine: processAppointment agenda regras time-based (d_before, d_zero, min_before).
      // processStatusChange dispara regras on_status do status inicial ('agendado').
      // Separacao evita double-insert quando apptTransition e usado depois.
      if (window.scheduleAutomations) scheduleAutomations(apptCompleto)
      if (window.AutomationsEngine && window.AutomationsEngine.processStatusChange) {
        AutomationsEngine.processStatusChange(apptCompleto, apptCompleto.status || 'agendado')
          .catch(function(e) { console.error('[Agenda] processStatusChange inicial falhou:', e) })
      }
    })
    // Aplica tag + lead status imediatamente (nao depende do link)
    if (window._applyStatusTag && apptCompleto.pacienteId) {
      _applyStatusTag(apptCompleto, 'agendado', 'criação')
    }
    if (apptCompleto.pacienteId) {
      _setLeadStatus(apptCompleto.pacienteId, 'scheduled', ['patient', 'attending'])
    }
  }
}

// ── Atualiza status/phase do lead ────────────────────────────
// Unifica status (legacy localStorage) com phase (SDR canonical).
// skipIf: array de statuses que NAO devem ser rebaixados
var _STATUS_TO_PHASE = { scheduled: 'agendado', patient: 'compareceu', attending: 'em_atendimento' }
function _setLeadStatus(leadId, newStatus, skipIf = []) {
  try {
    var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    var idx   = leads.findIndex(function(l) { return l.id === leadId })
    if (idx < 0) return
    if (skipIf.includes(leads[idx].status)) return
    leads[idx].status = newStatus
    store.set('clinicai_leads', leads)
  } catch { /* silencioso */ }
  // Sync with SDR phase system
  var phase = _STATUS_TO_PHASE[newStatus]
  if (phase && window.SdrService) {
    SdrService.changePhase(leadId, phase, 'status-sync').catch(function(e) { console.warn("[api]", e.message || e) })
  }
}

// (removido) Cache de templates e helpers de wa_message_templates
// Fluxo de envio de mensagem ao criar agendamento agora usa o engine
// (AutomationsEngine.processAppointment dispara regras on_status=agendado
//  com filtro trigger_config.patient_type para diferenciar novo/retorno).

// (removido) _enviarMsgAgendamento / _tplMsgAgendamento / _fmtDataPtBr
// Substituidos pelo engine (processAppointment dispara on_status=agendado
// com filtro patient_type em trigger_config). Os 2 conteudos originais
// estao agora em wa_agenda_automations como regras "Confirmacao Paciente
// Novo" e "Confirmacao Paciente Retorno".

// Cache do template default (buscado 1x por sessão)
let _anamneseDefaultTemplateId = null
async function _getAnamneseDefaultTemplateId() {
  if (_anamneseDefaultTemplateId) return _anamneseDefaultTemplateId
  if (!window._sbShared) return null
  try {
    const { data, error } = await window._sbShared
      .from('anamnesis_templates')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error || !data || !data.length) return null
    _anamneseDefaultTemplateId = data[0].id
    return _anamneseDefaultTemplateId
  } catch (e) { return null }
}

/**
 * Gera link REAL de anamnese pra ser enviado ao paciente via WhatsApp.
 * Cria uma anamnesis_request no Supabase e retorna a URL no formato
 * canônico: form-render.html?slug=X#token=Y
 *
 * Retorna null se não conseguir criar (ex: sem template, sem paciente).
 * Caller deve tratar o null (pular a linha do link na mensagem).
 *
 * @param {string} apptId
 * @param {string} pacienteId — UUID do lead/paciente
 * @returns {Promise<string|null>}
 */
async function _gerarLinkAnamnese(apptId, pacienteId) {
  if (!window._sbShared || !pacienteId) return null
  try {
    const tplId = await _getAnamneseDefaultTemplateId()
    if (!tplId) { console.warn('[Anamnese] Sem template default ativo'); return null }

    // Garante que o lead existe em patients (a RPC create_anamnesis_request
    // exige patient_id real, não lead_id)
    let patientId = pacienteId
    if (window._upsertLeadAsPatient) {
      try { patientId = await window._upsertLeadAsPatient(pacienteId) } catch (e) { patientId = pacienteId }
    }

    // Clinic ID: vem do auth
    const { data: { user } } = await window._sbShared.auth.getUser()
    const clinicId = user?.user_metadata?.clinic_id || null

    const { data, error } = await window._sbShared.rpc('create_anamnesis_request', {
      p_clinic_id:   clinicId,
      p_patient_id:  patientId,
      p_template_id: tplId,
      p_expires_at:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) { console.warn('[Anamnese] create_request falhou:', error.message); return null }
    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.public_slug || !row.raw_token) return null

    const base = window.location.origin || ''
    return `${base}/form-render.html?slug=${row.public_slug}#token=${row.raw_token}`
  } catch (e) {
    console.warn('[Anamnese] _gerarLinkAnamnese exception:', e)
    return null
  }
}


function deleteAppt() {
  const id = document.getElementById('appt_id')?.value
  if (!id) return
  if (!confirm('Excluir esta consulta?')) return
  const appts = getAppointments().filter(a => a.id !== id)
  saveAppointments(appts)
  closeApptModal()
  refreshCurrentAgenda()
  // Soft delete no Supabase (fire-and-forget)
  window.AppointmentsService?.softDelete(id)
}

function openApptDetail(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  // Inicializar campos de documentos se ausentes
  let changed = false
  if (a.anamneseRespondida === undefined) { a.anamneseRespondida = false; changed = true }
  if (!a.consentimentoImagem) { a.consentimentoImagem = 'pendente'; changed = true }
  if (!a.consentimentoProcedimento) { a.consentimentoProcedimento = 'pendente'; changed = true }
  if (changed) saveAppointments(appts)

  const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const profs = getProfessionals()
  const profNome = a.profissionalNome || profs[a.profissionalIdx]?.nome || '—'

  const docBool = (val, trueLabel, falseLabel) => val
    ? `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; ${trueLabel}</span>`
    : `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; ${falseLabel}</span>`

  const consentBadge = (val) => {
    if (val === 'assinado') return `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; Assinado</span>`
    if (val === 'recusado') return `<span style="color:#DC2626;font-size:11px;font-weight:700">&#10007; Recusado</span>`
    return `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; Pendente</span>`
  }

  const canFinish = ['agendado','confirmado','em_atendimento'].includes(a.status)

  const existing = document.getElementById('apptDetailDlg')
  if (existing) existing.remove()

  const dlg = document.createElement('div')
  dlg.id = 'apptDetailDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9998'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:500px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
        <div>
          <div style="font-size:17px;font-weight:800;color:#111827">${a.pacienteNome||'Paciente'}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">${fmtDate(a.data)} &nbsp;${a.horaInicio}–${a.horaFim}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:10px;font-weight:700;color:${s.color};background:${s.bg};padding:4px 10px;border-radius:20px">${s.label||a.status}</span>
          <button onclick="document.getElementById('apptDetailDlg').remove()"
            style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
        </div>
      </div>

      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px">

        <!-- Dados principais -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>
            <div style="font-size:13px;font-weight:600;color:#111827">${a.procedimento||'—'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>
            <div style="font-size:13px;font-weight:600;color:#111827">${profNome}</div>
          </div>
        </div>

        <!-- Documentos e Consentimentos -->
        <div style="background:#F9FAFB;border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Documentos &amp; Consentimentos</div>
          <div style="display:flex;flex-direction:column;gap:9px">

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Ficha de Anamnese</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${docBool(a.anamneseRespondida,'Respondida','Pendente')}
                <button onclick="_toggleAnamnese('${id}')"
                  style="font-size:10px;padding:3px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#6B7280">
                  ${a.anamneseRespondida ? 'Desfazer' : 'Marcar'}
                </button>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Consentimento de Imagem</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${consentBadge(a.consentimentoImagem)}
                <select onchange="_setConsent('${id}','imagem',this.value)"
                  style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">
                  <option value="pendente" ${a.consentimentoImagem==='pendente'?'selected':''}>Pendente</option>
                  <option value="assinado" ${a.consentimentoImagem==='assinado'?'selected':''}>Assinado</option>
                  <option value="recusado" ${a.consentimentoImagem==='recusado'?'selected':''}>Recusado</option>
                </select>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Consentimento do Procedimento</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${consentBadge(a.consentimentoProcedimento)}
                <select onchange="_setConsent('${id}','procedimento',this.value)"
                  style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">
                  <option value="pendente" ${a.consentimentoProcedimento==='pendente'?'selected':''}>Pendente</option>
                  <option value="assinado" ${a.consentimentoProcedimento==='assinado'?'selected':''}>Assinado</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        <!-- Ações -->
        <div style="display:flex;gap:8px">
          ${canFinish ? `<button onclick="document.getElementById('apptDetailDlg').remove();openFinalizarModal('${id}')"
            style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Finalizar Atendimento</button>` : ''}
          <button onclick="document.getElementById('apptDetailDlg').remove();openApptModal('${id}')"
            style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Editar</button>
        </div>

      </div>
    </div>`

  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  document.body.appendChild(dlg)
}

function _toggleAnamnese(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  a.anamneseRespondida = !a.anamneseRespondida
  saveAppointments(appts)
  openApptDetail(id)
}

function _setConsent(id, type, val) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  if (type === 'imagem') a.consentimentoImagem = val
  if (type === 'procedimento') a.consentimentoProcedimento = val
  saveAppointments(appts)
}

// ── Finalizar consulta ─────────────────────────────────────────
function quickFinish(id) {
  openFinalizarModal(id)
}

// ── Modal: Finalizar Atendimento ───────────────────────────────
function openFinalizarModal(id) {
  const a = getAppointments().find(x => x.id === id)
  if (!a) return

  const existing = document.getElementById('finalizarModalDlg')
  if (existing) existing.remove()

  const dlg = document.createElement('div')
  dlg.id = 'finalizarModalDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:480px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.28)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:16px;font-weight:800;color:#111827">Finalizar Atendimento</div>
        <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
          style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
      </div>

      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">

        <!-- Resumo do paciente -->
        <div style="background:#F5F3FF;border-radius:10px;padding:12px 14px">
          <div style="font-size:14px;font-weight:700;color:#7C3AED">${a.pacienteNome||'Paciente'}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'—'}</div>
        </div>

        <!-- Banner VPI -->
        <div style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border:1.5px solid #6EE7B7;border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
          <svg width="18" height="18" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div>
            <div style="font-size:12px;font-weight:700;color:#065F46">Programa de Parceiros VPI</div>
            <div style="font-size:11px;color:#047857;margin-top:2px">Ao finalizar, <strong>${a.pacienteNome||'este paciente'}</strong> será automaticamente inscrito e receberá um convite via WhatsApp em 7 dias.</div>
          </div>
        </div>

        <!-- Procedimentos realizados -->
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
            Procedimentos Realizados <span style="color:#DC2626">*</span>
          </label>
          <textarea id="finalizar_proc" rows="3" placeholder="Descreva os procedimentos realizados..."
            style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">${a.procedimentosRealizados||a.procedimento||''}</textarea>
        </div>

        <!-- Valor total -->
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
            Valor Total <span style="color:#DC2626">*</span>
          </label>
          <input id="finalizar_valor" type="number" min="0" step="0.01" placeholder="R$ 0,00"
            value="${a.valorCobrado||''}"
            style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
        </div>

        <!-- Orçamento / Indicação -->
        <div style="background:#F9FAFB;border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Orçamento Realizado (Indicação)</div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
            <div>
              <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Indicação para</label>
              <input id="finalizar_indicacao" type="text" placeholder="Ex: Botox, Harmonização..."
                value="${a.orcamentoIndicacao||''}"
                style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
            </div>
            <div>
              <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Valor</label>
              <input id="finalizar_ind_valor" type="number" min="0" step="0.01" placeholder="R$ 0,00"
                value="${a.orcamentoValor||''}"
                style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
            </div>
          </div>
        </div>

        <!-- Mensagem de erro -->
        <div id="finalizar_erro" style="display:none;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:10px 12px;font-size:12px;color:#DC2626;font-weight:600"></div>

        <!-- Ações -->
        <div style="display:flex;gap:8px;padding-top:2px">
          <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
            style="flex:1;padding:11px;background:#F3F4F6;color:#6B7280;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Pular (criar alerta)</button>
          <button onclick="_confirmFinalizar('${id}')"
            style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Confirmar e Finalizar</button>
        </div>

      </div>
    </div>`

  dlg.addEventListener('click', e => {
    if (e.target === dlg) { _skipFinalizar(id); dlg.remove() }
  })
  document.body.appendChild(dlg)
}

function _confirmFinalizar(id) {
  const proc  = document.getElementById('finalizar_proc')?.value?.trim()
  const valor = parseFloat(document.getElementById('finalizar_valor')?.value || '')
  const errEl = document.getElementById('finalizar_erro')

  if (!proc) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe os procedimentos realizados.' }
    return
  }
  if (!valor || valor <= 0) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe o valor total do atendimento.' }
    return
  }

  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  a.status = 'finalizado'
  a.procedimentosRealizados = proc
  a.valorCobrado = valor
  a.orcamentoIndicacao = document.getElementById('finalizar_indicacao')?.value?.trim() || ''
  a.orcamentoValor = parseFloat(document.getElementById('finalizar_ind_valor')?.value || '') || 0
  a.pendente_finalizar = false
  saveAppointments(appts)

  // Sync to Supabase so status persists across reloads
  if (window.AppointmentsService && AppointmentsService.syncOne) AppointmentsService.syncOne(a)

  // Promover lead para 'patient' — aparece em Pacientes
  if (a.pacienteId) _setLeadStatus(a.pacienteId, 'patient')

  const dlg = document.getElementById('finalizarModalDlg')
  if (dlg) dlg.remove()
  refreshCurrentAgenda()
  _renderNotificationBell()

  // ── VPI: auto-inscrição no Programa de Parceiros ──────────
  if (typeof vpiAutoEnroll === 'function') {
    vpiAutoEnroll(a)
  }
}

function _skipFinalizar(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  a.pendente_finalizar = true
  saveAppointments(appts)
  _renderNotificationBell()
  _showToast(
    'Alerta criado',
    `Finalização de "${a.pacienteNome||'Paciente'}" pendente`,
    'warning'
  )
}

// ── Toast de notificação ───────────────────────────────────────
function _showToast(title, subtitle, type) {
  type = type || 'info'
  const icons = {
    success: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    warning: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error:   `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  }

  const toast = document.createElement('div')
  toast.className = `clinic-toast toast-${type}`
  toast.innerHTML = `
    <span class="clinic-toast-icon">${icons[type]||icons.info}</span>
    <div class="clinic-toast-body">
      <div class="clinic-toast-title">${title}</div>
      ${subtitle ? `<div class="clinic-toast-sub">${subtitle}</div>` : ''}
    </div>
    <button class="clinic-toast-close" onclick="_dismissToast(this.closest('.clinic-toast'))">&times;</button>`
  document.body.appendChild(toast)

  // Auto-remover após 5 s
  const timer = setTimeout(() => _dismissToast(toast), 5000)
  toast._timer = timer
}

function _dismissToast(el) {
  if (!el || !document.body.contains(el)) return
  clearTimeout(el._timer)
  el.classList.add('hiding')
  setTimeout(() => el.remove(), 300)
}

// ── Sino de notificação ────────────────────────────────────────
function _renderNotificationBell() {
  const appts      = getAppointments()
  const pending    = appts.filter(a => a.pendente_finalizar && a.status !== 'finalizado')
  const pendingReg = JSON.parse(localStorage.getItem('clinic_pending_users') || '[]')
  const totalBadge = pending.length + pendingReg.length

  const wrapper = document.getElementById('notifDropdown')
  if (!wrapper) return

  const btn = wrapper.querySelector('button')

  // Badge de contagem
  let badge = wrapper.querySelector('.badge')
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'badge badge-danger'
    btn?.appendChild(badge)
  }
  if (totalBadge > 0) {
    badge.textContent = totalBadge > 9 ? '9+' : totalBadge
    badge.style.display = ''
  } else {
    badge.style.display = 'none'
  }

  // Animação do sino
  const bellIcon = wrapper.querySelector('svg, i[data-feather="bell"]')
  const bellEl   = bellIcon || btn
  if (bellEl) {
    if (totalBadge > 0) bellEl.classList.add('bell-ringing')
    else                 bellEl.classList.remove('bell-ringing')
  }

  // Itens no menu
  const menu = document.getElementById('notifMenu')
  if (!menu) return
  menu.querySelectorAll('.notif-finalizar-alert,.notif-reg-alert').forEach(el => el.remove())

  // Cadastros pendentes de aprovação
  pendingReg.forEach(u => {
    const item = document.createElement('div')
    item.className = 'notif-item notif-unread notif-reg-alert'
    item.innerHTML = `
      <div class="notif-icon" style="background:#FEF3C7;color:#D97706;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-feather="user-plus" style="width:15px;height:15px"></i>
      </div>
      <div class="notif-content" style="flex:1;min-width:0">
        <p class="notif-title" style="margin:0;font-size:12px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Cadastro: ${u.name}</p>
        <p class="notif-desc" style="margin:2px 0 0;font-size:11px;color:#6B7280">${u.email} · ${u.role || '—'}</p>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button onclick="event.stopPropagation();aprovarUsuario('${u.id}')"
            style="padding:3px 10px;background:#10B981;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aprovar
          </button>
          <button onclick="event.stopPropagation();rejeitarUsuario('${u.id}')"
            style="padding:3px 10px;background:#EF4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Rejeitar
          </button>
        </div>
      </div>`
    const header = menu.querySelector('.dropdown-header')
    if (header) header.after(item)
    else menu.prepend(item)
  })

  // Finalizações pendentes
  pending.forEach(a => {
    const item = document.createElement('div')
    item.className = 'notif-item notif-unread notif-finalizar-alert'
    item.style.cursor = 'pointer'
    item.innerHTML = `
      <div class="notif-icon notif-icon-danger"><i data-feather="alert-circle"></i></div>
      <div class="notif-content">
        <p class="notif-title">Finalizar: ${a.pacienteNome||'Paciente'}</p>
        <p class="notif-desc">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'Sem procedimento'}</p>
        <p class="notif-time">Atendimento pendente de finalização</p>
      </div>`
    item.addEventListener('click', () => {
      menu.classList.remove('show')
      openFinalizarModal(a.id)
    })
    const header = menu.querySelector('.dropdown-header')
    if (header) header.after(item)
    else menu.prepend(item)
  })

  featherIn(wrapper)

  // Re-anima o sino com feather substituído (feather cria novo svg)
  setTimeout(() => {
    const svg = wrapper.querySelector('svg')
    if (svg) {
      if (pending.length > 0) svg.classList.add('bell-ringing')
      else                     svg.classList.remove('bell-ringing')
    }
  }, 50)
}

// ── Modal: Fechar o Dia ────────────────────────────────────────
function abrirFecharDia() {
  const appts   = getAppointments()
  const pending = appts.filter(a => a.pendente_finalizar && a.status !== 'finalizado')

  if (pending.length === 0) {
    _showToast('Dia encerrado', 'Todos os atendimentos foram finalizados.', 'success')
    return
  }

  const existing = document.getElementById('fecharDiaDlg')
  if (existing) existing.remove()

  const items = pending.map(a => `
    <div class="fd-alert-item" onclick="document.getElementById('fecharDiaDlg').remove();openFinalizarModal('${a.id}')">
      <div class="fd-alert-dot"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#111827">${a.pacienteNome||'Paciente'}</div>
        <div style="font-size:11px;color:#6B7280">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'—'}</div>
      </div>
      <span style="font-size:10px;color:#DC2626;font-weight:700;flex-shrink:0">Finalizar ›</span>
    </div>`).join('')

  const dlg = document.createElement('div')
  dlg.id = 'fecharDiaDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:460px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="padding:20px 22px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:18px;font-weight:800;color:#DC2626">&#9888; Fechar o Dia</div>
        <div style="font-size:13px;color:#6B7280;margin-top:4px">Existem <strong>${pending.length}</strong> atendimento${pending.length!==1?'s':''} sem finalização. Registre antes de encerrar o dia.</div>
      </div>
      <div style="padding:18px 22px">
        ${items}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button onclick="document.getElementById('fecharDiaDlg').remove()"
            style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Fechar e Resolver Depois</button>
        </div>
        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:10px">Os alertas permanecem no sino até serem resolvidos.</p>
      </div>
    </div>`
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  document.body.appendChild(dlg)
}

// ── Lembrete periódico (a cada 20 min se houver alertas) ──────
setInterval(() => {
  const pending = getAppointments().filter(a => a.pendente_finalizar && a.status !== 'finalizado')
  if (pending.length > 0) {
    _showToast(
      `${pending.length} atendimento${pending.length!==1?'s':''} pendente${pending.length!==1?'s':''}`,
      'Clique no sino para finalizar antes de encerrar o dia.',
      'warning'
    )
  }
}, 20 * 60 * 1000)

// ── Bloqueio ao fechar o navegador com alertas pendentes ──────
window.addEventListener('beforeunload', e => {
  const pending = getAppointments().filter(a => a.pendente_finalizar && a.status !== 'finalizado')
  if (pending.length > 0) {
    const msg = `Você tem ${pending.length} atendimento(s) sem finalização registrada. Deseja realmente sair?`
    e.preventDefault()
    e.returnValue = msg
    return msg
  }
})

// ── Dedução de estoque ao finalizar consulta ──────────────────
// Tenta encontrar o injetável pelo nome do produto e decrementa
// estoque em 1 unidade. Salva via store.set → Supabase automático.
// Silencioso: se não encontrar o produto, ignora sem erro.
function _deductStock(produtos) {
  if (!produtos?.length) return
  try {
    const INJ_KEY = 'clinic_injetaveis'
    const injs = JSON.parse(localStorage.getItem(INJ_KEY) || '[]')
    if (!injs.length) return
    let changed = false
    for (const prod of produtos) {
      const nome = (prod.nome || '').toLowerCase().trim()
      if (!nome) continue
      const idx = injs.findIndex(inj => (inj.nome || '').toLowerCase().trim() === nome)
      if (idx >= 0 && typeof injs[idx].estoque === 'number' && injs[idx].estoque > 0) {
        injs[idx].estoque -= 1
        injs[idx].updated_at = new Date().toISOString()
        changed = true
      }
    }
    if (changed) store.set(INJ_KEY, injs)
  } catch { /* silencioso */ }
}

// ── Modal: Finalizar Consulta ─────────────────────────────────
function openFinishModal(id) {
  const a = getAppointments().find(x => x.id === id)
  if (!a) return

  document.getElementById('finish_appt_id').value = id
  _finishProducts = JSON.parse(JSON.stringify(a.produtos || []))

  // Resumo
  const sum = document.getElementById('finishSummary')
  if (sum) sum.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Paciente</span><br/><strong>${a.pacienteNome}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Procedimento</span><br/><strong>${a.procedimento||'—'}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Data</span><br/><strong>${fmtDate(a.data)} ${a.horaInicio}–${a.horaFim}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Profissional</span><br/><strong>${a.profissionalNome||'—'}</strong></div>
    </div>
  `

  // Valor pago anterior
  const valInput = document.getElementById('finish_valor')
  if (valInput) valInput.value = a.valorCobrado || ''

  // WhatsApp badge
  const badge = document.getElementById('whatsappConfirmBadge')
  if (badge) badge.style.display = a.whatsappFinanceiroEnviado ? 'block' : 'none'

  // Produtos datalist
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  const prodList = document.getElementById('finishProdList')
  if (prodList) prodList.innerHTML = techs.map(t => `<option value="${t.nome}"/>`).join('')

  renderFinishProducts()
  recalcProfit()

  document.getElementById('apptFinishModal').style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeFinishModal() {
  const m = document.getElementById('apptFinishModal')
  if (m) m.style.display = 'none'
  document.body.style.overflow = ''
}

function simWhatsappConfirm() {
  const btn = document.querySelector('#apptFinishModal button[onclick="simWhatsappConfirm()"]')
  if (btn) { btn.textContent = '⏳ Enviando...'; btn.disabled = true }
  setTimeout(() => {
    if (btn) { btn.textContent = 'Enviado!'; btn.style.background = '#059669' }
    document.getElementById('whatsappConfirmBadge').style.display = 'block'
  }, 1200)
}

function addFinishProduct() {
  const nome  = document.getElementById('finish_prod_nome')?.value?.trim()
  const custo = parseFloat(document.getElementById('finish_prod_custo')?.value || '0')
  if (!nome) return
  _finishProducts.push({ nome, custo: isNaN(custo) ? 0 : custo })
  document.getElementById('finish_prod_nome').value  = ''
  document.getElementById('finish_prod_custo').value = ''
  renderFinishProducts()
  recalcProfit()
}

function removeFinishProduct(i) {
  _finishProducts.splice(i, 1)
  renderFinishProducts()
  recalcProfit()
}

function renderFinishProducts() {
  const list = document.getElementById('finishProductsList')
  if (!list) return
  if (!_finishProducts.length) {
    list.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:6px 0">Nenhum produto adicionado</div>'
    return
  }
  list.innerHTML = _finishProducts.map((p,i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:#F9FAFB;border-radius:7px;padding:7px 10px">
      <span style="font-size:13px;color:#374151">${p.nome}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600;color:#EF4444">${fmtBRL(p.custo)}</span>
        <button onclick="removeFinishProduct(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:inline-flex;align-items:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
  `).join('')
}

function recalcProfit() {
  const receita = parseFloat(document.getElementById('finish_valor')?.value || '0') || 0
  const custos  = _finishProducts.reduce((s,p) => s + (p.custo || 0), 0)
  const lucro   = receita - custos

  setText('res_receita', fmtBRL(receita))
  setText('res_custos',  fmtBRL(custos))
  const lucroEl = document.getElementById('res_lucro')
  if (lucroEl) {
    lucroEl.textContent = fmtBRL(lucro)
    lucroEl.style.color = lucro >= 0 ? '#10B981' : '#EF4444'
  }
}

function confirmFinishAppt() {
  const id = document.getElementById('finish_appt_id')?.value
  if (!id) return

  const receita = parseFloat(document.getElementById('finish_valor')?.value || '0') || 0
  const custos  = _finishProducts.reduce((s,p) => s + (p.custo || 0), 0)

  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  a.status = 'finalizado'
  a.valorCobrado = receita
  a.produtos     = [..._finishProducts]
  a.custoTotal   = custos
  a.lucro        = receita - custos
  a.whatsappFinanceiroEnviado = document.getElementById('whatsappConfirmBadge')?.style.display !== 'none'

  saveAppointments(appts)
  // Sync Supabase (fire-and-forget)
  window.AppointmentsService?.syncOne(a)

  // Deduz estoque dos injetáveis usados nos produtos
  _deductStock(_finishProducts)

  closeFinishModal()
  refreshCurrentAgenda()

  // Toast de sucesso
  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;bottom:28px;right:28px;background:#10B981;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.15)'
  toast.textContent = `Consulta finalizada · Lucro: ${fmtBRL(a.lucro)}`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}


// ── Internals expostos para extração modular ─────────────────────────────────
// Estes helpers são usados por agenda-modal.js, agenda-finalize.js e agenda-notifications.js.
// Não fazem parte da API pública documentada — são infra interna.
window._apptGetAll          = getAppointments
window._apptSaveAll         = saveAppointments
window._apptGenId           = genApptId
window._apptAddMinutes      = addMinutes
window._apptFmtDate         = fmtDate
window._apptFmtBRL          = fmtBRL
window._apptRefresh         = refreshCurrentAgenda
window._apptStatusCfg       = APPT_STATUS_CFG
window._apptCheckConflict   = checkConflict
window._apptSetLeadStatus   = _setLeadStatus
// window._apptEnviarMsg removido — engine agora trata msg de confirmacao
// via processAppointment (regras on_status=agendado com patient_type).
window._apptFinishProducts  = function(v) { if (v !== undefined) _finishProducts = v; return _finishProducts }
window._apptDeductStock     = _deductStock

// Expor globais
window._nomeEnxuto          = _nomeEnxuto
window.renderAgenda         = renderAgenda
window.setAgendaView        = setAgendaView
window.navAgenda            = navAgenda
window._apptTip             = _apptTip
window._apptTipHide         = _apptTipHide
window._mesHoverShow        = _mesHoverShow
window._mesHoverHide        = _mesHoverHide
// window.openApptModal exposto por js/agenda-modal.js (versao canonical)
window.closeApptModal       = closeApptModal
window.saveAppt             = saveAppt
window.deleteAppt           = deleteAppt
window.openApptDetail       = openApptDetail
window.apptSearchPatient    = apptSearchPatient
window.apptProcAutofill     = apptProcAutofill
window.selectApptPatient    = selectApptPatient
window.agendaDragStart      = agendaDragStart
window.agendaDragOver       = agendaDragOver
window.agendaDragLeave      = agendaDragLeave
window.agendaDrop           = agendaDrop
window.showDragConfirm      = showDragConfirm
window.cancelDragConfirm    = cancelDragConfirm
window.confirmDragReschedule = confirmDragReschedule
window.quickFinish          = quickFinish
window.openFinishModal      = openFinishModal
window.closeFinishModal     = closeFinishModal
window.simWhatsappConfirm   = simWhatsappConfirm
window.addFinishProduct     = addFinishProduct
window.removeFinishProduct  = removeFinishProduct
window.recalcProfit         = recalcProfit
window.confirmFinishAppt    = confirmFinishAppt
window.openFinalizarModal   = openFinalizarModal
window._confirmFinalizar    = _confirmFinalizar
window._skipFinalizar       = _skipFinalizar
window._toggleAnamnese      = _toggleAnamnese
window._setConsent          = _setConsent
window.agendaMesModal       = agendaMesModal
window.abrirFecharDia       = abrirFecharDia
window._showToast           = _showToast
window._dismissToast        = _dismissToast
window._toastWarn = function(m) { _showToast('Atenção', m, 'warn') }
window._toastErr  = function(m) { _showToast('Erro', m, 'error') }
window._toastOk   = function(m) { _showToast('Sucesso', m, 'success') }
// showRegisterModal → definida em auth.js (redireciona para login.html)

// ─── Inicialização ────────────────────────────────────────────
// Usa evento 'clinicai:auth-success' — nunca chamar loadDashboardData() diretamente.
// Isso garante que dashboard.js seja o único dono da sua inicialização.
// ── Migração de status: recalcula status dos leads com base nos agendamentos
// Garante consistência para leads cadastrados antes desta lógica existir.
// Roda uma vez no boot, silenciosamente.
function _migrateLeadStatuses() {
  try {
    const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    if (!leads.length) return
    const appts = JSON.parse(localStorage.getItem(_apptStorageKey()) || '[]')

    // Mapa: patientId → statuses dos agendamentos
    const apptMap = {}
    for (const a of appts) {
      const pid = a.pacienteId || ''
      if (!pid) continue
      if (!apptMap[pid]) apptMap[pid] = []
      apptMap[pid].push(a.status)
    }

    let changed = 0
    for (const lead of leads) {
      // Não rebaixa quem já foi promovido manualmente
      if (lead.status === 'lost' || lead.status === 'archived') continue

      const statuses = apptMap[lead.id] || []
      const hasFinalizado = statuses.includes('finalizado')
      const hasAgendado   = statuses.some(s => ['agendado','confirmado','em_atendimento','na_clinica','em_consulta','aguardando'].includes(s))

      if (hasFinalizado && lead.status !== 'patient') {
        lead.status = 'patient'; changed++
      } else if (hasAgendado && lead.status !== 'patient' && lead.status !== 'attending') {
        lead.status = 'scheduled'; changed++
      }
    }

    if (changed > 0) {
      store.set('clinicai_leads', leads)
      console.info(`[ClinicAI] Migração de status: ${changed} lead(s) promovido(s).`)
    }
  } catch { /* silencioso */ }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) {
    showLoginModal()
  } else {
    _migrateLeadStatuses()  // corrige status de leads existentes no boot
    document.dispatchEvent(new CustomEvent('clinicai:auth-success'))
    // Exibir alertas pendentes de finalização no sino
    setTimeout(() => {
      _renderNotificationBell()
      featherIn(document.getElementById('notifDropdown'))
    }, 600)
  }
})
