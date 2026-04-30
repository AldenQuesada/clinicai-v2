/**
 * ClinicAI - Share FM Engine
 *
 * Orquestra o fluxo de criacao de link compartilhavel:
 *   1. Mostra modal de consent (LGPD)
 *   2. Captura fotos como blobs (a partir do canvas/blob URL atual do FM)
 *   3. Upload para Supabase Storage (bucket facial-shares)
 *   4. fm_share_create RPC com snapshots de dados
 *   5. Encurta a URL via short_link_create
 *   6. Mostra modal de resultado com link + copy + envio WA
 *
 * Fire-and-forget — nunca quebra a pagina chamadora.
 *
 * Expoe window.ShareFmEngine:
 *   start({ leadId, leadName, leadPhone, clinicName, professionalName,
 *           procedureLabel, sourceAppointmentId, beforeBlob, afterBlob,
 *           metrics, analysisText })
 */
;(function () {
  'use strict'
  if (window._shareFmEngineLoaded) return
  window._shareFmEngineLoaded = true

  function _toast(msg, type) {
    if (window.toast) return window.toast(msg, type || 'info')
    if (window.showToast) return window.showToast(msg, type || 'info')
    console.log('[ShareFm]', type, msg)
  }

  function _whatsappLink(phone, message) {
    if (!phone) return null
    var p = String(phone).replace(/\D/g, '')
    if (!p) return null
    if (p.length === 10 || p.length === 11) p = '55' + p  // BR default
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(message)
  }

  // Retry helper: tenta deletar storage 3x com backoff exponencial (150ms, 450ms, 1350ms).
  // Retorna Promise<boolean> — true se alguma tentativa foi bem-sucedida.
  function _retryStorageDelete(paths, maxAttempts) {
    var attempts = Math.max(1, maxAttempts || 3)
    function attempt(n) {
      return window.ShareFmService.deleteStorageObjects(paths).then(function () {
        return true
      }).catch(function (e) {
        if (n >= attempts) {
          console.warn('[ShareFm] storage delete failed after ' + attempts + ' attempts:', e)
          return false
        }
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(attempt(n + 1)) }, 150 * Math.pow(3, n - 1))
        })
      })
    }
    return attempt(1)
  }

  // Enfileira paths na cleanup_queue (processados depois por Edge Function
  // com service-role). Ver migration 20260700000411_fm_storage_cleanup_queue.sql.
  function _enqueueStorageCleanup(paths, shareId, reason) {
    if (!paths || !paths.length) return Promise.resolve()
    var sb = window._sbShared || (window.supabase && window.ClinicEnv
      ? window.supabase.createClient(window.ClinicEnv.SUPABASE_URL, window.ClinicEnv.SUPABASE_KEY)
      : null)
    if (!sb) {
      console.warn('[ShareFm] sb indisponivel para enqueue cleanup')
      return Promise.resolve()
    }
    var bucket = (window.ShareFmConfig && window.ShareFmConfig.BUCKET) || 'facial-shares'
    return sb.rpc('fm_storage_cleanup_enqueue', {
      p_bucket: bucket,
      p_paths: paths,
      p_reason: reason || 'revoke_client_failed',
      p_share_id: shareId || null,
    }).then(function (res) {
      if (res.error) {
        console.error('[ShareFm] cleanup enqueue failed:', res.error)
        return
      }
      console.log('[ShareFm] cleanup enqueued:', res.data, 'items')
    }).catch(function (e) {
      console.error('[ShareFm] cleanup enqueue exception:', e)
    })
  }

  var ShareFmEngine = {
    start: function (input) {
      try {
        if (!input || !input.leadId) {
          _toast('Dados insuficientes para gerar link', 'warn')
          return
        }
        if (!window.ShareFmService) {
          _toast('Servico de share indisponivel', 'error')
          return
        }
        if (!window.ShareFmModal || !window.ShareFmModal.openConsent) {
          _toast('Modal nao carregado', 'error')
          return
        }

        // 1. Modal de consent — bloqueia ate o profissional confirmar
        window.ShareFmModal.openConsent(input, function (consentResult) {
          if (!consentResult || consentResult.cancelled) return
          ShareFmEngine._executeShare(input, consentResult).catch(function (e) {
            console.error('[ShareFm] _executeShare:', e)
            _toast('Falha ao gerar link: ' + (e.message || ''), 'error')
          })
        })
      } catch (e) {
        console.warn('[ShareFm] start error:', e)
        _toast('Erro inesperado', 'error')
      }
    },

    _executeShare: function (input, consent) {
      var svc = window.ShareFmService
      var cfg = window.ShareFmConfig
      var token = svc.generateToken()
      var shareDirId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(36).slice(2))
      var basePath = (input.clinicId || 'default') + '/' + shareDirId

      // Loading visual
      window.ShareFmModal.openProgress('Preparando link compartilhavel...')

      // 2 + 3. Upload das fotos (paralelo)
      var beforePromise = input.beforeBlob
        ? svc.uploadPhoto(input.beforeBlob, basePath + '/before.jpg').catch(function (e) { console.warn('[ShareFm] before upload:', e); return null })
        : Promise.resolve(null)
      var afterPromise = input.afterBlob
        ? svc.uploadPhoto(input.afterBlob, basePath + '/after.jpg').catch(function (e) { console.warn('[ShareFm] after upload:', e); return null })
        : Promise.resolve(null)

      return Promise.all([beforePromise, afterPromise]).then(function (paths) {
        var beforePath = paths[0]
        var afterPath = paths[1]
        if (!beforePath && !afterPath) throw new Error('Nenhuma foto enviada')

        window.ShareFmModal.openProgress('Salvando registro do link...')

        // 4. RPC create
        return svc.createShare({
          token:               token,
          leadId:              input.leadId,
          leadName:            input.leadName,
          clinicName:          input.clinicName,
          professionalName:    input.professionalName,
          procedureLabel:      input.procedureLabel,
          sourceAppointmentId: input.sourceAppointmentId,
          beforePhotoPath:     beforePath,
          afterPhotoPath:      afterPath,
          metrics:             input.metrics || {},
          analysisText:        input.analysisText || null,
          ctaPhone:            input.ctaPhone || input.clinicPhone || null,
          ttlDays:             consent.ttlDays || cfg.DEFAULT_TTL_DAYS,
          consentText:         consent.consentText,
        })
      }).then(function (created) {
        if (!created || !created.token) throw new Error('Falha ao criar share')

        // URL publica usa dominio de producao mesmo se Dra estiver testando
        // em localhost — paciente precisa abrir no celular.
        var baseUrl = (cfg.publicBaseUrl ? cfg.publicBaseUrl() : window.location.origin)
        var publicUrl = baseUrl + cfg.PUBLIC_PAGE_PATH + '?t=' + created.token
        window.ShareFmModal.openProgress('Encurtando URL...')

        // 5. Encurta — codigo curto + tracking
        var shortCode = cfg.SHORT_LINK_PREFIX + Math.random().toString(36).slice(2, 8)
        return svc.shortenUrl(publicUrl, shortCode, 'Resultado de analise facial').then(function (shortRes) {
          var finalUrl = shortRes.shortUrl || publicUrl
          var waMessage = (
            'Ola! Aqui esta sua analise facial: ' + finalUrl +
            '\n\nLink valido por ' + (consent.ttlDays || cfg.DEFAULT_TTL_DAYS) + ' dias.'
          )
          var waHref = _whatsappLink(input.leadPhone, waMessage)

          // 6. Modal de resultado
          window.ShareFmModal.openResult({
            shareId:    created.id,
            token:      created.token,
            url:        finalUrl,
            longUrl:    publicUrl,
            shortCode:  shortRes.code,
            waHref:     waHref,
            expiresAt:  created.expires_at,
            ttlDays:    consent.ttlDays || cfg.DEFAULT_TTL_DAYS,
          })
          _toast('Link gerado com sucesso', 'success')
        })
      })
    },

    revoke: function (shareId, reason, callback) {
      if (!window.ShareFmService) return
      window.ShareFmService.revoke(shareId, reason || 'manual').then(function (res) {
        var paths = (res && (res.before_photo_path || res.after_photo_path))
          ? [res.before_photo_path, res.after_photo_path].filter(Boolean)
          : []
        if (!paths.length) {
          _toast('Link revogado', 'success')
          if (callback) callback(true)
          return
        }
        // LGPD: client tenta deletar 3x (exponential backoff). Se todas falharem,
        // enfileira na fm_storage_cleanup_queue para o cron processar com
        // service-role. Assim, em nenhum cenario o "revoguei mas a foto continua
        // acessivel" pode acontecer silenciosamente. Ver case-gallery-share.md C4.
        _retryStorageDelete(paths, 3).then(function (ok) {
          if (!ok) _enqueueStorageCleanup(paths, shareId, 'revoke_client_failed')
          _toast('Link revogado', 'success')
          if (callback) callback(true)
        })
      }).catch(function (e) {
        _toast('Falha ao revogar: ' + (e.message || ''), 'error')
        if (callback) callback(false)
      })
    },
  }

  window.ShareFmEngine = ShareFmEngine
})()
