/**
 * ClinicAI — Notifications Repository
 *
 * Camada de acesso a dados para notificações.
 * Sem lógica de negócio — apenas chamadas ao Supabase.
 *
 * Todas as operações retornam { ok, data?, error?, total?, unread? }.
 * Erros de rede são capturados e normalizados aqui.
 */

;(function () {
  'use strict'

  if (window._clinicaiNotifRepoLoaded) return
  window._clinicaiNotifRepoLoaded = true

  // ── Cliente Supabase ────────────────────────────────────────────────────
  function _sb() {
    var e = window.ClinicEnv || {}
    return window._sbShared
      || (window.supabase?.createClient && e.SUPABASE_URL
          ? window.supabase.createClient(e.SUPABASE_URL, e.SUPABASE_KEY)
          : null)
  }

  // ── Normaliza resultado ─────────────────────────────────────────────────
  function _ok(data)  { return { ok: true,  data, error: null } }
  function _err(e)    { return { ok: false, data: null, error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }
  function _wrap(data, error) {
    if (error) return _err(error)
    if (data && data.ok === false) return _err(data.error || 'unknown_error')
    return {
      ok:     true,
      error:  null,
      data:   data?.data    ?? [],
      total:  data?.total   ?? 0,
      unread: data?.unread  ?? 0,
    }
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /**
   * Lista notificações do usuário atual, paginadas.
   *
   * @param {number} [limit=20]
   * @param {number} [offset=0]
   * @returns {Promise<{ok, data: Notification[], total: number, unread: number, error?}>}
   *
   * Notification = {
   *   id, type, title, body, data, is_read, read_at, created_at, sender_id
   * }
   */
  async function listMine(limit = 20, offset = 0) {
    try {
      const { data, error } = await _sb().rpc('list_my_notifications', {
        p_limit:  limit,
        p_offset: offset,
      })
      return _wrap(data, error)
    } catch (e) {
      return { ok: false, error: e.message, data: [], total: 0, unread: 0 }
    }
  }

  /**
   * Retorna apenas a contagem de notificações não lidas.
   * Mais leve que listMine — ideal para polling do badge.
   *
   * @returns {Promise<{ok, count: number, error?}>}
   */
  async function getUnreadCount() {
    try {
      const { data, error } = await _sb().rpc('get_unread_count')
      if (error) return { ok: false, count: 0, error: error.message }
      if (!data?.ok) return { ok: false, count: 0, error: data?.error }
      return { ok: true, count: data.count ?? 0 }
    } catch (e) {
      return { ok: false, count: 0, error: e.message }
    }
  }

  /**
   * Marca uma notificação como lida.
   *
   * @param {string} id — UUID da notificação
   * @returns {Promise<{ok, error?}>}
   */
  async function markRead(id) {
    try {
      const { data, error } = await _sb().rpc('mark_notification_read', { p_id: id })
      if (error) return { ok: false, error: error.message }
      if (!data?.ok) return { ok: false, error: data?.error }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Marca todas as notificações não lidas como lidas.
   *
   * @returns {Promise<{ok, marked: number, error?}>}
   */
  async function markAllRead() {
    try {
      const { data, error } = await _sb().rpc('mark_all_read')
      if (error) return { ok: false, marked: 0, error: error.message }
      if (!data?.ok) return { ok: false, marked: 0, error: data?.error }
      return { ok: true, marked: data.marked ?? 0 }
    } catch (e) {
      return { ok: false, marked: 0, error: e.message }
    }
  }

  /**
   * Envia uma notificação para um usuário específico (admin/owner).
   *
   * @param {string} recipientId
   * @param {string} type
   * @param {string} title
   * @param {string} [body]
   * @param {object} [data]
   * @returns {Promise<{ok, error?}>}
   */
  async function send(recipientId, type, title, body = null, data = null) {
    try {
      const { data: res, error } = await _sb().rpc('send_notification', {
        p_recipient_id: recipientId,
        p_type:         type,
        p_title:        title,
        p_body:         body,
        p_data:         data,
      })
      if (error) return { ok: false, error: error.message }
      if (!res?.ok) return { ok: false, error: res?.error }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * Envia a mesma notificação para todos (ou por role).
   *
   * @param {string}   type
   * @param {string}   title
   * @param {string}   [body]
   * @param {object}   [data]
   * @param {string[]} [roles] — null = todos
   * @returns {Promise<{ok, sent_to: number, error?}>}
   */
  async function broadcast(type, title, body = null, data = null, roles = null) {
    try {
      const { data: res, error } = await _sb().rpc('broadcast_notification', {
        p_type:  type,
        p_title: title,
        p_body:  body,
        p_data:  data,
        p_roles: roles,
      })
      if (error) return { ok: false, sent_to: 0, error: error.message }
      if (!res?.ok) return { ok: false, sent_to: 0, error: res?.error }
      return { ok: true, sent_to: res.sent_to ?? 0 }
    } catch (e) {
      return { ok: false, sent_to: 0, error: e.message }
    }
  }

  /**
   * Inscreve um listener de realtime para novas notificações do usuário atual.
   * Retorna a subscription (chamar .unsubscribe() para cancelar).
   *
   * @param {function(Notification):void} onNew — chamado com cada nova notificação
   * @returns {object|null} — subscription object ou null se realtime indisponível
   */
  function subscribeToNew(onNew) {
    const sb = _sb()
    if (!sb?.channel) return null

    const profile = window.getCurrentProfile?.()
    if (!profile?.id) return null

    try {
      const channel = sb
        .channel('notifications:' + profile.id)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `recipient_id=eq.${profile.id}`,
          },
          (payload) => {
            if (typeof onNew === 'function') onNew(payload.new)
          }
        )
        .subscribe()
      return channel
    } catch (e) {
      console.warn('[NotificationsRepository] realtime indisponível:', e.message)
      return null
    }
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.NotificationsRepository = Object.freeze({
    listMine,
    getUnreadCount,
    markRead,
    markAllRead,
    send,
    broadcast,
    subscribeToNew,
  })

})()
