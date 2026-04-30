/**
 * ClinicAI — Inbox Service
 *
 * Camada de negocio para o modulo Inbox (WhatsApp).
 * Orquestra chamadas ao InboxRepository e disparo de mensagens
 * via Evolution API.
 *
 * Depende de:
 *   InboxRepository  (inbox.repository.js)
 *
 * API publica (window.InboxService):
 *   loadInbox()
 *   loadConversation(id)
 *   assumeConversation(id)
 *   releaseConversation(id)
 *   sendMessage(id, content)
 *   resolveConversation(id)
 */

;(function () {
  'use strict'

  if (window._clinicaiInboxServiceLoaded) return
  window._clinicaiInboxServiceLoaded = true

  // ── WhatsApp envio (via proxy server-side) ────────────────────
  //
  // Security fix 2026-04-19: a EVOLUTION_API_KEY nao pode mais rodar
  // no client. Todas as chamadas a Evolution passam agora pela edge
  // function `wa-send-proxy`, que guarda a key em env var server-side.
  //
  // Request body esperado pelo proxy:
  //   { to: <phone-digits>, type: 'text' | 'media', text?, media?, ... }

  // ── Helpers ───────────────────────────────────────────────────

  function _repo() { return window.InboxRepository || null }

  function _proxyUrl() {
    return (window.ClinicEnv?.SUPABASE_URL || '').replace(/\/$/, '') +
           '/functions/v1/wa-send-proxy'
  }

  async function _logError(source, errorType, phone, content, errorMsg) {
    try {
      var url = (window.ClinicEnv?.SUPABASE_URL || '') + '/rest/v1/rpc/wa_log_error'
      var key = window.ClinicEnv?.SUPABASE_KEY || ''
      await fetch(url, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_source: source,
          p_error_type: errorType,
          p_phone: phone || null,
          p_payload: content ? { content: String(content).substring(0, 200) } : null,
          p_error_msg: String(errorMsg || '').substring(0, 500)
        })
      })
    } catch (e) { console.error('[InboxService] Falha ao logar erro:', e.message) }
  }

  async function _sendEvolution(phone, content) {
    try {
      const key = window.ClinicEnv?.SUPABASE_KEY || ''
      const r = await fetch(_proxyUrl(), {
        method: 'POST',
        headers: {
          'apikey':        key,
          'Authorization': 'Bearer ' + key,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ to: phone, type: 'text', text: content }),
      })
      if (!r.ok) {
        const e = await r.text()
        console.warn('[InboxService] wa-send-proxy error:', e)
        return { ok: false, error: e }
      }
      const data = await r.json()
      if (data && data.ok === false) {
        return { ok: false, error: data.error || 'proxy_error' }
      }
      return { ok: true, data: data?.data || data }
    } catch (e) {
      console.warn('[InboxService] wa-send-proxy exception:', e.message)
      return { ok: false, error: e.message }
    }
  }

  // ── Public API ────────────────────────────────────────────────

  async function loadInbox() {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.list()
  }

  async function loadConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.getConversation(id)
  }

  async function assumeConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.assume(id)
  }

  async function releaseConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.release(id)
  }

  async function sendMessage(id, content) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }

    const result = await repo.send(id, content)
    if (!result.ok) return result

    // Dispara mensagem via Evolution API
    const phone = result.data?.phone || result.data?.remoteJid || null
    if (phone) {
      const evoResult = await _sendEvolution(phone, content)
      if (!evoResult.ok) {
        // Marcar como falha no banco
        var msgId = result.data?.message_id
        if (msgId && repo.updateMessageStatus) {
          await repo.updateMessageStatus(msgId, 'failed')
        }
        // Logar erro
        _logError('inbox_send', 'evolution_failed', phone, content, evoResult.error)
        return { ok: true, data: result.data, sendFailed: true, sendError: evoResult.error }
      }
      // Marcar como enviado
      var msgId2 = result.data?.message_id
      if (msgId2 && repo.updateMessageStatus) {
        await repo.updateMessageStatus(msgId2, 'sent')
      }
    } else {
      console.warn('[InboxService] Sem telefone no resultado RPC, Evolution API nao chamada')
      return { ok: true, data: result.data, sendFailed: true, sendError: 'Telefone nao encontrado' }
    }

    return result
  }

  async function resolveConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.resolve(id)
  }

  async function archiveConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.archive(id)
  }

  async function reopenConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.reopen(id)
  }

  // ── Expose ────────────────────────────────────────────────────

  window.InboxService = Object.freeze({
    loadInbox,
    loadConversation,
    assumeConversation,
    releaseConversation,
    sendMessage,
    sendText: _sendEvolution,
    resolveConversation,
    archiveConversation,
    reopenConversation,
  })
})()
