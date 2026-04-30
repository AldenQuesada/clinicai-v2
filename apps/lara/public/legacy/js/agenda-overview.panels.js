/**
 * ClinicAI — Agenda Overview · Patient/Proc panels + flyouts + ranking modal
 * Extraido de agenda-overview.js (seam 5 · 2026-04-24). Blocos autocontidos
 * de hover e modal:
 *   - _aoPositionFlyout / _aoShowFlyout / _aoHideFlyout / _aoScheduleHideFlyout
 *   - _aoShowPatientFlyout (hover timeline) / _aoShowPatientPanel (modal expandido)
 *   - _aoShowProcFlyout (hover ranking) / _aoOpenRankingModal
 *
 * Dependencias ja expostas por agenda-overview.js principal:
 *   window._aoCurrentAppts / _aoProcStatsMap / _aoPatientByLead / _aoFlyoutTimer
 *   helpers top-level (ja global): _aoFmtTime, _aoFmtBRL, _aoDaysSince,
 *   _aoFmtShortDate, featherIn, navigateTo, openLead
 */
;(function () {
  'use strict'

// ── Flyout: Paciente (timeline hover) ─────────────────────────
function _aoPositionFlyout(el, refEl) {
  const rect = refEl.getBoundingClientRect()
  const fw = 280, fh = 300
  let top  = rect.top + window.scrollY
  let left = rect.right + 12

  // Flip para esquerda se não cabe na direita
  if (left + fw > window.innerWidth - 10) left = rect.left - fw - 12
  // Corrige vertical se sai pela base
  if (top + fh > window.innerHeight + window.scrollY - 10) top = window.innerHeight + window.scrollY - fh - 10
  if (top < 0) top = 8

  el.style.top  = top + 'px'
  el.style.left = left + 'px'
}

function _aoShowFlyout(html, refEl) {
  clearTimeout(window._aoFlyoutTimer)
  let flyout = document.getElementById('aoFlyout')
  if (!flyout) return
  const inner = document.getElementById('aoFlyoutInner')
  if (inner) inner.innerHTML = html
  flyout.style.display = 'block'
  _aoPositionFlyout(flyout, refEl)
  featherIn(inner || flyout, { 'stroke-width': 1.8, width: 13, height: 13 })
}

function _aoHideFlyout() {
  const flyout = document.getElementById('aoFlyout')
  if (flyout) flyout.style.display = 'none'
}

function _aoScheduleHideFlyout() {
  window._aoFlyoutTimer = setTimeout(_aoHideFlyout, 180)
}

function _aoShowPatientFlyout(event, apptIdx) {
  // Mantido para compatibilidade — redireciona para o painel persistente
  _aoShowPatientPanel(apptIdx)
}

function _aoShowPatientPanel(apptIdx) {
  const a = window._aoCurrentAppts[apptIdx]
  if (!a) return

  const name       = a.lead?.name || 'Paciente'
  const phone      = a.lead?.phone || '—'
  const email      = a.lead?.email || ''
  const initials   = name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
  const proc       = a.procedure?.name || '—'
  const price      = a.procedure?.price ? _aoFmtBRL(a.procedure.price) : '—'
  const dur        = a.durationMinutes ? `${a.durationMinutes}min` : ''
  const timeStr    = _aoFmtTime(a.scheduledAt)
  const specialist = a.user?.name || null

  const leadId     = a.lead?.id || a.leadId
  const patient    = leadId ? window._aoPatientByLead[leadId] : null
  const totalProcs = patient?.totalProcedures ?? '—'
  const totalRev   = patient?.totalRevenue != null ? _aoFmtBRL(patient.totalRevenue) : '—'
  const lastDays   = patient?.lastProcedureAt ? _aoDaysSince(patient.lastProcedureAt) : null
  const lastStr    = lastDays === 0 ? 'hoje' : lastDays !== null ? `${lastDays} dias atrás` : '—'

  document.getElementById('aoPatientPanel')?.remove()

  const panel = document.createElement('div')
  panel.id = 'aoPatientPanel'
  panel.className = 'ao-patient-panel-backdrop'
  panel.innerHTML = `
    <div class="ao-patient-panel-box">
      <div class="ao-patient-panel-header">
        <div class="ao-flyout-avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="ao-flyout-name">${name}</div>
          <div class="ao-flyout-phone">${phone}${email ? ` · ${email}` : ''}</div>
        </div>
        <button class="ao-panel-close" onclick="document.getElementById('aoPatientPanel')?.remove()">✕</button>
      </div>
      <div class="ao-flyout-divider"></div>
      <div class="ao-flyout-row">
        <i data-feather="clock" style="width:13px;height:13px"></i>
        <span><strong>${timeStr}</strong> · ${proc}${dur ? ' · ' + dur : ''}</span>
      </div>
      <div class="ao-flyout-row">
        <i data-feather="tag" style="width:13px;height:13px"></i>
        <span>${_aoChip(a.status)} ${price !== '—' ? '· ' + price : ''}</span>
      </div>
      ${specialist ? `
      <div class="ao-flyout-row">
        <i data-feather="user-check" style="width:13px;height:13px"></i>
        <span>Especialista: <strong>${specialist}</strong></span>
      </div>` : ''}
      ${a.notes ? `<div class="ao-flyout-row" style="margin-top:2px"><i data-feather="message-square" style="width:13px;height:13px"></i><span style="font-size:11px;color:var(--text-muted)">${a.notes}</span></div>` : ''}
      <div class="ao-flyout-divider"></div>
      <div class="ao-flyout-stat-grid">
        <div class="ao-flyout-stat">
          <div class="ao-flyout-stat-val">${totalProcs}</div>
          <div class="ao-flyout-stat-lbl">Procedimentos</div>
        </div>
        <div class="ao-flyout-stat">
          <div class="ao-flyout-stat-val" style="font-size:13px">${totalRev}</div>
          <div class="ao-flyout-stat-lbl">Receita total</div>
        </div>
      </div>
      <div class="ao-flyout-row" style="margin-bottom:0">
        <i data-feather="calendar" style="width:13px;height:13px"></i>
        <span>Último procedimento: <strong>${lastStr}</strong></span>
      </div>
      <div class="ao-flyout-actions">
        ${leadId ? `<button class="ao-flyout-btn primary" onclick="document.getElementById('aoPatientPanel')?.remove();navigateTo('leads');setTimeout(()=>openLead&&openLead('${leadId}'),500)"><i data-feather="user" style="width:13px;height:13px"></i> Ver Perfil</button>` : ''}
      </div>
    </div>
  `
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove() })
  document.body.appendChild(panel)
  featherIn(panel, { 'stroke-width': 1.8, width: 13, height: 13 })
}

function _aoShowProcFlyout(event, procName) {
  clearTimeout(window._aoFlyoutTimer)
  const stats = window._aoProcStatsMap[procName]
  if (!stats) return

  const avgTicket = stats.attended > 0 ? stats.revenue / stats.attended : 0
  const topPatients = stats.patients
    .filter(p => p.status === 'attended')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)

  const allPatients = stats.patients
    .filter(p => p.status === 'attended')

  const remaining = allPatients.length - topPatients.length

  const html = `
    <div class="ao-flyout-header">
      <div class="ao-flyout-proc-icon"><i data-feather="activity" style="width:18px;height:18px"></i></div>
      <div style="min-width:0">
        <div class="ao-flyout-name">${procName}</div>
        <div class="ao-flyout-phone">${stats.category || 'Procedimento'}</div>
      </div>
    </div>
    <div class="ao-flyout-stat-grid">
      <div class="ao-flyout-stat">
        <div class="ao-flyout-stat-val">${stats.count}</div>
        <div class="ao-flyout-stat-lbl">Agendados</div>
      </div>
      <div class="ao-flyout-stat">
        <div class="ao-flyout-stat-val">${stats.attended}</div>
        <div class="ao-flyout-stat-lbl">Realizados</div>
      </div>
      <div class="ao-flyout-stat">
        <div class="ao-flyout-stat-val" style="font-size:12px;color:#10B981">${_aoFmtBRL(stats.revenue)}</div>
        <div class="ao-flyout-stat-lbl">Receita</div>
      </div>
      <div class="ao-flyout-stat">
        <div class="ao-flyout-stat-val" style="font-size:12px">${avgTicket > 0 ? _aoFmtBRL(avgTicket) : '—'}</div>
        <div class="ao-flyout-stat-lbl">Ticket médio</div>
      </div>
    </div>
    ${topPatients.length ? `
    <div class="ao-flyout-divider"></div>
    <div class="ao-flyout-section-title">Pacientes realizados</div>
    ${topPatients.map(p => `
      <div class="ao-flyout-patient-row">
        <span class="ao-flyout-patient-name">${p.name}</span>
        <span class="ao-flyout-patient-val">${p.price > 0 ? _aoFmtBRL(p.price) : '—'}</span>
      </div>`).join('')}
    ${remaining > 0 ? `<div class="ao-flyout-more">+ ${remaining} mais neste período</div>` : ''}
    ` : ''}`

  _aoShowFlyout(html, event.currentTarget)
}

// ── Modal: Detalhes do Procedimento (ranking click) ────────────
function _aoOpenRankingModal(procName) {
  const stats = window._aoProcStatsMap[procName]
  if (!stats) return

  const avgTicket = stats.attended > 0 ? stats.revenue / stats.attended : 0

  const allPatients = stats.patients
    .filter(p => p.status === 'attended')
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  document.getElementById('aoRankingModal')?.remove()

  const timelineHTML = allPatients.length ? `
    <div class="ao-rm-section-title">Linha do tempo — pacientes realizados</div>
    <div class="ao-rm-timeline">
      ${allPatients.map(p => {
        const dateStr = p.date
          ? new Date(p.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
          : '—'
        const initials = (p.name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
        return `
        <div class="ao-rm-tl-item">
          <div class="ao-rm-tl-dot"></div>
          <div class="ao-rm-tl-content">
            <div class="ao-rm-tl-date">${dateStr}</div>
            <div class="ao-rm-tl-patient">
              <div class="ao-rm-tl-avatar">${initials}</div>
              <div class="ao-rm-tl-info">
                <div class="ao-rm-tl-name">${p.name}</div>
                ${p.phone ? `<div class="ao-rm-tl-phone">${p.phone}</div>` : ''}
              </div>
              <div class="ao-rm-tl-right">
                ${p.price > 0 ? `<div class="ao-rm-tl-price">${_aoFmtBRL(p.price)}</div>` : ''}
                ${p.leadId ? `<button class="ao-rm-tl-btn" onclick="document.getElementById('aoRankingModal')?.remove();navigateTo('leads');setTimeout(()=>openLead&&openLead('${p.leadId}'),500)">Perfil</button>` : ''}
              </div>
            </div>
          </div>
        </div>`
      }).join('')}
    </div>
  ` : `<div class="ao-timeline-empty" style="padding:20px"><p>Nenhum procedimento realizado no período</p></div>`

  const modal = document.createElement('div')
  modal.id = 'aoRankingModal'
  modal.className = 'ao-ranking-modal-backdrop'
  modal.innerHTML = `
    <div class="ao-ranking-modal-box">
      <div class="ao-rm-header">
        <div class="ao-rm-icon"><i data-feather="activity" style="width:20px;height:20px"></i></div>
        <div style="flex:1;min-width:0">
          <div class="ao-rm-title">${procName}</div>
          <div class="ao-rm-cat">${stats.category || 'Procedimento'}</div>
        </div>
        <button class="ao-panel-close" onclick="document.getElementById('aoRankingModal')?.remove()">✕</button>
      </div>
      <div class="ao-rm-stats">
        <div class="ao-rm-stat">
          <div class="ao-rm-stat-val">${stats.count}</div>
          <div class="ao-rm-stat-lbl">Agendados</div>
        </div>
        <div class="ao-rm-stat">
          <div class="ao-rm-stat-val">${stats.attended}</div>
          <div class="ao-rm-stat-lbl">Realizados</div>
        </div>
        <div class="ao-rm-stat">
          <div class="ao-rm-stat-val" style="color:#10B981;font-size:14px">${_aoFmtBRL(stats.revenue)}</div>
          <div class="ao-rm-stat-lbl">Receita</div>
        </div>
        <div class="ao-rm-stat">
          <div class="ao-rm-stat-val" style="font-size:14px">${avgTicket > 0 ? _aoFmtBRL(avgTicket) : '—'}</div>
          <div class="ao-rm-stat-lbl">Ticket médio</div>
        </div>
      </div>
      <div class="ao-rm-body">
        ${timelineHTML}
      </div>
    </div>
  `
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)
  featherIn(modal, { 'stroke-width': 1.8, width: 16, height: 16 })
}


  // Expose
  window._aoPositionFlyout    = _aoPositionFlyout
  window._aoShowFlyout        = _aoShowFlyout
  window._aoHideFlyout        = _aoHideFlyout
  window._aoScheduleHideFlyout = _aoScheduleHideFlyout
  window._aoShowPatientFlyout = _aoShowPatientFlyout
  window._aoShowPatientPanel  = _aoShowPatientPanel
  window._aoShowProcFlyout    = _aoShowProcFlyout
  window._aoOpenRankingModal  = _aoOpenRankingModal

  window.AgendaOverviewPanels = Object.freeze({
    positionFlyout:    _aoPositionFlyout,
    showFlyout:        _aoShowFlyout,
    hideFlyout:        _aoHideFlyout,
    scheduleHideFlyout: _aoScheduleHideFlyout,
    showPatientFlyout: _aoShowPatientFlyout,
    showPatientPanel:  _aoShowPatientPanel,
    showProcFlyout:    _aoShowProcFlyout,
    openRankingModal:  _aoOpenRankingModal
  })
})()
