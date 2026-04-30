/**
 * ClinicAI — Agenda Overview Module
 * Analytics e dashboard de performance da agenda.
 * Visualizações: KPIs, timeline, ranking, gráficos, aniversários, SDR.
 *
 * Dependências externas:
 *   getAppointments()  → api.js (agenda core)
 *   getProfessionals() → professionals.js
 *   apiFetch()         → auth.js
 *   formatCurrency()   → utils.js
 *   Chart              → Chart.js (CDN)
 *   feather            → feather-icons (CDN)
 *
 * ⚠ GLOBALS OWNED BY THIS FILE:
 *   loadAgendaOverview, aoSetPeriod, aoApplyCustomPeriod
 *   aoConfirmAppt, aoMarkAttended, aoShowTooltip, aoHideTooltip
 *   aoBdOpenOffer, aoBdModalClose, aoBdCopyOffer, aoBdOpenWhatsapp
 *   _aoShowPatientPanel, _aoShowProcFlyout, _aoOpenRankingModal, _aoHideFlyout
 */

// ══════════════════════════════════════════════════════════════
//  AGENDA OVERVIEW — Visão Geral da Agenda
// ══════════════════════════════════════════════════════════════

let _aoWeekChart = null
let _aoPeriod    = { type: 'mes' }  // estado do período selecionado

// Expor _aoPeriod via getter pra arquivos irmaos (birthdays, panels)
// _aoGetDateRange ja e function top-level => esta em window automaticamente.
function _aoGetCurrentPeriod() { return _aoPeriod }
window._aoGetCurrentPeriod = _aoGetCurrentPeriod
window._aoGetDateRange = _aoGetDateRange

// ── Helpers ───────────────────────────────────────────────────
function _aoFmtTime(iso) {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function _aoFmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function _aoDaysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function _aoFmtShortDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ── Cálculo do intervalo por período ─────────────────────────
function _aoGetDateRange(period) {
  const now   = new Date()
  const today = new Date(now); today.setHours(0,0,0,0)

  if (period.type === 'hoje') {
    const end = new Date(today); end.setHours(23,59,59,999)
    return { from: today, to: end, label: 'Hoje', granularity: 'hour' }
  }
  if (period.type === 'semana') {
    // Segunda a Domingo da semana corrente
    const day = now.getDay()
    const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
    return { from: mon, to: sun, label: 'Esta Semana', granularity: 'day' }
  }
  if (period.type === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0); end.setHours(23,59,59,999)
    return { from: start, to: end, label: 'Este Mês', granularity: 'week' }
  }
  if (period.type === 'custom' && period.from && period.to) {
    const from = new Date(period.from + 'T00:00:00')
    const to   = new Date(period.to   + 'T23:59:59')
    const days = Math.ceil((to - from) / 86400000)
    const gran = days <= 14 ? 'day' : 'week'
    return { from, to, label: `${_aoFmtShortDate(period.from)} – ${_aoFmtShortDate(period.to)}`, granularity: gran }
  }
  // fallback
  const end = new Date(today); end.setHours(23,59,59,999)
  return { from: today, to: end, label: 'Hoje', granularity: 'hour' }
}

// ── Controle de período ───────────────────────────────────────
function aoSetPeriod(type) {
  _aoPeriod = { type }

  // Atualiza botões ativos
  document.querySelectorAll('.ao-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === type)
  })

  // Mostra/oculta custom date range
  const rangeEl = document.getElementById('aoDateRange')
  if (rangeEl) rangeEl.classList.toggle('visible', type === 'custom')

  if (type !== 'custom') loadAgendaOverview()
}

function aoApplyCustomPeriod() {
  const from = document.getElementById('aoDateFrom')?.value
  const to   = document.getElementById('aoDateTo')?.value
  if (!from || !to) { showToast('Selecione o intervalo de datas', 'warn'); return }
  if (from > to)    { showToast('Data inicial deve ser anterior à final', 'warn'); return }
  _aoPeriod = { type: 'custom', from, to }
  loadAgendaOverview()
}

// ── Config de status ──────────────────────────────────────────
const AO_STATUS = {
  scheduled:   { label: 'Agendado',   color: '#3B82F6', bg: '#EFF6FF' },
  confirmed:   { label: 'Confirmado', color: '#10B981', bg: '#ECFDF5' },
  attended:    { label: 'Compareceu', color: '#7C3AED', bg: '#EDE9FE' },
  no_show:     { label: 'No-show',   color: '#EF4444', bg: '#FEF2F2' },
  cancelled:   { label: 'Cancelado', color: '#6B7280', bg: '#F3F4F6' },
  rescheduled: { label: 'Remarcado', color: '#F59E0B', bg: '#FFFBEB' },
}
function _aoChip(status) {
  const c = AO_STATUS[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' }
  return `<span class="ao-chip" style="background:${c.bg};color:${c.color}">${c.label}</span>`
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const colors = { success: '#10B981', error: '#EF4444', warn: '#F59E0B' }
  const t = document.createElement('div')
  t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${colors[type]||'#10B981'};color:#fff;padding:11px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.15);animation:aoFadeIn .2s ease`
  t.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : '⚠ ') + msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3200)
}

// ── Benchmarks do mercado (clínicas de estética BR) ──────────
// Configuraveis via localStorage: clinic_config.benchmarks.{occupancy|confirmRate|noshowRate}
function _getBenchConfig() {
  try {
    var cfg = JSON.parse(localStorage.getItem('clinic_config') || '{}')
    return (cfg && cfg.benchmarks) || {}
  } catch(e) { return {} }
}
var _benchCfg = _getBenchConfig()

const AO_BENCH = {
  occupancy: {
    label: 'Índice de Ocupação',
    good: _benchCfg.occupancy_good || 70, warn: _benchCfg.occupancy_warn || 50,
    marketAvg: _benchCfg.occupancy_avg || 67,
    inverted: false,
    msgs: {
      good: { badge: '✓ Acima da média', tip: 'Ótimo! Sua clínica está acima dos 67% que é a média do mercado de estética. Continue com as estratégias de retenção.' },
      warn: { badge: '⚠ Abaixo da média', tip: 'Clínicas de estética bem geridas mantêm 65–75% de ocupação. Considere campanhas de reativação de leads e lista de espera para horários vagos.' },
      bad:  { badge: '⚠ Crítico', tip: 'Menos de metade dos horários estão preenchidos. Revise sua captação, crie promoções para horários ociosos e ative o agendamento online 24/7.' },
    },
    detail: (v) => `Média de mercado: ~67% · Você: ${v}%`,
  },
  confirmRate: {
    label: 'Taxa de Confirmação',
    good: _benchCfg.confirm_good || 68, warn: _benchCfg.confirm_warn || 50,
    marketAvg: _benchCfg.confirm_avg || 68,
    inverted: false,
    msgs: {
      good: { badge: '✓ Boa confirmação', tip: 'Acima dos 68% da média. Clínicas que enviam 2 lembretes (48h e 24h antes) chegam a 82% — considere automatizar.' },
      warn: { badge: '⚠ Confirmação baixa', tip: 'Pacientes não confirmados têm 3× mais chance de no-show. Envie lembretes automáticos via WhatsApp em 2 etapas: 48h e 2h antes.' },
      bad:  { badge: '⚠ Confirmação crítica', tip: 'Menos da metade confirmou. Implemente confirmação obrigatória com botão de resposta no WhatsApp. Sem resposta em 24h → ligar.' },
    },
    detail: (v) => `Média de mercado: ~68% · Você: ${v}%`,
  },
  noshowRate: {
    label: 'Taxa de No-show',
    good: _benchCfg.noshow_good || 12, warn: _benchCfg.noshow_warn || 22,
    marketAvg: _benchCfg.noshow_avg || 12,
    inverted: true,
    msgs: {
      good: { badge: '✓ No-show sob controle', tip: 'Parabéns! Sua taxa está igual ou abaixo dos 12% da média do mercado. Mantenha os lembretes automáticos.' },
      warn: { badge: '⚠ No-show elevado', tip: 'Cada no-show é receita perdida. Implemente lista de espera, cobranças de sinal para histórico de ausências e reforce os lembretes 24h antes.' },
      bad:  { badge: '⚠ No-show crítico', tip: 'Mais de 1 em 5 pacientes não comparece. Crie política de sinal obrigatório, taxa de cancelamento em cima da hora e reative ausentes com campanha de WhatsApp.' },
    },
    detail: (v) => `Média de mercado: ~12% · Você: ${v}%`,
  },
}

// Retorna 'good' | 'warn' | 'bad' dado um valor e tipo de benchmark
function _aoBenchStatus(value, key) {
  const b = AO_BENCH[key]
  if (!b) return 'good'
  if (b.inverted) {
    if (value <= b.good) return 'good'
    if (value <= b.warn) return 'warn'
    return 'bad'
  } else {
    if (value >= b.good) return 'good'
    if (value >= b.warn) return 'warn'
    return 'bad'
  }
}

// Injeta badge de alerta e configura tooltip
function _aoRenderBenchBadge(badgeId, cardId, value, key) {
  const badgeEl = document.getElementById(badgeId)
  const cardEl  = document.getElementById(cardId)
  if (!badgeEl || !cardEl) return

  const b      = AO_BENCH[key]
  const status = _aoBenchStatus(value, key)
  const msg    = b.msgs[status]

  // Badge
  badgeEl.innerHTML = `
    <span class="ao-bench-badge ${status}"
      data-ao-bench="${key}"
      data-ao-status="${status}"
      data-ao-value="${value}"
      onmouseenter="aoShowTooltip(event,'${key}',${value},'${status}')"
      onmouseleave="aoHideTooltip()">
      ${msg.badge}
    </span>`

  // Borda colorida no card
  cardEl.classList.remove('bench-good','bench-warn','bench-bad')
  cardEl.classList.add(`bench-${status}`)
}

// ── Tooltip flutuante ─────────────────────────────────────────
let _aoTipEl = null

function _aoEnsureTooltip() {
  if (!_aoTipEl) {
    _aoTipEl = document.createElement('div')
    _aoTipEl.id = 'aoTooltipFloat'
    document.body.appendChild(_aoTipEl)
  }
  return _aoTipEl
}

function aoShowTooltip(event, key, value, status) {
  const b   = AO_BENCH[key]
  const msg = b?.msgs[status]
  if (!b || !msg) return

  const tip = _aoEnsureTooltip()
  const pct = `${value}%`
  const mkAvg = `${b.marketAvg}%`

  const statusColors = { good: '#10B981', warn: '#F59E0B', bad: '#EF4444' }
  const statusLabel  = { good: 'Acima da média', warn: 'Abaixo da média', bad: 'Crítico' }

  tip.innerHTML = `
    <div class="ao-tt-title">${b.label}</div>
    <div class="ao-tt-market">Média do mercado de estética: <strong style="color:${statusColors[status]}">${mkAvg}</strong></div>
    <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:8px">
      <span class="ao-tt-current" style="color:${statusColors[status]}">${pct}</span>
      <span style="font-size:11px;color:#9CA3AF">${statusLabel[status]}</span>
    </div>
    <hr class="ao-tt-divider"/>
    <div class="ao-tt-tip">${msg.tip}</div>
    <div style="margin-top:8px;font-size:10px;color:#6B7280">${b.detail(value)}</div>`

  tip.classList.add('visible')
  _aoPositionTooltip(event)
}

function _aoPositionTooltip(event) {
  const tip = _aoTipEl
  if (!tip) return
  const W = window.innerWidth, H = window.innerHeight
  const tw = 300, th = 160
  let x = event.clientX + 14
  let y = event.clientY + 14
  if (x + tw > W - 10) x = event.clientX - tw - 10
  if (y + th > H - 10) y = event.clientY - th - 10
  tip.style.left = x + 'px'
  tip.style.top  = y + 'px'
}

function aoHideTooltip() {
  _aoEnsureTooltip().classList.remove('visible')
}

// Move tooltip com o mouse quando visível
document.addEventListener('mousemove', (e) => {
  if (_aoTipEl?.classList.contains('visible')) _aoPositionTooltip(e)
})

// ── Ações rápidas ─────────────────────────────────────────────
// Usam AppointmentsService (localStorage + fire-and-forget Supabase)
// em vez da API externa (que não está disponível neste ambiente)
async function aoConfirmAppt(id) {
  const btn = document.querySelector(`[data-ao-confirm="${id}"]`)
  if (btn) { btn.textContent = '...'; btn.disabled = true }
  try {
    const svc = window.AppointmentsService
    if (!svc) throw new Error('AppointmentsService não carregado')
    const result = svc.updateLocalStatus(id, 'confirmed')
    if (!result.ok) throw new Error('Agendamento não encontrado')
    showToast('Agendamento confirmado!')
    loadAgendaOverview()
  } catch (e) {
    showToast(e.message || 'Erro', 'error')
    if (btn) { btn.textContent = 'Confirmar'; btn.disabled = false }
  }
}
async function aoMarkAttended(id) {
  const btn = document.querySelector(`[data-ao-attend="${id}"]`)
  if (btn) { btn.textContent = '...'; btn.disabled = true }
  try {
    const svc = window.AppointmentsService
    if (!svc) throw new Error('AppointmentsService não carregado')
    const result = svc.updateLocalStatus(id, 'attended')
    if (!result.ok) throw new Error('Agendamento não encontrado')
    showToast('Comparecimento registrado!')
    loadAgendaOverview()
  } catch (e) {
    showToast(e.message || 'Erro', 'error')
    if (btn) { btn.textContent = 'Compareceu'; btn.disabled = false }
  }
}

// ── Render: 5 KPIs ────────────────────────────────────────────
function _aoRenderKpis(appts, rangeLabel) {
  const total       = appts.length
  const confirmed   = appts.filter(a => ['confirmed','attended'].includes(a.status)).length
  const unconfirmed = appts.filter(a => a.status === 'scheduled').length
  const noshows     = appts.filter(a => a.status === 'no_show').length
  const revenue     = appts
    .filter(a => !['cancelled','no_show'].includes(a.status))
    .reduce((s, a) => s + (a.procedure?.price || 0), 0)
  const attended    = appts.filter(a => a.status === 'attended').length
  const noshowRate  = (attended + noshows) > 0
    ? Math.round(noshows / (attended + noshows) * 100) : 0

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }

  set('aoKpiTotal',          total)
  set('aoKpiTotalSub',       `${rangeLabel}`)
  set('aoKpiConfirmed',      confirmed)
  set('aoKpiConfirmedSub',   total ? `${Math.round(confirmed / total * 100) || 0}% do total` : '')
  set('aoKpiUnconfirmed',    unconfirmed)
  set('aoKpiUnconfirmedSub', unconfirmed ? 'Aguardam confirmação' : 'Todos confirmados ✓')
  set('aoKpiRevenue',        _aoFmtBRL(revenue))
  set('aoKpiRevenueSub',     total ? `Ticket médio: ${_aoFmtBRL(revenue / (total || 1))}` : '')
  set('aoKpiNoshow',         noshows)
  set('aoKpiNoshowSub',      `${noshowRate}% dos atendimentos`)

  // Subtítulo da página com período
  const dateEl = document.getElementById('aoTodayDate')
  if (dateEl) dateEl.textContent = `Período: ${rangeLabel}`
}

// ── Render: Métricas Estatísticas + Benchmarks ─────────────────
function _aoRenderStats(appts, rangeLabel, granularity) {
  // Slots disponíveis: depende do período (08h-20h = 24 slots de 30min por dia)
  const SLOTS_PER_DAY = 24
  const apptDays = new Set(appts.map(a => a.scheduledAt?.slice(0,10)).filter(Boolean)).size || 1
  const totalSlots = SLOTS_PER_DAY * apptDays

  // 1. Índice de Ocupação
  const active    = appts.filter(a => !['cancelled'].includes(a.status)).length
  const occupancy = Math.min(100, Math.round(active / totalSlots * 100))

  const gaugeFill = document.getElementById('aoGaugeFill')
  if (gaugeFill) {
    const arcLen = 157
    gaugeFill.style.strokeDashoffset = arcLen - (arcLen * occupancy / 100)
    gaugeFill.style.stroke = occupancy >= 70 ? '#10B981' : occupancy >= 50 ? '#7C3AED' : '#3B82F6'
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
  set('aoOccupancyPct',    `${occupancy}%`)
  set('aoOccupancyDetail', `${active} consultas em ${apptDays} dia${apptDays > 1 ? 's' : ''} · ${totalSlots} slots`)
  _aoRenderBenchBadge('aoBadgeOccupancy', 'aoStatOccupancy', occupancy, 'occupancy')

  // 2. Taxa de Confirmação
  const totalValid    = appts.filter(a => a.status !== 'cancelled').length
  const totalConfirm  = appts.filter(a => ['confirmed','attended'].includes(a.status)).length
  const confirmRate   = totalValid > 0 ? Math.round(totalConfirm / totalValid * 100) : 0
  set('aoConfirmRate',   `${confirmRate}%`)
  set('aoConfirmDetail', `${totalConfirm} confirmados de ${totalValid} válidos`)
  set('aoConfirmMeta',   rangeLabel)
  const crBar = document.getElementById('aoConfirmBar')
  if (crBar) crBar.style.width = `${confirmRate}%`
  _aoRenderBenchBadge('aoBadgeConfirm', 'aoStatConfirm', confirmRate, 'confirmRate')

  // 3. Taxa de No-show
  const attended   = appts.filter(a => a.status === 'attended').length
  const noshows    = appts.filter(a => a.status === 'no_show').length
  const noshowBase = attended + noshows
  const noshowRate = noshowBase > 0 ? Math.round(noshows / noshowBase * 100) : 0
  set('aoNoshowRate',   `${noshowRate}%`)
  set('aoNoshowDetail', `${noshows} no-shows de ${noshowBase} finalizados`)
  set('aoNoshowMeta',   rangeLabel)
  const nrBar = document.getElementById('aoNoshowBar')
  if (nrBar) nrBar.style.width = `${Math.min(100, noshowRate)}%`
  _aoRenderBenchBadge('aoBadgeNoshow', 'aoStatNoshow', noshowRate, 'noshowRate')

  // Título do card de ocupação atualiza com período
  const titleOcc = document.getElementById('aoTitleOccupancy')
  if (titleOcc) titleOcc.textContent = `Índice de Ocupação · ${rangeLabel}`
}

// ── Render: Timeline (dia ou período) ────────────────────────
function _aoRenderTimeline(appts) {
  const el = document.getElementById('aoTimeline')
  if (!el) return

  const isToday = _aoPeriod.type === 'hoje'
  // Exclui cancelados, ordena por data
  const sorted = [...appts]
    .filter(a => a.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 30) // mostra no máximo 30

  if (!sorted.length) {
    el.innerHTML = `<div class="ao-timeline-empty">
      <i data-feather="calendar" style="width:28px;height:28px;opacity:.3"></i>
      <p>Nenhum agendamento neste período</p>
    </div>`
    featherIn(el, { 'stroke-width': 1.8, width: 16, height: 16 })
    return
  }

  // Agrupa por dia para períodos não-hoje
  if (!isToday) {
    const byDay = {}
    sorted.forEach(a => {
      const day = a.scheduledAt?.slice(0,10) || 'sem-data'
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(a)
    })

    el.innerHTML = Object.entries(byDay).map(([day, dayAppts]) => {
      const dt = new Date(day + 'T12:00')
      const header = dt.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })
      const rows = dayAppts.map(a => _aoTimelineRow(a, false)).join('')
      return `
        <div style="padding:8px 0 4px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border);margin-bottom:4px">
          ${header}
        </div>
        ${rows}`
    }).join('')
  } else {
    el.innerHTML = sorted.map(a => _aoTimelineRow(a, true)).join('')
  }

  if (appts.filter(a => a.status !== 'cancelled').length > 30) {
    el.innerHTML += `<div style="padding:10px;text-align:center;font-size:11px;color:var(--text-muted)">Mostrando 30 de ${appts.length} agendamentos</div>`
  }

  featherIn(el, { 'stroke-width': 1.8, width: 16, height: 16 })
}

function _aoTimelineRow(a, showTime) {
  const cfg        = AO_STATUS[a.status] || AO_STATUS.scheduled
  const name       = a.lead?.name || 'Lead'
  const phone      = a.lead?.phone || ''
  const proc       = a.procedure?.name || '— sem procedimento'
  const noProc     = !a.procedure
  const isPast     = new Date(a.scheduledAt) < new Date()
  const specialist = a.user?.name || null

  const btns = []
  if (a.status === 'scheduled')
    btns.push(`<button class="ao-btn-sm ao-btn-green" data-ao-confirm="${a.id}" onclick="event.stopPropagation();aoConfirmAppt('${a.id}')">Confirmar</button>`)
  if (['scheduled','confirmed'].includes(a.status) && isPast)
    btns.push(`<button class="ao-btn-sm ao-btn-purple" data-ao-attend="${a.id}" onclick="event.stopPropagation();aoMarkAttended('${a.id}')">Compareceu</button>`)

  const apptIdx = window._aoCurrentAppts.indexOf(a)
  const idxAttr = apptIdx >= 0 ? `data-appt-idx="${apptIdx}"` : ''

  return `<div class="ao-timeline-item" ${idxAttr}
    onclick="event.stopPropagation();_aoShowPatientPanel(${apptIdx})">
    <div class="ao-timeline-time">${_aoFmtTime(a.scheduledAt)}</div>
    <div class="ao-timeline-dot" style="background:${cfg.color}"></div>
    <div class="ao-timeline-body">
      <div class="ao-timeline-name">${name} <span style="font-weight:400;color:var(--text-muted);font-size:11px">${phone}</span></div>
      <div class="ao-timeline-proc" style="${noProc?'color:#F59E0B':''}">
        ${noProc?'⚠ ':''}${proc}${a.durationMinutes?` · ${a.durationMinutes}min`:''}${a.procedure?.price?` · ${_aoFmtBRL(a.procedure.price)}`:''}
      </div>
      ${specialist ? `<div class="ao-timeline-specialist"><i data-feather="user-check" style="width:11px;height:11px;margin-right:3px;opacity:.6"></i>${specialist}</div>` : ''}
    </div>
    <div class="ao-timeline-actions">
      ${_aoChip(a.status)}${btns.join('')}
    </div>
  </div>`
}

// ── Render: Ranking de Procedimentos ─────────────────────────
function _aoRenderRanking(monthArr) {
  const el = document.getElementById('aoProcRanking')
  if (!el) return

  // Constrói mapa de stats por procedimento
  window._aoProcStatsMap = {}
  monthArr.forEach(a => {
    if (!a.procedure?.name) return
    const key = a.procedure.name
    if (!window._aoProcStatsMap[key]) {
      window._aoProcStatsMap[key] = { count: 0, attended: 0, revenue: 0, patients: [], procId: a.procedure?.id || null, category: a.procedure?.category || null }
    }
    window._aoProcStatsMap[key].count++
    if (a.status === 'attended') {
      window._aoProcStatsMap[key].attended++
      window._aoProcStatsMap[key].revenue += a.procedure?.price || 0
    }
    const patName = a.lead?.name || a.patient?.name || 'Paciente'
    const patPhone = a.lead?.phone || ''
    window._aoProcStatsMap[key].patients.push({
      name:    patName,
      phone:   patPhone,
      leadId:  a.lead?.id || null,
      date:    a.scheduledAt,
      price:   a.procedure?.price || 0,
      status:  a.status,
    })
  })

  const sorted = Object.entries(window._aoProcStatsMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)

  if (!sorted.length) {
    el.innerHTML = `<div class="ao-timeline-empty" style="padding:20px"><p>Nenhum procedimento no período</p></div>`
    return
  }

  const maxCount = sorted[0]?.[1].count || 1
  const posClass = (i) => i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''

  // Atualiza label do header com período
  const lbl = document.getElementById('aoProcRankingLabel')
  if (lbl) {
    const ro = _aoGetDateRange(_aoPeriod)
    lbl.textContent = ro.label
  }

  el.innerHTML = sorted.map(([name, stats], i) => {
    const avgTicket = stats.attended > 0 ? stats.revenue / stats.attended : 0
    return `
    <div class="ao-rank-item" data-proc-name="${name.replace(/"/g,'&quot;')}"
      onclick="_aoOpenRankingModal('${name.replace(/'/g,'&#39;').replace(/\\/g,'\\\\')}')"
      title="Clique para ver pacientes"
      style="cursor:pointer">
      <div class="ao-rank-pos ${posClass(i)}">${i + 1}</div>
      <div class="ao-rank-body">
        <div class="ao-rank-name">${name}</div>
        <div class="ao-rank-bar-wrap">
          <div class="ao-rank-bar-fill" style="width:${Math.round(stats.count/maxCount*100)}%"></div>
        </div>
        ${stats.revenue > 0 ? `<div class="ao-rank-revenue">${_aoFmtBRL(stats.revenue)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="ao-rank-count">${stats.count}x</div>
        ${stats.attended > 0 ? `<div class="ao-rank-attended">✓ ${stats.attended}</div>` : ''}
      </div>
    </div>`
  }).join('')
}

// ── Render: Gráfico de Distribuição (período dinâmico) ────────
function _aoRenderWeekChart(appts, rangeObj) {
  const canvas = document.getElementById('aoWeekCanvas')
  if (!canvas) return
  if (_aoWeekChart) { _aoWeekChart.destroy(); _aoWeekChart = null }

  const { from, to, granularity } = rangeObj
  const TOTAL_SLOTS = 24

  // Gera buckets dependendo da granularidade
  const buckets = []
  const cur = new Date(from); cur.setHours(0,0,0,0)
  const end = new Date(to);   end.setHours(23,59,59,999)

  if (granularity === 'week') {
    // Agrupar por semana
    while (cur <= end) {
      const wStart = new Date(cur)
      const wEnd   = new Date(cur); wEnd.setDate(cur.getDate() + 6); wEnd.setHours(23,59,59,999)
      buckets.push({ label: `${_aoFmtShortDate(wStart.toISOString())}`, from: new Date(wStart), to: new Date(wEnd) })
      cur.setDate(cur.getDate() + 7)
    }
  } else {
    // Agrupar por dia
    while (cur <= end) {
      const d   = new Date(cur)
      const iso = d.toISOString().slice(0,10)
      buckets.push({ label: d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit' }), iso })
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Calcula confirmados, não confirmados e % ocupação por bucket
  const confirmedCounts   = buckets.map(b => appts.filter(a => {
    const d = a.scheduledAt?.slice(0,10)
    return b.iso ? d === b.iso : (a.scheduledAt >= b.from.toISOString() && a.scheduledAt <= b.to.toISOString())
  }).filter(a => ['confirmed','attended'].includes(a.status)).length)

  const unconfirmedCounts = buckets.map(b => appts.filter(a => {
    const d = a.scheduledAt?.slice(0,10)
    return b.iso ? d === b.iso : (a.scheduledAt >= b.from.toISOString() && a.scheduledAt <= b.to.toISOString())
  }).filter(a => a.status === 'scheduled').length)

  const occupancyPcts = buckets.map((b, i) => {
    const total = (confirmedCounts[i] || 0) + (unconfirmedCounts[i] || 0)
    const slots = b.iso ? TOTAL_SLOTS : TOTAL_SLOTS * 7
    return Math.round(total / slots * 100)
  })

  _aoWeekChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        {
          label: 'Confirmados',
          data: confirmedCounts,
          backgroundColor: '#10B981',
          borderRadius: 3,
          stack: 'a',
        },
        {
          label: 'Não confirmados',
          data: unconfirmedCounts,
          backgroundColor: '#BFDBFE',
          borderRadius: 3,
          stack: 'a',
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const i = items[0]?.dataIndex
              return i !== undefined ? [`Ocupação estimada: ${occupancyPcts[i]}%`] : []
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, color: '#6B7280', maxRotation: 0 } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#6B7280' }, grid: { color: '#F3F4F6' } }
      }
    }
  })
}

// ── Render: Pacientes sem Retorno ─────────────────────────────
function _aoRenderNoReturn(patients) {
  const el = document.getElementById('aoNoReturn')
  if (!el) return

  // Filtra pacientes sem retorno há 60+ dias
  const noReturn = (patients || [])
    .filter(p => {
      const days = _aoDaysSince(p.lastProcedureAt)
      return days === null || days >= 60
    })
    .sort((a, b) => {
      const da = _aoDaysSince(a.lastProcedureAt) ?? 9999
      const db = _aoDaysSince(b.lastProcedureAt) ?? 9999
      return db - da
    })
    .slice(0, 6)

  if (!noReturn.length) {
    el.innerHTML = `<div class="ao-timeline-empty" style="padding:20px">
      <i data-feather="check-circle" style="width:22px;height:22px;opacity:.3"></i>
      <p>Todos os pacientes retornaram recentemente</p>
    </div>`
    featherIn(el, { 'stroke-width': 1.8, width: 16, height: 16 })
    return
  }

  el.innerHTML = noReturn.map(p => {
    const days    = _aoDaysSince(p.lastProcedureAt)
    const label   = days === null ? 'Nunca retornou' : `${days} dias sem retorno`
    const badge   = days === null || days >= 180 ? 'hot' : days >= 90 ? 'warm' : 'cold'
    const initials = (p.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

    return `<div class="ao-return-item">
      <div class="ao-return-avatar">${initials}</div>
      <div class="ao-return-body">
        <div class="ao-return-name">${p.name}</div>
        <div class="ao-return-date">${label}</div>
      </div>
      <span class="ao-return-badge ${badge}">${badge === 'hot' ? '🔴 Urgente' : badge === 'warm' ? '🟡 Atenção' : '⚪ Monitorar'}</span>
    </div>`
  }).join('')

  featherIn(el, { 'stroke-width': 1.8, width: 16, height: 16 })
}


// ── Render: Aniversariantes (timeline vertical) ────────────────
// ── Estado global para flyouts ─────────────────────────────────
window._aoCurrentAppts  = []  // appointments do período atual
window._aoProcStatsMap  = {}  // { procName → { count, attended, revenue, patients[] } }
window._aoPatientByLead = {}  // { leadId → patient }
window._aoFlyoutTimer   = null


// ── Carregamento principal ─────────────────────────────────────
async function loadAgendaOverview() {
  const spin = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    if (window.Skeleton) {
      if (id === 'aoTimeline') Skeleton.into(el, 'cards', { count: 3 })
      else if (id === 'aoProcRanking') Skeleton.into(el, 'rows', { count: 4, cols: 2 })
      else Skeleton.into(el, 'rows', { count: 2, cols: 2 })
    } else {
      el.innerHTML = '<div class="ao-loading"><div class="ao-spinner"></div></div>'
    }
  }
  spin('aoTimeline')
  spin('aoProcRanking')
  spin('aoNoReturn')
  spin('aoBirthdays')
  ;['aoKpiTotal','aoKpiConfirmed','aoKpiUnconfirmed','aoKpiRevenue','aoKpiNoshow'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—'
  })

  // Extrai range do período corrente
  const rangeObj = _aoGetDateRange(_aoPeriod)
  const { from, to, label: rangeLabel, granularity } = rangeObj

  try {
    const svc = window.AppointmentsService

    // ① Todos os agendamentos do período — localStorage (já sincronizado com Supabase)
    // normalizeForOverview() converte status e campos para o formato esperado pelas
    // funções _aoRenderKpis, _aoRenderStats, _aoRenderTimeline etc.
    const rawLocal = svc
      ? svc.getLocalForPeriod(from, to)
      : (typeof getAppointments === 'function'
          ? getAppointments().filter(a => a.data >= from.toISOString().slice(0,10) && a.data <= to.toISOString().slice(0,10))
          : [])
    const appts = svc ? svc.normalizeForOverview(rawLocal) : rawLocal

    // ② Pacientes para "sem retorno" — derivados de clinicai_leads
    const patientsArr = svc ? svc.getLocalLeadsAsPatients() : []

    // ③ Aniversariantes do período — calculados de clinicai_leads
    const bdArr = svc ? svc.getBirthdays(from, to) : []

    // Armazena estado global para flyouts
    window._aoCurrentAppts = appts
    window._aoPatientByLead = {}
    patientsArr.forEach(p => { if (p.leadId) window._aoPatientByLead[p.leadId] = p })

    // Atualiza label da agenda
    const timelineLabel = document.getElementById('aoTimelineLabel')
    if (timelineLabel) timelineLabel.textContent = rangeLabel

    // Renderiza todos os blocos
    _aoRenderKpis(appts, rangeLabel)
    _aoRenderStats(appts, rangeLabel, granularity)
    _aoRenderTimeline(appts)
    _aoRenderRanking(appts)
    _aoRenderWeekChart(appts, rangeObj)
    if (typeof window._aoRenderBirthdays === 'function') window._aoRenderBirthdays(bdArr)
    _aoRenderNoReturn(patientsArr)
    _aoRenderCashflowToday()

  } catch (err) {
    const errHtml = `<div class="ao-timeline-empty"><p style="color:#EF4444">${err.message || 'Erro ao carregar'}</p></div>`
    ;['aoTimeline','aoProcRanking','aoNoReturn','aoBirthdays'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = errHtml
    })
  }
}

// ── Saldo do Dia (integracao com Cashflow) ─────────────
async function _aoRenderCashflowToday() {
  if (!window.CashflowService || !window.CashflowService.getSummary) return
  var host = document.getElementById('aoCashflowToday')
  if (!host) {
    // Cria container injetado no topo da pagina overview, antes do KPI grid
    var page = document.getElementById('page-agenda-overview')
    if (!page) return
    var kpiGrid = page.querySelector('.ao-kpi-grid')
    if (!kpiGrid) return
    host = document.createElement('div')
    host.id = 'aoCashflowToday'
    host.style.cssText = 'background:#fff;border:1px solid #e5e7eb;border-top:3px solid #10b981;border-radius:14px;padding:14px 18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);display:flex;align-items:center;gap:14px;flex-wrap:wrap'
    kpiGrid.parentNode.insertBefore(host, kpiGrid)
  }

  host.innerHTML = '<div class="sk sk-line sk-w40" style="height:14px"></div>'

  try {
    var todayISO = new Date().toISOString().slice(0, 10)
    var res = await window.CashflowService.getSummary(todayISO, todayISO)
    if (!res || !res.ok) { host.style.display = 'none'; return }
    var s = res.data || {}
    var fmt = window.CashflowService.fmtCurrency
    var bal = (s.credits || 0) - (s.debits || 0)
    var balColor = bal >= 0 ? '#10b981' : '#ef4444'

    host.innerHTML = ''
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
        + '<div style="font-size:11px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.4px">Caixa de hoje</div>'
      + '</div>'
      + '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">'
        + '<div><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;font-weight:600">Entradas</div><div style="font-size:16px;color:#10b981;font-weight:700">' + fmt(s.credits || 0) + '</div></div>'
        + '<div><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;font-weight:600">Saidas</div><div style="font-size:16px;color:#ef4444;font-weight:700">' + fmt(s.debits || 0) + '</div></div>'
        + '<div><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;font-weight:600">Saldo</div><div style="font-size:18px;color:' + balColor + ';font-weight:700">' + fmt(bal) + '</div></div>'
        + '<div><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;font-weight:600">Movimentos</div><div style="font-size:16px;color:#374151;font-weight:700">' + (s.count || 0) + '</div></div>'
      + '</div>'
      + '<button onclick="navigateTo(\'fin-cashflow\')" style="margin-left:auto;background:#fff;color:#10b981;border:1.5px solid #bbf7d0;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">Ver detalhes →</button>'
  } catch (e) {
    console.warn('[AgendaOverview] cashflow today error:', e)
    host.style.display = 'none'
  }
}

window.loadAgendaOverview   = loadAgendaOverview
window.aoSetPeriod          = aoSetPeriod
window.aoApplyCustomPeriod  = aoApplyCustomPeriod
window.aoConfirmAppt        = aoConfirmAppt
window.aoMarkAttended       = aoMarkAttended
window.aoShowTooltip        = aoShowTooltip
window.aoHideTooltip        = aoHideTooltip
// aoBd* — expostos por agenda-overview.birthdays.js (seam 2 · 2026-04-24)

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('aoPatientPanel')?.remove()
    document.getElementById('aoRankingModal')?.remove()
    const modal = document.getElementById('aoBirthdayModal')
    if (modal && modal.style.display !== 'none' && window.aoBdModalClose) window.aoBdModalClose()
  }
})
window.showToast            = showToast

// ── Namespace agregador congelado (contrato canonico do projeto) ─
// Os window.<fn> acima permanecem para compatibilidade com onclick inline.
// Aniversariantes: ver window.AgendaOverviewBirthdays.
window.AgendaOverview = Object.freeze({
  load: loadAgendaOverview,
  setPeriod: aoSetPeriod,
  applyCustomPeriod: aoApplyCustomPeriod,
  confirmAppt: aoConfirmAppt,
  markAttended: aoMarkAttended,
})
