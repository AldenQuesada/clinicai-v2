/**
 * ClinicAI — Agenda Overview · Birthday section
 * Extraido de agenda-overview.js (seam 2 · 2026-04-24) pra reduzir
 * o monolito de 1278 LOC. Bloco autocontido pra aniversariantes:
 *   - _aoRenderBirthdays(patients)   — timeline horizontal
 *   - aoBdOpenOffer(patient)         — modal de oferta gerada por IA
 *   - aoBdModalClose/Copy/Whatsapp   — acoes do modal
 *
 * Dependencias (ambas ja globais via agenda-overview.js principal):
 *   window._aoGetCurrentPeriod() — getter do _aoPeriod (var local do main)
 *   _aoGetDateRange(period)      — calcula range do periodo selecionado
 *   apiFetch, showToast, formatWaPhone, featherIn, navigateTo, openLead
 */
;(function () {
  'use strict'

  // State local do modal (scope isolado por IIFE)
  let _bdCurrentOffer = null
  let _bdCurrentPhone = null

  function _aoRenderBirthdays(patients) {
    const el  = document.getElementById('aoBirthdays')
    const lbl = document.getElementById('aoBirthdaysLabel')
    if (!el) return

    const period   = (typeof window._aoGetCurrentPeriod === 'function') ? window._aoGetCurrentPeriod() : { type: 'mes' }
    const rangeObj = (typeof window._aoGetDateRange === 'function') ? window._aoGetDateRange(period) : { label: '' }
    if (lbl) lbl.textContent = rangeObj.label

    if (!patients || !patients.length) {
      el.innerHTML = `<div class="ao-bd-empty">
        <div style="font-size:24px;margin-bottom:8px">🎂</div>
        <p>Nenhum aniversariante no período selecionado</p>
      </div>`
      return
    }

    const MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

    el.innerHTML = `<div class="ao-bd-timeline">${patients.map(p => {
      const isToday   = p.daysUntil === 0
      const queixasHtml = (p.queixas || []).slice(0, 3).map(q =>
        `<span class="ao-bd-chip">${q}</span>`
      ).join('')
      const ageText   = p.age ? `${p.age} anos` : ''
      const monthStr  = p.bdMonth ? MONTHS_PT[p.bdMonth - 1] : '?'
      const dayStr    = p.bdDay   ? String(p.bdDay).padStart(2, '0') : '?'
      const daysLabel = isToday   ? '🎂 Hoje!' : p.daysUntil > 0 ? `em ${p.daysUntil} dias` : p.daysUntil < 0 ? `há ${Math.abs(p.daysUntil)} dias` : ''

      return `<div class="ao-bd-item">
        <div class="ao-bd-date-col">
          <div class="ao-bd-date-badge${isToday ? ' today' : ''}">
            <span class="bd-day">${dayStr}</span>
            <span class="bd-mon">${monthStr}</span>
          </div>
          <div class="ao-bd-line"></div>
        </div>
        <div class="ao-bd-card">
          <div class="ao-bd-card-header">
            <span class="ao-bd-name">${p.name}</span>
            <span class="ao-bd-age">${ageText}</span>
            <div class="ao-bd-actions">
              ${p.leadId ? `<button class="ao-bd-btn" title="Ver cadastro" onclick="navigateTo('leads');setTimeout(()=>openLead&&openLead('${p.leadId}'),400)">
                <i data-feather="user" style="width:12px;height:12px"></i>
              </button>` : ''}
              <button class="ao-bd-btn offer" title="Gerar oferta irresistível" onclick="aoBdOpenOffer(${JSON.stringify(p).replace(/"/g,'&quot;')})">
                <i data-feather="gift" style="width:12px;height:12px"></i>
              </button>
            </div>
          </div>
          ${queixasHtml ? `<div class="ao-bd-complaints">${queixasHtml}</div>` : ''}
          ${daysLabel ? `<div class="ao-bd-days${isToday ? ' today-label' : ''}">${daysLabel}</div>` : ''}
        </div>
      </div>`
    }).join('')}</div>`

    if (typeof window.featherIn === 'function') {
      window.featherIn(el, { 'stroke-width': 1.8, width: 12, height: 12 })
    }
  }

  // ── Birthday Offer Modal ─────────────────────────────────────
  function aoBdOpenOffer(patient) {
    _bdCurrentOffer = null
    _bdCurrentPhone = patient.phone || null

    const modal = document.getElementById('aoBirthdayModal')
    if (!modal) return
    modal.style.display = 'flex'

    document.getElementById('aoBdModalName').textContent = patient.name
    const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    const monthName = patient.bdMonth ? MONTHS_PT[patient.bdMonth - 1] : null
    const metaParts = []
    if (patient.age)      metaParts.push(`${patient.age} anos`)
    if (monthName && patient.bdDay) metaParts.push(`Aniversário: ${patient.bdDay} de ${monthName}`)
    if (patient.daysUntil === 0)    metaParts.push('🎂 hoje!')
    else if (patient.daysUntil > 0) metaParts.push(`em ${patient.daysUntil} dias`)
    document.getElementById('aoBdModalMeta').textContent = metaParts.join(' · ')

    const bodyEl = document.getElementById('aoBdModalBody')
    bodyEl.innerHTML = `<div class="ao-loading"><div class="ao-spinner"></div><span>Gerando oferta com IA...</span></div>`

    if (typeof window.featherIn === 'function') {
      window.featherIn(document.getElementById('aoBdModal'), { 'stroke-width': 1.8 })
    }

    const _aiBdRequest = typeof window.apiFetch === 'function'
      ? window.apiFetch('/ai/birthday-offer', {
          method: 'POST',
          body: {
            name:           patient.name,
            age:            patient.age || null,
            daysUntil:      patient.daysUntil,
            bdDate:         patient.bdThisYear || null,
            queixas:        patient.queixas || [],
            proceduresDone: patient.proceduresDone || [],
            notes:          patient.notes || null,
          },
        })
      : Promise.reject(new Error('API não configurada'))

    _aiBdRequest.catch(() => ({
      source: 'template',
      message: `Olá ${patient.name}! 🎉 Parabéns pelo seu aniversário! Temos uma oferta especial para você. Entre em contato e aproveite!`,
      subject: `Feliz Aniversário, ${patient.name}!`,
    })).then(offer => {
      if (!offer || offer.error) {
        bodyEl.innerHTML = `<p style="color:#EF4444;font-size:13px">Não foi possível gerar a oferta. Verifique a configuração da API.</p>`
        return
      }
      _bdCurrentOffer = offer
      const isAI = offer.source === 'ai'
      bodyEl.innerHTML = `
        <div class="ao-bd-offer-titulo">${offer.titulo || ''}</div>
        <div class="ao-bd-offer-desc">${offer.oferta || ''}</div>
        <div class="ao-bd-offer-msg">
          <strong>Mensagem WhatsApp</strong>
          ${offer.whatsapp || ''}
        </div>
        <div class="ao-bd-offer-details">
          <div class="ao-bd-offer-detail">
            <strong>Brinde</strong>
            <span>${offer.brinde || '—'}</span>
          </div>
          <div class="ao-bd-offer-detail">
            <strong>Validade</strong>
            <span>${offer.validade || '—'}</span>
          </div>
        </div>
        ${offer.gatilhos && offer.gatilhos.length ? `
        <div class="ao-bd-offer-chips">
          ${offer.gatilhos.map(g => `<span class="ao-bd-offer-chip">${g}</span>`).join('')}
        </div>` : ''}
        <div class="ao-bd-offer-source${isAI ? ' ai-badge' : ''}">
          ${isAI ? 'Oferta gerada pela IA com base nas queixas da paciente' : 'Oferta template — configure ANTHROPIC_API_KEY para personalizar'}
        </div>`

      if (_bdCurrentPhone) {
        document.getElementById('aoBdWhatsappBtn').style.display = 'flex'
      } else {
        document.getElementById('aoBdWhatsappBtn').style.display = 'none'
      }
    }).catch(() => {
      bodyEl.innerHTML = `<p style="color:#EF4444;font-size:13px">Erro de conexão ao gerar oferta.</p>`
    })
  }

  function aoBdModalClose() {
    const modal = document.getElementById('aoBirthdayModal')
    if (modal) modal.style.display = 'none'
    _bdCurrentOffer = null
  }

  function aoBdCopyOffer() {
    if (!_bdCurrentOffer) return
    const text = _bdCurrentOffer.whatsapp || _bdCurrentOffer.oferta || ''
    navigator.clipboard.writeText(text)
      .then(() => window.showToast && window.showToast('Mensagem copiada!'))
      .catch(() => window.showToast && window.showToast('Não foi possível copiar', 'warn'))
  }

  function aoBdOpenWhatsapp() {
    if (!_bdCurrentOffer || !_bdCurrentPhone) return
    const phone = _bdCurrentPhone.replace(/\D/g, '')
    const msg   = encodeURIComponent(_bdCurrentOffer.whatsapp || _bdCurrentOffer.oferta || '')
    const waPhone = window.formatWaPhone ? window.formatWaPhone(phone) : ('55' + phone)
    window.open(`https://wa.me/${waPhone}?text=${msg}`, '_blank')
  }

  // Expose
  window._aoRenderBirthdays = _aoRenderBirthdays
  window.aoBdOpenOffer      = aoBdOpenOffer
  window.aoBdModalClose     = aoBdModalClose
  window.aoBdCopyOffer      = aoBdCopyOffer
  window.aoBdOpenWhatsapp   = aoBdOpenWhatsapp

  window.AgendaOverviewBirthdays = Object.freeze({
    renderBirthdays: _aoRenderBirthdays,
    openOffer:       aoBdOpenOffer,
    modalClose:      aoBdModalClose,
    copyOffer:       aoBdCopyOffer,
    openWhatsapp:    aoBdOpenWhatsapp
  })
})()
