/**
 * ClinicAI — Modal Manager unificado
 *
 * API mínima para alert/confirm/dialog que substitui as 4 implementações
 * ad-hoc espalhadas (multiProcAlert, finConsultaAlert, _alertPagamentoAberto,
 * etc). Standardiza:
 *  - Botão de fechar (×)
 *  - Click fora do inner box fecha
 *  - Esc fecha
 *  - Cleanup do listener Esc no close
 *  - Destaque visual coordenado com tom (info/warn/error/success)
 *
 * Uso:
 *   Modal.alert({ title, message, tone: 'warn' })
 *   Modal.confirm({ title, message, confirmText, onConfirm })
 *   Modal.dialog({ title, body: htmlString, footer: htmlString })
 */
;(function () {
  'use strict'

  if (typeof window === 'undefined') return

  var TONES = {
    info:    { bg: '#3B82F6', tag: 'Info' },
    success: { bg: '#16A34A', tag: 'Sucesso' },
    warn:    { bg: '#F59E0B', tag: 'Atenção' },
    error:   { bg: '#DC2626', tag: 'Erro' },
  }

  var _activeStack = []

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    })
  }

  var _modalIdCounter = 0

  function _open(opts) {
    var tone = TONES[opts.tone] || TONES.info
    var headerBg = tone.bg
    var modalId = 'clinicai-modal-' + (++_modalIdCounter)
    var titleId = modalId + '-title'

    // Salva o elemento ativo pra restaurar foco no close
    var previousFocus = /** @type {HTMLElement|null} */ (document.activeElement)

    var overlay = document.createElement('div')
    overlay.className = 'clinicai-modal-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10010;display:flex;align-items:center;justify-content:center;padding:16px'

    var inner = document.createElement('div')
    inner.className = 'clinicai-modal-inner'
    inner.id = modalId
    inner.setAttribute('role', 'dialog')
    inner.setAttribute('aria-modal', 'true')
    inner.setAttribute('aria-labelledby', titleId)
    inner.style.cssText = 'background:#fff;border-radius:14px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column'

    var header = document.createElement('div')
    header.style.cssText = 'background:' + headerBg + ';padding:14px 18px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0'
    header.innerHTML = '<div>' +
      '<div id="' + titleId + '" style="font-size:14px;font-weight:800">' + _esc(opts.title || tone.tag) + '</div>' +
      (opts.subtitle ? '<div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px">' + _esc(opts.subtitle) + '</div>' : '') +
    '</div>' +
    '<button type="button" data-modal-close aria-label="Fechar" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:700;line-height:1">×</button>'

    var body = document.createElement('div')
    body.style.cssText = 'padding:18px;font-size:13px;color:#374151;line-height:1.55;overflow-y:auto;flex:1'
    if (opts.bodyHtml) body.innerHTML = opts.bodyHtml
    else if (opts.message) body.textContent = opts.message

    var footer = document.createElement('div')
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid #F3F4F6;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0'

    inner.appendChild(header)
    inner.appendChild(body)
    if (opts.footerHtml || opts.buttons) inner.appendChild(footer)
    overlay.appendChild(inner)

    function close(reason) {
      if (overlay._closed) return
      overlay._closed = true
      document.removeEventListener('keydown', keyHandler)
      _activeStack = _activeStack.filter(function(o) { return o !== overlay })
      try { document.body.removeChild(overlay) } catch (e) {}
      // Restore focus para onde estava antes
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus() } catch (e) {}
      }
      if (typeof opts.onClose === 'function') opts.onClose(reason)
    }

    // Focus trap: tab e shift+tab ciclam dentro do modal
    function _focusableElements() {
      return /** @type {NodeListOf<HTMLElement>} */ (inner.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ))
    }

    function keyHandler(e) {
      if (e.key === 'Escape') {
        close('esc')
        return
      }
      if (e.key === 'Tab') {
        var els = _focusableElements()
        if (!els.length) return
        var first = /** @type {HTMLElement} */ (els[0])
        var last = /** @type {HTMLElement} */ (els[els.length - 1])
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close('outside')
    })
    header.querySelector('[data-modal-close]').addEventListener('click', function() { close('button') })
    document.addEventListener('keydown', keyHandler)

    // Botões customizados
    if (opts.buttons && Array.isArray(opts.buttons)) {
      opts.buttons.forEach(function(btn) {
        var b = document.createElement('button')
        b.type = 'button'
        b.textContent = btn.label
        var primary = btn.primary
        b.style.cssText = 'padding:8px 16px;background:' + (primary ? headerBg : '#F3F4F6') + ';color:' + (primary ? '#fff' : '#6B7280') + ';border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer'
        b.addEventListener('click', function() {
          var stay = btn.onClick && btn.onClick({ close: function() { close('button') } })
          if (stay !== false) close('button')
        })
        footer.appendChild(b)
      })
    } else if (opts.footerHtml) {
      footer.innerHTML = opts.footerHtml
    }

    document.body.appendChild(overlay)
    _activeStack.push(overlay)

    // Move foco para o primeiro elemento focável (a11y)
    setTimeout(function() {
      var focusables = /** @type {NodeListOf<HTMLElement>} */ (inner.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      if (focusables.length) focusables[0].focus()
      else { inner.setAttribute('tabindex', '-1'); inner.focus() }
    }, 0)

    return { close: close, overlay: overlay, body: body }
  }

  function alert(opts) {
    if (typeof opts === 'string') opts = { message: opts }
    return _open(Object.assign({
      tone: 'info',
      buttons: [{ label: 'Entendido', primary: true }],
    }, opts))
  }

  function confirm(opts) {
    if (typeof opts === 'string') opts = { message: opts }
    var resolved = false
    return new Promise(function(resolve) {
      _open(Object.assign({
        tone: 'warn',
        buttons: [
          { label: opts.cancelText || 'Cancelar', onClick: function() { resolved = true; resolve(false) } },
          { label: opts.confirmText || 'Confirmar', primary: true, onClick: function() { resolved = true; resolve(true) } },
        ],
        onClose: function() { if (!resolved) resolve(false) },
      }, opts))
    })
  }

  function dialog(opts) { return _open(opts) }

  function closeAll() {
    _activeStack.slice().forEach(function(o) { try { o._closed = true; document.body.removeChild(o) } catch (e) {} })
    _activeStack = []
  }

  window.Modal = { alert: alert, confirm: confirm, dialog: dialog, closeAll: closeAll }
})()
