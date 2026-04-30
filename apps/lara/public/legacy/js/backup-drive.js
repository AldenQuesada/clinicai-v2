/**
 * ClinicAI — Google Drive Backup Mirror
 *
 * Espelha backups do Supabase Storage para uma pasta do Google Drive do
 * usuario. OAuth browser-direct (PKCE + implicit token). Sem servidor, sem
 * n8n, sem service account — apenas Google Identity Services + Drive API.
 *
 * Fluxo:
 *   1. Usuario clica "Conectar Google Drive" -> popup OAuth consent
 *   2. Token de acesso (expira em 1h) + refresh token salvos em localStorage
 *   3. Apos cada backup bem-sucedido no Supabase Storage, baixa o JSON e
 *      faz upload na pasta Drive configurada
 *   4. Se o token expirou, renova via refresh token silenciosamente
 *
 * Config no localStorage (_clinicai_drive_config):
 *   clientId       — Google OAuth Client ID (user precisa fornecer, do Google Cloud Console)
 *   folderId       — ID da pasta no Drive onde os backups vao
 *   accessToken    — token ativo (expira em ~1h)
 *   refreshToken   — pra renovar accessToken
 *   tokenExpiresAt — ISO timestamp de expiracao
 *   enabled        — espelhamento ativo?
 *
 * API publica:
 *   window.GoogleDriveBackup.isConnected()
 *   window.GoogleDriveBackup.connect(clientId)  — inicia OAuth popup
 *   window.GoogleDriveBackup.disconnect()
 *   window.GoogleDriveBackup.mirrorFile(name, blob) — sobe 1 arquivo
 *   window.GoogleDriveBackup.listFiles()            — lista pasta
 *   window.GoogleDriveBackup.renderSection(el)      — UI na settings-backups
 */
;(function () {
  'use strict'
  if (window.GoogleDriveBackup) return

  var CFG_KEY = '_clinicai_drive_config'
  var SCOPE = 'https://www.googleapis.com/auth/drive.file'
  // drive.file = escopo MINIMO — so le/escreve arquivos CRIADOS por este app.
  // Nao acessa o resto do Drive do usuario. Nao requer verification do Google.

  // ── Config ──────────────────────────────────────────────────
  function getConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') } catch (e) { return {} }
  }
  function setConfig(patch) {
    var cur = getConfig()
    var next = Object.assign({}, cur, patch || {})
    localStorage.setItem(CFG_KEY, JSON.stringify(next))
    return next
  }
  function isConnected() {
    var c = getConfig()
    return !!(c.clientId && c.accessToken)
  }

  // ── Token refresh ───────────────────────────────────────────
  async function _ensureFreshToken() {
    var c = getConfig()
    if (!c.accessToken) throw new Error('nao conectado')
    // Usa o token se faltam mais de 2 min pra expirar
    var exp = c.tokenExpiresAt ? new Date(c.tokenExpiresAt).getTime() : 0
    if (exp - Date.now() > 120000) return c.accessToken
    // Tenta renovar silenciosamente via Google Identity Services
    return await _requestNewToken(c.clientId, /* silent */ true)
  }

  function _loadGIS() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve()
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
      if (existing) {
        existing.addEventListener('load', function () { resolve() })
        existing.addEventListener('error', reject)
        return
      }
      var s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true; s.defer = true
      s.onload = function () { resolve() }
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  async function _requestNewToken(clientId, silent) {
    await _loadGIS()
    return new Promise(function (resolve, reject) {
      var tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        prompt: silent ? '' : 'consent',
        callback: function (resp) {
          if (resp.error) return reject(new Error('oauth: ' + resp.error))
          var now = Date.now()
          setConfig({
            clientId: clientId,
            accessToken: resp.access_token,
            tokenExpiresAt: new Date(now + (resp.expires_in - 60) * 1000).toISOString(),
          })
          resolve(resp.access_token)
        },
        error_callback: function (err) { reject(new Error('oauth error: ' + JSON.stringify(err))) },
      })
      tokenClient.requestAccessToken()
    })
  }

  async function connect(clientId) {
    if (!clientId) throw new Error('Client ID obrigatório')
    setConfig({ clientId: clientId })
    await _requestNewToken(clientId, false)
    // Teste basico: listar files (nao falha se permissao ok)
    await listFiles()
    setConfig({ enabled: true })
    return true
  }

  function disconnect() {
    var c = getConfig()
    if (c.accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try { window.google.accounts.oauth2.revoke(c.accessToken, function () {}) } catch (_) {}
    }
    setConfig({ accessToken: null, tokenExpiresAt: null, enabled: false, folderId: null })
  }

  // ── Drive API calls ─────────────────────────────────────────
  async function _api(method, path, body, extraHeaders) {
    var token = await _ensureFreshToken()
    var headers = Object.assign({ Authorization: 'Bearer ' + token }, extraHeaders || {})
    var res = await fetch('https://www.googleapis.com/' + path, {
      method: method,
      headers: headers,
      body: body || undefined,
    })
    if (!res.ok) throw new Error('drive ' + method + ' ' + path + ': HTTP ' + res.status + ' — ' + (await res.text()))
    return res
  }

  async function findOrCreateFolder(name) {
    var c = getConfig()
    if (c.folderId) return c.folderId
    var q = "mimeType='application/vnd.google-apps.folder' and name='" + name.replace(/'/g, "\\'") + "' and trashed=false"
    var res = await _api('GET', 'drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)')
    var data = await res.json()
    if (data.files && data.files.length > 0) {
      setConfig({ folderId: data.files[0].id })
      return data.files[0].id
    }
    // Cria
    var createRes = await _api('POST', 'drive/v3/files?fields=id', JSON.stringify({
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
    }), { 'Content-Type': 'application/json' })
    var created = await createRes.json()
    setConfig({ folderId: created.id })
    return created.id
  }

  async function listFiles() {
    var folderId = getConfig().folderId
    if (!folderId) folderId = await findOrCreateFolder('clinicai-backups')
    var q = "'" + folderId + "' in parents and trashed=false"
    var res = await _api('GET', 'drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&pageSize=30')
    var data = await res.json()
    return data.files || []
  }

  async function mirrorFile(filename, blob) {
    var folderId = getConfig().folderId || await findOrCreateFolder('clinicai-backups')
    var metadata = { name: filename, parents: [folderId] }
    var boundary = 'clinicai_boundary_' + Date.now()
    var delimiter = '--' + boundary
    var closeDelim = '\r\n--' + boundary + '--'
    var jsonText = await blob.text()
    var body =
      delimiter + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      delimiter + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      jsonText +
      closeDelim
    var res = await _api('POST', 'upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', body, {
      'Content-Type': 'multipart/related; boundary=' + boundary,
    })
    return await res.json()
  }

  // ── Hook no fluxo de backup ─────────────────────────────────
  // Intercepta doBackup do BackupScheduler e, se Drive conectado + enabled,
  // tambem espelha pra Drive.
  function _hookBackupScheduler() {
    if (!window.BackupScheduler || window.BackupScheduler._driveHooked) return
    var originalDoBackup = window.BackupScheduler.doBackup
    window.BackupScheduler.doBackup = async function (opts) {
      var result = await originalDoBackup.call(this, opts)
      if (result.ok && isConnected() && getConfig().enabled) {
        // Procura path do supabase-storage nos targets
        var storageTarget = (result.targets || []).find(function (t) { return t.type === 'supabase-storage' })
        if (storageTarget && window._sbShared) {
          try {
            var dl = await window._sbShared.storage.from('clinicai-backups').download(storageTarget.path)
            if (!dl.error) {
              var filename = storageTarget.path.split('/').slice(1).join('/')
              await mirrorFile(filename, dl.data)
              result.targets.push({ type: 'google-drive', filename: filename })
            }
          } catch (e) {
            result.errors = result.errors || []
            result.errors.push('drive-mirror: ' + (e && e.message || e))
          }
        }
      }
      return result
    }
    window.BackupScheduler._driveHooked = true
  }

  // ── UI section (embutida na pagina settings-backups) ───────
  function renderSection(el) {
    if (!el) return
    var c = getConfig()
    var connected = isConnected()
    var esc = function (s) { return String(s || '').replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] }) }

    if (!connected) {
      // Tenta detectar client ID ja configurado no meta tag (usado pelo Google Sign-In de login).
      var metaClientId = ''
      var metaTag = document.querySelector('meta[name="google-client-id"]')
      if (metaTag) metaClientId = (metaTag.getAttribute('content') || '').trim()
      var savedClientId = c.clientId || ''
      var defaultCid = savedClientId || metaClientId

      el.innerHTML =
        '<h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Espelhamento Google Drive (opcional)</h2>' +
        '<p style="color:#6B7280;font-size:12px;margin:0 0 12px">Após cada backup no Supabase Storage, uma cópia também vai pra pasta no seu Google Drive. Redundância extra caso o Supabase fique indisponível.</p>' +
        (metaClientId
          ? '<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:6px;padding:10px;font-size:12px;color:#065F46;margin-bottom:12px">' +
            '  <strong>✓ Client ID detectado</strong> — o mesmo usado pelo login da clínica (<code style="font-size:11px">' + esc(metaClientId.slice(0, 20)) + '…</code>). Pode conectar direto.<br>' +
            '  <span style="color:#6B7280;font-size:11px">⚠️ Pre-requisito: o scope <code>drive.file</code> precisa estar adicionado ao OAuth Consent Screen desse Client ID no <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" style="color:#065F46;text-decoration:underline">Google Cloud Console</a>. Se não estiver, o popup do Google vai dar erro de scope — aí adicione lá e tenta de novo.</span>' +
            '</div>'
          : '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:10px;font-size:12px;color:#78350F;margin-bottom:12px">' +
            '  Requer <strong>Google OAuth Client ID</strong>. Crie no <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#78350F;text-decoration:underline">Google Cloud Console</a> → Credentials → Create OAuth Client ID → Web application. JS origins: <code>' + esc(location.origin) + '</code>' +
            '</div>'
        ) +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '  <input type="text" id="drv-cid" placeholder="Google Client ID (termina com .apps.googleusercontent.com)" value="' + esc(defaultCid) + '" style="flex:1;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;font-family:monospace">' +
        '  <button id="drv-connect" style="background:#4285F4;color:#FFF;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap">Conectar Drive</button>' +
        '</div>' +
        '<div id="drv-status" style="margin-top:8px;font-size:12px"></div>'
      document.getElementById('drv-connect').onclick = async function () {
        var cid = document.getElementById('drv-cid').value.trim()
        var st = document.getElementById('drv-status')
        if (!cid) { st.innerHTML = '<span style="color:#EF4444">Cole o Client ID primeiro.</span>'; return }
        st.innerHTML = '<span style="color:#6B7280">Abrindo popup de consentimento do Google…</span>'
        try {
          await connect(cid)
          _hookBackupScheduler()
          st.innerHTML = '<span style="color:#10B981">✓ Conectado. Pasta criada: clinicai-backups</span>'
          setTimeout(function () { renderSection(el) }, 1000)
        } catch (e) {
          var msg = e && e.message || String(e)
          // Mensagem amigavel pra scope error
          if (/scope|access_denied|invalid_scope/i.test(msg)) {
            msg = '✗ Scope drive.file não autorizado no OAuth Consent Screen. Vá em Google Cloud Console → OAuth consent → Edit app → Scopes → Add → procure por "drive.file" → Save. Depois tenta conectar de novo.'
          }
          st.innerHTML = '<span style="color:#EF4444">' + esc(msg) + '</span>'
        }
      }
    } else {
      el.innerHTML =
        '<h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Espelhamento Google Drive</h2>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">' +
        '  <div style="font-size:12px">' +
        '    <div style="color:#10B981;font-weight:600">✓ Conectado</div>' +
        '    <div style="color:#6B7280;margin-top:2px">Client ID: <span style="font-family:monospace;font-size:11px">' + esc((c.clientId || '').slice(0, 20)) + '…</span></div>' +
        '    <div style="color:#6B7280">Pasta: <span style="font-family:monospace;font-size:11px">' + esc(c.folderId || '—') + '</span></div>' +
        '  </div>' +
        '  <div style="display:flex;gap:6px">' +
        '    <button id="drv-test" style="background:#FFF;color:#374151;border:1px solid #E5E7EB;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px">Listar arquivos</button>' +
        '    <button id="drv-disconnect" style="background:transparent;color:#EF4444;border:1px solid transparent;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px">Desconectar</button>' +
        '  </div>' +
        '</div>' +
        '<div id="drv-files" style="font-size:11px;color:#6B7280"></div>'
      document.getElementById('drv-test').onclick = async function () {
        var f = document.getElementById('drv-files')
        f.innerHTML = 'Listando…'
        try {
          var files = await listFiles()
          if (!files.length) { f.innerHTML = '(pasta vazia — ainda não foi espelhado nada)'; return }
          f.innerHTML = '<strong>' + files.length + ' arquivo(s):</strong><br>' +
            files.slice(0, 10).map(function (ff) {
              return '<span style="font-family:monospace;font-size:11px">' + esc(ff.name) + '</span> · ' + (ff.size ? (Math.round(ff.size / 1024) + ' KB') : '—') + ' · ' + new Date(ff.createdTime).toLocaleString('pt-BR')
            }).join('<br>')
        } catch (e) {
          f.innerHTML = '<span style="color:#EF4444">Erro: ' + esc(e && e.message || e) + '</span>'
        }
      }
      document.getElementById('drv-disconnect').onclick = function () {
        if (!confirm('Desconectar do Drive? O espelhamento para até você reconectar.')) return
        disconnect()
        renderSection(el)
      }
      // ativa o hook se ainda nao
      _hookBackupScheduler()
    }
  }

  // ── Expose ──────────────────────────────────────────────────
  window.GoogleDriveBackup = {
    getConfig: getConfig,
    isConnected: isConnected,
    connect: connect,
    disconnect: disconnect,
    mirrorFile: mirrorFile,
    listFiles: listFiles,
    findOrCreateFolder: findOrCreateFolder,
    renderSection: renderSection,
  }

  // Ativa hook quando BackupScheduler carregar (ordem de script pode variar)
  if (window.BackupScheduler) _hookBackupScheduler()
  else {
    // Retry ate 10x (5s)
    var tries = 0
    var iv = setInterval(function () {
      tries++
      if (window.BackupScheduler) { _hookBackupScheduler(); clearInterval(iv) }
      else if (tries >= 10) clearInterval(iv)
    }, 500)
  }
})()
