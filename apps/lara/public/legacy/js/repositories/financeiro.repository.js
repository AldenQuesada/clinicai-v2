/**
 * ClinicAI — Financeiro Repository
 *
 * Acesso puro ao Supabase para o módulo financeiro.
 * Sem lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs:
 *   fin_get_all_data(year, month)         — meta do mês + config (gastos/procs/demo)
 *   fin_save_month_goal(year, month, data) — upsert da meta mensal
 *   fin_save_config(gastos, procs, demo)   — upsert de gastos/procedimentos/demo
 *   fin_get_annual_plan(year)              — planejamento anual
 *   fin_save_annual_plan(year, plan_data)  — upsert do planejamento anual
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiFinRepoLoaded) return
  window._clinicaiFinRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── getAllData(year, month) ──────────────────────────────────
  /**
   * Retorna meta do mês + configuração (gastos, procs, demo) em uma chamada.
   * @param {number} year
   * @param {number} month  1–12
   */
  async function getAllData(year, month) {
    try {
      const { data, error } = await _sb().rpc('fin_get_all_data', {
        p_year:  year,
        p_month: month,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── saveMonthGoal(year, month, metaData) ────────────────────
  /**
   * Salva a meta do mês atual.
   * @param {number} year
   * @param {number} month
   * @param {object} metaData  — { mensal, realizado, ticketMedio, diasUteis, diasDecorridos, mesAtual }
   */
  async function saveMonthGoal(year, month, metaData) {
    try {
      const { data, error } = await _sb().rpc('fin_save_month_goal', {
        p_year:      year,
        p_month:     month,
        p_meta_data: metaData,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── saveConfig(gastos, procs, demo) ────────────────────────
  /**
   * Salva a configuração financeira da clínica.
   * Qualquer parâmetro null não será atualizado.
   * @param {object|null} gastos  — { fixos: [], variaveis: [] }
   * @param {Array|null}  procs   — [{ id, nome, cat, preco, custo, qtd }]
   * @param {object|null} demo    — dados demográficos
   */
  async function saveConfig(gastos, procs, demo) {
    try {
      const { data, error } = await _sb().rpc('fin_save_config', {
        p_gastos: gastos ?? null,
        p_procs:  procs  ?? null,
        p_demo:   demo   ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getAnnualPlan(year) ─────────────────────────────────────
  /**
   * @param {number} year
   */
  async function getAnnualPlan(year) {
    try {
      const { data, error } = await _sb().rpc('fin_get_annual_plan', { p_year: year })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── saveAnnualPlan(year, planData) ──────────────────────────
  /**
   * @param {number} year
   * @param {object} planData  — { ano, meses, especialistas }
   */
  async function saveAnnualPlan(year, planData) {
    try {
      const { data, error } = await _sb().rpc('fin_save_annual_plan', {
        p_year:      year,
        p_plan_data: planData,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ─────────────────────────────────────────
  window.FinanceiroRepository = Object.freeze({
    getAllData,
    saveMonthGoal,
    saveConfig,
    getAnnualPlan,
    saveAnnualPlan,
  })

})()
