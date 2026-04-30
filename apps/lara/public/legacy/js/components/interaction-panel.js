/**
 * ClinicAI — InteractionPanel Component (Sprint 8, Feature C)
 *
 * Painel lateral deslizante para registrar e visualizar interações de um lead.
 * Abre via InteractionPanel.open(leadId, leadName) e fecha com .close().
 *
 * Tipos suportados: note | call | whatsapp | email | meeting
 * Campos:
 *   - tipo (tabs)
 *   - conteúdo (textarea)
 *   - outcome (select, depende do tipo)
 *   - direção (inbound/outbound, só para call/whatsapp/email)
 *   - duração em minutos (só para call/meeting)
 *
 * Depende de:
 *   SdrService  (sdr.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiInteractionPanelLoaded) return
  window._clinicaiInteractionPanelLoaded = true

  // ── Configuração dos tipos ────────────────────────────────────

  const TYPES = [
    { slug: 'note',     label: 'Nota',      icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' },
    { slug: 'call',     label: 'Ligação',   icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.09z"/></svg>' },
    { slug: 'whatsapp', label: 'WhatsApp',  icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    { slug: 'email',    label: 'E-mail',    icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' },
    { slug: 'meeting',  label: 'Reunião',   icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  ]

  const OUTCOMES = {
    note:     [],
    call:     ['atendeu', 'nao_atendeu', 'caixa_postal', 'numero_errado', 'agendou', 'remarcou'],
    whatsapp: ['respondeu', 'nao_respondeu', 'agendou', 'remarcou', 'cancelou'],
    email:    ['enviado', 'respondeu', 'nao_respondeu'],
    meeting:  ['realizada', 'cancelada', 'remarcada', 'converteu'],
  }

  const OUTCOME_LABELS = {
    atendeu: 'Atendeu', nao_atendeu: 'Nao atendeu', caixa_postal: 'Caixa postal',
    numero_errado: 'Numero errado', agendou: 'Agendou', remarcou: 'Remarcou',
    respondeu: 'Respondeu', nao_respondeu: 'Nao respondeu', cancelou: 'Cancelou',
    enviado: 'Enviado', realizada: 'Realizada', cancelada: 'Cancelada',
    remarcada: 'Remarcada', converteu: 'Converteu',
  }

  // ── Estado ────────────────────────────────────────────────────

  let _panelEl    = null
  let _overlayEl  = null
  let _leadId     = null
  let _activeType = 'note'

  // ── Helpers ───────────────────────────────────────────────────

  function _timeAgo(dateStr) {
    if (!dateStr) return ''
    const diff  = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (days > 0)  return `${days}d atras`
    if (hours > 0) return `${hours}h atras`
    if (mins > 0)  return `${mins}m atras`
    return 'agora'
  }

  function _typeConfig(slug) {
    return TYPES.find(t => t.slug === slug) || TYPES[0]
  }

  // ── Render do histórico ───────────────────────────────────────

  function _renderHistory(interactions) {
    if (!interactions?.length) {
      return '<div class="ip-empty">Nenhuma interacao registrada</div>'
    }

    return interactions.map(i => {
      const cfg = _typeConfig(i.type)
      const outcome = i.outcome ? `<span class="ip-item-outcome">${OUTCOME_LABELS[i.outcome] || i.outcome}</span>` : ''
      const dir = i.direction === 'inbound' ? '← ' : i.direction === 'outbound' ? '→ ' : ''
      const dur = i.duration_sec ? `<span class="ip-item-dur">${Math.round(i.duration_sec / 60)}min</span>` : ''

      return `
        <div class="ip-item ip-item-${i.type}">
          <div class="ip-item-header">
            <span class="ip-item-icon">${cfg.icon}</span>
            <span class="ip-item-type">${dir}${cfg.label}</span>
            ${outcome}
            ${dur}
            <span class="ip-item-time">${_timeAgo(i.created_at)}</span>
          </div>
          ${i.content ? `<div class="ip-item-content">${i.content}</div>` : ''}
        </div>
      `
    }).join('')
  }

  // ── Render do form ────────────────────────────────────────────

  function _renderForm(type) {
    const outcomes = OUTCOMES[type] || []
    const hasDir   = ['call', 'whatsapp', 'email'].includes(type)
    const hasDur   = ['call', 'meeting'].includes(type)

    const placeholder = type === 'note'
      ? 'Escreva uma nota sobre este lead...'
      : type === 'call'
      ? 'Resumo da ligacao...'
      : type === 'whatsapp'
      ? 'Resumo da conversa...'
      : type === 'email'
      ? 'Assunto ou resumo...'
      : 'Notas da reuniao...'

    return `
      ${hasDir ? `
        <div class="ip-field-row">
          <label class="ip-label">Direcao</label>
          <div class="ip-dir-toggle">
            <button class="ip-dir-btn active" data-dir="outbound">Enviado</button>
            <button class="ip-dir-btn" data-dir="inbound">Recebido</button>
          </div>
        </div>
      ` : ''}

      <div class="ip-field">
        <textarea class="ip-textarea" id="ip-content" placeholder="${placeholder}" rows="3"></textarea>
      </div>

      ${outcomes.length ? `
        <div class="ip-field">
          <label class="ip-label">Resultado</label>
          <select class="ip-select" id="ip-outcome">
            <option value="">— selecione —</option>
            ${outcomes.map(o => `<option value="${o}">${OUTCOME_LABELS[o] || o}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      ${hasDur ? `
        <div class="ip-field">
          <label class="ip-label">Duracao (minutos)</label>
          <input type="number" class="ip-input" id="ip-duration" min="0" max="999" placeholder="0">
        </div>
      ` : ''}
    `
  }

  // ── Render do painel ──────────────────────────────────────────

  function _renderPanel(leadName) {
    return `
      <div class="ip-panel" id="ip-panel">
        <div class="ip-header">
          <div class="ip-header-info">
            <div class="ip-header-title">Interacoes</div>
            <div class="ip-header-lead">${leadName || 'Lead'}</div>
          </div>
          <button class="ip-close-btn" id="ip-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="ip-type-tabs">
          ${TYPES.map(t => `
            <button class="ip-type-tab${t.slug === _activeType ? ' active' : ''}" data-type="${t.slug}" title="${t.label}">
              ${t.icon}
              <span>${t.label}</span>
            </button>
          `).join('')}
        </div>

        <div class="ip-form" id="ip-form">
          ${_renderForm(_activeType)}
        </div>

        <div class="ip-form-footer">
          <button class="ip-save-btn" id="ip-save">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Registrar
          </button>
        </div>

        <div class="ip-history-header">Historico</div>
        <div class="ip-history" id="ip-history">
          <div class="ip-loading">Carregando...</div>
        </div>
      </div>
    `
  }

  // ── Ações ─────────────────────────────────────────────────────

  function _getFormValues() {
    const content  = _panelEl.querySelector('#ip-content')?.value.trim() || null
    const outcome  = _panelEl.querySelector('#ip-outcome')?.value || null
    const durVal   = _panelEl.querySelector('#ip-duration')?.value
    const durationSec = durVal ? parseInt(durVal, 10) * 60 : null
    const activeDir = _panelEl.querySelector('.ip-dir-btn.active')
    const direction = activeDir ? activeDir.dataset.dir : null

    return { content, outcome: outcome || null, direction, durationSec }
  }

  async function _save() {
    const btn = _panelEl.querySelector('#ip-save')
    const { content, outcome, direction, durationSec } = _getFormValues()

    if (!content && _activeType === 'note') {
      _panelEl.querySelector('#ip-content')?.focus()
      return
    }

    btn.disabled = true
    btn.textContent = 'Salvando...'

    const result = await window.SdrService.addInteraction(
      _leadId, _activeType, content, outcome, direction, durationSec
    )

    if (!result.ok) {
      btn.disabled = false
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Registrar'
      console.warn('[InteractionPanel] save falhou:', result.error)
      return
    }

    // Limpa o form
    const formEl = _panelEl.querySelector('#ip-form')
    if (formEl) formEl.innerHTML = _renderForm(_activeType)
    _bindFormEvents()

    btn.disabled = false
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Registrar'

    // Recarrega histórico
    _loadHistory()
  }

  async function _loadHistory() {
    const histEl = _panelEl.querySelector('#ip-history')
    if (!histEl) return

    const result = await window.SdrService.getInteractions(_leadId, 30)
    histEl.innerHTML = result.ok
      ? _renderHistory(result.data)
      : '<div class="ip-empty">Erro ao carregar historico</div>'
  }

  function _bindFormEvents() {
    _panelEl.querySelectorAll('.ip-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _panelEl.querySelectorAll('.ip-dir-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })
  }

  function _bindPanelEvents() {
    _panelEl.querySelector('#ip-close')?.addEventListener('click', close)

    _panelEl.querySelectorAll('.ip-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _activeType = tab.dataset.type
        _panelEl.querySelectorAll('.ip-type-tab').forEach(t => t.classList.remove('active'))
        tab.classList.add('active')

        const formEl = _panelEl.querySelector('#ip-form')
        if (formEl) { formEl.innerHTML = _renderForm(_activeType); _bindFormEvents() }
      })
    })

    _panelEl.querySelector('#ip-save')?.addEventListener('click', _save)

    _bindFormEvents()
  }

  // ── API pública ───────────────────────────────────────────────

  function open(leadId, leadName) {
    if (_panelEl) close()

    _leadId     = leadId
    _activeType = 'note'

    // Overlay
    _overlayEl = document.createElement('div')
    _overlayEl.className = 'ip-overlay'
    _overlayEl.addEventListener('click', close)
    document.body.appendChild(_overlayEl)

    // Painel
    const wrapper = document.createElement('div')
    wrapper.innerHTML = _renderPanel(leadName)
    _panelEl = wrapper.firstElementChild
    document.body.appendChild(_panelEl)

    // Força reflow antes de adicionar classe de animação
    _panelEl.getBoundingClientRect()
    _panelEl.classList.add('open')

    _bindPanelEvents()
    _loadHistory()

    // Fecha com Escape
    document.addEventListener('keydown', _onEscape)
  }

  function close() {
    document.removeEventListener('keydown', _onEscape)

    if (_panelEl) {
      _panelEl.classList.remove('open')
      _panelEl.addEventListener('transitionend', () => _panelEl?.remove(), { once: true })
      _panelEl = null
    }

    _overlayEl?.remove()
    _overlayEl = null
    _leadId    = null
  }

  function _onEscape(e) {
    if (e.key === 'Escape') close()
  }

  // ── Exposição global ──────────────────────────────────────────
  window.InteractionPanel = Object.freeze({ open, close })

})()
