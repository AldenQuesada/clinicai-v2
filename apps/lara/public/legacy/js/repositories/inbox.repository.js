/**
 * ClinicAI — Inbox Repository
 *
 * Acesso puro ao Supabase para o modulo Inbox (WhatsApp).
 * Zero logica de negocio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   wa_inbox_list()
 *   wa_inbox_conversation(p_conversation_id)
 *   wa_inbox_assume(p_conversation_id)
 *   wa_inbox_release(p_conversation_id)
 *   wa_inbox_send(p_conversation_id, p_content)
 *   wa_inbox_resolve(p_conversation_id)
 *
 * Depende de:
 *   window.ClinicEnv — configuracao Supabase (SUPABASE_URL, SUPABASE_KEY)
 */

;(function () {
  'use strict'

  if (window._clinicaiInboxRepoLoaded) return
  window._clinicaiInboxRepoLoaded = true

  const _url = () => window.ClinicEnv?.SUPABASE_URL || ''
  const _key = () => window.ClinicEnv?.SUPABASE_KEY || ''
  function _sb() { return window._sbShared || null }
  function _headers() {
    var token = (typeof getToken === 'function' && getToken()) || _key()
    return { 'apikey': _key(), 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  }

  async function _rpc(name, params = {}) {
    try {
      const sb = _sb()
      if (!sb) return { ok: false, data: null, error: 'Supabase not ready' }
      const res = await sb.rpc(name, params)
      if (res.error) return { ok: false, data: null, error: res.error.message }
      return { ok: true, data: res.data, error: null }
    } catch (e) { return { ok: false, data: null, error: e.message } }
  }

  // ── Inbox ─────────────────────────────────────────────────────

  async function list() {
    return _rpc('wa_inbox_list')
  }

  async function getConversation(id) {
    return _rpc('wa_inbox_conversation', { p_conversation_id: id })
  }

  async function assume(id) {
    return _rpc('wa_inbox_assume', { p_conversation_id: id })
  }

  async function release(id) {
    return _rpc('wa_inbox_release', { p_conversation_id: id })
  }

  async function send(id, content) {
    return _rpc('wa_inbox_send', { p_conversation_id: id, p_content: content })
  }

  async function resolve(id) {
    return _rpc('wa_inbox_resolve', { p_conversation_id: id })
  }

  async function archive(id) {
    return _rpc('wa_inbox_archive', { p_conversation_id: id })
  }

  async function reopen(id) {
    return _rpc('wa_inbox_reopen', { p_conversation_id: id })
  }

  async function updateMessageStatus(msgId, status) {
    try {
      await fetch(_url() + '/rest/v1/wa_messages?id=eq.' + msgId, {
        method: 'PATCH', headers: _headers(),
        body: JSON.stringify({ status: status })
      })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  }

  // ── Expose ────────────────────────────────────────────────────

  window.InboxRepository = Object.freeze({
    list,
    getConversation,
    assume,
    release,
    send,
    resolve,
    archive,
    reopen,
    updateMessageStatus,
  })
})()
