/**
 * ClinicAI — Dashboard Repository
 *
 * Acesso puro ao Supabase para analytics do dashboard.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   dashboard_kpis()  — KPIs consolidados da clínica (leads, agenda, receita, funil)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiDashRepoLoaded) return
  window._clinicaiDashRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── fetchKPIs ─────────────────────────────────────────────────
  /**
   * Busca todos os KPIs consolidados da clínica via RPC server-side.
   * Uma única chamada retorna: leads, agendamentos, receita, funil e trends.
   *
   * @returns {Promise<{ok, data: object, error}>}
   */
  async function fetchKPIs() {
    try {
      const { data, error } = await _sb().rpc('dashboard_kpis')
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.DashboardRepository = Object.freeze({ fetchKPIs })

})()
