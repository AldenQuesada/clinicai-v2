/**
 * ClinicAI — LeadCard Component (Sprint 8)
 *
 * Card reutilizável do lead para uso nos kanbans e na inbox.
 * Renderiza: nome, telefone, temperatura, prioridade, tags, ações rápidas.
 *
 * Uso:
 *   const card = LeadCard.create(lead, { onTagClick, onPhaseChange, onMoveStage })
 *   column.appendChild(card)
 *
 *   LeadCard.updateTags(cardEl, tags)   — atualiza badges sem re-render
 *
 * Depende de:
 *   SdrService  (sdr.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiLeadCardLoaded) return
  window._clinicaiLeadCardLoaded = true

  // ── Configurações visuais ─────────────────────────────────────

  const TEMPERATURE_CONFIG = {
    cold: { label: 'Frio',   color: '#93c5fd', bg: '#eff6ff', icon: '❄' },
    warm: { label: 'Morno',  color: '#fcd34d', bg: '#fffbeb', icon: '◑' },
    hot:  { label: 'Quente', color: '#f87171', bg: '#fef2f2', icon: '●' },
  }

  const PRIORITY_CONFIG = {
    normal: null,
    high:   { label: 'Alta',    color: '#f97316', bg: '#fff7ed' },
    urgent: { label: 'Urgente', color: '#ef4444', bg: '#fef2f2' },
  }

  const PHASE_CONFIG = {
    lead:        { label: 'Lead',        color: '#6366f1' },
    agendado:    { label: 'Agendado',    color: '#8b5cf6' },
    reagendado:  { label: 'Reagendado',  color: '#a855f7' },
    compareceu:  { label: 'Compareceu',  color: '#06b6d4' },
    paciente:    { label: 'Paciente',    color: '#10b981' },
    orcamento:   { label: 'Orçamento',   color: '#f59e0b' },
    perdido:     { label: 'Perdido',     color: '#ef4444' },
  }

  // ── Helpers ───────────────────────────────────────────────────

  function _initials(name) {
    if (!name || name === '—') return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  function _avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444']
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  function _formatPhone(phone) {
    if (!phone || phone === '—') return ''
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
    if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
    return phone
  }

  function _timeAgo(dateStr) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (days > 0)  return `${days}d`
    if (hours > 0) return `${hours}h`
    if (mins > 0)  return `${mins}m`
    return 'agora'
  }

  // ── Render de badges ──────────────────────────────────────────

  function _renderTemperatureBadge(temperature) {
    const cfg = TEMPERATURE_CONFIG[temperature] || TEMPERATURE_CONFIG.cold
    return `<span class="lc-badge lc-badge-temp" style="color:${cfg.color};background:${cfg.bg}" title="Temperatura: ${cfg.label}">
      <span class="lc-badge-dot" style="background:${cfg.color}"></span>${cfg.label}
    </span>`
  }

  function _renderPriorityBadge(priority) {
    const cfg = PRIORITY_CONFIG[priority]
    if (!cfg) return ''
    return `<span class="lc-badge lc-badge-priority" style="color:${cfg.color};background:${cfg.bg}" title="Prioridade: ${cfg.label}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ${cfg.label}
    </span>`
  }

  function _renderTagBadges(tags) {
    if (!tags || !tags.length) return ''
    const visible = tags.slice(0, 3)
    const extra   = tags.length - 3
    let html = visible.map(t =>
      `<span class="lc-tag" style="color:${t.color};border-color:${t.color}20;background:${t.color}12" title="${_e(t.label)}">${_e(t.label)}</span>`
    ).join('')
    if (extra > 0) html += `<span class="lc-tag lc-tag-more" title="${tags.slice(3).map(t => _e(t.label)).join(', ')}">+${extra}</span>`
    return html
  }

  // ── Render do card ────────────────────────────────────────────

  function _renderCard(lead, tags) {
    const temp   = TEMPERATURE_CONFIG[lead.temperature] || TEMPERATURE_CONFIG.cold
    const phase  = PHASE_CONFIG[lead.phase] || PHASE_CONFIG.lead
    const initials = _initials(lead.name)
    const _e = window.escHtml || function(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
    const avatarBg = _avatarColor(lead.name)
    const phone    = _formatPhone(lead.phone)
    const age      = _timeAgo(lead.created_at || lead.createdAt)
    const qf       = Array.isArray(lead.queixas_faciais) ? lead.queixas_faciais : []
    const queixasHtml = qf.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 0">' +
          qf.slice(0, 3).map(q => '<span style="font-size:9px;padding:2px 6px;background:#EEF2FF;color:#4338CA;border-radius:4px;white-space:nowrap">' + _e(q) + '</span>').join('') +
          (qf.length > 3 ? '<span style="font-size:9px;padding:2px 4px;color:#9ca3af">+' + (qf.length - 3) + '</span>' : '') +
        '</div>'
      : ''

    return `
      <div class="lead-card" data-lead-id="${_e(lead.id)}" data-phase="${_e(lead.phase)}" data-temperature="${_e(lead.temperature || 'cold')}">

        <div class="lc-header">
          <div class="lc-avatar" style="background:${avatarBg}">${_e(initials)}</div>
          <div class="lc-info">
            <div class="lc-name">${_e(lead.name || '—')}</div>
          </div>
          ${_renderTemperatureBadge(lead.temperature || 'cold')}
          <div class="lc-meta">
            <span class="lc-age" title="Criado há ${age}">${age}</span>
          </div>
        </div>

        <div class="lc-footer">
          ${phone ? `<span class="lc-phone-inline">${phone}</span>` : ''}
          ${queixasHtml}
          <div class="lc-tags-inline" data-tags-container="${lead.id}">${_renderTagBadges(tags || [])}</div>
          <div class="lc-actions">
            <button class="lc-action-btn lc-action-whatsapp" data-action="whatsapp" data-phone="${lead.phone || ''}" title="Abrir no WhatsApp">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </button>
            <button class="lc-action-btn" data-action="tag" data-lead-id="${lead.id}" title="Adicionar tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </button>
            <button class="lc-action-btn" data-action="interaction" data-lead-id="${lead.id}" title="Registrar interacao">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="lc-action-btn" data-action="move" data-lead-id="${lead.id}" title="Mover fase">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

      </div>
    `
  }

  // ── API pública ───────────────────────────────────────────────

  /**
   * Cria e retorna o elemento DOM do card.
   *
   * @param {object} lead   — objeto do lead (campos: id, name, phone, temperature, priority, phase, created_at)
   * @param {object} opts   — callbacks:
   *   onTagClick(leadId)        — clique no botão de tag
   *   onMoveStage(leadId)       — clique no botão de mover
   *   onWhatsApp(phone, leadId) — clique no botão de WhatsApp
   * @param {array}  tags   — array de tags já carregadas (opcional, carrega async se omitido)
   * @returns {HTMLElement}
   */
  function create(lead, opts = {}, tags = null) {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = _renderCard(lead, tags)
    const card = wrapper.firstElementChild

    // Carrega tags async se não fornecidas
    if (tags === null && window.SdrService) {
      window.SdrService.getTags('lead', lead.id).then(result => {
        if (result.ok && result.data?.length) {
          updateTags(card, result.data)
        }
      })
    }

    // Bind de eventos
    card.querySelector('[data-action="tag"]')?.addEventListener('click', e => {
      e.stopPropagation()
      opts.onTagClick?.(lead.id, lead, e.currentTarget)
    })

    card.querySelector('[data-action="interaction"]')?.addEventListener('click', e => {
      e.stopPropagation()
      if (window.InteractionPanel) {
        window.InteractionPanel.open(lead.id, lead.name)
      }
      opts.onInteractionClick?.(lead.id, lead)
    })

    card.querySelector('[data-action="move"]')?.addEventListener('click', e => {
      e.stopPropagation()
      opts.onMoveStage?.(lead.id, lead)
    })

    card.querySelector('[data-action="whatsapp"]')?.addEventListener('click', e => {
      e.stopPropagation()
      const phone = e.currentTarget.dataset.phone
      if (phone && phone !== '—') {
        const digits = phone.replace(/\D/g, '')
        window.open(`https://wa.me/${window.formatWaPhone ? formatWaPhone(digits) : '55'+digits}`, '_blank')
      }
      opts.onWhatsApp?.(phone, lead.id)
    })

    card.querySelector('.lc-menu-btn')?.addEventListener('click', e => {
      e.stopPropagation()
      opts.onMenuClick?.(lead.id, lead, e.currentTarget)
    })

    return card
  }

  /**
   * Atualiza apenas os badges de tags do card sem re-render completo.
   *
   * @param {HTMLElement} cardEl — elemento do card
   * @param {array}       tags   — novo array de tags
   */
  function updateTags(cardEl, tags) {
    const container = cardEl.querySelector('[data-tags-container]')
    if (container) container.innerHTML = _renderTagBadges(tags)
  }

  /**
   * Atualiza temperatura do card (badge + data-attribute).
   *
   * @param {HTMLElement} cardEl
   * @param {'cold'|'warm'|'hot'} temperature
   */
  function updateTemperature(cardEl, temperature) {
    const badge = cardEl.querySelector('.lc-badge-temp')
    if (badge) {
      const cfg = TEMPERATURE_CONFIG[temperature] || TEMPERATURE_CONFIG.cold
      badge.style.color      = cfg.color
      badge.style.background = cfg.bg
      const dot = badge.querySelector('.lc-badge-dot')
      if (dot) dot.style.background = cfg.color
      badge.title = 'Temperatura: ' + cfg.label
      badge.innerHTML = `<span class="lc-badge-dot" style="background:${cfg.color}"></span>${cfg.label}`
    }
    cardEl.dataset.temperature = temperature
  }

  // ── Exposição global ──────────────────────────────────────────
  window.LeadCard = Object.freeze({
    create,
    updateTags,
    updateTemperature,
  })

})()
