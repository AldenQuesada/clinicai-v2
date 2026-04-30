/**
 * ClinicAI — Storage Namespace (multi-tenant safe)
 *
 * Helper pra localStorage com namespace por clinic_id. Evita vazamento de
 * dados entre operadores do mesmo dispositivo (ex: Dr. Alden e
 * Recepcionista X logando no mesmo Chrome — appointments compartilhados).
 *
 * Uso:
 *   ClinicStorage.get('clinicai_appointments')     // -> localStorage['clinicai_appointments_<clinic_id>']
 *   ClinicStorage.set('clinicai_appointments', v)  // -> seta namespaced
 *   ClinicStorage.remove('clinicai_appointments')
 *   ClinicStorage.clinicId()                       // resolve current
 *
 * Fallback: se clinic_id indisponivel, usa 'default' (preserva comportamento
 * legacy em contexto sem login — ex: lp.html anon).
 *
 * Namespace SKIP: algumas chaves globais (settings compartilhadas) nao
 * devem ser namespaceadas. Lista whitelist em `SKIP_NAMESPACE`.
 *
 * Refs:
 *   - code-review/agenda.md C4 — localStorage sem clinic_id vaza entre operadores
 *   - project_clinic_mirian_full_access.md — Mirian (owner) tem escopo full
 */
;(function () {
  'use strict'

  if (window.ClinicStorage) return

  // Chaves que NAO devem ser namespaced (compartilhadas entre clinicas do device)
  var SKIP_NAMESPACE = {
    'clinicai_consent':          1,
    'clinicai_theme':            1,
    'clinicai_locale':           1,
    'clinicai_feature_flags':    1,
    // Auth session (gerenciada pelo supabase-js) — no-op aqui
  }

  function _clinicId() {
    // 1. Sessão ativa
    try {
      var profile = sessionStorage.getItem('clinicai_profile')
      if (profile) {
        var parsed = JSON.parse(profile)
        if (parsed && parsed.clinic_id) return String(parsed.clinic_id)
      }
    } catch (e) {}

    // 2. JWT decoded (via window.ClinicAuth se exposto)
    try {
      if (window.ClinicAuth && typeof ClinicAuth.getClinicId === 'function') {
        var c = ClinicAuth.getClinicId()
        if (c) return String(c)
      }
    } catch (e) {}

    // 3. Default Mirian (backward compat)
    return '00000000-0000-0000-0000-000000000001'
  }

  function _nsKey(key) {
    if (!key) return key
    if (SKIP_NAMESPACE[key]) return key
    return key + '_' + _clinicId()
  }

  function get(key) {
    try { return localStorage.getItem(_nsKey(key)) } catch (e) { return null }
  }

  function set(key, value) {
    try { localStorage.setItem(_nsKey(key), value) } catch (e) {}
  }

  function remove(key) {
    try { localStorage.removeItem(_nsKey(key)) } catch (e) {}
  }

  function getJSON(key, fallback) {
    var raw = get(key)
    if (raw == null) return fallback === undefined ? null : fallback
    try { return JSON.parse(raw) }
    catch (e) { return fallback === undefined ? null : fallback }
  }

  function setJSON(key, value) {
    try { set(key, JSON.stringify(value)) } catch (e) {}
  }

  // Helper pra purgar todas as keys da clinica atual (logout cleanup)
  function purgeClinic() {
    try {
      var cid = _clinicId()
      var suffix = '_' + cid
      var toRemove = []
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        if (k && k.endsWith(suffix)) toRemove.push(k)
      }
      toRemove.forEach(function (k) { localStorage.removeItem(k) })
      return toRemove.length
    } catch (e) { return 0 }
  }

  // Migrate legacy: move chaves globais pra namespaced na primeira carga
  // (one-shot, idempotente)
  function migrateLegacy(keys) {
    if (!Array.isArray(keys)) return
    try {
      var cid = _clinicId()
      keys.forEach(function (key) {
        if (SKIP_NAMESPACE[key]) return
        var legacyRaw = localStorage.getItem(key)
        if (legacyRaw == null) return
        var nsKey = key + '_' + cid
        // So migra se namespaced ainda nao existe
        if (localStorage.getItem(nsKey) == null) {
          localStorage.setItem(nsKey, legacyRaw)
        }
        // Nao remove legacy automaticamente — fallback safety. Caller decide.
      })
    } catch (e) {}
  }

  window.ClinicStorage = Object.freeze({
    get:          get,
    set:          set,
    remove:       remove,
    getJSON:      getJSON,
    setJSON:      setJSON,
    clinicId:     _clinicId,
    nsKey:        _nsKey,
    purgeClinic:  purgeClinic,
    migrateLegacy: migrateLegacy,
    SKIP_NAMESPACE: SKIP_NAMESPACE,
  })

  // Auto-migrate chaves criticas se legacy existir e namespaced ainda nao
  migrateLegacy([
    'clinicai_appointments',
    'clinicai_appointments_backup',
    'clinicai_leads',
    'clinicai_patients',
    'clinicai_appt_offline_queue',
  ])
})()
