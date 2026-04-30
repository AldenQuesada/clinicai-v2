/**
 * ClinicAI — HTML Sanitizer (defensive, offline)
 *
 * DOMPurify-alike sanitizer sem dependencia externa. Usado em 3 lugares onde
 * admins podem injetar HTML de templates (legal-docs, report-luxury, magazine)
 * e o output vai ao DOM em pagina com PII/sessao valida.
 *
 * Politica:
 *   - Allowlist estrita de TAGS editoriais (texto e formatacao basica).
 *   - Allowlist estrita de ATRIBUTOS.
 *   - Bloqueia TODO atributo on* (onclick, onerror, onload, etc).
 *   - Bloqueia schemes perigosos em href/src (javascript:, data:, vbscript:).
 *   - Remove tags fonte de XSS: <script>, <style>, <iframe>, <object>,
 *     <embed>, <link>, <meta>, <base>, <form>, <input>, <button>, <svg> com
 *     elementos ativos.
 *   - Remove atributos estranhos: srcdoc, formaction, form*, http-equiv,
 *     xlink:href (usado em SVG XSS).
 *
 * API:
 *   window.ClinicSanitizer.clean(htmlString, options) -> string
 *
 * Options (opcional):
 *   - allowStyle: boolean (default false) — permite atributo style (sanitizado
 *     para remover expression() / javascript: / url(...)).
 *   - extraTags: string[] — tags adicionais a permitir.
 *   - extraAttrs: string[] — atributos adicionais a permitir.
 *
 * Refs LGPD / XSS:
 *   - code-review/legal-docs.md C5 — bypass do _sanitize atual
 *   - code-review/magazine.md C1 — srcdoc XSS via template literal
 *   - code-review/case-gallery-share.md H1 — templates editaveis cru
 */
;(function () {
  'use strict'

  if (window.ClinicSanitizer) return

  // ── Allowlists ────────────────────────────────────────────────────────
  // Tags basicas de texto/formatacao suficientes para TCLE, revistas e
  // templates editoriais. Qualquer tag fora daqui e' removida.
  var ALLOWED_TAGS = {
    // Estrutura
    'p': 1, 'br': 1, 'hr': 1, 'div': 1, 'span': 1,
    // Headings
    'h1': 1, 'h2': 1, 'h3': 1, 'h4': 1, 'h5': 1, 'h6': 1,
    // Text formatting
    'b': 1, 'strong': 1, 'i': 1, 'em': 1, 'u': 1, 's': 1,
    'small': 1, 'sub': 1, 'sup': 1, 'mark': 1, 'blockquote': 1,
    // Lists
    'ul': 1, 'ol': 1, 'li': 1, 'dl': 1, 'dt': 1, 'dd': 1,
    // Tables
    'table': 1, 'thead': 1, 'tbody': 1, 'tfoot': 1,
    'tr': 1, 'td': 1, 'th': 1, 'caption': 1, 'colgroup': 1, 'col': 1,
    // Media (com schema check em src)
    'img': 1,
    // Links (com schema check em href)
    'a': 1,
    // Inline
    'code': 1, 'pre': 1, 'kbd': 1, 'samp': 1, 'abbr': 1, 'cite': 1,
    'time': 1, 'figure': 1, 'figcaption': 1,
  }

  // Tags explicitamente proibidas — qualquer ocorrencia e' removida.
  var FORBIDDEN_TAGS = {
    'script': 1, 'style': 1, 'iframe': 1, 'object': 1, 'embed': 1,
    'link': 1, 'meta': 1, 'base': 1, 'form': 1, 'input': 1, 'button': 1,
    'textarea': 1, 'select': 1, 'option': 1, 'frame': 1, 'frameset': 1,
    'applet': 1, 'audio': 1, 'video': 1, 'source': 1, 'track': 1,
    'svg': 1, 'math': 1, 'template': 1, 'slot': 1, 'portal': 1,
    'dialog': 1, 'details': 1, 'summary': 1, 'menu': 1, 'menuitem': 1,
    'noscript': 1, 'noembed': 1, 'noframes': 1, 'xml': 1,
  }

  // Atributos permitidos globalmente (aplicaveis em qualquer tag allowlisted).
  var ALLOWED_GLOBAL_ATTRS = {
    'class': 1, 'id': 1, 'title': 1, 'lang': 1, 'dir': 1,
    'align': 1, 'valign': 1,
  }

  // Atributos por-tag.
  var ALLOWED_TAG_ATTRS = {
    'a':     { 'href': 1, 'target': 1, 'rel': 1 },
    'img':   { 'src': 1, 'alt': 1, 'width': 1, 'height': 1, 'loading': 1 },
    'table': { 'cellpadding': 1, 'cellspacing': 1, 'border': 1, 'width': 1 },
    'td':    { 'colspan': 1, 'rowspan': 1, 'width': 1, 'height': 1 },
    'th':    { 'colspan': 1, 'rowspan': 1, 'width': 1, 'height': 1, 'scope': 1 },
    'col':   { 'span': 1, 'width': 1 },
    'colgroup': { 'span': 1 },
    'time':  { 'datetime': 1 },
    'blockquote': { 'cite': 1 },
  }

  // Atributos proibidos em QUALQUER contexto.
  var FORBIDDEN_ATTRS = {
    'srcdoc': 1, 'sandbox': 1,
    'formaction': 1, 'formmethod': 1, 'formtarget': 1, 'formenctype': 1,
    'http-equiv': 1, 'manifest': 1, 'ping': 1,
    'xmlns': 1, 'xml:base': 1, 'xml:lang': 1, 'xml:space': 1,
    'onscroll': 1, 'onload': 1, 'onerror': 1, // redundant com startsWith('on')
  }

  // Schemes permitidos em href/src. Literalmente — tudo o resto bloqueado.
  var SAFE_HREF_SCHEMES = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i
  var SAFE_SRC_SCHEMES  = /^(https?:|\/|\.\/|\.\.\/)/i

  // ── Helpers ───────────────────────────────────────────────────────────
  function _isSafeHref(url) {
    if (!url) return false
    var trimmed = String(url).trim()
    // Bloqueia javascript:, data:, vbscript:, file:, about:, blob:, etc.
    if (/^(javascript:|data:|vbscript:|file:|about:|blob:)/i.test(trimmed)) return false
    return SAFE_HREF_SCHEMES.test(trimmed)
  }

  function _isSafeSrc(url) {
    if (!url) return false
    var trimmed = String(url).trim()
    if (/^(javascript:|data:|vbscript:|file:|about:|blob:)/i.test(trimmed)) return false
    return SAFE_SRC_SCHEMES.test(trimmed)
  }

  function _sanitizeStyle(value) {
    if (!value) return ''
    var s = String(value)
    // Remove expressions, imports, javascript:, url(...) com schemes perigosos.
    if (/expression\s*\(/i.test(s)) return ''
    if (/javascript\s*:/i.test(s)) return ''
    if (/vbscript\s*:/i.test(s)) return ''
    if (/@import/i.test(s)) return ''
    if (/behavior\s*:/i.test(s)) return ''
    // Remove url() com data: ou javascript: ou external
    s = s.replace(/url\s*\([^)]*\)/gi, function (m) {
      if (/(javascript|vbscript|data):/i.test(m)) return ''
      return m
    })
    return s
  }

  function _cleanAttrs(el, options) {
    var tag = el.tagName.toLowerCase()
    var tagAttrs = ALLOWED_TAG_ATTRS[tag] || {}
    var allowStyle = !!(options && options.allowStyle)
    var extraAttrs = (options && options.extraAttrs) || []
    // Iterate reverse — removal em loop.
    for (var i = el.attributes.length - 1; i >= 0; i--) {
      var attr = el.attributes[i]
      var name = attr.name.toLowerCase()
      var value = attr.value

      // 1) Qualquer handler de evento (on*) — bloqueio absoluto.
      if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); continue }

      // 2) Atributos proibidos explicitos.
      if (FORBIDDEN_ATTRS[name]) { el.removeAttribute(attr.name); continue }

      // 3) style: so se allowStyle=true, e sanitizado.
      if (name === 'style') {
        if (!allowStyle) { el.removeAttribute(attr.name); continue }
        var safeStyle = _sanitizeStyle(value)
        if (!safeStyle) el.removeAttribute(attr.name)
        else el.setAttribute('style', safeStyle)
        continue
      }

      // 4) href: so schemes seguros.
      if (name === 'href') {
        if (!_isSafeHref(value)) { el.removeAttribute(attr.name); continue }
        // Adiciona rel=noopener em target=_blank
        if (el.getAttribute('target') === '_blank') {
          var existing = el.getAttribute('rel') || ''
          if (existing.indexOf('noopener') === -1) {
            el.setAttribute('rel', (existing ? existing + ' ' : '') + 'noopener noreferrer')
          }
        }
        continue
      }

      // 5) src: so schemes seguros.
      if (name === 'src') {
        if (!_isSafeSrc(value)) { el.removeAttribute(attr.name); continue }
        continue
      }

      // 6) data-* livre — util para renderers (ex: data-page-id).
      if (name.indexOf('data-') === 0) continue

      // 7) aria-* livre — util para acessibilidade.
      if (name.indexOf('aria-') === 0) continue

      // 8) Allowlist global ou por-tag ou extras do chamador.
      if (ALLOWED_GLOBAL_ATTRS[name]) continue
      if (tagAttrs[name]) continue
      if (extraAttrs.indexOf(name) !== -1) continue

      // Nao permitido — remover.
      el.removeAttribute(attr.name)
    }
  }

  function _cleanNode(node, options) {
    // Walker recursivo. Remove elementos nao-allowlisted mantendo filhos.
    var child = node.firstChild
    while (child) {
      var next = child.nextSibling
      if (child.nodeType === 1 /* Element */) {
        var tag = child.tagName.toLowerCase()

        // Forbidden tag — remove sem preservar filhos (seguranca).
        if (FORBIDDEN_TAGS[tag]) {
          child.parentNode.removeChild(child)
          child = next
          continue
        }

        // Nao-allowlisted tag (ex: <custom-el>) — remove mas mantem filhos.
        if (!ALLOWED_TAGS[tag]) {
          var parent = child.parentNode
          while (child.firstChild) parent.insertBefore(child.firstChild, child)
          parent.removeChild(child)
          child = next
          continue
        }

        // Limpar atributos + recursar.
        _cleanAttrs(child, options)
        _cleanNode(child, options)
      } else if (child.nodeType === 8 /* Comment */) {
        // Remove comentarios (podem conter payloads conditional IE ou hide CSS).
        child.parentNode.removeChild(child)
      }
      child = next
    }
  }

  function clean(html, options) {
    if (html == null) return ''
    if (typeof html !== 'string') html = String(html)
    if (!html) return ''

    // Usar DOMParser para parsing real do HTML.
    var doc
    try {
      doc = new DOMParser().parseFromString('<!doctype html><html><body>' + html + '</body></html>', 'text/html')
    } catch (e) {
      // Fallback — createElement + innerHTML nao executa <script> mas carrega <img onerror>.
      // Com _cleanNode removendo on*, o vetor fica fechado.
      var tmp = document.createElement('div')
      tmp.innerHTML = html
      _cleanNode(tmp, options || {})
      return tmp.innerHTML
    }

    var body = doc.body
    if (!body) return ''
    _cleanNode(body, options || {})
    return body.innerHTML
  }

  // Helper: sanitiza HTML e tambem escapa texto puro (quando caller nao sabe o tipo).
  function cleanText(text) {
    if (text == null) return ''
    return String(text).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    })
  }

  // Helper publico: valida se URL e' safe para href.
  function isSafeUrl(url) { return _isSafeHref(url) }

  window.ClinicSanitizer = {
    clean: clean,
    cleanText: cleanText,
    isSafeUrl: isSafeUrl,
    // Exposto para testes / casos especiais
    _allowedTags: ALLOWED_TAGS,
    _forbiddenTags: FORBIDDEN_TAGS,
  }
})()
