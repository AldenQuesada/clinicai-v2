/**
 * ClinicAI — Pluggy Service
 *
 * Integra o widget Pluggy Connect (carregado da CDN deles) com o backend.
 * Fluxo:
 *   1. loadWidget() carrega o script da CDN do Pluggy (lazy)
 *   2. getConnectToken() chama o n8n proxy que gera o token com clientSecret
 *   3. openConnectWidget() abre o modal do Pluggy Connect
 *   4. onSuccess → registerConnection() salva item_id na tabela pluggy_connections
 */
;(function () {
  'use strict'
  if (window._clinicaiPluggySvcLoaded) return
  window._clinicaiPluggySvcLoaded = true

  var PLUGGY_SCRIPT_URL = 'https://cdn.pluggy.ai/web/v1/pluggy.js'

  // URL do proxy n8n que gera connect token (usa clientId+secret internamente)
  // Configurar em localStorage: clinicai_pluggy_token_url
  // Default: usa o n8n da clinica
  var DEFAULT_TOKEN_URL = 'https://flows.aldenquesada.site/webhook/pluggy-connect-token'

  var _widgetLoaded = false
  var _widgetLoading = null

  function _repo() { return window.PluggyRepository || null }

  function _getTokenUrl() {
    try {
      var custom = localStorage.getItem('clinicai_pluggy_token_url')
      return custom || DEFAULT_TOKEN_URL
    } catch (e) { return DEFAULT_TOKEN_URL }
  }

  /**
   * Carrega o script do widget Pluggy da CDN (uma vez).
   */
  function loadWidget() {
    if (_widgetLoaded) return Promise.resolve()
    if (_widgetLoading) return _widgetLoading

    _widgetLoading = new Promise(function(resolve, reject) {
      if (window.PluggyConnect) { _widgetLoaded = true; return resolve() }
      var s = document.createElement('script')
      s.src = PLUGGY_SCRIPT_URL
      s.async = true
      s.onload = function() { _widgetLoaded = true; resolve() }
      s.onerror = function() { reject(new Error('Falha ao carregar widget Pluggy')) }
      document.head.appendChild(s)
    })
    return _widgetLoading
  }

  /**
   * Busca um connect token via n8n proxy.
   * O n8n chama https://api.pluggy.ai/auth usando clientId+clientSecret e gera o token.
   */
  async function getConnectToken(clientUserId) {
    var url = _getTokenUrl()
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientUserId: clientUserId || 'clinic-default' }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      var data = await r.json()
      // Pluggy retorna { accessToken } ou { connectToken } dependendo do endpoint
      return data.accessToken || data.connectToken || data.token || null
    } catch (e) {
      console.warn('[PluggyService] getConnectToken falhou:', e.message)
      return null
    }
  }

  /**
   * Abre o widget Pluggy Connect.
   *
   * @param {object} opts
   *   - connectToken: string (opcional, se nao vier busca via n8n)
   *   - onSuccess: callback(itemData)
   *   - onError:   callback(error)
   *   - onExit:    callback()
   */
  async function openConnectWidget(opts) {
    opts = opts || {}

    // Carrega widget + token em paralelo
    var tokenPromise = opts.connectToken
      ? Promise.resolve(opts.connectToken)
      : getConnectToken(opts.clientUserId)
    await Promise.all([loadWidget(), tokenPromise])

    if (!window.PluggyConnect) {
      throw new Error('PluggyConnect nao disponivel apos load')
    }

    var token = await tokenPromise
    if (!token) throw new Error('Nao foi possivel gerar connect token. Configure o proxy n8n.')

    var pluggy = new window.PluggyConnect({
      connectToken: token,
      includeSandbox: false,
      onSuccess: async function(itemData) {
        try {
          // Registra a conexao no nosso backend
          await registerConnection({
            item_id:          itemData.item && itemData.item.id,
            institution_id:   itemData.item && itemData.item.connector && String(itemData.item.connector.id),
            institution_name: itemData.item && itemData.item.connector && itemData.item.connector.name,
            metadata:         { raw: itemData },
          })
        } catch (e) { console.warn('[PluggyService] registerConnection falhou:', e) }
        if (opts.onSuccess) opts.onSuccess(itemData)
      },
      onError: function(err) {
        console.warn('[PluggyService] Pluggy error:', err)
        if (opts.onError) opts.onError(err)
      },
      onExit: function() {
        if (opts.onExit) opts.onExit()
      },
    })
    pluggy.init()
    return pluggy
  }

  /**
   * Registra uma conexao no backend (chamado apos sucesso no widget).
   */
  async function registerConnection(data) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'PluggyRepository nao disponivel' }
    return repo.registerConnection(data)
  }

  async function listConnections() {
    var repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'PluggyRepository nao disponivel' }
    return repo.listConnections()
  }

  async function disconnect(id) {
    var repo = _repo()
    if (!repo) return { ok: false, error: 'PluggyRepository nao disponivel' }
    return repo.disconnect(id)
  }

  /**
   * Dispara sync manual via n8n endpoint (opcional).
   */
  async function syncNow(itemId) {
    var url = (_getTokenUrl() || '').replace('/pluggy-connect-token', '/pluggy-sync-now')
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: itemId || null }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      console.warn('[PluggyService] syncNow falhou:', e.message)
      return { ok: false, error: e.message }
    }
  }

  window.PluggyService = Object.freeze({
    loadWidget:           loadWidget,
    getConnectToken:      getConnectToken,
    openConnectWidget:    openConnectWidget,
    registerConnection:   registerConnection,
    listConnections:      listConnections,
    disconnect:           disconnect,
    syncNow:              syncNow,
  })
})()
