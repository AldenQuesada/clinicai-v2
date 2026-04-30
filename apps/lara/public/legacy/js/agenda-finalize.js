/**
 * ClinicAI — Agenda Finalize (Bridge)
 *
 * DEPRECADO: logica canonica agora vive em agenda-smart.js.
 * Este arquivo apenas cria bridges para nomes legados que ainda
 * podem ser referenciados em api.js, agenda-modal.js, etc.
 *
 * Funcoes canonicas (agenda-smart.js):
 *   openFinalizeModal(id)  — modal completo de finalizacao
 *   confirmFinalize(id)    — confirma e salva
 *   closeFinalizeModal()   — fecha modal
 */
;(function () {
  'use strict'

  // Bridge: nomes legados → canonicos
  // openFinalizarModal ja bridged em agenda-smart.js
  // Estes cobrem funcoes que inline onclick ainda referenciam:

  window.quickFinish = function (id) {
    if (window.openFinalizeModal) openFinalizeModal(id)
  }

  window._confirmFinalizar = function (id) {
    if (window.confirmFinalize) confirmFinalize(id)
  }

  window._skipFinalizar = function (id) {
    if (window.closeFinalizeModal) closeFinalizeModal(true)
  }

  window.openFinishModal = function (id) {
    if (window.openFinalizeModal) openFinalizeModal(id)
  }

  window.closeFinishModal = function () {
    if (window.closeFinalizeModal) closeFinalizeModal(true)
  }

  window.confirmFinishAppt = function () {
    // Legacy: nao tem id, busca do DOM
    var idEl = document.getElementById('finishApptId')
    if (idEl && window.confirmFinalize) confirmFinalize(idEl.value)
  }

  // ── Namespace agregador congelado (contrato canonico do projeto) ─
  // Os window.<fn> acima permanecem para compatibilidade com onclick inline.
  window.AgendaFinalize = Object.freeze({
    quickFinish: window.quickFinish,
    openFinishModal: window.openFinishModal,
    closeFinishModal: window.closeFinishModal,
    confirmFinishAppt: window.confirmFinishAppt
  })

})()
