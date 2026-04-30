;(function () {
  'use strict'
  if (window._clinicaiSheetsImportLoaded) return
  window._clinicaiSheetsImportLoaded = true

  var STORAGE_KEY = 'clinicai_sheets_url_fullface'
  var LAST_IMPORT = 'clinicai_sheets_last_import_fullface'

  function getUrl()       { return localStorage.getItem(STORAGE_KEY) || '' }
  function setUrl(url)    { localStorage.setItem(STORAGE_KEY, url.trim()) }
  function getLastImport(){ return localStorage.getItem(LAST_IMPORT) || null }

  /**
   * Importa leads da planilha Google para o kanban Full Face.
   * Retorna { ok, imported, skipped, error }
   */
  async function importFullFace(opts) {
    opts = opts || {}
    var url = opts.url || getUrl()

    if (!url) {
      return { ok: false, error: 'URL da planilha não configurada.' }
    }

    var res
    try {
      // JSONP via URL + parâmetro para evitar CORS
      var fetchUrl = url + (url.includes('?') ? '&' : '?') + 'callback=_clinicaiSheetsCallback&t=' + Date.now()
      var data = await _fetchJson(url)
      if (!data.ok) return { ok: false, error: data.error || 'Erro retornado pela planilha.' }
      res = data
    } catch (e) {
      return { ok: false, error: 'Falha ao buscar planilha: ' + e.message }
    }

    var leads      = res.leads || []
    var imported   = 0
    var skipped    = 0

    // Leads existentes (para deduplicar por telefone) via cache unificado
    var existing = []
    try { existing = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch(e) {}
    var existingPhones = new Set(existing.map(function(l) {
      return String(l.phone || l.whatsapp || l.telefone || '').replace(/\D/g, '')
    }).filter(Boolean))

    for (var i = 0; i < leads.length; i++) {
      var lead = leads[i]
      var phone = String(lead.phone || '').replace(/\D/g, '')

      if (!phone || existingPhones.has(phone)) {
        skipped++
        continue
      }

      // Gera ID único
      lead.id = crypto.randomUUID ? crypto.randomUUID() : _uid()

      // Garante campos obrigatórios
      if (!lead.created_at) lead.created_at = new Date().toISOString()
      if (!lead.status) lead.status = 'new'
      if (!lead.source_type) lead.source_type = 'import'
      if (window.normalizeLead) normalizeLead(lead)

      // Persiste localStorage + sincroniza Supabase
      if (typeof _syncLeadToCache === 'function') {
        _syncLeadToCache(lead)
      } else if (window.LeadsService) {
        // Fallback: grava direto (mantendo timestamp LWW via store.set se disponivel)
        existing.push(lead)
        if (window.store && typeof window.store.set === 'function') {
          window.store.set('clinicai_leads', existing)
        } else {
          localStorage.setItem('clinicai_leads', JSON.stringify(existing))
        }
        window.LeadsService.syncOne(lead)
      }

      // Atribui tag "Lead Novo" (fire-and-forget)
      if (window.SdrService) {
        window.SdrService.assignTag('lead_novo', 'lead', lead.id).catch(function(e) { console.warn("[sheets-import.service]", e.message || e) })
      }

      existingPhones.add(phone)
      imported++
    }

    localStorage.setItem(LAST_IMPORT, new Date().toISOString())

    return { ok: true, imported: imported, skipped: skipped, total: leads.length }
  }

  async function _fetchJson(url) {
    var r = await fetch(url, { mode: 'cors' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.json()
  }

  function _uid() {
    return 'gs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
  }

  window.SheetsImportService = Object.freeze({
    importFullFace: importFullFace,
    getUrl:         getUrl,
    setUrl:         setUrl,
    getLastImport:  getLastImport,
  })
})()
