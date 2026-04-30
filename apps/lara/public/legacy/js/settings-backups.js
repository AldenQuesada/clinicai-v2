/**
 * ClinicAI — Settings > Backups
 *
 * Sistema de backup automatico tenant-safe em 3 camadas:
 *   1. Supabase Storage (primario) — bucket clinicai-backups, RLS por clinic_id
 *   2. Webhook externo (opcional) — n8n/Zapier pra espelhamento
 *   3. Download local (fallback) — se primeiros falharem, baixa JSON
 *
 * Escopo do backup:
 *   - localStorage completo (exceto chaves do proprio backup)
 *   - Dump JSONB de todas tabelas tenant-scoped via RPC clinic_backup_snapshot()
 *
 * Tenant isolation garantido em 3 camadas:
 *   - Path: <clinic_id>/<timestamp>-<name>.json (cliente monta)
 *   - Storage RLS: authenticated user so ve/escreve folder do seu app_clinic_id()
 *   - RPC snapshot: SECURITY DEFINER filtra por app_clinic_id() em cada tabela
 *
 * API publica:
 *   window.renderSettingsBackups()        — pagina settings-backups
 *   window.BackupScheduler.doBackup()     — dispara backup manual
 *   window.BackupScheduler.listBackups()  — lista arquivos do Storage
 *   window.BackupScheduler.getConfig()    — le config salva
 */
;(function () {
  'use strict'

  if (window.BackupScheduler) return

  var CFG_KEY = '_clinicai_backup_config'
  var LAST_KEY = '_clinicai_last_backup_at'
  var BUCKET = 'clinicai-backups'
  var DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12h

  var _timer = null

  // ── SB client ───────────────────────────────────────────────
  function _sb() { return window._sbShared || null }

  function _getClinicId() {
    // 1. ClinicStorage (fonte canonica — tem fallback pra profile/auth/default)
    try {
      if (window.ClinicStorage && typeof window.ClinicStorage.clinicId === 'function') {
        var c = window.ClinicStorage.clinicId()
        if (c) return String(c)
      }
    } catch (_) {}
    // 2. sessionStorage profile (fallback se ClinicStorage nao carregou)
    try {
      var profile = sessionStorage.getItem('clinicai_profile')
      if (profile) {
        var parsed = JSON.parse(profile)
        if (parsed && parsed.clinic_id) return String(parsed.clinic_id)
      }
    } catch (_) {}
    // 3. ClinicAuth direto
    try {
      if (window.ClinicAuth && typeof window.ClinicAuth.getClinicId === 'function') {
        var ca = window.ClinicAuth.getClinicId()
        if (ca) return String(ca)
      }
    } catch (_) {}
    return null
  }

  // ── Config ──────────────────────────────────────────────────
  function getConfig() {
    try {
      var raw = localStorage.getItem(CFG_KEY)
      if (!raw) return { enabled: false, intervalMs: DEFAULT_INTERVAL_MS, webhookUrl: '', includeSupabase: true }
      var c = JSON.parse(raw)
      return {
        enabled: !!c.enabled,
        intervalMs: typeof c.intervalMs === 'number' && c.intervalMs >= 60000 ? c.intervalMs : DEFAULT_INTERVAL_MS,
        webhookUrl: typeof c.webhookUrl === 'string' ? c.webhookUrl : '',
        includeSupabase: c.includeSupabase !== false, // default true
      }
    } catch (e) {
      return { enabled: false, intervalMs: DEFAULT_INTERVAL_MS, webhookUrl: '', includeSupabase: true }
    }
  }
  function setConfig(patch) {
    var cur = getConfig()
    var next = Object.assign({}, cur, patch || {})
    localStorage.setItem(CFG_KEY, JSON.stringify(next))
    _restartScheduler()
    return next
  }

  // ── Snapshot collection ─────────────────────────────────────
  function _collectLocalStorage() {
    var storage = {}
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i)
      if (k === LAST_KEY || k === CFG_KEY) continue
      storage[k] = localStorage.getItem(k)
    }
    return storage
  }

  async function _collectSupabaseData() {
    var sb = _sb()
    if (!sb) return { _error: 'supabase client nao disponivel' }
    try {
      var res = await sb.rpc('clinic_backup_snapshot')
      if (res.error) return { _error: res.error.message }
      return res.data
    } catch (e) {
      return { _error: e && e.message || String(e) }
    }
  }

  async function _buildSnapshot(opts) {
    opts = opts || {}
    var cfg = getConfig()
    var clinicId = _getClinicId() || 'default'
    var ts = new Date().toISOString()
    var payload = {
      _meta: {
        schema: 'clinicai-backup/v2',
        origin: location.origin,
        timestamp: ts,
        url: location.href,
        userAgent: navigator.userAgent,
        clinicId: clinicId,
      },
      localStorage: _collectLocalStorage(),
    }
    if (cfg.includeSupabase && !opts.skipSupabase) {
      payload.supabase = await _collectSupabaseData()
    }
    payload._meta.localStorageKeys = Object.keys(payload.localStorage).length
    payload._meta.supabaseIncluded = cfg.includeSupabase && !opts.skipSupabase && payload.supabase && !payload.supabase._error
    return payload
  }

  // ── Upload ──────────────────────────────────────────────────
  async function _uploadToStorage(payload) {
    var sb = _sb()
    if (!sb) throw new Error('Supabase client nao disponivel (faca login)')
    var clinicId = payload._meta.clinicId
    if (!clinicId || clinicId === 'default') throw new Error('clinic_id ausente — nao vai upload sem tenant identificado')

    var json = JSON.stringify(payload)
    var ts = payload._meta.timestamp.replace(/[:.]/g, '-')
    var filename = ts + '-clinicai-backup.json'
    var path = clinicId + '/' + filename
    var blob = new Blob([json], { type: 'application/json' })

    var up = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: 'application/json',
      upsert: false,
    })
    if (up.error) throw new Error('Storage upload: ' + up.error.message)

    // Log via RPC (opcional — se falhar nao rollback do upload)
    try {
      await sb.rpc('clinic_backup_log_record', {
        p_label: payload._meta.supabaseIncluded ? 'full' : 'localstorage',
        p_storage_path: path,
        p_size_bytes: blob.size,
      })
    } catch (e) {
      console.warn('[backup] log_record falhou:', e && e.message)
    }

    return { path: path, sizeBytes: blob.size, filename: filename }
  }

  async function _fireWebhook(payload, webhookUrl) {
    var res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('Webhook HTTP ' + res.status)
    return true
  }

  function _triggerDownload(payload) {
    var json = JSON.stringify(payload, null, 2)
    var ts = payload._meta.timestamp.replace(/[:.]/g, '-')
    var filename = 'clinicai-backup-' + (payload._meta.clinicId || 'unknown') + '-' + ts + '.json'
    var blob = new Blob([json], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return filename
  }

  async function doBackup(opts) {
    opts = opts || {}
    var cfg = getConfig()
    var result = { ok: false, targets: [], errors: [], timestamp: null, sizeKb: 0 }

    var payload
    try {
      payload = await _buildSnapshot(opts)
      result.timestamp = payload._meta.timestamp
      result.sizeKb = Math.round(JSON.stringify(payload).length / 1024 * 10) / 10
    } catch (e) {
      result.errors.push('snapshot: ' + (e && e.message || e))
      return result
    }

    // 1. Supabase Storage (primario)
    if (!opts.skipStorage) {
      try {
        var up = await _uploadToStorage(payload)
        result.targets.push({ type: 'supabase-storage', path: up.path, sizeBytes: up.sizeBytes })
        result.ok = true
      } catch (e) {
        result.errors.push('storage: ' + (e && e.message || e))
      }
    }

    // 2. Webhook externo (opcional — roda adicionalmente se configurado)
    if (cfg.webhookUrl) {
      try {
        await _fireWebhook(payload, cfg.webhookUrl)
        result.targets.push({ type: 'webhook', url: cfg.webhookUrl })
      } catch (e) {
        result.errors.push('webhook: ' + (e && e.message || e))
      }
    }

    // 3. Download local (forcado ou fallback se tudo acima falhou)
    if (opts.forceDownload || (!result.ok && result.targets.length === 0)) {
      try {
        var fn = _triggerDownload(payload)
        result.targets.push({ type: 'download', filename: fn })
        result.ok = true
      } catch (e) {
        result.errors.push('download: ' + (e && e.message || e))
      }
    }

    if (result.ok) localStorage.setItem(LAST_KEY, result.timestamp)

    try {
      var page = document.getElementById('page-settings-backups')
      if (page && page.classList.contains('active')) renderSettingsBackups()
    } catch (_) {}

    return result
  }

  // ── List / Restore ──────────────────────────────────────────
  async function listBackups() {
    var sb = _sb()
    if (!sb) return { ok: false, error: 'cliente supabase indisponivel' }
    var clinicId = _getClinicId()
    if (!clinicId) return { ok: false, error: 'clinic_id ausente' }
    var res = await sb.storage.from(BUCKET).list(clinicId, {
      limit: 30,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, files: res.data || [] }
  }

  async function downloadBackup(path) {
    var sb = _sb()
    if (!sb) throw new Error('cliente supabase indisponivel')
    var res = await sb.storage.from(BUCKET).download(path)
    if (res.error) throw new Error(res.error.message)
    return res.data // Blob
  }

  async function restoreFromStorage(path, opts) {
    opts = opts || {}
    var blob = await downloadBackup(path)
    var text = await blob.text()
    var payload = JSON.parse(text)
    return _applyRestore(payload, opts)
  }

  async function restoreFromFile(file, opts) {
    opts = opts || {}
    var text = await new Promise(function (resolve, reject) {
      var r = new FileReader()
      r.onload = function (e) { resolve(e.target.result) }
      r.onerror = function (e) { reject(e) }
      r.readAsText(file)
    })
    var payload = JSON.parse(text)
    return _applyRestore(payload, opts)
  }

  function _applyRestore(payload, opts) {
    var result = { localStorageKeys: 0, supabaseSkipped: true }
    var ls = payload.localStorage || payload.storage || null
    if (!ls || typeof ls !== 'object') throw new Error('formato invalido — localStorage ausente')
    if (!opts.skipLocalStorage) {
      Object.keys(ls).forEach(function (k) { localStorage.setItem(k, ls[k]) })
      result.localStorageKeys = Object.keys(ls).length
    }
    // Restore de Supabase NAO eh feito automatico — risco alto de sobrescrever prod
    // O usuario deve importar manual via Supabase SQL Editor se precisar
    return result
  }

  // ── Scheduler ───────────────────────────────────────────────
  function _tick() {
    var cfg = getConfig()
    if (!cfg.enabled) return
    if (!_sb()) return // aguarda cliente supabase carregar
    var lastStr = localStorage.getItem(LAST_KEY)
    var last = lastStr ? new Date(lastStr).getTime() : 0
    var elapsed = Date.now() - last
    if (elapsed >= cfg.intervalMs) {
      doBackup().catch(function (e) { console.warn('[backup] tick falhou:', e) })
    }
  }
  function _startScheduler() {
    if (_timer) return
    _timer = setInterval(_tick, 5 * 60 * 1000)
    setTimeout(_tick, 30 * 1000)
  }
  function _stopScheduler() {
    if (_timer) { clearInterval(_timer); _timer = null }
  }
  function _restartScheduler() {
    _stopScheduler()
    var cfg = getConfig()
    if (cfg.enabled) _startScheduler()
  }

  // ── UI helpers ──────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function _formatDateTime(iso) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch (_) { return iso }
  }
  function _formatSize(bytes) {
    if (bytes == null) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  // ── Main render ─────────────────────────────────────────────
  async function renderSettingsBackups() {
    var page = document.getElementById('page-settings-backups')
    if (!page) return

    var cfg = getConfig()
    var last = localStorage.getItem(LAST_KEY)
    var clinicId = _getClinicId() || '—'
    var sbReady = !!_sb()
    var nextScheduled = '—'
    if (cfg.enabled && last) {
      var next = new Date(last).getTime() + cfg.intervalMs
      nextScheduled = _formatDateTime(new Date(next).toISOString())
    } else if (cfg.enabled) {
      nextScheduled = 'ao abrir (30s)'
    }

    page.innerHTML = [
      '<div style="max-width:980px;margin:0 auto;padding:24px">',
      '  <h1 style="font-size:22px;margin:0 0 4px">Backups</h1>',
      '  <p style="color:#6B7280;margin:0 0 24px;font-size:13px">Backup automático criptografado dos dados da clínica — localStorage do navegador + snapshot completo do Supabase (leads, agendas, pacientes, FM, magazine, LPs, etc.). Tenant isolation garantido server-side.</p>',

      // Status
      '  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:16px">',
      '    <h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Status</h2>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">',
      '      <div><strong>Clinic ID:</strong> <span style="font-family:monospace;font-size:11px;color:#6B7280">' + _esc(clinicId) + '</span></div>',
      '      <div><strong>Cliente Supabase:</strong> ' + (sbReady ? '<span style="color:#10B981">✓ pronto</span>' : '<span style="color:#EF4444">✗ não carregou</span>') + '</div>',
      '      <div><strong>Último backup:</strong> ' + _formatDateTime(last) + '</div>',
      '      <div><strong>Próximo:</strong> ' + _esc(nextScheduled) + '</div>',
      '      <div><strong>Auto-backup:</strong> ' + (cfg.enabled ? '<span style="color:#10B981">✓ ligado</span>' : '<span style="color:#EF4444">○ desligado</span>') + '</div>',
      '      <div><strong>Inclui Supabase:</strong> ' + (cfg.includeSupabase ? '<span style="color:#10B981">✓ sim</span>' : '<span style="color:#F59E0B">○ só localStorage</span>') + '</div>',
      '    </div>',
      '  </div>',

      // Actions
      '  <div style="background:#FFF;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:16px">',
      '    <h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Ações</h2>',
      '    <div style="display:flex;gap:8px;flex-wrap:wrap">',
      '      <button id="bkp-run-now" style="background:#7C3AED;color:#FFF;border:0;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Fazer backup agora</button>',
      '      <button id="bkp-download" style="background:#FFF;color:#374151;border:1px solid #E5E7EB;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:13px">Baixar JSON local</button>',
      '      <button id="bkp-restore-file" style="background:#FFF;color:#374151;border:1px solid #E5E7EB;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:13px">Restaurar de arquivo…</button>',
      '      <button id="bkp-refresh" style="background:transparent;color:#7C3AED;border:1px solid transparent;padding:10px 8px;border-radius:6px;cursor:pointer;font-size:13px">Atualizar lista</button>',
      '    </div>',
      '    <div id="bkp-status-msg" style="margin-top:12px;font-size:12px;min-height:18px"></div>',
      '  </div>',

      // Config
      '  <div style="background:#FFF;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:16px">',
      '    <h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Configuração</h2>',
      '    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">',
      '      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">',
      '        <input type="checkbox" id="bkp-cfg-enabled" ' + (cfg.enabled ? 'checked' : '') + ' style="width:16px;height:16px">',
      '        <span>Ligar auto-backup (dispara enquanto o dashboard estiver aberto)</span>',
      '      </label>',
      '      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">',
      '        <input type="checkbox" id="bkp-cfg-include-sb" ' + (cfg.includeSupabase ? 'checked' : '') + ' style="width:16px;height:16px">',
      '        <span>Incluir dados do Supabase (leads, pacientes, FM, magazine, LPs…) no backup</span>',
      '      </label>',
      '      <div>',
      '        <label style="display:block;margin-bottom:6px;color:#6B7280">Intervalo</label>',
      '        <select id="bkp-cfg-interval" style="padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;min-width:240px">',
      '          <option value="3600000" ' + (cfg.intervalMs === 3600000 ? 'selected' : '') + '>A cada 1 hora</option>',
      '          <option value="21600000" ' + (cfg.intervalMs === 21600000 ? 'selected' : '') + '>A cada 6 horas</option>',
      '          <option value="43200000" ' + (cfg.intervalMs === 43200000 ? 'selected' : '') + '>A cada 12 horas (recomendado)</option>',
      '          <option value="86400000" ' + (cfg.intervalMs === 86400000 ? 'selected' : '') + '>Diário (24h)</option>',
      '          <option value="604800000" ' + (cfg.intervalMs === 604800000 ? 'selected' : '') + '>Semanal (7 dias)</option>',
      '        </select>',
      '      </div>',
      '      <div>',
      '        <label style="display:block;margin-bottom:6px;color:#6B7280">Webhook externo (opcional — espelha o backup pra Zapier/n8n/Drive)</label>',
      '        <input type="text" id="bkp-cfg-webhook" value="' + _esc(cfg.webhookUrl) + '" placeholder="https://… (opcional)" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;font-family:monospace">',
      '      </div>',
      '      <div id="bkp-cfg-saved" style="font-size:11px;color:#6B7280">Mudanças salvam automaticamente.</div>',
      '    </div>',
      '  </div>',

      // Drive section (placeholder — will be filled by drive integration module)
      '  <div id="bkp-drive-section" style="background:#FFF;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:16px">',
      '    <h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Espelhamento Google Drive</h2>',
      '    <p style="color:#6B7280;font-size:12px;margin:0">Aguardando módulo de integração Drive carregar…</p>',
      '  </div>',

      // History from Storage
      '  <div style="background:#FFF;border:1px solid #E5E7EB;border-radius:8px;padding:16px">',
      '    <h2 style="font-size:14px;margin:0 0 12px;font-weight:600">Backups no Supabase Storage</h2>',
      '    <div id="bkp-history-list" style="font-size:12px;color:#9CA3AF">Carregando…</div>',
      '  </div>',
      '</div>',
    ].join('\n')

    // ── Bindings ──────────────────────────────────────────────
    var statusEl = document.getElementById('bkp-status-msg')
    function _setStatus(msg, color) {
      if (!statusEl) return
      statusEl.innerHTML = '<span style="color:' + (color || '#374151') + '">' + _esc(msg) + '</span>'
    }

    document.getElementById('bkp-run-now').onclick = async function () {
      _setStatus('Gerando snapshot e enviando…', '#6B7280')
      this.disabled = true
      var r = await doBackup()
      this.disabled = false
      if (r.ok) {
        var dest = r.targets.map(function (t) { return t.type }).join(', ')
        _setStatus('✓ Backup concluído — ' + r.sizeKb + ' KB · destino: ' + dest + (r.errors.length ? ' (com ' + r.errors.length + ' erro(s): ' + r.errors.join('; ') + ')' : ''), '#10B981')
      } else {
        _setStatus('✗ Falhou: ' + (r.errors.join(' | ') || 'erro desconhecido'), '#EF4444')
      }
      setTimeout(renderSettingsBackups, 1500)
    }

    document.getElementById('bkp-download').onclick = async function () {
      _setStatus('Gerando download local…', '#6B7280')
      var r = await doBackup({ forceDownload: true, skipStorage: true })
      _setStatus(r.ok ? '✓ Download iniciado' : '✗ ' + r.errors.join(' | '), r.ok ? '#10B981' : '#EF4444')
    }

    document.getElementById('bkp-restore-file').onclick = function () {
      if (!confirm('Restaurar vai SOBRESCREVER o localStorage atual. O dump Supabase NÃO é restaurado automaticamente (segurança). Continuar?')) return
      var input = document.createElement('input')
      input.type = 'file'; input.accept = '.json'
      input.onchange = async function (e) {
        var f = e.target.files[0]
        if (!f) return
        try {
          var r = await restoreFromFile(f)
          _setStatus('✓ Restaurado ' + r.localStorageKeys + ' chaves do localStorage. Recarregue (F5).', '#10B981')
        } catch (err) {
          _setStatus('✗ ' + (err && err.message || err), '#EF4444')
        }
      }
      input.click()
    }

    document.getElementById('bkp-refresh').onclick = renderSettingsBackups

    // Auto-save em cada mudança (sem botão Salvar separado — evita perder alterações)
    var savedEl = document.getElementById('bkp-cfg-saved')
    var savedFlashTimer = null
    function _flashSaved() {
      if (!savedEl) return
      savedEl.innerHTML = '<span style="color:#10B981">✓ salvo</span>'
      if (savedFlashTimer) clearTimeout(savedFlashTimer)
      savedFlashTimer = setTimeout(function () {
        savedEl.innerHTML = 'Mudanças salvam automaticamente.'
        savedEl.style.color = '#6B7280'
      }, 1500)
    }
    function _saveFromInputs() {
      setConfig({
        enabled: document.getElementById('bkp-cfg-enabled').checked,
        intervalMs: parseInt(document.getElementById('bkp-cfg-interval').value, 10) || DEFAULT_INTERVAL_MS,
        webhookUrl: document.getElementById('bkp-cfg-webhook').value.trim(),
        includeSupabase: document.getElementById('bkp-cfg-include-sb').checked,
      })
      _flashSaved()
    }
    document.getElementById('bkp-cfg-enabled').onchange    = _saveFromInputs
    document.getElementById('bkp-cfg-include-sb').onchange = _saveFromInputs
    document.getElementById('bkp-cfg-interval').onchange   = _saveFromInputs
    // Webhook: salva só no blur OU após pause de 800ms digitando
    var webhookEl = document.getElementById('bkp-cfg-webhook')
    var webhookTimer = null
    webhookEl.addEventListener('input', function () {
      if (webhookTimer) clearTimeout(webhookTimer)
      webhookTimer = setTimeout(_saveFromInputs, 800)
    })
    webhookEl.addEventListener('blur', function () {
      if (webhookTimer) { clearTimeout(webhookTimer); webhookTimer = null }
      _saveFromInputs()
    })

    // Carrega histórico do Storage
    var histEl = document.getElementById('bkp-history-list')
    listBackups().then(function (r) {
      if (!r.ok) {
        histEl.innerHTML = '<span style="color:#EF4444">Erro ao listar: ' + _esc(r.error) + '</span>'
        return
      }
      if (!r.files.length) {
        histEl.innerHTML = '<span style="color:#9CA3AF">Nenhum backup no Storage ainda. Faça o primeiro clicando em "Fazer backup agora".</span>'
        return
      }
      histEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;border-bottom:1px solid #E5E7EB"><th style="padding:6px 0">Arquivo</th><th>Data</th><th>Tamanho</th><th style="text-align:right">Ações</th></tr></thead><tbody>' +
        r.files.map(function (f) {
          var created = f.created_at || (f.metadata && f.metadata.lastModified) || null
          var size = f.metadata && f.metadata.size
          return '<tr style="border-bottom:1px solid #F3F4F6"><td style="padding:6px 0;font-family:monospace;font-size:11px">' + _esc(f.name) + '</td><td>' + _formatDateTime(created) + '</td><td>' + _formatSize(size) + '</td><td style="text-align:right"><button data-path="' + _esc(clinicId + '/' + f.name) + '" class="bkp-restore-row" style="background:transparent;color:#7C3AED;border:0;cursor:pointer;font-size:11px;padding:2px 6px">Restaurar</button></td></tr>'
        }).join('') + '</tbody></table>'
      // bind rest
      Array.prototype.slice.call(document.querySelectorAll('.bkp-restore-row')).forEach(function (btn) {
        btn.onclick = async function () {
          var path = btn.dataset.path
          if (!confirm('Restaurar ' + path + '? Vai SOBRESCREVER o localStorage atual.')) return
          _setStatus('Baixando e restaurando…', '#6B7280')
          try {
            var rr = await restoreFromStorage(path)
            _setStatus('✓ Restaurado ' + rr.localStorageKeys + ' chaves. Recarregue (F5).', '#10B981')
          } catch (e) {
            _setStatus('✗ ' + (e && e.message || e), '#EF4444')
          }
        }
      })
    })

    // Drive section (se modulo carregado)
    if (window.GoogleDriveBackup && typeof window.GoogleDriveBackup.renderSection === 'function') {
      window.GoogleDriveBackup.renderSection(document.getElementById('bkp-drive-section'))
    }
  }

  // ── Boot ────────────────────────────────────────────────────
  window.BackupScheduler = {
    getConfig: getConfig,
    setConfig: setConfig,
    doBackup: doBackup,
    listBackups: listBackups,
    downloadBackup: downloadBackup,
    restoreFromStorage: restoreFromStorage,
    restoreFromFile: restoreFromFile,
  }
  window.renderSettingsBackups = renderSettingsBackups

  if (getConfig().enabled) _startScheduler()
})()
