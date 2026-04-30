/**
 * Sanitize URL · helper global de protocolo-whitelist pra hrefs/srcs
 * user-controlled em qualquer módulo da plataforma (LP Builder, Quiz, VPI,
 * Agenda, Magazine, B2B, etc).
 *
 * Problema: _esc() (HTML-escape) NÃO bloqueia protocolos perigosos como
 * javascript:, data:, vbscript:. Se admin colocar btn_href="javascript:..."
 * ou um visitante/paciente conseguir persistir uma URL, navegador executa
 * o código ao clicar (XSS).
 *
 * Uso:
 *   <a href="${esc(sanitizeUrl(userUrl))}">
 *   <img src="${esc(sanitizeUrl(userImgUrl))}">
 *
 * Whitelist:
 *   http://, https://  (absolutos)
 *   mailto:, tel:      (ações seguras)
 *   /path              (path relativo)
 *   #anchor, ?query    (relativos ao documento)
 *
 * Bloqueia (retorna '#' inerte):
 *   javascript:, data:, vbscript:, file:, any outro protocolo
 *
 * Também exposto globalmente como:
 *   window.sanitizeUrl         (função solta, pra inline scripts)
 *   window.LPBHelpers.sanitizeUrl  (módulo LPBuilder pode consumir via objeto)
 */
;(function () {
  'use strict'

  function sanitizeUrl(u) {
    if (u == null) return '#'
    var s = String(u).trim()
    if (s === '' || s === '#') return '#'
    // Whitelist: absolutos safe + relativos comuns
    if (/^(https?:|mailto:|tel:|\/|#|\?)/i.test(s)) return s
    // Qualquer outro protocolo (javascript:, data:, vbscript:, file:) → '#'
    return '#'
  }

  // Expõe global direto — qualquer <script inline> pode usar
  window.sanitizeUrl = sanitizeUrl

  // Expõe no namespace do LPBuilder se o módulo existir (não cria dependência)
  if (window.LPBHelpers && !window.LPBHelpers.sanitizeUrl) {
    try {
      // LPBHelpers pode estar frozen — tenta setar só se falhar silencia
      window.LPBHelpers.sanitizeUrl = sanitizeUrl
    } catch (_) { /* frozen, ignore */ }
  }
})()
