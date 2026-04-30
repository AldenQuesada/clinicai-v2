/**
 * ClinicAI — Inbox UI (Central de Atendimento)
 *
 * Interface para a secretaria gerenciar conversas WhatsApp.
 * Design pensado para pessoa sem experiencia tecnologica:
 *   - Botoes grandes e claros
 *   - Cores significativas (vermelho=urgente, amarelo=atencao, verde=ok)
 *   - Alertas visuais pulsantes
 *   - Zero ambiguidade nos rotulos
 *
 * Renderiza na div #inbox-root da page-inbox.
 *
 * Depende de:
 *   window.InboxService (inbox.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiInboxUILoaded) return
  window._clinicaiInboxUILoaded = true

  // ── Estado ──────────────────────────────────────────────────

  let _conversations = []
  let _activeConv    = null   // conversation object with messages
  let _activeId      = null   // selected conversation id
  let _loading       = true
  let _chatLoading   = false
  let _sending       = false
  let _filter        = 'all'  // all, urgent, waiting, lara, resolved
  let _search        = ''
  let _refreshTimer  = null
  let _lastUrgentCount = 0
  let _realtimeChannel = null

  // ── Helpers ─────────────────────────────────────────────────

  function _root() { return document.getElementById('inbox-root') }

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function _timeAgo(iso) {
    if (!iso) return ''
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1)  return 'agora'
    if (m < 60) return m + 'min'
    const h = Math.floor(m / 60)
    if (h < 24) return h + 'h'
    return Math.floor(h / 24) + 'd'
  }

  function _timeShort(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function _svg(name, size) {
    size = size || 16
    var paths = {
      alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      check:       '<polyline points="20 6 9 17 4 12"/>',
      send:        '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
      user:        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      search:      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
      x:           '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      refreshCw:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    }
    return '<svg width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + (paths[name] || '') + '</svg>'
  }

  // ── Sound alert for urgent messages ─────────────────────────

  function _playAlertSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)()
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 800
      gain.gain.value = 0.3
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
      setTimeout(function() {
        var osc2 = ctx.createOscillator()
        var gain2 = ctx.createGain()
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.frequency.value = 1000
        gain2.gain.value = 0.3
        osc2.start()
        osc2.stop(ctx.currentTime + 0.15)
      }, 200)
    } catch(e) {}
  }

  // ── Browser push notification ──────────────────────────────

  function _sendBrowserNotification(title, body) {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: '/favicon.ico', tag: 'clinicai-inbox' })
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') new Notification(title, { body: body, icon: '/favicon.ico', tag: 'clinicai-inbox' })
      })
    }
  }

  // ── Browser tab notification count ─────────────────────────

  function _updateTabTitle() {
    var pending = _conversations.filter(function(c) { return c.is_urgent || !c.ai_enabled }).length
    document.title = pending > 0 ? '(' + pending + ') Central de Atendimento' : 'ClinicAI'
  }

  // ── Init ────────────────────────────────────────────────────

  async function init() {
    _loading = true
    _render()

    // Retry up to 5 times if InboxService not ready (deploy/cache race condition)
    var retries = 0
    while (retries < 5) {
      if (window.InboxService) break
      retries++
      await new Promise(function(r) { setTimeout(r, 1000) })
    }

    await _loadConversations()

    // If conversations empty, retry 2 more times (Supabase may be slow)
    if (_conversations.length === 0) {
      for (var r = 0; r < 2; r++) {
        await new Promise(function(resolve) { setTimeout(resolve, 2000) })
        await _loadConversations()
        if (_conversations.length > 0) break
      }
    }

    _loading = false
    _render()
    _startAutoRefresh()
    _startRealtime()
    _checkHealth()
  }

  function _startAutoRefresh() {
    if (_refreshTimer) clearInterval(_refreshTimer)
    _refreshTimer = setInterval(function () {
      var input = document.getElementById('ibxInputField')
      if (input && document.activeElement === input) return
      _loadConversations().then(function () {
        var newUrgent = _conversations.filter(function(c) { return c.is_urgent }).length
        if (newUrgent > _lastUrgentCount && _lastUrgentCount >= 0) { _playAlertSound(); _sendBrowserNotification('Mensagem Urgente', 'Nova mensagem que precisa atencao na Central de Atendimento'); }
        _lastUrgentCount = newUrgent
        _updateTabTitle()
        var input2 = document.getElementById('ibxInputField')
        if (input2 && document.activeElement === input2) return
        if (_activeId) {
          _updateSidebarOnly()
          _refreshChat()
        } else {
          _render()
        }
      })
    }, 10000)
  }

  // ── Data ────────────────────────────────────────────────────

  async function _loadConversations() {
    if (!window.InboxService) {
      console.warn('[Inbox] InboxService nao disponivel, tentando novamente...')
      return
    }
    try {
      var result = await window.InboxService.loadInbox()
      if (result && result.ok) {
        _conversations = result.data || []
      } else {
        console.warn('[Inbox] loadInbox falhou:', result?.error)
      }
    } catch(e) {
      console.warn('[Inbox] Erro ao carregar conversas:', e.message)
    }
  }

  async function _loadChat(convId) {
    if (!window.InboxService) return
    _chatLoading = true
    _activeId = convId
    _render()
    var result = await window.InboxService.loadConversation(convId)
    if (result.ok) {
      _activeConv = result.data
    }
    _chatLoading = false
    _render()
    _scrollChatToBottom()
  }

  async function _refreshChat() {
    if (!_activeId || !window.InboxService) return
    var result = await window.InboxService.loadConversation(_activeId)
    if (!result.ok) return
    var oldCount = _activeConv?.messages?.length || 0
    _activeConv = result.data
    var newCount = _activeConv?.messages?.length || 0
    // So re-renderizar se tem msgs novas
    if (newCount !== oldCount) {
      var msgsEl = document.getElementById('ibxChatMessages')
      if (msgsEl) {
        // Verificar se usuario esta no fundo do scroll (ou perto)
        var wasAtBottom = (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) < 80
        var msgs = _activeConv.messages || []
        var html = ''
        for (var i = 0; i < msgs.length; i++) html += _renderMessage(msgs[i])
        msgsEl.innerHTML = html
        // So scrollar para baixo se ja estava no fundo
        if (wasAtBottom) msgsEl.scrollTop = msgsEl.scrollHeight
      }
    }
  }

  function _updateSidebarOnly() {
    var list = _filtered()
    var listEl = document.querySelector('.ibx-conv-list')
    if (!listEl) return
    var html = ''
    if (list.length === 0) {
      html = '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary);font-size:14px">Nenhuma conversa encontrada</div>'
    } else {
      for (var i = 0; i < list.length; i++) html += _renderConvItem(list[i])
    }
    listEl.innerHTML = html
    listEl.querySelectorAll('.ibx-conv').forEach(function (el) {
      el.addEventListener('click', function () { _loadChat(el.dataset.convId) })
    })
    // Atualizar cards tambem
    var ct = _counts()
    var cardsEl = document.querySelector('.ibx-cards')
    if (cardsEl) {
      var vals = cardsEl.querySelectorAll('.ibx-card-value')
      if (vals[0]) vals[0].textContent = ct.urgent
      if (vals[1]) vals[1].textContent = ct.waiting
      if (vals[2]) vals[2].textContent = ct.lara
      if (vals[3]) vals[3].textContent = ct.resolved
    }
  }

  function _scrollChatToBottom() {
    setTimeout(function () {
      var el = document.getElementById('ibxChatMessages')
      if (el) el.scrollTop = el.scrollHeight
    }, 100)
  }

  // ── Filtered conversations ──────────────────────────────────

  function _filtered() {
    var list = _conversations
    if (_filter === 'urgent') {
      list = list.filter(function (c) { return c.is_urgent })
    } else if (_filter === 'waiting') {
      list = list.filter(function (c) { return !c.ai_enabled && !c.is_urgent })
    } else if (_filter === 'lara') {
      list = list.filter(function (c) { return c.ai_enabled })
    }
    if (_search) {
      var q = _search.toLowerCase()
      list = list.filter(function (c) {
        return (c.lead_name || '').toLowerCase().indexOf(q) >= 0 ||
               (c.phone || '').indexOf(q) >= 0
      })
    }
    return list
  }

  // ── Counts ──────────────────────────────────────────────────

  function _counts() {
    var urgent = 0, waiting = 0, lara = 0, resolved = 0
    for (var i = 0; i < _conversations.length; i++) {
      var c = _conversations[i]
      if (c.is_urgent) urgent++
      else if (!c.ai_enabled) waiting++
      else lara++
    }
    return { urgent: urgent, waiting: waiting, lara: lara, resolved: resolved }
  }

  // ── Render principal ────────────────────────────────────────

  function _render() {
    var root = _root()
    if (!root) return

    if (_loading) {
      root.innerHTML = '<div class="ibx-page"><div class="ibx-loading"><div class="ibx-spinner"></div><span>Carregando conversas...</span></div></div>'
      return
    }

    var ct = _counts()
    var list = _filtered()

    root.innerHTML =
      '<div class="ibx-page">' +
        _renderCards(ct) +
        '<div class="ibx-main">' +
          _renderSidebar(list) +
          _renderChat() +
        '</div>' +
      '</div>'

    _bindEvents(root)
    _updateTabTitle()
  }

  // ── Cards de resumo ─────────────────────────────────────────

  function _renderCards(ct) {
    return '<div class="ibx-cards">' +
      '<div class="ibx-card ibx-card-urgent' + (ct.urgent > 0 ? ' ibx-has-items' : '') + '">' +
        '<div class="ibx-card-icon">' + _svg('alertCircle', 22) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label">Urgentes</div><div class="ibx-card-value">' + ct.urgent + '</div></div>' +
      '</div>' +
      '<div class="ibx-card ibx-card-waiting">' +
        '<div class="ibx-card-icon">' + _svg('clock', 22) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label">Aguardando Voce</div><div class="ibx-card-value">' + ct.waiting + '</div></div>' +
      '</div>' +
      '<div class="ibx-card ibx-card-lara">' +
        '<div class="ibx-card-icon">' + _svg('messageCircle', 22) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label">Lara Ativa</div><div class="ibx-card-value">' + ct.lara + '</div></div>' +
      '</div>' +
      '<div class="ibx-card ibx-card-resolved">' +
        '<div class="ibx-card-icon">' + _svg('checkCircle', 22) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label">Resolvidos Hoje</div><div class="ibx-card-value">' + ct.resolved + '</div></div>' +
      '</div>' +
      '<button class="ibx-card ibx-card-refresh" id="ibxRefreshBtn" title="Atualizar conversas">' +
        '<div class="ibx-card-icon" style="background:#DCFCE7;color:#25D366">' + _svg('refreshCw', 18) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label">Atualizar</div><div class="ibx-card-value" style="font-size:12px;color:var(--text-secondary)">Agora</div></div>' +
      '</button>' +
      '<div class="ibx-card" id="ibxHealthCard" style="display:none">' +
        '<div class="ibx-card-icon" style="background:#FEE2E2;color:#DC2626">' + _svg('alertCircle', 18) + '</div>' +
        '<div class="ibx-card-info"><div class="ibx-card-label" id="ibxHealthLabel">Erros</div><div class="ibx-card-value" id="ibxHealthValue" style="color:#DC2626">0</div></div>' +
      '</div>' +
    '</div>'
  }

  // ── Sidebar (lista de conversas) ────────────────────────────

  function _renderSidebar(list) {
    var filtersHtml =
      '<div class="ibx-filters">' +
        _filterBtn('all', 'Todas') +
        _filterBtn('urgent', 'Urgentes') +
        _filterBtn('waiting', 'Aguardando') +
        _filterBtn('lara', 'Lara Ativa') +
      '</div>'

    var searchHtml =
      '<div class="ibx-search">' +
        '<input class="ibx-search-input" id="ibxSearch" type="text" placeholder="Buscar por nome ou telefone..." value="' + _esc(_search) + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
      '</div>'

    var convHtml = ''
    if (list.length === 0) {
      convHtml = '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary);font-size:14px">Nenhuma conversa encontrada</div>'
    } else {
      for (var i = 0; i < list.length; i++) {
        convHtml += _renderConvItem(list[i])
      }
    }

    return '<div class="ibx-sidebar">' + searchHtml + filtersHtml + '<div class="ibx-conv-list">' + convHtml + '</div></div>'
  }

  function _filterBtn(val, label) {
    return '<button class="ibx-filter-btn' + (_filter === val ? ' ibx-filter-active' : '') + '" data-filter="' + val + '">' + label + '</button>'
  }

  function _renderConvItem(c) {
    var isSelected = _activeId === c.conversation_id
    var dotClass = c.is_urgent ? 'ibx-dot-red' : (!c.ai_enabled ? 'ibx-dot-yellow' : 'ibx-dot-green')
    var urgentClass = c.is_urgent ? ' ibx-conv-urgent' : ''
    var selectedClass = isSelected ? ' ibx-conv-selected' : ''
    var name = c.lead_name || 'Desconhecido'
    var preview = c.last_message_text || ''
    if (preview.length > 50) preview = preview.substring(0, 50) + '...'

    var tags = ''
    if (c.is_urgent) tags += '<span class="ibx-tag ibx-tag-urgent">URGENTE</span>'
    if (c.tags && c.tags.indexOf('pronto_agendar') >= 0) tags += '<span class="ibx-tag ibx-tag-agendar">QUER AGENDAR</span>'
    if (c.tags && c.tags.indexOf('perguntou_preco') >= 0) tags += '<span class="ibx-tag ibx-tag-preco">PERGUNTOU PRECO</span>'
    if (c.funnel === 'fullface') tags += '<span class="ibx-tag" style="background:#F3E8FF;color:#7C3AED">FULL FACE</span>'
    else if (c.funnel === 'procedimentos') tags += '<span class="ibx-tag" style="background:#DBEAFE;color:#1E40AF">PROCEDIMENTO</span>'
    if (c.ai_enabled) tags += '<span class="ibx-tag ibx-tag-lara">LARA</span>'
    else tags += '<span class="ibx-tag ibx-tag-humano">VOCE</span>'

    return '<div class="ibx-conv' + urgentClass + selectedClass + '" data-conv-id="' + _esc(c.conversation_id) + '">' +
      '<div class="ibx-conv-dot ' + dotClass + '"></div>' +
      '<div class="ibx-conv-body">' +
        '<div class="ibx-conv-top">' +
          '<span class="ibx-conv-name">' + _esc(name) + '</span>' +
          '<span class="ibx-conv-time">' + _timeAgo(c.last_message_at) + '</span>' +
        '</div>' +
        '<div class="ibx-conv-preview">' + _esc(preview) + '</div>' +
        '<div class="ibx-conv-tags">' + tags + '</div>' +
      '</div>' +
    '</div>'
  }

  // ── Chat (direita) ──────────────────────────────────────────

  function _renderChat() {
    if (!_activeId) {
      return '<div class="ibx-chat">' +
        '<div class="ibx-chat-empty">' +
          '<div class="ibx-chat-empty-icon">' + _svg('messageCircle', 48) + '</div>' +
          '<div class="ibx-chat-empty-text">Selecione uma conversa</div>' +
          '<div class="ibx-chat-empty-sub">Clique em uma conversa na lista ao lado para ver as mensagens</div>' +
        '</div>' +
      '</div>'
    }

    if (_chatLoading) {
      return '<div class="ibx-chat"><div class="ibx-loading"><div class="ibx-spinner"></div><span>Carregando mensagens...</span></div></div>'
    }

    if (!_activeConv) {
      return '<div class="ibx-chat"><div class="ibx-chat-empty"><div class="ibx-chat-empty-text">Erro ao carregar conversa</div></div></div>'
    }

    var conv = _activeConv.conversation || {}
    var lead = _activeConv.lead || {}
    var msgs = _activeConv.messages || []
    var isAiEnabled = conv.ai_enabled !== false

    // Header
    var header = '<div class="ibx-chat-header">' +
      '<div class="ibx-chat-header-info">' +
        '<div class="ibx-chat-name">' + _esc(lead.name || 'Desconhecido') + '</div>' +
        '<div class="ibx-chat-phone">' + _esc(conv.phone || '') +
          (lead.phase ? ' &middot; ' + _esc(lead.phase) : '') +
          (lead.queixas_faciais && lead.queixas_faciais.length ? ' &middot; ' + _esc(lead.queixas_faciais.join(', ')) : '') +
        '</div>' +
      '</div>' +
      '<div class="ibx-chat-actions">' +
        (isAiEnabled
          ? '<button class="ibx-btn ibx-btn-assume" id="ibxBtnAssume">' + _svg('user', 16) + ' ASSUMIR CONVERSA</button>'
          : '<button class="ibx-btn ibx-btn-release" id="ibxBtnRelease">' + _svg('messageCircle', 16) + ' DEVOLVER PARA LARA</button>'
        ) +
        '<button class="ibx-btn ibx-btn-resolve" id="ibxBtnResolve">' + _svg('check', 16) + ' RESOLVER</button>' +
        '<button class="ibx-btn ibx-btn-resolve" id="ibxBtnArchive" style="color:#D97706;border-color:#F59E0B">' + _svg('x', 16) + ' ARQUIVAR</button>' +
        '<button class="ibx-btn ibx-btn-resolve" id="ibxBtnTransfer" style="color:#2563EB;border-color:#3B82F6">' + _svg('user', 16) + ' DRA. MIRIAN</button>' +
      '</div>' +
    '</div>'

    // Status bar
    var statusBar = '<div class="ibx-chat-status ' + (isAiEnabled ? 'ibx-status-lara' : 'ibx-status-humano') + '">' +
      (isAiEnabled
        ? _svg('messageCircle', 12) + ' Lara esta respondendo automaticamente'
        : _svg('user', 12) + ' Voce assumiu esta conversa — Lara pausada'
      ) +
    '</div>'

    // Messages
    var msgsHtml = ''
    for (var i = 0; i < msgs.length; i++) {
      msgsHtml += _renderMessage(msgs[i])
    }

    var messagesArea = '<div class="ibx-chat-messages" id="ibxChatMessages">' + msgsHtml + '</div>'

    // Input
    var inputArea = ''
    if (!isAiEnabled) {
      inputArea = '<div class="ibx-chat-input">' +
        '<textarea class="ibx-input-field" id="ibxInputField" placeholder="Digite sua mensagem..." rows="1"></textarea>' +
        '<button class="ibx-send-btn" id="ibxSendBtn"' + (_sending ? ' disabled' : '') + '>' +
          _svg('send', 18) + ' ENVIAR' +
        '</button>' +
      '</div>'
    }

    return '<div class="ibx-chat">' + header + statusBar + messagesArea + inputArea + '</div>'
  }

  function _renderMessage(msg) {
    var isInbound = msg.direction === 'inbound'
    var senderLabel = ''
    var senderClass = ''
    var msgClass = 'ibx-msg '

    if (isInbound) {
      msgClass += 'ibx-msg-inbound'
    } else {
      msgClass += 'ibx-msg-outbound'
      if (msg.sender === 'lara' || msg.sender === 'ai') {
        msgClass += ' ibx-msg-lara'
        senderLabel = '<span class="ibx-msg-sender ibx-msg-sender-lara">Lara</span>'
      } else {
        msgClass += ' ibx-msg-humano'
        senderLabel = '<span class="ibx-msg-sender ibx-msg-sender-humano">Voce</span>'
      }
    }

    var contentHtml = ''
    var isMedia = msg.content_type && msg.content_type !== 'text'
    var hasUrl = msg.media_url && msg.media_url.startsWith('data:')
    var mediaId = 'ibx-media-' + (msg.id || Math.random().toString(36).substr(2, 6))

    if (msg.content_type === 'image' && hasUrl) {
      contentHtml = '<img src="' + _esc(msg.media_url) + '" class="ibx-msg-image" alt="' + _esc(msg.content || '') + '" loading="lazy" onclick="window.open(this.src,\'_blank\')">'
      if (msg.content && msg.content !== '[imagem recebida]') contentHtml += '<div class="ibx-msg-caption">' + _esc(msg.content) + '</div>'
    } else if (msg.content_type === 'audio' && hasUrl) {
      contentHtml = '<audio controls preload="none" style="max-width:240px;height:36px"><source src="' + _esc(msg.media_url) + '"></audio>'
    } else if (msg.content_type === 'video' && hasUrl) {
      contentHtml = '<video controls preload="none" style="max-width:280px;border-radius:8px"><source src="' + _esc(msg.media_url) + '"></video>'
    } else if (isMedia && !hasUrl) {
      // Media sem URL acessivel — mostrar tipo com indicador SVG Feather
      var typeLabel = msg.content_type === 'audio' ? 'Audio' : msg.content_type === 'image' ? 'Imagem' : msg.content_type === 'video' ? 'Video' : msg.content_type === 'sticker' ? 'Sticker' : 'Arquivo'
      // Feather icons inline: mic (audio), image (imagem), film (video), smile (sticker), paperclip (default)
      var typeIcon
      if (msg.content_type === 'audio') {
        typeIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
      } else if (msg.content_type === 'image') {
        typeIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
      } else if (msg.content_type === 'video') {
        typeIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
      } else if (msg.content_type === 'sticker') {
        typeIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
      } else {
        typeIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
      }
      contentHtml = '<div class="ibx-msg-media-tag">' + typeIcon + ' ' + typeLabel + '</div>'
      if (msg.content && !msg.content.startsWith('[')) contentHtml += '<div>' + _esc(msg.content).replace(/\n/g, '<br>') + '</div>'
    } else {
      contentHtml = _esc(msg.content || '').replace(/\n/g, '<br>')
    }

    var statusIcon = ''
    if (!isInbound && msg.status) {
      if (msg.status === 'failed') statusIcon = '<span class="ibx-msg-status ibx-status-failed" title="Falha no envio">✗</span>'
      else if (msg.status === 'pending') statusIcon = '<span class="ibx-msg-status ibx-status-pending" title="Enviando...">◷</span>'
      else if (msg.status === 'sent') statusIcon = '<span class="ibx-msg-status ibx-status-sent" title="Enviado">✓</span>'
    }

    return '<div class="' + msgClass + '">' +
      '<div>' + contentHtml + '</div>' +
      '<div class="ibx-msg-meta">' +
        senderLabel +
        '<span class="ibx-msg-time">' + _timeShort(msg.sent_at) + statusIcon + '</span>' +
      '</div>' +
    '</div>'
  }

  // ── Events ──────────────────────────────────────────────────

  function _bindEvents(root) {
    // Filter buttons
    // Refresh button
    var refreshBtn = root.querySelector('#ibxRefreshBtn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async function () {
        var valEl = refreshBtn.querySelector('.ibx-card-value')
        if (valEl) valEl.textContent = '...'
        await _loadConversations()
        if (_activeId) await _loadChat(_activeId)
        else _render()
      })
    }

    root.querySelectorAll('.ibx-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _filter = btn.dataset.filter
        _render()
      })
    })

    // Search with debounce
    var searchInput = root.querySelector('#ibxSearch')
    if (searchInput) {
      var _searchTimer = null
      searchInput.addEventListener('input', function () {
        _search = searchInput.value
        clearTimeout(_searchTimer)
        _searchTimer = setTimeout(function () {
          var savedValue = _search
          var savedPos = searchInput.selectionStart
          // Only re-render sidebar list, not the whole page
          var listEl = document.querySelector('.ibx-conv-list')
          if (listEl) {
            var list = _filtered()
            var html = ''
            if (list.length === 0) {
              html = '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary);font-size:14px">Nenhuma conversa encontrada</div>'
            } else {
              for (var i = 0; i < list.length; i++) html += _renderConvItem(list[i])
            }
            listEl.innerHTML = html
            // Re-bind conv clicks
            listEl.querySelectorAll('.ibx-conv').forEach(function (el) {
              el.addEventListener('click', function () { _loadChat(el.dataset.convId) })
            })
          }
        }, 300)
      })
    }

    // Conversation clicks
    root.querySelectorAll('.ibx-conv').forEach(function (el) {
      el.addEventListener('click', function () {
        _loadChat(el.dataset.convId)
      })
    })

    // Assume button
    var assumeBtn = root.querySelector('#ibxBtnAssume')
    if (assumeBtn) {
      assumeBtn.addEventListener('click', async function () {
        if (!_activeId || !window.InboxService) return
        assumeBtn.disabled = true
        assumeBtn.textContent = 'Assumindo...'
        await window.InboxService.assumeConversation(_activeId)
        await _loadConversations()
        await _loadChat(_activeId)
      })
    }

    // Release button
    var releaseBtn = root.querySelector('#ibxBtnRelease')
    if (releaseBtn) {
      releaseBtn.addEventListener('click', async function () {
        if (!_activeId || !window.InboxService) return
        releaseBtn.disabled = true
        releaseBtn.textContent = 'Devolvendo...'
        await window.InboxService.releaseConversation(_activeId)
        await _loadConversations()
        await _loadChat(_activeId)
      })
    }

    // Resolve button
    var resolveBtn = root.querySelector('#ibxBtnResolve')
    if (resolveBtn) {
      resolveBtn.addEventListener('click', async function () {
        if (!_activeId || !window.InboxService) return
        if (!confirm('Deseja encerrar esta conversa?')) return
        await window.InboxService.resolveConversation(_activeId)
        _activeId = null
        _activeConv = null
        await _loadConversations()
        _render()
      })
    }

    // Archive button
    var archiveBtn = root.querySelector('#ibxBtnArchive')
    if (archiveBtn) {
      archiveBtn.addEventListener('click', async function () {
        if (!_activeId || !window.InboxService) return
        if (!confirm('Arquivar esta conversa? Ela sai da lista mas pode ser reaberta quando o paciente mandar nova mensagem.')) return
        await window.InboxService.archiveConversation(_activeId)
        _activeId = null
        _activeConv = null
        await _loadConversations()
        _render()
      })
    }

    // Transfer to Dra. Mirian button
    var transferBtn = root.querySelector('#ibxBtnTransfer')
    if (transferBtn) {
      transferBtn.addEventListener('click', async function () {
        if (!_activeId || !window.InboxService) return
        if (!confirm('Transferir esta conversa para a Dra. Mirian?')) return
        transferBtn.disabled = true
        transferBtn.textContent = 'Transferindo...'
        await window.InboxService.assumeConversation(_activeId)
        await window.InboxService.sendMessage(_activeId, 'Entendi! Vou encaminhar sua conversa para a Dra. Mirian. Ela vai entrar em contato com voce em breve!')
        await _loadConversations()
        await _loadChat(_activeId)
      })
    }

    // Send button
    var sendBtn = root.querySelector('#ibxSendBtn')
    var inputField = root.querySelector('#ibxInputField')
    if (sendBtn && inputField) {
      sendBtn.addEventListener('click', function () { _sendMessage(inputField) })
      inputField.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          _sendMessage(inputField)
        }
      })
    }
  }

  async function _sendMessage(inputEl) {
    var text = (inputEl.value || '').trim()
    if (!text || !_activeId || _sending) return

    _sending = true
    inputEl.disabled = true
    var sendBtn = document.getElementById('ibxSendBtn')
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviando...' }

    var result = await window.InboxService.sendMessage(_activeId, text)

    _sending = false
    inputEl.disabled = false
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar' }

    if (result && result.sendFailed) {
      // Mostrar erro mas manter texto no input para reenvio
      var errDiv = document.getElementById('ibxSendError')
      if (!errDiv) {
        errDiv = document.createElement('div')
        errDiv.id = 'ibxSendError'
        errDiv.style.cssText = 'padding:6px 12px;background:#FEE2E2;color:#DC2626;font-size:12px;font-weight:600;border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center'
        inputEl.parentNode.insertBefore(errDiv, inputEl)
      }
      errDiv.innerHTML = '<span>Falha ao enviar. Mensagem salva mas nao chegou ao paciente.</span><button onclick="this.parentNode.remove()" style="background:none;border:none;color:#DC2626;font-weight:700;cursor:pointer;font-size:14px">X</button>'
    } else {
      inputEl.value = ''
      var errDiv = document.getElementById('ibxSendError')
      if (errDiv) errDiv.remove()
    }

    await _loadChat(_activeId)
  }

  // ── Health Check ──────────────────────────────────────────────

  async function _checkHealth() {
    try {
      var env = window.ClinicEnv || {}
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return
      var r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/wa_health_check', {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: '{}'
      })
      if (!r.ok) return
      var data = await r.json()
      var card = document.getElementById('ibxHealthCard')
      var label = document.getElementById('ibxHealthLabel')
      var value = document.getElementById('ibxHealthValue')
      if (!card) return

      var issues = (data.errors_unresolved || 0) + (data.failed_msgs || 0)
      if (issues > 0) {
        card.style.display = ''
        value.textContent = issues
        label.textContent = data.failed_msgs > 0 ? 'Msgs Falharam' : 'Erros'
      } else {
        card.style.display = 'none'
      }
    } catch (e) { /* silencioso */ }

    // Repetir a cada 60s
    setTimeout(_checkHealth, 60000)
  }

  // ── Supabase Realtime ────────────────────────────────────────

  function _startRealtime() {
    if (!window.supabase?.createClient) return
    try {
      var env = window.ClinicEnv || {}
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return
      var client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
      _realtimeChannel = client.channel('wa_messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, function () {
          _loadConversations().then(function () {
            var newUrgent = _conversations.filter(function(c) { return c.is_urgent }).length
            if (newUrgent > _lastUrgentCount && _lastUrgentCount >= 0) { _playAlertSound(); _sendBrowserNotification('Mensagem Urgente', 'Nova mensagem que precisa atencao na Central de Atendimento'); }
            _lastUrgentCount = newUrgent
            _updateTabTitle()
            if (_activeId) {
              _updateSidebarOnly()
              _refreshChat()
            } else {
              _render()
            }
          })
        })
        .subscribe()
    } catch(e) {}
  }

  // ── Cleanup ─────────────────────────────────────────────────

  function destroy() {
    if (_refreshTimer) clearInterval(_refreshTimer)
    _refreshTimer = null
    if (_realtimeChannel) {
      try { _realtimeChannel.unsubscribe() } catch(e) {}
      _realtimeChannel = null
    }
  }

  // ── Exposicao global ────────────────────────────────────────
  window.InboxUI = Object.freeze({ init: init, destroy: destroy })

})()
