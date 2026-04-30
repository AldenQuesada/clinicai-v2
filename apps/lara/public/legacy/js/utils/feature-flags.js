/**
 * ClinicAI — Feature Flags
 *
 * Sistema simples de feature flags em localStorage para rollout
 * gradual de features de risco. Cada flag tem um default no código.
 *
 * Uso:
 *   if (FeatureFlags.isEnabled('new_payment_block')) { ... }
 *   FeatureFlags.enable('new_payment_block')
 *   FeatureFlags.disable('experimental_x')
 *   FeatureFlags.list()  // estado atual de todas as flags
 *
 * Inspeção via console:
 *   window.FeatureFlags.list()
 *
 * Defaults: definidos abaixo (FLAG_DEFAULTS). Para ativar uma flag
 * sem editar código, abrir DevTools e:
 *   localStorage.setItem('clinicai_ff_<nome>', '1')
 */
// @ts-nocheck — wrapper IIFE
(function () {
  'use strict'
  if (typeof window === 'undefined') return

  var STORAGE_PREFIX = 'clinicai_ff_'

  // Defaults — adicionar novas flags aqui
  var FLAG_DEFAULTS = {
    new_payment_block:        true,   // pagamentos múltiplos no agendamento
    cortesia_per_proc:        true,   // cortesia por procedimento
    audit_trail_ui:           false,  // botão "Ver histórico financeiro" (UI ainda nao pronta)
    whatsapp_feedback_badge:  false,  // badge "Confirmação agendada" (UI ainda nao pronta)
    error_boundary_remote:    false,  // envio de erros pra endpoint remoto
    perf_lazy_modal_mount:    false,  // só montar modal HTML quando primeira abertura
  }

  function _key(name) { return STORAGE_PREFIX + name }

  function isEnabled(name) {
    try {
      var v = localStorage.getItem(_key(name))
      if (v === '1' || v === 'true') return true
      if (v === '0' || v === 'false') return false
    } catch (e) { /* */ }
    return !!FLAG_DEFAULTS[name]
  }

  function enable(name) {
    try { localStorage.setItem(_key(name), '1') } catch (e) { /* */ }
  }

  function disable(name) {
    try { localStorage.setItem(_key(name), '0') } catch (e) { /* */ }
  }

  function reset(name) {
    try { localStorage.removeItem(_key(name)) } catch (e) { /* */ }
  }

  function list() {
    var out = {}
    Object.keys(FLAG_DEFAULTS).forEach(function (name) {
      out[name] = isEnabled(name)
    })
    return out
  }

  function defaults() { return Object.assign({}, FLAG_DEFAULTS) }

  window.FeatureFlags = {
    isEnabled: isEnabled,
    enable: enable,
    disable: disable,
    reset: reset,
    list: list,
    defaults: defaults,
  }
})()
