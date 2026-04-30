/**
 * Image + Canvas helpers compartilhados — LP Builder, Magazine, Facial Mapper,
 * VPI story generator, quiz images, qualquer lugar que manipula imagem via
 * canvas (crop/resize/zoom/pan).
 *
 * Problema resolvido: cada módulo tinha sua própria lógica de new Image() +
 * src, e só alguns setavam crossOrigin='anonymous' ANTES de src. O que
 * esqueceu causava tainted canvas — toBlob/toDataURL falhando silenciosamente.
 * Bug real detectado em 2026-04-24:
 *   lp-builder/lpb-image-crop.js   ✓ tinha (fix no commit 37c26ab)
 *   magazine/admin/image-crop.js   ✗ não tinha
 *   fm/fm-crop.js                  ✗ não tinha (2 ocorrências)
 *
 * API:
 *   ImageCanvas.loadCORS(src)               → Promise<HTMLImageElement>
 *   ImageCanvas.setCORS(imgEl, src)         → imgEl (seta crossOrigin antes)
 *   ImageCanvas.toBlobSafe(canvas, mime, q) → Promise<Blob> (detect tainted)
 *
 * Regra de ouro: para QUALQUER <img> que vai ser desenhada em <canvas>
 * depois, use ImageCanvas.setCORS ou ImageCanvas.loadCORS. Não sete .src
 * direto antes de crossOrigin.
 */
;(function () {
  'use strict'

  /**
   * Cria e carrega HTMLImageElement novo com crossOrigin correto.
   * @param {string} src — URL (http, https, data:, blob:) ou path relativo
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImageCORS(src) {
    return new Promise(function (resolve, reject) {
      if (!src) return reject(new Error('src vazio'))
      var img = new Image()
      img.crossOrigin = 'anonymous'  // DEVE ser setado ANTES de src
      img.onload = function () { resolve(img) }
      img.onerror = function () {
        reject(new Error('Falha ao carregar imagem (possível CORS ou 404): ' + String(src).slice(0, 120)))
      }
      img.src = src
    })
  }

  /**
   * Seta crossOrigin + src em <img> existente (reaproveita nó DOM).
   * Use quando Cropper.js ou lib semelhante precisa do mesmo <img> node.
   * @param {HTMLImageElement} imgEl
   * @param {string} src
   * @returns {HTMLImageElement}
   */
  function setImageCORS(imgEl, src) {
    if (!imgEl || !imgEl.tagName || imgEl.tagName !== 'IMG') {
      throw new Error('setImageCORS: esperado <img>, recebido ' + (imgEl && imgEl.tagName))
    }
    imgEl.crossOrigin = 'anonymous'
    imgEl.src = src
    return imgEl
  }

  /**
   * canvas.toBlob() como Promise com tratamento de tainted canvas.
   * Rejeita explicitamente quando blob é null (canvas CORS-tainted) em vez
   * de passar blob=null silenciosamente pro caller.
   * @param {HTMLCanvasElement} canvas
   * @param {string} [mime='image/jpeg']
   * @param {number} [quality=0.92]
   * @returns {Promise<Blob>}
   */
  function canvasToBlobSafe(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (!canvas || !canvas.toBlob) return reject(new Error('canvas inválido'))
      var m = mime || 'image/jpeg'
      var q = (quality != null) ? quality : 0.92
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob)
          else reject(new Error('canvas.toBlob retornou null (possível tainted CORS). Tente upload local em vez de URL externa.'))
        }, m, q)
      } catch (e) {
        reject(new Error('canvas.toBlob throw: ' + e.message + ' (canvas CORS-tainted)'))
      }
    })
  }

  window.ImageCanvas = Object.freeze({
    loadCORS:   loadImageCORS,
    setCORS:    setImageCORS,
    toBlobSafe: canvasToBlobSafe,
  })
})()
