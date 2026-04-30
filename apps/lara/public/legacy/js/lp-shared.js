/**
 * Landing Pages — JS compartilhado
 * Clínica Mirian de Paula
 *
 * Responsabilidades:
 *   1. Captura sid + utm_* da URL e grava sessionStorage
 *      (compatível com vpi_attribution do dashboard)
 *   2. Constrói URLs de CTA WhatsApp com mensagem pré-preenchida
 *      e parâmetros de tracking
 *   3. Reveal on scroll (IntersectionObserver)
 *
 * Expoe window.LPShared.
 */
(function (global) {
  'use strict';

  var CLINIC_WA_PHONE = '5534992164449'; // placeholder — ajustar
  var ATTR_STORAGE_KEY = 'vpi_attribution';
  var ATTR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  // ── Attribution capture ─────────────────────────────────────
  function _readAttr() {
    try {
      var raw = sessionStorage.getItem(ATTR_STORAGE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.sid || !p.capturedAt) return null;
      if ((Date.now() - p.capturedAt) > ATTR_TTL_MS) {
        sessionStorage.removeItem(ATTR_STORAGE_KEY);
        return null;
      }
      return p;
    } catch (_) { return null; }
  }

  function _writeAttr(data) {
    try { sessionStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function captureFromURL() {
    try {
      var qp  = new URLSearchParams(window.location.search);
      var sid = qp.get('sid');
      if (!sid || sid.length < 4) {
        // Gera sid da landing se não veio do short-link — ainda rastreia canal
        sid = 'lp_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      }
      var existing = _readAttr();
      if (existing && existing.sid === sid) return existing;

      var data = {
        sid: sid,
        utm: {
          source:   qp.get('utm_source')   || null,
          medium:   qp.get('utm_medium')   || null,
          campaign: qp.get('utm_campaign') || null,
          content:  qp.get('utm_content')  || null,
          term:     qp.get('utm_term')     || null,
        },
        landing:    (document.body && document.body.dataset && document.body.dataset.landing) || null,
        capturedAt: Date.now(),
      };
      _writeAttr(data);
      return data;
    } catch (err) {
      return null;
    }
  }

  function getSessionId() { var d = _readAttr(); return d ? d.sid : null; }
  function getUTMs()      { var d = _readAttr(); return d ? d.utm : null; }

  // ── WhatsApp CTA builder ────────────────────────────────────
  function buildWhatsAppURL(message) {
    var attr = _readAttr() || {};
    var msg = message || 'Olá, gostaria de uma avaliação.';

    // Adiciona tracking discreto na mensagem (invisível para paciente em termos de conteúdo,
    // mas permite cruzar com attribution no dashboard).
    var tracking = '';
    if (attr.landing || attr.sid) {
      tracking = '\n\n_ref: ' + (attr.landing || 'lp') + (attr.sid ? ' #' + attr.sid.slice(0, 10) : '') + '_';
    }
    var finalMsg = msg + tracking;
    var phone = CLINIC_WA_PHONE.replace(/\D/g, '');
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(finalMsg);
  }

  function wireWhatsAppLinks() {
    var links = document.querySelectorAll('[data-wa-message]');
    links.forEach(function (a) {
      var msg = a.getAttribute('data-wa-message') || '';
      a.href = buildWhatsAppURL(msg);
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }

  // ── Reveal on scroll ────────────────────────────────────────
  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { observer.observe(el); });
  }

  // ── Boot ────────────────────────────────────────────────────
  function boot() {
    captureFromURL();
    wireWhatsAppLinks();
    setupReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.LPShared = {
    captureFromURL: captureFromURL,
    getSessionId:   getSessionId,
    getUTMs:        getUTMs,
    buildWhatsAppURL: buildWhatsAppURL,
    wireWhatsAppLinks: wireWhatsAppLinks,
    CLINIC_WA_PHONE:   CLINIC_WA_PHONE,
  };
})(window);
