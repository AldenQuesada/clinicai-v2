/**
 * ClinicAI — Financeiro Service
 *
 * Lógica de negócio para o módulo financeiro.
 * Gerencia sincronização bidirecional Supabase ↔ localStorage.
 * Graceful degradation: funciona sem Supabase (só localStorage).
 *
 * Depende de:
 *   FinanceiroRepository  (financeiro.repository.js)
 *   PermissionsService    (permissions.service.js)
 *
 * API pública (window.FinanceiroService):
 *   loadMonth(year, month)        — carrega meta do mês + config
 *   loadAnnualPlan(year)          — carrega planejamento anual
 *   saveMonthGoal(year, month, meta)       — salva meta mensal
 *   saveConfig(gastos, procs, demo)        — salva config da clínica
 *   saveAnnualPlan(year, planejamento)     — salva planejamento
 *   canEdit()                             — boolean: pode salvar?
 */

;(function () {
  'use strict'

  if (window._clinicaiFinServiceLoaded) return
  window._clinicaiFinServiceLoaded = true

  // ── Chaves localStorage (compatibilidade com código existente) ─
  const KEYS = {
    meta:   'clinicai_fin_meta',
    gastos: 'clinicai_fin_gastos',
    procs:  'clinicai_fin_procs',
    demo:   'clinicai_fin_demo',
    plan:   'clinicai_fin_plan',
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _canEdit() {
    const perms = window.PermissionsService
    return perms ? perms.can('financeiro:edit') : false
  }

  function _local(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  }

  function _localSet(key, val) {
    try {
      if (window.store?.set) { window.store.set(key, val) }
      else { localStorage.setItem(key, JSON.stringify(val)) }
    } catch (e) {
      if (e.name !== 'QuotaExceededError') console.warn('[FinanceiroService] localStorage:', e)
    }
  }

  // ── loadMonth(year, month) ───────────────────────────────────
  /**
   * Carrega meta do mês e config (gastos, procs, demo).
   * Supabase vence sobre localStorage quando disponível.
   *
   * @returns {Promise<{meta, gastos, procs, demo}>}
   */
  async function loadMonth(year, month) {
    const repo = window.FinanceiroRepository

    // Valores locais como fallback
    const localMeta   = _local(KEYS.meta)
    const localGastos = _local(KEYS.gastos)
    const localProcs  = _local(KEYS.procs)
    const localDemo   = _local(KEYS.demo)

    if (!repo) {
      return { meta: localMeta, gastos: localGastos, procs: localProcs, demo: localDemo }
    }

    const result = await repo.getAllData(year, month)
    if (!result.ok) {
      console.warn('[FinanceiroService] Supabase indisponível, usando localStorage:', result.error)
      return { meta: localMeta, gastos: localGastos, procs: localProcs, demo: localDemo }
    }

    const { goal, config } = result.data

    // Mescla: Supabase vence em dados existentes, localStorage completa
    const meta   = Object.keys(goal).length   > 0 ? goal              : localMeta
    const gastos = config.gastos?.fixos?.length > 0 || config.gastos?.variaveis?.length > 0
      ? config.gastos : localGastos
    const procs  = Array.isArray(config.procs) && config.procs.length > 0
      ? config.procs : localProcs
    const demo   = Object.keys(config.demo || {}).length > 0 ? config.demo : localDemo

    // Sincroniza localStorage com dados do Supabase
    if (meta)   _localSet(KEYS.meta,   meta)
    if (gastos) _localSet(KEYS.gastos, gastos)
    if (procs)  _localSet(KEYS.procs,  procs)
    if (demo)   _localSet(KEYS.demo,   demo)

    return { meta, gastos, procs, demo }
  }

  // ── loadAnnualPlan(year) ─────────────────────────────────────
  /**
   * @returns {Promise<object|null>}
   */
  async function loadAnnualPlan(year) {
    const repo      = window.FinanceiroRepository
    const localPlan = _local(KEYS.plan)

    if (!repo) return localPlan

    const result = await repo.getAnnualPlan(year)
    if (!result.ok) {
      console.warn('[FinanceiroService] Supabase indisponível (annual plan):', result.error)
      return localPlan
    }

    const plan = Object.keys(result.data || {}).length > 0 ? result.data : localPlan
    if (plan) _localSet(KEYS.plan, plan)
    return plan
  }

  // ── saveMonthGoal(year, month, meta) ────────────────────────
  /**
   * Persiste meta no localStorage e, se tiver permissão, no Supabase.
   */
  async function saveMonthGoal(year, month, metaData) {
    _localSet(KEYS.meta, metaData)

    if (!_canEdit()) return { ok: true, synced: false }

    const repo = window.FinanceiroRepository
    if (!repo)  return { ok: true, synced: false }

    const result = await repo.saveMonthGoal(year, month, metaData)
    if (!result.ok) {
      console.warn('[FinanceiroService] Falha ao salvar meta no Supabase:', result.error)
    }
    return { ok: true, synced: result.ok, error: result.error }
  }

  // ── saveConfig(gastos, procs, demo) ─────────────────────────
  /**
   * Salva configuração (gastos, procedimentos, demo) no localStorage + Supabase.
   * Passa null para um campo que não deve ser alterado.
   */
  async function saveConfig(gastos, procs, demo) {
    if (gastos !== null) _localSet(KEYS.gastos, gastos)
    if (procs  !== null) _localSet(KEYS.procs,  procs)
    if (demo   !== null) _localSet(KEYS.demo,   demo)

    if (!_canEdit()) return { ok: true, synced: false }

    const repo = window.FinanceiroRepository
    if (!repo)  return { ok: true, synced: false }

    const result = await repo.saveConfig(gastos, procs, demo)
    if (!result.ok) {
      console.warn('[FinanceiroService] Falha ao salvar config no Supabase:', result.error)
    }
    return { ok: true, synced: result.ok, error: result.error }
  }

  // ── saveAnnualPlan(year, planejamento) ──────────────────────
  async function saveAnnualPlan(year, planejamento) {
    _localSet(KEYS.plan, planejamento)

    if (!_canEdit()) return { ok: true, synced: false }

    const repo = window.FinanceiroRepository
    if (!repo)  return { ok: true, synced: false }

    const result = await repo.saveAnnualPlan(year, planejamento)
    if (!result.ok) {
      console.warn('[FinanceiroService] Falha ao salvar planejamento no Supabase:', result.error)
    }
    return { ok: true, synced: result.ok, error: result.error }
  }

  // ── canEdit() ────────────────────────────────────────────────
  function canEdit() { return _canEdit() }

  // ── Exposição global ─────────────────────────────────────────
  window.FinanceiroService = Object.freeze({
    loadMonth,
    loadAnnualPlan,
    saveMonthGoal,
    saveConfig,
    saveAnnualPlan,
    canEdit,
  })

})()
