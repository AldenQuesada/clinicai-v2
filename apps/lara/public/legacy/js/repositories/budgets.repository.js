/**
 * BudgetsRepository
 *
 * Camada de acesso a dados para a tabela `budgets` via Supabase RPCs.
 *
 * Dependências:
 *   window._sbShared — cliente Supabase compartilhado
 *
 * API pública (window.BudgetsRepository):
 *   getBudgets(leadId)                      → {ok, data:[]}
 *   upsertBudget({id?, lead_id, title, ...}) → {ok, id, is_update}
 *   deleteBudget(budgetId)                  → {ok}
 *   updateStatus(budgetId, status)          → {ok}
 */
;(function () {
  'use strict'

  if (window.BudgetsRepository) return

  // ── Helpers ─────────────────────────────────────────────────

  function _sb() { return window._sbShared }
  function _ok(data)  { return { ok: true,  data, error: null }  }
  function _err(msg)  { return { ok: false, data: null, error: msg } }

  function _unavailable() {
    return _err('Supabase nao disponivel')
  }

  // ── getBudgets ───────────────────────────────────────────────

  async function getBudgets(leadId) {
    if (!_sb()) return _unavailable()
    try {
      const { data, error } = await _sb().rpc('sdr_get_budgets', { p_lead_id: leadId })
      if (error) return _err(error.message || String(error))
      if (data?.ok === false) return _err(data.error || 'Erro desconhecido')
      return _ok(data?.data ?? [])
    } catch (e) {
      return _err(e.message)
    }
  }

  // ── upsertBudget ─────────────────────────────────────────────

  async function upsertBudget(budget) {
    if (!_sb()) return _unavailable()
    try {
      const { data, error } = await _sb().rpc('sdr_upsert_budget', {
        p_id:          budget.id           || null,
        p_lead_id:     budget.lead_id      || null,
        p_title:       budget.title        || null,
        p_notes:       budget.notes        || null,
        p_status:      budget.status       || 'draft',
        p_items:       budget.items        || [],
        p_valid_until: budget.valid_until  || null,
        p_discount:    parseFloat(budget.discount) || 0,
        p_payments:    Array.isArray(budget.payments_json) ? budget.payments_json : [],
      })
      if (error) return _err(error.message || String(error))
      if (data?.ok === false) return _err(data.error || 'Erro desconhecido')
      return _ok({ id: data?.id ?? null, is_update: data?.is_update ?? false })
    } catch (e) {
      return _err(e.message)
    }
  }

  // ── deleteBudget ─────────────────────────────────────────────

  async function deleteBudget(budgetId) {
    if (!_sb()) return _unavailable()
    try {
      const { data, error } = await _sb().rpc('sdr_delete_budget', { p_budget_id: budgetId })
      if (error) return _err(error.message || String(error))
      if (data?.ok === false) return _err(data.error || 'Erro desconhecido')
      return _ok(true)
    } catch (e) {
      return _err(e.message)
    }
  }

  // ── updateStatus ─────────────────────────────────────────────

  async function updateStatus(budgetId, status) {
    if (!_sb()) return _unavailable()
    try {
      const { data, error } = await _sb().rpc('sdr_update_budget_status', {
        p_budget_id: budgetId,
        p_status:    status,
      })
      if (error) return _err(error.message || String(error))
      if (data?.ok === false) return _err(data.error || 'Erro desconhecido')
      return _ok(true)
    } catch (e) {
      return _err(e.message)
    }
  }

  // ── Exposição global ─────────────────────────────────────────

  window.BudgetsRepository = Object.freeze({
    getBudgets,
    upsertBudget,
    deleteBudget,
    updateStatus,
  })

})()
