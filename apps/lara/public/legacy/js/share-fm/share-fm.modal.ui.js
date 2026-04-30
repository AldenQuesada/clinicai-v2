/**
 * ClinicAI - Share FM Modal UI
 *
 * 3 modais sequenciais: consent (LGPD) -> progress -> result.
 *
 * API:
 *   ShareFmModal.openConsent(input, callback)
 *     callback({ cancelled?: bool, ttlDays, consentText })
 *   ShareFmModal.openProgress(message)
 *   ShareFmModal.openResult({ url, longUrl, waHref, expiresAt, ttlDays, ... })
 *   ShareFmModal.close()
 */
;(function () {
  'use strict'
  if (window._shareFmModalLoaded) return
  window._shareFmModalLoaded = true

  var GOLD = '#C8A97E'
  var DARK = '#0A0A0A'
  var TEXT = '#F5F0E8'
  var GREEN = '#10B981'
  var RED = '#EF4444'

  var _overlay = null

  function _close() {
    if (!_overlay) return
    var o = _overlay
    o.style.opacity = '0'
    setTimeout(function () { if (o.parentNode) o.remove() }, 200)
    _overlay = null
  }

  function _mount(innerHtml, opts) {
    _close()
    _overlay = document.createElement('div')
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px);opacity:0;transition:opacity .2s'
    _overlay.innerHTML = innerHtml
    document.body.appendChild(_overlay)
    requestAnimationFrame(function () { _overlay.style.opacity = '1' })
    if (opts && opts.onMount) opts.onMount(_overlay)
    return _overlay
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _shellOpen(maxWidth, contentHtml) {
    return (
      '<div style="background:' + DARK + ';border:1px solid rgba(200,169,126,0.2);' +
                  'border-radius:16px;max-width:' + (maxWidth || 560) + 'px;width:100%;padding:32px;' +
                  'color:' + TEXT + ';font-family:Montserrat,sans-serif;' +
                  'box-shadow:0 32px 80px rgba(0,0,0,0.7);max-height:85vh;overflow-y:auto">' +
        contentHtml +
      '</div>'
    )
  }

  // ── 1. Consent Modal ────────────────────────────────────────
  function _openConsent(input, callback) {
    var cfg = window.ShareFmConfig
    var defaultTtl = cfg.DEFAULT_TTL_DAYS
    var maxTtl = cfg.MAX_TTL_DAYS
    var consentTpl = cfg.CONSENT_TEXT

    var html = _shellOpen(620,
      '<div style="margin-bottom:20px">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:26px;font-style:italic;color:' + GOLD + ';margin-bottom:6px">Compartilhar analise</div>' +
        '<div style="font-size:12px;color:rgba(245,240,232,0.65);line-height:1.5">' +
          'Sera gerado um link <strong>publico temporario</strong> com a foto antes/depois e a analise visual de <strong>' + _esc(input.leadName || 'paciente') + '</strong>. ' +
          'O link tem token aleatorio (256 bits) e expira automaticamente.' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:18px">' +
        '<label style="font-size:10px;color:rgba(200,169,126,0.7);letter-spacing:0.08em;text-transform:uppercase;font-weight:700;display:block;margin-bottom:8px">' +
          'Validade do link' +
        '</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          [7, 15, 30, 60, 90].map(function (d) {
            var sel = d === defaultTtl
            return '<button data-ttl="' + d + '" type="button" style="' +
              'padding:8px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:Montserrat,sans-serif;' +
              'border:1px solid ' + (sel ? GOLD : 'rgba(200,169,126,0.3)') + ';' +
              'background:' + (sel ? GOLD : 'transparent') + ';' +
              'color:' + (sel ? DARK : TEXT) + '">' +
              d + ' dias' +
            '</button>'
          }).join('') +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:20px;padding:16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<span style="font-size:11px;font-weight:700;color:#F59E0B;letter-spacing:0.08em;text-transform:uppercase">Consentimento LGPD</span>' +
        '</div>' +
        '<div id="shareFmConsentText" style="font-size:11px;color:rgba(245,240,232,0.85);line-height:1.6;font-style:italic">' +
          _esc(consentTpl.replace('{ttl_days}', defaultTtl)) +
        '</div>' +
        '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:12px;cursor:pointer">' +
          '<input type="checkbox" id="shareFmConsentCheck" style="margin-top:3px;accent-color:' + GOLD + '">' +
          '<span style="font-size:11px;color:' + TEXT + '">Confirmo que tenho a autorizacao da paciente e aceito os termos acima.</span>' +
        '</label>' +
      '</div>' +

      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="shareFmCancel" type="button" style="padding:10px 16px;border:1px solid rgba(245,240,232,0.15);border-radius:8px;background:transparent;color:rgba(245,240,232,0.6);cursor:pointer;font-family:Montserrat,sans-serif;font-size:12px">Cancelar</button>' +
        '<button id="shareFmConfirm" type="button" disabled style="padding:10px 20px;border:none;border-radius:8px;background:rgba(200,169,126,0.3);color:rgba(10,10,10,0.5);cursor:not-allowed;font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.04em">Gerar link</button>' +
      '</div>'
    )

    var selectedTtl = defaultTtl

    _mount(html, { onMount: function (o) {
      function _refresh() {
        var consentEl = o.querySelector('#shareFmConsentText')
        consentEl.textContent = consentTpl.replace('{ttl_days}', selectedTtl)
        // toggle highlight
        o.querySelectorAll('[data-ttl]').forEach(function (b) {
          var d = parseInt(b.getAttribute('data-ttl'), 10)
          var sel = d === selectedTtl
          b.style.background = sel ? GOLD : 'transparent'
          b.style.color = sel ? DARK : TEXT
          b.style.borderColor = sel ? GOLD : 'rgba(200,169,126,0.3)'
        })
      }
      o.querySelectorAll('[data-ttl]').forEach(function (b) {
        b.addEventListener('click', function () {
          selectedTtl = parseInt(b.getAttribute('data-ttl'), 10)
          if (selectedTtl > maxTtl) selectedTtl = maxTtl
          _refresh()
        })
      })

      var checkEl = o.querySelector('#shareFmConsentCheck')
      var confirmBtn = o.querySelector('#shareFmConfirm')
      var cancelBtn = o.querySelector('#shareFmCancel')

      checkEl.addEventListener('change', function () {
        if (checkEl.checked) {
          confirmBtn.disabled = false
          confirmBtn.style.background = GOLD
          confirmBtn.style.color = DARK
          confirmBtn.style.cursor = 'pointer'
        } else {
          confirmBtn.disabled = true
          confirmBtn.style.background = 'rgba(200,169,126,0.3)'
          confirmBtn.style.color = 'rgba(10,10,10,0.5)'
          confirmBtn.style.cursor = 'not-allowed'
        }
      })

      cancelBtn.addEventListener('click', function () {
        _close()
        callback && callback({ cancelled: true })
      })

      confirmBtn.addEventListener('click', function () {
        if (!checkEl.checked) return
        var consentText = consentTpl.replace('{ttl_days}', selectedTtl)
        callback && callback({
          ttlDays: selectedTtl,
          consentText: consentText,
        })
      })

      function _esc(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', _esc)
          _close()
          callback && callback({ cancelled: true })
        }
      }
      document.addEventListener('keydown', _esc)
    }})
  }

  // ── 2. Progress Modal ───────────────────────────────────────
  function _openProgress(message) {
    var html = _shellOpen(420,
      '<div style="text-align:center;padding:20px 0">' +
        '<div style="display:inline-block;width:40px;height:40px;border:3px solid rgba(200,169,126,0.2);border-top-color:' + GOLD + ';border-radius:50%;animation:shareFmSpin 1s linear infinite;margin-bottom:16px"></div>' +
        '<div style="font-size:13px;color:rgba(245,240,232,0.8);font-family:Montserrat,sans-serif">' + _esc(message || 'Carregando...') + '</div>' +
      '</div>' +
      '<style>@keyframes shareFmSpin { to { transform: rotate(360deg) } }</style>'
    )
    _mount(html)
  }

  // ── 3. Result Modal ─────────────────────────────────────────
  function _openResult(result) {
    var fmtExp = ''
    try { fmtExp = new Date(result.expiresAt).toLocaleDateString('pt-BR') } catch (e) { fmtExp = '—' }

    var html = _shellOpen(560,
      '<div style="margin-bottom:18px;text-align:center">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(16,185,129,0.15);margin-bottom:12px">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + GREEN + '" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;color:' + GOLD + '">Link pronto para compartilhar</div>' +
        '<div style="font-size:11px;color:rgba(245,240,232,0.55);margin-top:4px">Valido por ' + result.ttlDays + ' dias (ate ' + fmtExp + ')</div>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="font-size:10px;color:rgba(200,169,126,0.7);letter-spacing:0.08em;text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px">URL</label>' +
        '<div style="display:flex;gap:8px">' +
          '<input id="shareFmUrlInput" readonly value="' + _esc(result.url) + '" style="flex:1;padding:10px 12px;background:rgba(245,240,232,0.04);border:1px solid rgba(200,169,126,0.2);border-radius:8px;color:' + TEXT + ';font-size:12px;font-family:monospace">' +
          '<button id="shareFmCopy" style="padding:10px 14px;background:' + GOLD + ';color:' + DARK + ';border:none;border-radius:8px;cursor:pointer;font-family:Montserrat,sans-serif;font-size:11px;font-weight:700">Copiar</button>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        (result.waHref
          ? '<a href="' + _esc(result.waHref) + '" target="_blank" rel="noopener" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;background:#25D366;color:#fff;border-radius:10px;text-decoration:none;font-family:Montserrat,sans-serif;font-size:12px;font-weight:700">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>' +
              'Enviar pelo WhatsApp' +
            '</a>'
          : '<div style="flex:1;padding:12px;background:rgba(245,240,232,0.04);border:1px dashed rgba(200,169,126,0.2);border-radius:10px;color:rgba(245,240,232,0.5);text-align:center;font-size:11px;font-style:italic">Sem telefone do paciente — copie o link manualmente.</div>') +
        '<button id="shareFmOpenPreview" style="padding:12px 16px;background:transparent;border:1px solid rgba(200,169,126,0.3);border-radius:10px;color:' + GOLD + ';cursor:pointer;font-family:Montserrat,sans-serif;font-size:11px;font-weight:700">Abrir preview</button>' +
      '</div>' +

      '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid rgba(200,169,126,0.1)">' +
        '<button id="shareFmRevoke" style="padding:8px 14px;background:transparent;border:1px solid rgba(239,68,68,0.4);border-radius:8px;color:' + RED + ';cursor:pointer;font-family:Montserrat,sans-serif;font-size:11px;font-weight:600">Revogar este link</button>' +
        '<button id="shareFmClose" style="padding:8px 16px;background:transparent;color:rgba(245,240,232,0.6);border:1px solid rgba(245,240,232,0.15);border-radius:8px;cursor:pointer;font-family:Montserrat,sans-serif;font-size:12px">Fechar</button>' +
      '</div>'
    )

    _mount(html, { onMount: function (o) {
      o.querySelector('#shareFmCopy').addEventListener('click', function () {
        var input = o.querySelector('#shareFmUrlInput')
        input.select()
        try {
          document.execCommand('copy')
          if (window.toast) window.toast('URL copiada', 'success')
        } catch (e) { /* noop */ }
      })
      o.querySelector('#shareFmOpenPreview').addEventListener('click', function () {
        window.open(result.longUrl, '_blank', 'noopener')
      })
      o.querySelector('#shareFmRevoke').addEventListener('click', function () {
        if (!confirm('Revogar este link agora? A paciente nao podera mais acessar.')) return
        if (window.ShareFmEngine) {
          window.ShareFmEngine.revoke(result.shareId, 'manual_via_modal', function (ok) {
            if (ok) _close()
          })
        }
      })
      o.querySelector('#shareFmClose').addEventListener('click', _close)
    }})
  }

  window.ShareFmModal = {
    openConsent:  _openConsent,
    openProgress: _openProgress,
    openResult:   _openResult,
    close:        _close,
  }
})()
