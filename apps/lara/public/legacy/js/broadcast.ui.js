/**
 * ClinicAI — Broadcast UI (extracted from automations.ui.js)
 *
 * Broadcast state, rendering functions, and helpers.
 * Uses shared helpers from window._clinicaiHelpers.
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastUILoaded) return
  window._clinicaiBroadcastUILoaded = true

  // ── Shared helper aliases ───────────────────────────────────
  var _esc = function(s) { return window._clinicaiHelpers.esc(s) }
  var _feather = function(n, s) { return window._clinicaiHelpers.feather(n, s) }

  // ── Broadcast state ─────────────────────────────────────────
  var _broadcasts        = []
  var _broadcastLoading  = false
  var _broadcastSaving   = false
  var _broadcastSelected = null  // id do broadcast selecionado para ver detalhes
  var _broadcastMode     = 'new' // 'new' | 'detail'
  var _broadcastForm     = _emptyBroadcastForm()

  var _bcRefreshTimer = null
  var _bcPanelOpen = true
  var _bcPanelTab = 'history' // 'editor' | 'history' | 'rules' | 'scheduled'
  var _bcPageMode = 'disparos' // 'disparos' = broadcast tabs | 'rules' = regras only
  var _bcStats = null
  var _bcSegment = 'all'
  var _bcSegmentLeads = []
  var _bcSegmentLoading = false
  var _bcUploading = false
  var _bcDeleteConfirm = null // id do broadcast em confirmacao de delete
  var _editingBroadcastId = null // id quando editando broadcast existente
  var _bcConfirmSend = false // mostra checklist de confirmacao

  function _emptyBroadcastForm() {
    return {
      name: '',
      content: '',
      media_url: '',
      media_caption: '',
      media_position: 'above',
      filter_phase: '',
      filter_temperature: '',
      filter_funnel: '',
      filter_source: '',
      batch_size: 10,
      batch_interval_min: 10,
      selected_leads: [],  // {id, nome, phone}
      scheduled_at: '',  // '' = enviar agora, 'YYYY-MM-DDTHH:MM' = agendado
    }
  }

  // ── Load & refresh ──────────────────────────────────────────

  async function _loadBroadcasts() {
    if (!window.BroadcastService) return
    _broadcastLoading = true
    try {
      try { window._clinicaiRender() } catch (e) { if (window.console) console.warn('[broadcast] render inicial falhou:', e && e.message) }
      var result = await window.BroadcastService.loadBroadcasts()
      _broadcasts = (result && result.ok && Array.isArray(result.data)) ? result.data : []
    } catch (e) {
      // Falha de rede/CORS/timeout · spinner SEMPRE deve sair
      if (window.console) console.warn('[broadcast] loadBroadcasts falhou:', e && e.message)
      _broadcasts = []
    } finally {
      _broadcastLoading = false
      try { window._clinicaiRender() } catch (e) { if (window.console) console.warn('[broadcast] render final falhou:', e && e.message) }
      _scheduleBroadcastRefresh()
    }
  }

  function _scheduleBroadcastRefresh() {
    if (_bcRefreshTimer) { clearTimeout(_bcRefreshTimer); _bcRefreshTimer = null }
    var hasSending = _broadcasts.some(function(b) { return b.status === 'sending' })
    if (hasSending) {
      _bcRefreshTimer = setTimeout(async function() {
        try {
          var result = await window.BroadcastService.loadBroadcasts()
          _broadcasts = (result && result.ok && Array.isArray(result.data)) ? result.data : []
        } catch (e) {
          if (window.console) console.warn('[broadcast] refresh falhou:', e && e.message)
        }
        window._clinicaiRender()
        _scheduleBroadcastRefresh()
      }, 5000)
    }
  }

  // ── Status helpers ──────────────────────────────────────────

  function _bcStatusLabel(st) {
    return { draft: 'Rascunho', sending: 'Enviando', completed: 'Concluido', cancelled: 'Cancelado' }[st] || st
  }
  function _bcStatusColor(st) {
    return { draft: '#6B7280', sending: '#F59E0B', completed: '#10B981', cancelled: '#EF4444' }[st] || '#6B7280'
  }

  function _bcSaveFormFields() {
    var n = document.getElementById('bcName')
    var u = document.getElementById('bcMediaUrl')
    var t = document.getElementById('bcContent')
    if (n) _broadcastForm.name = n.value
    // Only overwrite media_url from input if it has a value (upload sets it directly)
    if (u && u.value) _broadcastForm.media_url = u.value
    if (t) _broadcastForm.content = t.value
    var cap = document.getElementById('bcMediaCaption')
    if (cap) _broadcastForm.media_caption = cap.value
    var posRadio = document.querySelector('input[name="bcMediaPos"]:checked')
    if (posRadio) _broadcastForm.media_position = posRadio.value
    var schedMode = document.querySelector('input[name="bcScheduleMode"]:checked')
    var schedInput = document.getElementById('bcScheduleAt')
    if (schedMode && schedMode.value === 'scheduled' && schedInput && schedInput.value) {
      _broadcastForm.scheduled_at = schedInput.value
    } else {
      _broadcastForm.scheduled_at = ''
    }
    // Auto-save de rascunho (apenas em modo novo, nao em edit)
    _bcDraftSave()
  }

  // ── Rascunho localStorage — persiste form enquanto user digita ─
  var _BC_DRAFT_KEY = 'clinicai_broadcast_draft'

  function _bcDraftSave() {
    // So salva rascunho se nao esta editando (evita sobrescrever ao editar antigo)
    if (_editingBroadcastId) return
    var f = _broadcastForm || {}
    // Nao salva se form esta vazio (usuario so abriu e fechou)
    var hasContent = (f.name && f.name.trim()) || (f.content && f.content.trim()) ||
                     f.media_url || (Array.isArray(f.selected_leads) && f.selected_leads.length)
    if (!hasContent) { try { localStorage.removeItem(_BC_DRAFT_KEY) } catch (e) {} ; return }
    try {
      localStorage.setItem(_BC_DRAFT_KEY, JSON.stringify({
        _savedAt: Date.now(),
        form: f,
      }))
    } catch (e) { /* quota */ }
  }

  function _bcDraftLoad() {
    try {
      var raw = localStorage.getItem(_BC_DRAFT_KEY)
      if (!raw) return null
      var obj = JSON.parse(raw)
      // Expira rascunho apos 7 dias (evita confusao)
      if (!obj || !obj.form || (Date.now() - (obj._savedAt || 0)) > 7 * 86400000) {
        localStorage.removeItem(_BC_DRAFT_KEY)
        return null
      }
      return obj.form
    } catch (e) { return null }
  }

  function _bcDraftClear() {
    try { localStorage.removeItem(_BC_DRAFT_KEY) } catch (e) {}
  }

  function _waFormat(text) {
    // Render WhatsApp formatting as HTML
    // Order matters: bold+italic combo first, then individual
    text = text.replace(/\*_([^_]+)_\*/g, '<b><i>$1</i></b>')
    text = text.replace(/_\*([^*]+)\*_/g, '<i><b>$1</b></i>')
    text = text.replace(/\*([^*]+)\*/g, '<b>$1</b>')
    text = text.replace(/_([^_]+)_/g, '<i>$1</i>')
    text = text.replace(/~([^~]+)~/g, '<s>$1</s>')
    text = text.replace(/```([^`]+)```/g, '<code>$1</code>')
    return text
  }

  // ── Render functions ────────────────────────────────────────

  function _renderBroadcastTab() {
    if (_broadcastLoading) {
      return '<div class="am-tab-content"><div class="am-loading"><div class="am-spinner"></div><span>Carregando disparos...</span></div></div>'
    }

    // ── LEFT: Stats sidebar ──────────────────────────────────
    var statsHtml = _renderBroadcastStats()

    // ── CENTER: Main area ────────────────────────────────────
    var centerHtml = '<div class="bc-center">'
    if (_bcPanelOpen && _bcPanelTab === 'editor') {
      // Show phone preview centered when creating
      centerHtml += '<div style="display:flex;justify-content:center;width:100%">' + _renderPhonePreviewInline(_broadcastForm.content, _broadcastForm.media_url, _broadcastForm.media_position) + '</div>'
    } else if (_broadcastMode === 'detail' && _broadcastSelected) {
      centerHtml += '<div class="bc-center-detail">' + _renderBroadcastDetail() + '</div>'
    } else {
      // Analytics dashboard
      centerHtml += window.BroadcastDashboard.render()
    }
    centerHtml += '</div>'

    // ── RIGHT: Slide panel ───────────────────────────────────
    var panelHtml = _renderBroadcastSlidePanel()

    return '<div class="am-tab-content"><div class="bc-v2">' + statsHtml + centerHtml + '</div>' + panelHtml + '</div>'
  }

  function _renderBroadcastStats() {
    var totalSent = 0, totalFailed = 0, totalTargets = 0
    var countCompleted = 0, countSending = 0, countFailed = 0, countDraft = 0
    var todayCount = 0, weekCount = 0, monthCount = 0
    var now = new Date()
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    var weekStart = todayStart - (now.getDay() * 86400000)
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    for (var i = 0; i < _broadcasts.length; i++) {
      var b = _broadcasts[i]
      var st = b.status || 'draft'
      if (st === 'completed') { totalSent += (b.sent_count || 0); countCompleted++ }
      if (st === 'sending') countSending++
      if (st === 'cancelled') countFailed++
      if (st === 'draft') countDraft++
      totalFailed += (b.failed_count || 0)
      totalTargets += (b.total_targets || 0)

      var ts = b.created_at ? new Date(b.created_at).getTime() : 0
      if (ts >= todayStart) todayCount++
      if (ts >= weekStart) weekCount++
      if (ts >= monthStart) monthCount++
    }

    var successRate = (totalSent + totalFailed) > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0

    var html = '<div class="bc-stats">'
    html += '<div class="bc-stats-title">Resumo</div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + totalSent + '</div><div class="bc-stat-sub">Total enviados</div></div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + successRate + '%</div><div class="bc-stat-sub">Taxa de sucesso</div></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Disparos</div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Hoje</span><span class="bc-stat-num">' + todayCount + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Semana</span><span class="bc-stat-num">' + weekCount + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Mes</span><span class="bc-stat-num">' + monthCount + '</span></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Por status</div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#10B981"></span>Concluidos</span><span class="bc-stat-num">' + countCompleted + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#F59E0B"></span>Enviando</span><span class="bc-stat-num">' + countSending + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#EF4444"></span>Cancelados</span><span class="bc-stat-num">' + countFailed + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#6B7280"></span>Rascunhos</span><span class="bc-stat-num">' + countDraft + '</span></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Alcance</div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + totalTargets + '</div><div class="bc-stat-sub">Leads alcancados</div></div>'

    html += '</div>'
    return html
  }

  function _renderPhonePreviewInline(content, mediaUrl, mediaPosition) {
    var now = new Date()
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
    var checkSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg>'

    // Image bubble
    var imgBubble = ''
    if (mediaUrl) {
      var isImg = mediaUrl.toLowerCase().indexOf('.jpg') >= 0 || mediaUrl.toLowerCase().indexOf('.jpeg') >= 0 || mediaUrl.toLowerCase().indexOf('.png') >= 0 || mediaUrl.toLowerCase().indexOf('.gif') >= 0 || mediaUrl.toLowerCase().indexOf('.webp') >= 0 || mediaUrl.toLowerCase().indexOf('supabase.co/storage') >= 0
      if (isImg) {
        imgBubble = '<div class="bc-wa-bubble bc-wa-img-bubble"><img src="' + _esc(mediaUrl) + '" class="bc-wa-preview-img"><div class="bc-wa-bubble-time">' + timeStr + ' ' + checkSvg + '</div></div>'
      }
    }

    // Text bubble
    var textBubble = ''
    if (content && content.trim()) {
      var escaped = _esc(content)
      escaped = escaped.replace(/\[(nome|queixa|queixa_principal)\]/gi, '<span class="bc-wa-tag">[$1]</span>')
      escaped = _waFormat(escaped)
      textBubble = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + escaped + '</div>'
        + '<div class="bc-wa-bubble-time">' + timeStr + ' ' + checkSvg + '</div></div>'
    }

    // Order by position
    var bubbleContent = ''
    if (!textBubble && !imgBubble) {
      bubbleContent = '<div class="bc-wa-empty">Digite a mensagem no painel ao lado</div>'
    } else if (mediaPosition === 'below') {
      bubbleContent = textBubble + imgBubble
    } else {
      bubbleContent = imgBubble + textBubble
    }

    return '<div class="bc-phone">'
      + '<div class="bc-phone-notch"><span class="bc-phone-notch-time">' + timeStr + '</span></div>'
      + '<div class="bc-wa-header">'
      + '<div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div>'
      + '</div>'
      + '<div class="bc-wa-chat" id="bcPhoneChat">' + bubbleContent + '</div>'
      + '<div class="bc-wa-bottom">'
      + '<div class="bc-wa-input-mock">Mensagem</div>'
      + '<div class="bc-wa-send-mock"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>'
      + '</div>'
      + '<div class="bc-phone-home"></div>'
      + '</div>'
  }

  function _updatePhonePreview(content) {
    var chatEl = document.getElementById('bcPhoneChat')
    if (!chatEl) return
    var now = new Date()
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
    var checkSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg>'
    var state = window.BroadcastUI.getState()
    var mediaUrl = state.form?.media_url || ''
    var mediaPosition = state.form?.media_position || 'above'

    // Image bubble
    var imgBubble = ''
    if (mediaUrl) {
      imgBubble = '<div class="bc-wa-bubble bc-wa-img-bubble"><img src="' + _esc(mediaUrl) + '" class="bc-wa-preview-img"><div class="bc-wa-bubble-time">' + timeStr + ' ' + checkSvg + '</div></div>'
    }

    // Text bubble
    var textBubble = ''
    if (content && content.trim()) {
      var escaped = _esc(content)
      escaped = escaped.replace(/\[(nome|queixa|queixa_principal)\]/gi, '<span class="bc-wa-tag">[$1]</span>')
      escaped = _waFormat(escaped)
      textBubble = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + escaped + '</div>'
        + '<div class="bc-wa-bubble-time">' + timeStr + ' ' + checkSvg + '</div></div>'
    }

    if (!textBubble && !imgBubble) {
      chatEl.innerHTML = '<div class="bc-wa-empty">Digite a mensagem ao lado para ver o preview</div>'
      return
    }

    chatEl.innerHTML = (mediaPosition === 'below') ? textBubble + imgBubble : imgBubble + textBubble
  }

  function _renderBroadcastSlidePanel() {
    var openClass = ' open'
    var html = '<div class="bc-slide-panel' + openClass + '" id="bcSlidePanel">'

    // Header
    html += '<div class="bc-slide-header">'
    html += '<span class="bc-slide-title">' + _feather('messageCircle', 16) + ' Disparos</span>'
    html += '<div style="display:flex;align-items:center;gap:6px">'
    html += '<button class="bc-new-dispatch-sm" id="bcNewBtn">' + _feather('plus', 14) + ' Novo</button>'
    html += '<button class="bc-slide-close" id="bcSlideClose">' + _feather('x', 16) + '</button>'
    html += '</div>'
    html += '</div>'

    // Tabs — filtradas por _bcPageMode
    var scheduledCount = _broadcasts.filter(function(b) { return b.scheduled_at && new Date(b.scheduled_at) > new Date() && (b.status === 'draft' || b.status === 'sending') }).length
    html += '<div class="bc-slide-tabs">'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'editor' ? ' active' : '') + '" data-panel-tab="editor">Editor</button>'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'history' ? ' active' : '') + '" data-panel-tab="history">Historico</button>'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'scheduled' ? ' active' : '') + '" data-panel-tab="scheduled" style="position:relative">Programados' + (scheduledCount > 0 ? '<span class="bc-tab-badge-top">' + scheduledCount + '</span>' : '') + '</button>'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'rules' ? ' active' : '') + '" data-panel-tab="rules">Regras</button>'
    html += '</div>'

    // Body
    html += '<div class="bc-slide-body">'
    if (_bcPanelTab === 'editor') {
      html += _renderBroadcastFormBody()
    } else if (_bcPanelTab === 'scheduled') {
      html += _renderBroadcastScheduledTab()
    } else if (_bcPanelTab === 'rules') {
      html += _renderBroadcastRulesTab()
    } else {
      html += _renderBroadcastHistoryTab()
    }
    html += '</div>'

    // Footer (only in editor tab)
    if (_bcPanelTab === 'editor') {
      html += '<div class="bc-slide-footer">'
      html += '<button class="am-btn-secondary" id="bcCancelForm">Cancelar</button>'
      html += '<button class="am-btn-primary" id="bcSaveBtn"' + (_broadcastSaving ? ' disabled' : '') + '>'
      html += (_broadcastSaving ? 'Salvando...' : _editingBroadcastId ? _feather('check', 14) + ' Salvar' : _feather('plus', 14) + ' Criar Disparo')
      html += '</button>'
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  function _renderBroadcastScheduledTab() {
    var scheduled = _broadcasts.filter(function(b) { return b.scheduled_at && new Date(b.scheduled_at) > new Date() && (b.status === 'draft' || b.status === 'sending') })
    if (scheduled.length === 0) {
      return '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px">' + _feather('clock', 24) + '<div style="margin-top:8px">Nenhum disparo programado</div></div>'
    }

    var html = ''
    for (var i = 0; i < scheduled.length; i++) {
      var b = scheduled[i]
      var schedDate = new Date(b.scheduled_at)
      var dateStr = schedDate.toLocaleDateString('pt-BR')
      var timeStr = schedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      var now = new Date()
      var diff = schedDate.getTime() - now.getTime()
      var diffMin = Math.round(diff / 60000)
      var countdown = ''
      if (diffMin > 1440) countdown = Math.floor(diffMin / 1440) + 'd'
      else if (diffMin > 60) countdown = Math.floor(diffMin / 60) + 'h ' + (diffMin % 60) + 'min'
      else if (diffMin > 0) countdown = diffMin + 'min'
      else countdown = 'agora'

      html += '<div class="bc-hist-item' + (_broadcastSelected === b.id ? ' bc-hist-active' : '') + '" data-id="' + b.id + '">'
      html += '<span class="bc-hist-dot" style="background:var(--accent-gold)"></span>'
      html += '<div class="bc-hist-info">'
      html += '<div class="bc-hist-top">'
      html += '<span class="bc-hist-name">' + _esc(b.name) + '</span>'
      html += '</div>'
      html += '<div class="bc-hist-meta">' + _feather('clock', 10) + ' ' + dateStr + ' ' + timeStr + ' &middot; ' + (b.total_targets || 0) + ' dest. &middot; em ' + countdown + '</div>'
      html += '</div>'
      html += '<button class="bc-hist-del-btn" data-id="' + b.id + '" title="Deletar">' + _feather('trash2', 13) + '</button>'
      html += '</div>'
    }
    return html
  }

  function _renderBroadcastHistoryTab() {
    // Filter out scheduled drafts (they show in Programados tab)
    var historyList = _broadcasts.filter(function(b) { return !(b.scheduled_at && new Date(b.scheduled_at) > new Date() && (b.status === 'draft' || b.status === 'sending')) })
    if (historyList.length === 0) {
      return '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px">Nenhum disparo ainda</div>'
    }

    var html = ''
    for (var i = 0; i < historyList.length; i++) {
      var b = historyList[i]
      var st = b.status || 'draft'
      var d = b.created_at ? new Date(b.created_at) : null
      var date = d ? d.toLocaleDateString('pt-BR') : '--'
      var time = d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

      var filterTags = []
      if (b.target_filter) {
        if (b.target_filter.phase) filterTags.push(b.target_filter.phase)
        if (b.target_filter.temperature) filterTags.push(b.target_filter.temperature)
        if (b.target_filter.funnel) filterTags.push(b.target_filter.funnel)
        if (b.target_filter.source_type) filterTags.push(b.target_filter.source_type)
      }

      var isDeleting = _bcDeleteConfirm === b.id

      html += '<div class="bc-hist-item' + (_broadcastSelected === b.id ? ' bc-hist-active' : '') + '" data-id="' + b.id + '">'
      html += '<span class="bc-hist-dot" style="background:' + _bcStatusColor(st) + '"></span>'
      html += '<div class="bc-hist-info">'
      html += '<div class="bc-hist-top">'
      html += '<span class="bc-hist-name">' + _esc(b.name) + '</span>'
      if (filterTags.length > 0) {
        html += filterTags.map(function(t) { return '<span class="bc-filter-tag">' + _esc(t) + '</span>' }).join('')
      }
      html += '</div>'
      var schedInfo = b.scheduled_at ? ' &middot; ' + _feather('clock', 10) + ' ' + new Date(b.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
      html += '<div class="bc-hist-meta">' + date + ' ' + time + ' &middot; ' + (b.sent_count || 0) + '/' + (b.total_targets || 0) + ' env.' + schedInfo + '</div>'

      if (isDeleting) {
        html += '<div class="bc-hist-delete-confirm">'
        html += '<span>Deletar?</span>'
        html += '<button class="bc-hist-del-yes" data-id="' + b.id + '">Sim</button>'
        html += '<button class="bc-hist-del-no" data-id="' + b.id + '">Nao</button>'
        html += '</div>'
      }

      html += '</div>'
      if (!isDeleting) {
        html += '<div class="bc-hist-actions">'
        html += '<button class="bc-hist-clone-btn" data-id="' + b.id + '" title="Reaproveitar">' + _feather('refreshCw', 13) + '</button>'
        html += '<button class="bc-hist-del-btn" data-id="' + b.id + '" title="Deletar">' + _feather('trash2', 13) + '</button>'
        html += '</div>'
      }
      html += '</div>'
    }
    return html
  }

  function _renderBroadcastFormBody() {
    var f = _broadcastForm
    return `
        <div class="am-field">
          <label class="am-label">Nome do disparo *</label>
          <input class="am-input" id="bcName" placeholder="Ex: Promo Lifting 5D Abril" value="${_esc(f.name)}">
        </div>
        <div class="am-field">
          <label class="am-label">Mensagem *</label>
          <textarea class="am-input" id="bcContent" rows="8" maxlength="4096" placeholder="Digite a mensagem aqui...&#10;&#10;Use [nome] para personalizar.&#10;Quebras de linha serao mantidas.">${_esc(f.content)}</textarea>
          <div class="bc-char-counter" id="bcCharCounter" style="font-size:11px;color:var(--text-muted);text-align:right;margin-top:4px">
            <span id="bcCharCount">${(f.content || '').length}</span> / 4096
          </div>
          <div class="bc-tags-bar">
            <span class="bc-tag-hint">Inserir:</span>
            <button type="button" class="bc-tag-btn" data-tag="[nome]">[nome]</button>
            <button type="button" class="bc-tag-btn" data-tag="[queixa]" title="Substituido pela queixa filtrada (exige 1 queixa no filtro)">[queixa]</button>
            <span class="bc-fmt-sep"></span>
            <button type="button" class="bc-fmt-btn" data-wrap="*" title="Negrito"><b>N</b></button>
            <button type="button" class="bc-fmt-btn" data-wrap="_" title="Italico"><i>I</i></button>
            <button type="button" class="bc-fmt-btn" data-wrap="~" title="Riscado"><s>R</s></button>
            <button type="button" class="bc-fmt-btn bc-fmt-mono" data-wrap="\`\`\`" title="Monoespaco">{ }</button>
            <span class="bc-fmt-sep"></span>
            <div class="bc-emoji-wrap">
              <button type="button" class="bc-fmt-btn bc-emoji-toggle" id="bcEmojiToggle" title="Emojis">&#128578;</button>
              <div class="bc-emoji-picker" id="bcEmojiPicker">
                ${['😊','😍','🔥','✨','💜','🌟','❤️','👏','🎉','💪','👋','🙏','💋','😉','🥰','💎','🌸','⭐','📍','📅','⏰','📞','💰','🎁','✅','❌','⚡','🏆','💡','🤝','👨‍⚕️','💆','🪞','💄','🌺','💫'].map(function(e) {
                  return '<button type="button" class="bc-emoji-btn" data-emoji="' + e + '">' + e + '</button>'
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="am-field">
          <label class="am-label">Imagem ou Link</label>
          <div class="bc-media-options">
            <button type="button" class="bc-media-upload-btn" id="bcMediaUploadBtn">${_feather('image', 14)} Enviar imagem</button>
            <span style="font-size:11px;color:var(--text-muted)">ou</span>
            <input class="am-input" id="bcMediaUrl" placeholder="https://... (URL da imagem ou link)" value="${_esc(f.media_url)}" style="flex:1">
          </div>
          <input type="file" id="bcMediaFile" accept="image/*" style="display:none">
          ${f.media_url ? '<div class="bc-media-preview"><img src="' + _esc(f.media_url) + '" alt="preview"><button type="button" class="bc-media-remove" id="bcMediaRemove">' + _feather('x', 10) + '</button></div>' : ''}
          <input class="am-input" id="bcMediaCaption" placeholder="Legenda da imagem (opcional)" value="${_esc(f.media_caption)}" style="margin-top:6px${f.media_url ? '' : ';display:none'}">
          <div class="bc-media-pos">
            <label class="bc-pos-label"><input type="radio" name="bcMediaPos" value="above" ${f.media_position !== 'below' ? 'checked' : ''}> Acima do texto</label>
            <label class="bc-pos-label"><input type="radio" name="bcMediaPos" value="below" ${f.media_position === 'below' ? 'checked' : ''}> Abaixo do texto</label>
          </div>
        </div>
        <div class="bc-filters-section">
          <label class="am-label">Segmentacao <span style="font-weight:400;text-transform:none;font-size:10px;color:var(--text-muted)">(opcional se selecionar leads)</span></label>
          <div class="bc-filters-grid">
            <div class="am-field">
              <label class="am-label-sm">Fase</label>
              <select class="am-input" id="bcFilterPhase">
                <option value="">-</option>
                <option value="lead"${f.filter_phase === 'lead' ? ' selected' : ''}>Lead</option>
                <option value="agendado"${f.filter_phase === 'agendado' ? ' selected' : ''}>Agendado</option>
                <option value="compareceu"${f.filter_phase === 'compareceu' ? ' selected' : ''}>Compareceu</option>
                <option value="orcamento"${f.filter_phase === 'orcamento' ? ' selected' : ''}>Orcamento</option>
                <option value="paciente"${f.filter_phase === 'paciente' ? ' selected' : ''}>Paciente</option>
                <option value="perdido"${f.filter_phase === 'perdido' ? ' selected' : ''}>Perdido</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Temperatura</label>
              <select class="am-input" id="bcFilterTemp">
                <option value="">-</option>
                <option value="hot"${f.filter_temperature === 'hot' ? ' selected' : ''}>Quente</option>
                <option value="warm"${f.filter_temperature === 'warm' ? ' selected' : ''}>Morno</option>
                <option value="cold"${f.filter_temperature === 'cold' ? ' selected' : ''}>Frio</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Funil</label>
              <select class="am-input" id="bcFilterFunnel">
                <option value="">-</option>
                <option value="fullface"${f.filter_funnel === 'fullface' ? ' selected' : ''}>Full Face</option>
                <option value="procedimentos"${f.filter_funnel === 'procedimentos' ? ' selected' : ''}>Procedimentos</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Origem</label>
              <select class="am-input" id="bcFilterSource">
                <option value="">-</option>
                <option value="quiz"${f.filter_source === 'quiz' ? ' selected' : ''}>Quiz</option>
                <option value="manual"${f.filter_source === 'manual' ? ' selected' : ''}>Manual</option>
                <option value="import"${f.filter_source === 'import' ? ' selected' : ''}>Importacao</option>
              </select>
            </div>
          </div>
        </div>
        <div class="bc-leads-section">
          <label class="am-label">${_feather('userCheck', 13)} Selecionar leads manualmente</label>
          <div class="bc-leads-search-wrap">
            <input class="am-input bc-leads-search" id="bcLeadSearch" placeholder="Buscar por nome..." autocomplete="off">
            <div class="bc-leads-dropdown" id="bcLeadDropdown"></div>
          </div>
          ${f.selected_leads.length > 0 ? '<div class="bc-leads-chips" id="bcLeadChips">' + f.selected_leads.map(function(l) {
            return '<span class="bc-lead-chip" data-id="' + _esc(l.id) + '">'
              + _esc(l.nome) + '<button type="button" class="bc-chip-remove" data-id="' + _esc(l.id) + '">&times;</button></span>'
          }).join('') + '</div>' : ''}
          <small class="am-hint">${f.selected_leads.length > 0 ? f.selected_leads.length + ' selecionado(s) — ' : ''}Leads selecionados recebem o disparo independente dos filtros</small>
        </div>
        <div class="bc-throttle-section">
          <label class="am-label">${_feather('shield', 13)} Controle de envio</label>
          <div class="bc-throttle-row">
            <div class="am-field">
              <label class="am-label-sm">Enviar por lote</label>
              <select class="am-input" id="bcBatchSize">
                <option value="5"${f.batch_size === 5 ? ' selected' : ''}>5 pessoas</option>
                <option value="10"${f.batch_size === 10 || !f.batch_size ? ' selected' : ''}>10 pessoas</option>
                <option value="15"${f.batch_size === 15 ? ' selected' : ''}>15 pessoas</option>
                <option value="20"${f.batch_size === 20 ? ' selected' : ''}>20 pessoas</option>
              </select>
            </div>
            <div class="bc-throttle-separator">a cada</div>
            <div class="am-field">
              <label class="am-label-sm">Intervalo</label>
              <select class="am-input" id="bcBatchInterval">
                <option value="5"${f.batch_interval_min === 5 ? ' selected' : ''}>5 min</option>
                <option value="10"${f.batch_interval_min === 10 || !f.batch_interval_min ? ' selected' : ''}>10 min</option>
                <option value="15"${f.batch_interval_min === 15 ? ' selected' : ''}>15 min</option>
                <option value="20"${f.batch_interval_min === 20 ? ' selected' : ''}>20 min</option>
                <option value="30"${f.batch_interval_min === 30 ? ' selected' : ''}>30 min</option>
                <option value="60"${f.batch_interval_min === 60 ? ' selected' : ''}>1 hora</option>
              </select>
            </div>
          </div>
          <small class="am-hint">${_feather('shield', 11)} Protecao contra bloqueio do WhatsApp</small>
        </div>
        <div class="bc-schedule-section">
          <label class="am-label">${_feather('clock', 13)} Agendamento</label>
          <div class="bc-schedule-row">
            <label class="bc-pos-label"><input type="radio" name="bcScheduleMode" value="now" ${!f.scheduled_at ? 'checked' : ''}> Enviar agora</label>
            <label class="bc-pos-label"><input type="radio" name="bcScheduleMode" value="scheduled" ${f.scheduled_at ? 'checked' : ''}> Agendar para</label>
            <input type="datetime-local" class="am-input bc-schedule-input" id="bcScheduleAt" value="${f.scheduled_at || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}" ${!f.scheduled_at ? 'disabled' : ''}>
          </div>
        </div>`
  }

  function _renderBroadcastDetail() {
    var b = _broadcasts.find(function(x) { return x.id === _broadcastSelected })
    if (!b) return '<div class="bc-panel-empty"><p>Disparo nao encontrado</p></div>'

    var st = b.status || 'draft'
    var date = b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : '--'
    var startDate = b.started_at ? new Date(b.started_at).toLocaleString('pt-BR') : '--'
    var endDate = b.completed_at ? new Date(b.completed_at).toLocaleString('pt-BR') : '--'
    var schedDate = b.scheduled_at ? new Date(b.scheduled_at).toLocaleString('pt-BR') : null
    var progress = b.total_targets > 0 ? Math.round((b.sent_count / b.total_targets) * 100) : 0

    var filterTags = []
    if (b.target_filter) {
      if (b.target_filter.phase) filterTags.push('Fase: ' + b.target_filter.phase)
      if (b.target_filter.temperature) filterTags.push('Temp: ' + b.target_filter.temperature)
      if (b.target_filter.funnel) filterTags.push('Funil: ' + b.target_filter.funnel)
      if (b.target_filter.source_type) filterTags.push('Origem: ' + b.target_filter.source_type)
    }

    var s = _bcStats && _bcStats.ok ? _bcStats : null
    var noResponse = s ? ((s.sent || 0) - (s.responded || 0)) : 0

    return `
      <div class="bc-detail-topbar">
        <div class="bc-detail-topbar-left">
          <h3 class="bc-detail-title">${_esc(b.name)}</h3>
          <span class="bc-status" style="background:${_bcStatusColor(st)}20;color:${_bcStatusColor(st)}">${_bcStatusLabel(st)}</span>
          ${filterTags.length > 0 ? filterTags.map(function(t) { return '<span class="bc-filter-tag">' + _esc(t) + '</span>' }).join('') : ''}
        </div>
        <div class="bc-detail-topbar-right">
          ${st === 'draft' ? '<button class="am-btn-ghost bc-clone-detail-btn" data-id="' + b.id + '">' + _feather('refreshCw', 13) + '</button>' : ''}
          ${st === 'draft' ? '<button class="am-btn-ghost bc-edit-btn" data-id="' + b.id + '">' + _feather('edit2', 13) + ' Editar</button>' : ''}
          ${st === 'draft' && !_bcConfirmSend ? '<button class="am-btn-primary bc-presend-btn" data-id="' + b.id + '">' + _feather('play', 13) + ' Iniciar</button>' : ''}
          ${st === 'draft' || st === 'sending' ? '<button class="am-btn-danger bc-cancel-btn" data-id="' + b.id + '">' + _feather('xCircle', 13) + ' Cancelar</button>' : ''}
        </div>
      </div>
      ${_bcConfirmSend && st === 'draft' ? '<div class="bc-confirm-send">'
        + '<div class="bc-confirm-title">' + _feather('shield', 14) + ' Confirmar envio</div>'
        + '<div class="bc-confirm-checks">'
        + '<div class="bc-confirm-item">' + _feather('userCheck', 12) + ' <b>' + (b.total_targets || 0) + '</b> destinatarios</div>'
        + (filterTags.length > 0 ? '<div class="bc-confirm-item">' + _feather('tag', 12) + ' Filtros: ' + filterTags.join(', ') + '</div>' : '<div class="bc-confirm-item">' + _feather('tag', 12) + ' Sem filtros (leads manuais)</div>')
        + '<div class="bc-confirm-item">' + _feather('messageCircle', 12) + ' Mensagem: ' + _esc((b.content || '').substring(0, 50)) + (b.content && b.content.length > 50 ? '...' : '') + '</div>'
        + (b.media_url ? '<div class="bc-confirm-item">' + _feather('image', 12) + ' Com midia (' + (b.media_position || 'above') + ')</div>' : '')
        + '<div class="bc-confirm-item">' + _feather('shield', 12) + ' Lote: ' + (b.batch_size || 10) + ' a cada ' + (b.batch_interval_min || 10) + 'min</div>'
        + (b.scheduled_at ? '<div class="bc-confirm-item">' + _feather('clock', 12) + ' Agendado: ' + new Date(b.scheduled_at).toLocaleString('pt-BR') + '</div>' : '<div class="bc-confirm-item">' + _feather('zap', 12) + ' Envio imediato</div>')
        + '</div>'
        + '<div class="bc-confirm-actions">'
        + '<button class="am-btn-secondary bc-confirm-no">Voltar</button>'
        + '<button class="am-btn-primary bc-start-btn" data-id="' + b.id + '" data-targets="' + (b.total_targets || 0) + '">' + _feather('check', 14) + ' Confirmar envio</button>'
        + '</div>'
        + '</div>' : ''}
      ${st === 'sending' ? '<div class="bc-progress" style="margin-bottom:16px"><div class="bc-progress-bar" style="width:' + progress + '%"></div><span class="bc-progress-text">' + progress + '%</span></div>' : ''}
      <div class="bc-detail-msg">${_esc(b.content)}</div>
      ${b.media_url ? (function() {
        // Valida URL antes de renderizar — rejeita javascript:, data:, vbscript: etc.
        // Usa ClinicSanitizer.isSafeUrl (schemes http/https/relative apenas).
        var _isSafe = window.ClinicSanitizer
          ? ClinicSanitizer.isSafeUrl(b.media_url)
          : /^(https?:\/\/|\/)/i.test(String(b.media_url || '').trim())
        if (!_isSafe) return ''  // Drop URL unsafe — nao renderiza nada
        var u = b.media_url.toLowerCase()
        var isImg = u.indexOf('.jpg') >= 0 || u.indexOf('.jpeg') >= 0 || u.indexOf('.png') >= 0 || u.indexOf('.gif') >= 0 || u.indexOf('.webp') >= 0 || u.indexOf('supabase.co/storage') >= 0
        if (isImg) return '<div class="bc-detail-media" style="margin:12px 0"><img src="' + _esc(b.media_url) + '" alt="media"></div>'
        return '<div class="bc-detail-link" style="margin:12px 0"><a href="' + _esc(b.media_url) + '" target="_blank" rel="noopener noreferrer">' + _feather('link', 13) + ' ' + _esc(b.media_caption || b.media_url) + '</a></div>'
      })() : ''}
      <div class="bc-info-strip">
        <div class="bc-info-dates">
          ${schedDate ? '<span style="color:var(--accent-gold);font-weight:600">' + _feather('clock', 11) + ' Agendado: ' + schedDate + '</span>' : ''}
          <span>${_feather('calendar', 11)} Criado: ${date}</span>
          ${b.started_at ? '<span>' + _feather('play', 11) + ' Iniciado: ' + startDate + '</span>' : ''}
          ${b.completed_at ? '<span>' + _feather('checkCircle', 11) + ' Finalizado: ' + endDate + '</span>' : ''}
        </div>
        ${s ? '<div class="bc-info-bars">'
          + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.send_rate || 0) + '%;background:#10B981"></div></div><span class="bc-metric-pct">' + (s.send_rate || 0) + '%</span><span class="bc-metric-lbl">Envio</span></div>'
          + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.response_rate || 0) + '%;background:#2563EB"></div></div><span class="bc-metric-pct">' + (s.response_rate || 0) + '%</span><span class="bc-metric-lbl">Resposta</span></div>'
          + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.delivery_rate || 0) + '%;background:#8B5CF6"></div></div><span class="bc-metric-pct">' + (s.delivery_rate || 0) + '%</span><span class="bc-metric-lbl">Entrega</span></div>'
          + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.read_rate || 0) + '%;background:#F59E0B"></div></div><span class="bc-metric-pct">' + (s.read_rate || 0) + '%</span><span class="bc-metric-lbl">Leitura</span></div>'
          + '</div>' : ''}
      </div>
      <div class="bc-detail-split">
        <div class="bc-detail-left">
          <div class="bc-leads-seg">
            <div class="bc-seg-item${_bcSegment === 'all' ? ' bc-seg-active' : ''}" data-seg="all"><span class="bc-seg-icon" style="background:#6B728020;color:#6B7280">${_feather('userCheck', 13)}</span><span class="bc-seg-num">${b.total_targets || 0}</span><span class="bc-seg-lbl">Todos</span></div>
            <div class="bc-seg-item${_bcSegment === 'sent' ? ' bc-seg-active' : ''}" data-seg="sent"><span class="bc-seg-icon" style="background:#10B98120;color:#10B981">${_feather('check', 13)}</span><span class="bc-seg-num">${b.sent_count || 0}</span><span class="bc-seg-lbl">Enviados</span></div>
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'responded' ? ' bc-seg-active' : '') + '" data-seg="responded"><span class="bc-seg-icon" style="background:#2563EB20;color:#2563EB">' + _feather('messageCircle', 13) + '</span><span class="bc-seg-num">' + (s.responded || 0) + '</span><span class="bc-seg-lbl">Responderam</span></div>' : ''}
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'delivered' ? ' bc-seg-active' : '') + '" data-seg="delivered"><span class="bc-seg-icon" style="background:#0EA5E920;color:#0EA5E9">' + _feather('checkCircle', 13) + '</span><span class="bc-seg-num">' + (s.delivered || 0) + '</span><span class="bc-seg-lbl">Entregues</span></div>' : ''}
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'read' ? ' bc-seg-active' : '') + '" data-seg="read"><span class="bc-seg-icon" style="background:#8B5CF620;color:#8B5CF6">' + _feather('eye', 13) + '</span><span class="bc-seg-num">' + (s.read || 0) + '</span><span class="bc-seg-lbl">Lidos</span></div>' : ''}
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'responded' ? ' bc-seg-active' : '') + '" data-seg="responded"><span class="bc-seg-icon" style="background:#2563EB20;color:#2563EB">' + _feather('messageCircle', 13) + '</span><span class="bc-seg-num">' + (s.responded || 0) + '</span><span class="bc-seg-lbl">Responderam</span></div>' : ''}
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'no_response' ? ' bc-seg-active' : '') + '" data-seg="no_response"><span class="bc-seg-icon" style="background:#F59E0B20;color:#F59E0B">' + _feather('clock', 13) + '</span><span class="bc-seg-num">' + noResponse + '</span><span class="bc-seg-lbl">Sem resposta</span></div>' : ''}
            <div class="bc-seg-item${_bcSegment === 'failed' ? ' bc-seg-active' : ''}" data-seg="failed"><span class="bc-seg-icon" style="background:#EF444420;color:#EF4444">${_feather('alertCircle', 13)}</span><span class="bc-seg-num">${b.failed_count || 0}</span><span class="bc-seg-lbl">Falhas</span></div>
          </div>
        </div>
        <div class="bc-detail-right">
          <div class="bc-seg-leads-list" id="bcSegLeadsList">
            ${_bcSegmentLoading
              ? '<div class="bc-seg-leads-empty"><span class="am-spinner bc-seg-spinner"></span>Carregando leads do segmento...</div>'
              : (_bcSegmentLeads.length > 0
                  ? _bcSegmentLeads.map(function(l) {
                      return '<div class="bc-seg-lead">' + _feather('userCheck', 12) + ' <span>' + _esc(l.name || 'Sem nome') + '</span><small>' + _esc(l.phone || '') + '</small></div>'
                    }).join('')
                  : '<div class="bc-seg-leads-empty">Selecione um segmento para ver os leads</div>')
            }
          </div>
        </div>
      </div>
      `
  }

  function _renderBroadcastRulesTab() {
    var sections = [
      {
        title: 'Segmentacao e Filtros',
        icon: 'tag',
        color: '#7C3AED',
        rules: [
          'Filtros por fase, temperatura, funil e origem sao cumulativos (AND)',
          'Leads selecionados manualmente recebem o disparo independente dos filtros',
          'Pelo menos um filtro ou um lead manual e obrigatorio para criar um disparo',
          'Leads sem telefone valido sao automaticamente excluidos'
        ]
      },
      {
        title: 'Selecao Manual de Leads',
        icon: 'userCheck',
        color: '#2563EB',
        rules: [
          'Busque por nome para encontrar leads no sistema',
          'Leads manuais sao adicionados alem dos filtros (OR)',
          'Maximo recomendado: 200 leads por disparo',
          'Leads duplicados (por filtro + manual) sao automaticamente deduplicados'
        ]
      },
      {
        title: 'Controle de Envio (Throttle)',
        icon: 'shield',
        color: '#10B981',
        rules: [
          'Lotes de 5 a 20 pessoas com intervalo de 5 a 60 minutos',
          'Configuracao padrao (10/10min) envia ~60 msgs/hora — seguro para WhatsApp',
          'Nunca exceda 200 mensagens/hora para evitar bloqueio temporario',
          'O sistema respeita automaticamente os limites configurados'
        ]
      },
      {
        title: 'Personalizacao da Mensagem',
        icon: 'edit2',
        color: '#F59E0B',
        rules: [
          'Use [nome] para inserir o nome do lead automaticamente',
          'Use [queixa] para inserir a queixa principal do lead',
          'Formatacao WhatsApp: *negrito*, _italico_, ~riscado~, ```mono```',
          'Imagens podem ser posicionadas acima ou abaixo do texto'
        ]
      },
      {
        title: 'Ciclo de Vida do Disparo',
        icon: 'refreshCw',
        color: '#6366F1',
        rules: [
          'Rascunho: disparo criado, aguardando inicio',
          'Enviando: mensagens sendo entregues em lotes',
          'Concluido: todos os lotes foram processados',
          'Cancelado: envio interrompido, msgs pendentes removidas'
        ]
      },
      {
        title: 'Arquitetura Tecnica',
        icon: 'settings',
        color: '#64748B',
        rules: [
          'wa_broadcasts armazena metadados do disparo',
          'wa_outbox recebe uma fila de mensagens por destinatario',
          'O worker n8n processa a fila respeitando batch_size e batch_interval',
          'Estatisticas (entrega, leitura, resposta) sao calculadas em tempo real via RPC'
        ]
      }
    ]

    var html = ''
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i]
      html += '<div class="bc-rules-section">'
      html += '<div class="bc-rules-header" style="color:' + s.color + '">'
      html += '<span class="bc-rules-icon" style="background:' + s.color + '15;color:' + s.color + '">' + _feather(s.icon, 15) + '</span>'
      html += '<span class="bc-rules-title">' + s.title + '</span>'
      html += '</div>'
      html += '<ul class="bc-rules-list">'
      for (var j = 0; j < s.rules.length; j++) {
        html += '<li>' + _feather('check', 11) + ' ' + s.rules[j] + '</li>'
      }
      html += '</ul>'
      html += '</div>'
    }
    return html
  }

  // ── Expose ──────────────────────────────────────────────────

  // Nao usar Object.freeze aqui: broadcast-events.ui.js injeta _updateCharCounter
  // dinamicamente (ex: linha 319) — o freeze causava TypeError "object is not extensible".
  window.BroadcastUI = ({
    renderTab: _renderBroadcastTab,
    loadBroadcasts: _loadBroadcasts,
    getState: function() {
      return {
        broadcasts: _broadcasts,
        form: _broadcastForm,
        selected: _broadcastSelected,
        mode: _broadcastMode,
        panelTab: _bcPanelTab,
        panelOpen: _bcPanelOpen,
        stats: _bcStats,
        segment: _bcSegment,
        segmentLeads: _bcSegmentLeads,
        loading: _broadcastLoading,
        saving: _broadcastSaving,
        uploading: _bcUploading,
        deleteConfirm: _bcDeleteConfirm,
        editingId: _editingBroadcastId,
        confirmSend: _bcConfirmSend,
      }
    },
    setState: function(key, val) {
      if (key === 'broadcastMode') _broadcastMode = val
      if (key === 'broadcastSelected') _broadcastSelected = val
      if (key === 'bcPanelTab') _bcPanelTab = val
      if (key === 'bcPanelOpen') _bcPanelOpen = val
      if (key === 'bcStats') _bcStats = val
      if (key === 'bcSegment') _bcSegment = val
      if (key === 'bcSegmentLeads') _bcSegmentLeads = val
      if (key === 'bcSegmentLoading') _bcSegmentLoading = !!val
      if (key === 'broadcastForm') _broadcastForm = val
      if (key === 'broadcastSaving') _broadcastSaving = val
      if (key === 'broadcastLoading') _broadcastLoading = val
      if (key === 'bcUploading') _bcUploading = val
      if (key === 'bcDeleteConfirm') _bcDeleteConfirm = val
      if (key === '_editingBroadcastId') _editingBroadcastId = val
      if (key === 'bcConfirmSend') _bcConfirmSend = val
      if (key === 'bcPageMode') _bcPageMode = val
      if (key === 'broadcasts') _broadcasts = val
    },
    emptyForm: _emptyBroadcastForm,
    saveFormFields: _bcSaveFormFields,
    updatePhonePreview: _updatePhonePreview,
    scheduleBroadcastRefresh: _scheduleBroadcastRefresh,
    draftLoad:  _bcDraftLoad,
    draftClear: _bcDraftClear,
    draftSave:  _bcDraftSave,
  })

})()
