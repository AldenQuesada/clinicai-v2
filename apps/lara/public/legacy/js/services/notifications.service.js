/**
 * ClinicAI — Notifications Service
 *
 * Gerencia o estado das notificações em memória.
 * Estratégia híbrida: tenta realtime primeiro, faz fallback para polling (30s).
 *
 * Depende de:
 *   NotificationsRepository  (notifications.repository.js)
 *
 * API pública (window.NotificationsService):
 *   init()                        — inicia polling/realtime (chamar após auth)
 *   destroy()                     — para polling, cancela subscription
 *   getAll()                      — notificações em cache (array)
 *   getUnreadCount()              — número de não lidas (do cache)
 *   markRead(id)                  — marca uma como lida + atualiza cache
 *   markAllRead()                 — marca todas como lidas + atualiza cache
 *   send(recipientId, type, ...) — envia (admin/owner)
 *   broadcast(type, ...)          — envia para todos/por role (admin/owner)
 *   loadMore()                    — carrega próxima página
 *   hasMore()                     — há mais páginas a carregar?
 *   onChange(fn)                  — subscribe a mudanças no cache
 *   offChange(fn)                 — unsubscribe
 */

;(function () {
  'use strict'

  if (window._clinicaiNotifServiceLoaded) return
  window._clinicaiNotifServiceLoaded = true

  // ── Constantes ──────────────────────────────────────────────────────────
  const PAGE_SIZE     = 20
  const POLL_INTERVAL = 30_000  // 30 segundos

  // ── Estado interno ──────────────────────────────────────────────────────
  let _notifications      = []   // cache principal (notificacoes + alertas internos)
  let _unreadCount        = 0
  let _total              = 0
  let _offset             = 0
  let _listeners          = []
  let _pollTimer          = null
  let _realtimeSub        = null
  let _internalAlertsSub  = null
  let _initialized        = false

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _repo() {
    if (!window.NotificationsRepository) {
      console.error('[NotificationsService] NotificationsRepository não carregado.')
      return null
    }
    return window.NotificationsRepository
  }

  function _notify() {
    _listeners.forEach(fn => {
      try { fn({ notifications: _notifications, unread: _unreadCount }) } catch {}
    })
  }

  function _mergeNew(incoming) {
    // Adiciona no topo sem duplicar
    const existingIds = new Set(_notifications.map(n => n.id))
    const newOnes = incoming.filter(n => !existingIds.has(n.id))
    if (newOnes.length) {
      _notifications = [...newOnes, ..._notifications]
      _total        += newOnes.length
    }
    // Recalcula unread a partir do cache
    _unreadCount = _notifications.filter(n => !n.is_read).length
    _notify()
  }

  // ── Core: carrega primeira página ───────────────────────────────────────

  async function _loadFirst() {
    const repo = _repo()
    if (!repo) return

    const result = await repo.listMine(PAGE_SIZE, 0)
    if (!result.ok) {
      console.warn('[NotificationsService] listMine:', result.error)
      return
    }

    // Preserva alertas internos ja carregados para evitar flicker
    const existing = _notifications.filter(function(n) { return n._source === 'internal_alert' })
    _notifications = [...(result.data || []), ...existing]
    _total         = result.total || 0
    _unreadCount   = _notifications.filter(function(n) { return !n.is_read }).length
    _offset        = PAGE_SIZE
    _notify()

    // Recarrega alertas internos em paralelo (fire-and-forget)
    _loadInternalAlerts()
  }

  // ── Alertas internos (internal_alerts — Tags + Rules) ───────────────────
  // Substitui completamente o slice de internal_alerts no cache
  // a cada chamada, garantindo dados frescos do Supabase.

  async function _loadInternalAlerts() {
    if (!window._sbShared) return
    try {
      const { data, error } = await window._sbShared.rpc('sdr_get_internal_alerts', {
        p_unread_only: false,
        p_limit:       50,
      })
      if (error || !data?.ok) return

      const alerts = (data.data || []).map(function(a) {
        return {
          id:         a.id,
          type:       'internal_' + (a.tipo || 'info'),
          title:      a.titulo,
          body:       a.corpo,
          is_read:    a.lida    || false,
          read_at:    a.lida_em || null,
          created_at: a.created_at,
          _source:    'internal_alert',
        }
      })

      _notifications = [
        ..._notifications.filter(function(n) { return n._source !== 'internal_alert' }),
        ...alerts,
      ]
      _unreadCount = _notifications.filter(function(n) { return !n.is_read }).length
      _notify()
    } catch(e) {
      console.warn('[NotificationsService] _loadInternalAlerts:', e)
    }
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  function _startPolling() {
    if (_pollTimer) return
    _pollTimer = setInterval(async () => {
      const repo = _repo()
      if (!repo) return

      // Polling leve: apenas verifica o contador de não lidas
      const result = await repo.getUnreadCount()
      if (!result.ok) return

      // Se o número mudou, recarrega a lista completa
      if (result.count !== _unreadCount) {
        await _loadFirst()
      }
    }, POLL_INTERVAL)
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer)
      _pollTimer = null
    }
  }

  // ── Realtime ─────────────────────────────────────────────────────────────

  function _startRealtime() {
    const repo = _repo()
    if (!repo) return

    _realtimeSub = repo.subscribeToNew(function(newNotif) {
      _mergeNew([newNotif])
    })

    if (_realtimeSub) {
      // Realtime ativo: polling mais espacado (so como fallback)
      _stopPolling()
      _pollTimer = setInterval(_loadFirst, 120_000)
    }

    // Realtime para internal_alerts (insert)
    _startInternalAlertsRealtime()
  }

  function _startInternalAlertsRealtime() {
    const sb = window._sbShared
    if (!sb?.channel) return
    const profile = window.getCurrentProfile?.()
    if (!profile?.clinic_id) return
    try {
      _internalAlertsSub = sb
        .channel('internal_alerts:' + profile.clinic_id)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'internal_alerts',
          filter: 'clinic_id=eq.' + profile.clinic_id,
        }, function(payload) {
          var a = payload.new
          _mergeNew([{
            id:         a.id,
            type:       'internal_' + (a.tipo || 'info'),
            title:      a.titulo,
            body:       a.corpo,
            is_read:    false,
            created_at: a.created_at,
            _source:    'internal_alert',
          }])
        })
        .subscribe()
    } catch(e) {
      console.warn('[NotificationsService] internal_alerts realtime:', e.message)
    }
  }

  function _stopRealtime() {
    if (_realtimeSub) {
      try { _realtimeSub.unsubscribe() } catch {}
      _realtimeSub = null
    }
    if (_internalAlertsSub) {
      try { _internalAlertsSub.unsubscribe() } catch {}
      _internalAlertsSub = null
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /**
   * Inicializa o serviço: carrega dados e inicia realtime + polling.
   * Seguro para chamar múltiplas vezes — ignora se já inicializado.
   *
   * @returns {Promise<void>}
   */
  async function init() {
    if (_initialized) return
    _initialized = true

    await _loadFirst()
    _startRealtime()
    _startPolling()
  }

  /**
   * Para o serviço e libera recursos.
   */
  function destroy() {
    _stopPolling()
    _stopRealtime()
    _notifications = []
    _unreadCount   = 0
    _total         = 0
    _offset        = 0
    _initialized   = false
    _notify()
  }

  /**
   * @returns {Notification[]}
   */
  function getAll() {
    return _notifications
  }

  /**
   * @returns {number}
   */
  function getUnreadCount() {
    return _unreadCount
  }

  /**
   * @returns {boolean} — há mais páginas para carregar?
   */
  function hasMore() {
    return _notifications.length < _total
  }

  /**
   * Carrega a próxima página de notificações e acrescenta ao cache.
   *
   * @returns {Promise<boolean>} — true se carregou mais itens
   */
  async function loadMore() {
    if (!hasMore()) return false
    const repo = _repo()
    if (!repo) return false

    const result = await repo.listMine(PAGE_SIZE, _offset)
    if (!result.ok) return false

    const existingIds = new Set(_notifications.map(n => n.id))
    const newOnes = (result.data || []).filter(n => !existingIds.has(n.id))
    _notifications = [..._notifications, ...newOnes]
    _offset       += PAGE_SIZE
    _notify()
    return newOnes.length > 0
  }

  /**
   * Marca uma notificação como lida e atualiza o cache.
   *
   * @param {string} id
   * @returns {Promise<{ok, error?}>}
   */
  async function markRead(id) {
    const notif = _notifications.find(function(n) { return n.id === id })

    // Alerta interno: delega ao TagEngine (ja chama sdr_mark_alert_read fire-and-forget)
    if (notif && notif._source === 'internal_alert') {
      if (window.TagEngine) window.TagEngine.markAlertRead(id)
      _notifications = _notifications.map(function(n) {
        return n.id === id ? Object.assign({}, n, { is_read: true, read_at: new Date().toISOString() }) : n
      })
      _unreadCount = Math.max(0, _unreadCount - 1)
      _notify()
      return { ok: true }
    }

    // Notificacao regular
    const repo = _repo()
    if (!repo) return { ok: false, error: 'repository_unavailable' }

    const result = await repo.markRead(id)
    if (result.ok) {
      _notifications = _notifications.map(function(n) {
        return n.id === id ? Object.assign({}, n, { is_read: true, read_at: new Date().toISOString() }) : n
      })
      _unreadCount = Math.max(0, _unreadCount - 1)
      _notify()
    }
    return result
  }

  /**
   * Marca todas as notificações como lidas e atualiza o cache.
   *
   * @returns {Promise<{ok, marked: number, error?}>}
   */
  async function markAllRead() {
    // Marca alertas internos via TagEngine (chama sdr_mark_all_alerts_read fire-and-forget)
    if (window.TagEngine) window.TagEngine.markAllAlertsRead()

    // Marca notificacoes regulares
    const repo = _repo()
    if (!repo) return { ok: false, marked: 0, error: 'repository_unavailable' }

    const result = await repo.markAllRead()
    if (result.ok) {
      const now = new Date().toISOString()
      _notifications = _notifications.map(function(n) {
        return n.is_read ? n : Object.assign({}, n, { is_read: true, read_at: now })
      })
      _unreadCount = 0
      _notify()
    }
    return result
  }

  /**
   * Envia notificação para um usuário (admin/owner).
   *
   * @param {string} recipientId
   * @param {string} type
   * @param {string} title
   * @param {string} [body]
   * @param {object} [data]
   * @returns {Promise<{ok, error?}>}
   */
  async function send(recipientId, type, title, body, data) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'repository_unavailable' }
    return repo.send(recipientId, type, title, body, data)
  }

  /**
   * Envia para todos (ou por role). Admin/owner apenas.
   *
   * @param {string}   type
   * @param {string}   title
   * @param {string}   [body]
   * @param {object}   [data]
   * @param {string[]} [roles]
   * @returns {Promise<{ok, sent_to: number, error?}>}
   */
  async function broadcast(type, title, body, data, roles) {
    const repo = _repo()
    if (!repo) return { ok: false, sent_to: 0, error: 'repository_unavailable' }
    return repo.broadcast(type, title, body, data, roles)
  }

  /**
   * Inscreve um listener chamado sempre que o cache mudar.
   * @param {function({notifications, unread}):void} fn
   */
  function onChange(fn) {
    if (typeof fn === 'function' && !_listeners.includes(fn)) {
      _listeners.push(fn)
    }
  }

  /**
   * Remove um listener.
   * @param {function} fn
   */
  function offChange(fn) {
    _listeners = _listeners.filter(l => l !== fn)
  }

  // ── Auto-init após auth ─────────────────────────────────────────────────
  document.addEventListener('clinicai:auth-success', () => {
    init().catch(e => console.warn('[NotificationsService] auto-init:', e))
  })

  // ── Exposição global ────────────────────────────────────────────────────
  window.NotificationsService = Object.freeze({
    init,
    destroy,
    getAll,
    getUnreadCount,
    hasMore,
    loadMore,
    markRead,
    markAllRead,
    send,
    broadcast,
    onChange,
    offChange,
  })

})()
