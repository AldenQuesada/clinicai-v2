/**
 * ClinicAI - Leads Cache Helper (Shared)
 *
 * Motivacao:
 *   Dezenas de arquivos liam `localStorage.getItem('clinicai_leads')` direto,
 *   violando a regra "NUNCA ler localStorage direto, sempre LeadsService".
 *   Efeitos: stale data entre abas, soft-delete nao respeitado, bypass de
 *   merge Supabase-first do LeadsService.loadAll().
 *
 * Este helper centraliza o acesso:
 *   - `read()` sync: LeadsService.getLocal() ou fallback direto
 *   - `readAsync()` async: LeadsService.loadAll() ou fallback direto
 *
 * A API preserva compatibilidade total com a leitura anterior
 * (JSON.parse(localStorage.getItem('clinicai_leads') || '[]')), sendo
 * drop-in replacement.
 *
 * Uso:
 *   var leads = window.ClinicLeadsCache.read()          // sync
 *   var leads = await window.ClinicLeadsCache.readAsync() // async/Supabase merge
 *
 * Preenche lacuna para handlers sync (DOM events) que nao podem ser async.
 */
;(function () {
  'use strict'

  if (window.ClinicLeadsCache) return

  var KEY = 'clinicai_leads'

  function _fallbackLocal() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]')
    } catch (e) {
      return []
    }
  }

  function read() {
    if (window.LeadsService && typeof window.LeadsService.getLocal === 'function') {
      try {
        return window.LeadsService.getLocal() || []
      } catch (e) {
        return _fallbackLocal()
      }
    }
    return _fallbackLocal()
  }

  async function readAsync() {
    if (window.LeadsService && typeof window.LeadsService.loadAll === 'function') {
      try {
        return await window.LeadsService.loadAll()
      } catch (e) {
        return _fallbackLocal()
      }
    }
    return _fallbackLocal()
  }

  window.ClinicLeadsCache = Object.freeze({ read: read, readAsync: readAsync })
})()
