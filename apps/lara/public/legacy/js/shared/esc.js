/**
 * ClinicAI - HTML Escape Helper (Shared)
 *
 * Substituicao unificada das implementacoes locais `_esc()` espalhadas
 * (prontuario.js, leads-context.js fallback de PDF, legal-docs, etc).
 *
 * Escape completo contra XSS em insercao em innerHTML / template strings.
 * Nao sanitiza URLs - apenas escapa caracteres HTML.
 *
 * Uso:
 *   window.ClinicEsc.html(str)       -> escape HTML-safe para innerHTML
 *   window.ClinicEsc.attr(str)       -> escape HTML-safe para atributos HTML
 *   window.ClinicEsc.js(str)         -> escape JS-safe para strings inline onclick="func('x')"
 *
 * Regra: sempre que for injetar dado do usuario em HTML, use ClinicEsc.
 */
;(function () {
  'use strict'

  if (window.ClinicEsc) return

  function _str(v) {
    return v == null ? '' : String(v)
  }

  function html(s) {
    return _str(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Escape para uso dentro de atributos HTML (ex: title="..."). Igual ao html
  // mas pode-se estender no futuro se necessario (ex: URL encoding).
  function attr(s) {
    return html(s)
  }

  // Escape para interpolar dentro de uma string JS (ex: onclick="foo('{{id}}')").
  // NUNCA sozinho - sempre depois de html() tambem.
  function js(s) {
    return _str(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
  }

  window.ClinicEsc = Object.freeze({ html: html, attr: attr, js: js })

  // Compatibilidade: se ainda nao existe, prove window.escHtml para legado.
  if (!window.escHtml) window.escHtml = html
})()
