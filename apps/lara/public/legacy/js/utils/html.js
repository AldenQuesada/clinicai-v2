/**
 * ClinicAI — HTML template helper
 *
 * Tag literal que escapa valores interpolados por padrão, eliminando
 * a classe de bugs "innerHTML + user data" que é o vetor #1 de XSS
 * em código legacy.
 *
 * Uso:
 *   html`<div>${userName}</div>`              // escapa
 *   html`<div>${html.raw(trustedHtml)}</div>` // marca como seguro
 *   html.attr(value)                           // escapa atributo
 */
// @ts-nocheck — wrapper IIFE com tipos dinâmicos.
(function (root, factory) {
  var mod = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = mod
  if (typeof root !== 'undefined') {
    root.html = mod
    if (typeof root.window !== 'undefined') root.window.html = mod
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  var HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return ''
    if (s && s.__rawHtml) return s.value
    return String(s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPE_MAP[c] })
  }

  function escapeAttr(s) {
    if (s === null || s === undefined) return ''
    return String(s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPE_MAP[c] })
  }

  function raw(value) { return { __rawHtml: true, value: String(value || '') } }

  /**
   * Tag literal: html`<div>${name}</div>`
   * Cada expressão interpolada é escapada. Para confiar em HTML
   * pre-validado, envolve com raw().
   */
  function html(strings, ...values) {
    var out = ''
    for (var i = 0; i < strings.length; i++) {
      out += strings[i]
      if (i < values.length) {
        var v = values[i]
        if (Array.isArray(v)) {
          // Array concat: cada item é escapado (a menos que seja raw)
          for (var j = 0; j < v.length; j++) out += escapeHtml(v[j])
        } else {
          out += escapeHtml(v)
        }
      }
    }
    return out
  }

  html.escape = escapeHtml
  html.attr = escapeAttr
  html.raw = raw

  return html
})
