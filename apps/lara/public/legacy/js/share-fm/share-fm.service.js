/**
 * ClinicAI - Share FM Service
 *
 * Camada de dados: storage upload + RPCs + signed URL helpers.
 *
 * Nao faz UI nem orquestracao de fluxo (delegado ao engine).
 *
 * Expoe window.ShareFmService:
 *   generateToken()                  -> string base64url 32 bytes
 *   uploadPhoto(blob, sharePath)     -> Promise<storagePath>
 *   createShare(payload)             -> Promise<{ id, token, expires_at }>
 *   resolveByToken(token)            -> Promise<shareData|null>
 *   revoke(id, reason)               -> Promise<{ before_path, after_path }>
 *   list(filters)                    -> Promise<Array>
 *   signedUrl(path)                  -> Promise<string>
 *   deleteStorageObjects(paths)      -> Promise<void>
 *   shortenUrl(longUrl, code, title) -> Promise<{ shortUrl, code }>
 */
;(function () {
  'use strict'
  if (window._shareFmServiceLoaded) return
  window._shareFmServiceLoaded = true

  function _sb() { return window._sbShared || window.supabaseClient || null }
  function _cfg() { return window.ShareFmConfig }

  // Token URL-safe 32 bytes (256 bits). base64url sem padding.
  function _generateToken() {
    var arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    var bin = ''
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
    var b64 = btoa(bin)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function _uploadPhoto(blob, storagePath) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.storage.from(_cfg().BUCKET).upload(storagePath, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    }).then(function (res) {
      if (res.error) throw res.error
      return storagePath
    })
  }

  function _signedUrl(storagePath) {
    var sb = _sb()
    if (!sb || !storagePath) return Promise.resolve(null)
    return sb.storage.from(_cfg().BUCKET).createSignedUrl(storagePath, _cfg().SIGNED_URL_TTL_SEC)
      .then(function (res) {
        if (res.error) { console.warn('[ShareFm] signedUrl error:', res.error); return null }
        return res.data && res.data.signedUrl
      })
  }

  function _deleteObjects(paths) {
    var sb = _sb()
    var clean = (paths || []).filter(Boolean)
    if (!sb || !clean.length) return Promise.resolve()
    return sb.storage.from(_cfg().BUCKET).remove(clean).then(function (res) {
      // LGPD: error precisa ser propagado pro engine poder retry + enqueue.
      // Ver case-gallery-share.md C4.
      if (res.error) {
        console.warn('[ShareFm] delete storage error:', res.error)
        throw res.error
      }
      return res.data
    })
  }

  function _createShare(payload) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('fm_share_create', {
      p_token:                 payload.token,
      p_lead_id:               payload.leadId,
      p_lead_name:             payload.leadName || null,
      p_clinic_name:           payload.clinicName || null,
      p_professional_name:     payload.professionalName || null,
      p_procedure_label:       payload.procedureLabel || null,
      p_source_appointment_id: payload.sourceAppointmentId || null,
      p_before_photo_path:     payload.beforePhotoPath || null,
      p_after_photo_path:      payload.afterPhotoPath || null,
      p_metrics:               payload.metrics || {},
      p_analysis_text:         payload.analysisText || null,
      p_cta_phone:             payload.ctaPhone || null,
      p_ttl_days:              payload.ttlDays || _cfg().DEFAULT_TTL_DAYS,
      p_consent_text:          payload.consentText,
    }).then(function (res) {
      if (res.error) throw res.error
      return res.data
    })
  }

  function _resolveByToken(token) {
    var sb = _sb()
    if (!sb) return Promise.resolve(null)
    return sb.rpc('fm_share_resolve', {
      p_token:      token,
      p_user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : null),
      p_ip_hash:    null,  // sem IP cru aqui — o trigger no banco poderia hash, mas nao bloqueia
    }).then(function (res) {
      if (res.error) { console.warn('[ShareFm] resolve error:', res.error); return null }
      return res.data
    })
  }

  function _revoke(id, reason) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('fm_share_revoke', {
      p_id:      id,
      p_reason:  reason || 'manual',
      p_user_id: null,
    }).then(function (res) {
      if (res.error) throw res.error
      return res.data
    })
  }

  function _list(filters) {
    var sb = _sb()
    if (!sb) return Promise.resolve([])
    filters = filters || {}
    return sb.rpc('fm_share_list', {
      p_lead_id: filters.leadId || null,
      p_status:  filters.status || null,
    }).then(function (res) {
      if (res.error) { console.warn('[ShareFm] list error:', res.error); return [] }
      return Array.isArray(res.data) ? res.data : []
    }).catch(function () { return [] })
  }

  // Encurta URL via short_link_create. Reutiliza tabela existente (opcao C).
  function _shortenUrl(longUrl, code, title) {
    var sb = _sb()
    if (!sb) return Promise.resolve({ shortUrl: longUrl, code: null })
    return sb.rpc('short_link_create', {
      p_code:  code,
      p_url:   longUrl,
      p_title: title || 'Compartilhamento de analise facial',
      p_pixels: {},
    }).then(function (res) {
      if (res.error) {
        console.warn('[ShareFm] shorten error:', res.error)
        return { shortUrl: longUrl, code: null }
      }
      // Mesma logica do publicBaseUrl — short link tem que apontar para
      // dominio publico mesmo em localhost (paciente abre no celular).
      var cfg = window.ShareFmConfig
      var origin = (cfg && cfg.publicBaseUrl) ? cfg.publicBaseUrl() : window.location.origin
      return { shortUrl: origin + '/r.html?c=' + code, code: code }
    }).catch(function (e) {
      console.warn('[ShareFm] shorten catch:', e)
      return { shortUrl: longUrl, code: null }
    })
  }

  window.ShareFmService = {
    generateToken:        _generateToken,
    uploadPhoto:          _uploadPhoto,
    createShare:          _createShare,
    resolveByToken:       _resolveByToken,
    revoke:               _revoke,
    list:                 _list,
    signedUrl:            _signedUrl,
    deleteStorageObjects: _deleteObjects,
    shortenUrl:           _shortenUrl,
  }
})()
