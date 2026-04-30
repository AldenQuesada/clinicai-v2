;(function () {
  'use strict'
  if (window._clinicaiLocalMigrationLoaded) return
  window._clinicaiLocalMigrationLoaded = true

  const MIGRATED_KEY = 'clinicai_sb_migrated_v1'

  function _safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback }
    catch { return fallback }
  }

  async function run() {
    if (localStorage.getItem(MIGRATED_KEY) === 'true') return { ok: true, skipped: true }

    const data = {
      rooms:         _safeJson('clinicai_rooms',         []),
      technologies:  _safeJson('clinicai_technologies',  []),
      professionals: _safeJson('clinicai_professionals', []),
      injetaveis:    _safeJson('clinic_injetaveis',      []),
      procedimentos: _safeJson('clinic_procedimentos',   []),
    }

    const total = Object.values(data).reduce((s, arr) => s + arr.length, 0)
    if (total === 0) {
      localStorage.setItem(MIGRATED_KEY, 'true')
      return { ok: true, skipped: true, reason: 'empty' }
    }

    const sb = window._sbShared
    if (!sb) return { ok: false, error: 'Supabase não inicializado' }

    try {
      const { data: result, error } = await sb.rpc('migrate_local_data', { p_data: data })
      if (error) return { ok: false, error: error.message || String(error) }

      localStorage.setItem(MIGRATED_KEY, 'true')
      console.info('[Migration] Dados locais migrados para Supabase:', result?.migrated)
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  }

  function hasMigrated() {
    return localStorage.getItem(MIGRATED_KEY) === 'true'
  }

  function reset() {
    localStorage.removeItem(MIGRATED_KEY)
  }

  window.LocalMigrationService = Object.freeze({ run, hasMigrated, reset })
})()
