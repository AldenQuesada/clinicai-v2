/**
 * ClinicAI — SDR Module
 * Funil comercial: metas, responsáveis, no-show causes, análise de período.
 *
 * Dependências externas:
 *   getProfessionals() → professionals.js
 *   apiFetch()         → auth.js
 *   showToast()        → api.js (agenda module)
 *
 * ⚠ GLOBALS OWNED BY THIS FILE:
 *   sdrSaveResp, sdrSetPeriod, sdrEditMeta, sdrSaveNoshowCause
 *   sdrLoadFunnel
 */

// ══════════════════════════════════════════════════════════════
// SDR — Funil, Responsável, Metas Editáveis
// ══════════════════════════════════════════════════════════════

const SDR_KEY = 'clinicai_sdr_config'

function sdrGetConfig() {
  try { return JSON.parse(localStorage.getItem(SDR_KEY) || '{}') } catch { return {} }
}
function sdrSaveConfig(cfg) { store.set(SDR_KEY, cfg) }

/** Preenche o select de responsáveis com profissionais cadastrados */
function sdrPopulateResp(prefix) {
  const sel = document.getElementById(`${prefix}_responsavel`)
  if (!sel) return
  const profs = getProfessionals ? getProfessionals() : []
  const cfg   = sdrGetConfig()
  const saved = cfg[`${prefix}_resp`] || ''
  sel.innerHTML = '<option value="">Selecione...</option>' +
    profs.map(p => `<option value="${p.nome}" ${p.nome === saved ? 'selected' : ''}>${p.nome}${p.especialidade ? ' — ' + p.especialidade : ''}</option>`).join('')
  if (!profs.length) sel.innerHTML = '<option value="">Nenhum profissional cadastrado</option>'
}

function sdrSaveResp(type, val) {
  const cfg = sdrGetConfig()
  cfg[`${type === 'fullface' ? 'sdrff' : 'sdrpt'}_resp`] = val
  sdrSaveConfig(cfg)
}

function sdrSetPeriod(type, period, btn) {
  const prefix = type === 'fullface' ? 'sdrff' : 'sdrpt'
  const wrap = document.querySelector(`#page-${type === 'fullface' ? 'sdh-fullface' : 'sdh-protocolos'} .sdr-period-btn`)?.closest('div')
  if (wrap) wrap.querySelectorAll('.sdr-period-btn').forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
  const cfg = sdrGetConfig()
  cfg[`${prefix}_period`] = period
  sdrSaveConfig(cfg)
  sdrLoadFunnel(prefix)
  sdrLoadSourceComparison(prefix)
}

/** Calcula cor por rangos (normal: maior = melhor) */
function _sdrRangeColor(actual, greenMin, yellowMin) {
  if (actual >= greenMin) return 'green'
  if (actual >= yellowMin) return 'orange'
  return 'red'
}

/** Calcula cor inversa por rangos (para perdidos: menor = melhor) */
function _sdrRangeColorInverse(actual, greenMax, yellowMax) {
  if (actual <= greenMax) return 'green'
  if (actual <= yellowMax) return 'orange'
  return 'red'
}

/** Renderiza tags de um estágio */
function _sdrRenderTags(elId, tags) {
  const el = document.getElementById(elId)
  if (!el) return
  el.innerHTML = tags.map(t => `<span class="sdr-tag-chip">${t}</span>`).join('')
}

/** Calcula datas de periodo */
function _sdrPeriodDates(period) {
  const now = new Date()
  const to  = now.toISOString()
  let from
  if (period === 'mes') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  } else if (period === 'trimestre') {
    from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString()
  } else {
    // semana (default)
    const d = new Date(now); d.setDate(d.getDate() - 7)
    from = d.toISOString()
  }
  return { from, to }
}

/** Carrega e renderiza o funil para um prefix (sdrff ou sdrpt) */
async function sdrLoadFunnel(prefix) {
  const cfg    = sdrGetConfig()
  const period = cfg[`${prefix}_period`] || 'semana'

  // Thresholds configuráveis (green = bom, yellow = médio, abaixo = ruim)
  const th = {
    ag:   { green: parseFloat(cfg[`${prefix}_th_ag_green`]   || '60'), yellow: parseFloat(cfg[`${prefix}_th_ag_yellow`]   || '30') },
    comp: { green: parseFloat(cfg[`${prefix}_th_comp_green`] || '80'), yellow: parseFloat(cfg[`${prefix}_th_comp_yellow`] || '50') },
    conv: { green: parseFloat(cfg[`${prefix}_th_conv_green`] || '60'), yellow: parseFloat(cfg[`${prefix}_th_conv_yellow`] || '30') },
    fech: { green: parseFloat(cfg[`${prefix}_th_fech_green`] || '50'), yellow: parseFloat(cfg[`${prefix}_th_fech_yellow`] || '25') },
    lost: { green: parseFloat(cfg[`${prefix}_th_lost_green`] || '10'), yellow: parseFloat(cfg[`${prefix}_th_lost_yellow`] || '20') },
  }

  // Atualiza labels dos thresholds na UI
  const _setTh = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = `${val}%` }
  Object.keys(th).forEach(k => {
    _setTh(`${prefix}_th_${k}_green`, th[k].green)
    _setTh(`${prefix}_th_${k}_yellow`, th[k].yellow)
  })

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  const setPct = (id, pct, thKey, inverse) => {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = `${pct}%`
    if (thKey && th[thKey]) {
      el.className = `sdr-arrow-pct ${inverse ? _sdrRangeColorInverse(pct, th[thKey].green, th[thKey].yellow) : _sdrRangeColor(pct, th[thKey].green, th[thKey].yellow)}`
    }
  }

  try {
    if (!window.SdrRepository) throw new Error('SdrRepository indisponivel')
    const dates = _sdrPeriodDates(period)
    const res = await SdrRepository.getFunnelMetrics(dates.from, dates.to)
    if (!res || res.ok === false) throw new Error(res?.error || 'Erro RPC')
    const d = res.data

    const totalLeads  = d.total_leads  || 0
    const agendados   = d.ever_agendado   || 0
    const compareceram= d.ever_compareceu || 0
    const pacientes   = d.ever_paciente   || 0
    const orcamentos  = d.ever_orcamento  || 0
    const perdidos    = d.ever_perdido    || 0
    const orcPac      = d.orcamento_para_paciente || 0
    const noShows     = d.no_shows        || 0

    // Taxas
    const pctAg   = totalLeads  > 0 ? Math.round(agendados    / totalLeads  * 100) : 0
    const pctComp = agendados   > 0 ? Math.round(compareceram / agendados   * 100) : 0
    const pctPac  = compareceram> 0 ? Math.round(pacientes    / compareceram* 100) : 0
    const pctOrc  = compareceram> 0 ? Math.round(orcamentos   / compareceram* 100) : 0
    const pctFech = orcamentos  > 0 ? Math.round(orcPac       / orcamentos  * 100) : 0

    // Contagens
    setEl(`${prefix}_c1`, totalLeads)
    setEl(`${prefix}_c2`, agendados)
    setEl(`${prefix}_c3`, compareceram)
    setEl(`${prefix}_c4`, pacientes)
    setEl(`${prefix}_c5`, orcamentos)
    setEl(`${prefix}_c6`, orcPac)
    setEl(`${prefix}_c7`, perdidos)

    // Percentuais com cores por rangos
    setPct(`${prefix}_p12`, pctAg, 'ag')
    setPct(`${prefix}_p23`, pctComp, 'comp')
    setPct(`${prefix}_p3pac`, pctPac, 'conv')
    setPct(`${prefix}_p3orc`, pctOrc)
    setPct(`${prefix}_p5pac`, pctFech, 'fech')

    // Perdidos (logica inversa: acima do yellow = ruim)
    var pctLost = totalLeads > 0 ? Math.round(perdidos / totalLeads * 100) : 0
    setPct(`${prefix}_p_lost`, pctLost, 'lost', true)

    // No-show
    const nsBadge = document.getElementById(`${prefix}_noshow`)
    const nsCount = document.getElementById(`${prefix}_noshow_count`)
    if (nsBadge) { nsBadge.style.display = noShows > 0 ? 'flex' : 'none'; if (nsCount) nsCount.textContent = noShows }

    // Temperatura
    setEl(`${prefix}_hot`,  d.temp_hot  || 0)
    setEl(`${prefix}_warm`, d.temp_warm || 0)
    setEl(`${prefix}_cold`, d.temp_cold || 0)

  } catch (e) {
    console.warn('[SDR] Funil fallback:', e.message)
    setEl(`${prefix}_c1`, 0)
    setEl(`${prefix}_c2`, 0)
    setEl(`${prefix}_c3`, 0)
    setEl(`${prefix}_c4`, 0)
    setEl(`${prefix}_c5`, 0)
    setEl(`${prefix}_c6`, 0)
    setEl(`${prefix}_c7`, 0)
  }
}

/** Threshold editavel — clique na span abre input inline */
function sdrEditThreshold(type, metric, level, el) {
  const prefix  = type === 'fullface' ? 'sdrff' : 'sdrpt'
  const cfgKey  = `${prefix}_th_${metric}_${level}`
  const current = parseFloat(el.textContent) || 50

  const borderColor = level === 'green' ? '#10b981' : '#f59e0b'
  const input = document.createElement('input')
  input.type  = 'number'; input.min = '1'; input.max = '100'
  input.value = current
  input.style.cssText = `width:40px;border:1.5px solid ${borderColor};border-radius:5px;padding:1px 4px;font-size:10px;font-weight:700;color:${borderColor};outline:none;text-align:center`
  el.replaceWith(input)
  input.focus(); input.select()

  const save = () => {
    const val = Math.min(100, Math.max(1, parseInt(input.value) || current))
    const span = document.createElement('span')
    span.className = 'sdr-target-val'
    span.id = el.id
    span.textContent = `${val}%`
    span.title = 'Clique para editar'
    span.onclick = () => sdrEditThreshold(type, metric, level, span)
    input.replaceWith(span)
    const cfg = sdrGetConfig()
    cfg[cfgKey] = val
    sdrSaveConfig(cfg)
    sdrLoadFunnel(prefix)
  }
  input.addEventListener('blur', save)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save() })
}

// Manter compatibilidade com onclick antigos
function sdrEditMeta(type, kind, el) {
  const metricMap = { agendamento: 'ag', comparecimento: 'comp', conversao: 'conv', fechamento: 'fech', perdidos: 'lost' }
  sdrEditThreshold(type, metricMap[kind] || 'ag', 'green', el)
}

/** Carrega e renderiza tabela comparativa por origem */
async function sdrLoadSourceComparison(prefix) {
  const wrap = document.getElementById(`${prefix}_source_table`)
  if (!wrap || !window.SdrRepository) return

  const cfg    = sdrGetConfig()
  const period = cfg[`${prefix}_period`] || 'semana'
  const dates  = _sdrPeriodDates(period)

  try {
    const res = await SdrRepository.getFunnelBySource(dates.from, dates.to)
    if (!res || res.ok === false) throw new Error(res?.error || 'Erro')
    const sources = res.data || []

    if (sources.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">Nenhum dado no periodo</div>'
      return
    }

    const sourceLabels = { quiz: 'Quiz', manual: 'Manual', import: 'Planilha', referral: 'Indicacao', social: 'Rede Social' }

    const _barHtml = (pct, color) => {
      return `<div style="display:flex;align-items:center;gap:6px;min-width:120px">
        <div style="flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden">
          <div style="width:${Math.min(pct, 100)}%;height:100%;background:${color};border-radius:3px"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${color};min-width:32px">${pct}%</span>
      </div>`
    }

    const _rateColor = (pct) => pct >= 50 ? '#10b981' : pct >= 25 ? '#f59e0b' : '#ef4444'
    const _lostColor = (pct) => pct <= 10 ? '#10b981' : pct <= 20 ? '#f59e0b' : '#ef4444'

    wrap.innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr style="border-bottom:2px solid #e5e7eb">' +
        '<th style="text-align:left;padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">ORIGEM</th>' +
        '<th style="text-align:center;padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">LEADS</th>' +
        '<th style="padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">AGENDAMENTO</th>' +
        '<th style="padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">COMPARECIMENTO</th>' +
        '<th style="padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">CONVERSAO</th>' +
        '<th style="padding:8px 6px;font-weight:700;color:#6b7280;font-size:11px">PERDA</th>' +
      '</tr></thead><tbody>' +
      sources.map(s => {
        const label = s.source_type === 'quiz' && s.quiz_title
          ? s.quiz_title
          : sourceLabels[s.source_type] || s.source_type
        const icon = s.source_type === 'quiz'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="margin-right:4px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="margin-right:4px"><circle cx="12" cy="12" r="10"/></svg>'

        return '<tr style="border-bottom:1px solid #f3f4f6">' +
          `<td style="padding:8px 6px;font-weight:600;color:#111">${icon}${label}</td>` +
          `<td style="padding:8px 6px;text-align:center;font-weight:800;color:#374151">${s.total_leads}</td>` +
          `<td style="padding:8px 6px">${_barHtml(s.taxa_agendamento, _rateColor(s.taxa_agendamento))}</td>` +
          `<td style="padding:8px 6px">${_barHtml(s.taxa_comparecimento, _rateColor(s.taxa_comparecimento))}</td>` +
          `<td style="padding:8px 6px">${_barHtml(s.taxa_conversao, _rateColor(s.taxa_conversao))}</td>` +
          `<td style="padding:8px 6px">${_barHtml(s.taxa_perda, _lostColor(s.taxa_perda))}</td>` +
        '</tr>'
      }).join('') +
      '</tbody></table>'
  } catch (e) {
    wrap.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">Erro ao carregar: ' + (e.message || '') + '</div>'
  }
}

function sdrSaveNoshowCause(sel) {
  const item = sel.closest('.sdr-ns-item')
  const name = item?.querySelector('.sdr-ns-name')?.textContent || ''
  if (sel.value) showToast(`Causa registrada para ${name}: ${sel.options[sel.selectedIndex].text}`, 'success')
}

window.sdrSaveResp       = sdrSaveResp
window.sdrSetPeriod      = sdrSetPeriod
window.sdrEditMeta       = sdrEditMeta
window.sdrSaveNoshowCause= sdrSaveNoshowCause

// ── Hook na navegação: detecta quando pagina SDR fica visivel ──
var _sdrLastLoad = {}
function _sdrOnPageVisible(pageId) {
  // Debounce: evita chamadas duplicadas em menos de 1 segundo
  var now = Date.now()
  if (_sdrLastLoad[pageId] && now - _sdrLastLoad[pageId] < 1000) return
  _sdrLastLoad[pageId] = now

  if (pageId === 'sdh-fullface')   { sdrPopulateResp('sdrff'); sdrLoadFunnel('sdrff'); sdrLoadSourceComparison('sdrff') }
  if (pageId === 'sdh-protocolos') { sdrPopulateResp('sdrpt'); sdrLoadFunnel('sdrpt') }
}

// Observer que detecta quando a page SDR ganha classe 'active'
var _sdrObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(m) {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      var el = m.target
      if (el.classList.contains('active') && el.id && el.id.startsWith('page-sdh-')) {
        var pageId = el.id.replace('page-', '')
        setTimeout(function() { _sdrOnPageVisible(pageId) }, 50)
      }
    }
  })
})

// Observar ambas as paginas SDR
document.addEventListener('DOMContentLoaded', function() {
  var pages = ['page-sdh-fullface', 'page-sdh-protocolos']
  pages.forEach(function(id) {
    var el = document.getElementById(id)
    if (el) _sdrObserver.observe(el, { attributes: true, attributeFilter: ['class'] })
  })
})

// Fallback: se a pagina ja esta ativa no load (F5 na pagina SDR)
window.addEventListener('load', function() {
  setTimeout(function() {
    var ff = document.getElementById('page-sdh-fullface')
    if (ff && ff.classList.contains('active')) _sdrOnPageVisible('sdh-fullface')
    var pt = document.getElementById('page-sdh-protocolos')
    if (pt && pt.classList.contains('active')) _sdrOnPageVisible('sdh-protocolos')
  }, 500)
})

// Hook legado (para navegacao via JS direto)
const _origNavigateTo = window.navigateTo
if (_origNavigateTo) {
  window.navigateTo = function(pageId) {
    _origNavigateTo(pageId)

    setTimeout(() => {
      if (pageId === 'agenda-overview') { loadAgendaOverview() }
      if (pageId === 'agenda') { _agendaView = 'semana'; _agendaDate = new Date(); renderAgenda() }
      if (pageId === 'agenda-reports') { if (window.renderAgendaRelatorios) renderAgendaRelatorios() }
      if (pageId === 'agenda-eventos') { if (window.renderAgendaEventos)    renderAgendaEventos() }
      if (pageId === 'agenda-tags')    { if (window.renderAgendaTagsFluxos) renderAgendaTagsFluxos() }
      if (pageId === 'agenda-today') { _agendaView = 'hoje'; _agendaDate = new Date(); renderAgenda() }
      if (pageId === 'agenda-full')  { _agendaView = 'mes';  _agendaDate = new Date(); renderAgenda() }
    }, 30)
  }
}
