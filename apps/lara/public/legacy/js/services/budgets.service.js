/**
 * BudgetsService
 *
 * Orquestra operações de orçamento: CRUD via BudgetsRepository
 * + disparo de regras de automação no evento `budget_created`.
 *
 * Dependências:
 *   BudgetsRepository  (budgets.repository.js)
 *   RulesService       (rules.service.js)  — opcional, fire-and-forget
 *
 * API pública (window.BudgetsService):
 *   getBudgets(leadId)   → {ok, data:[]}
 *   upsert(budget)       → {ok, id, is_update}
 *   delete(budgetId)     → {ok}
 *   updateStatus(id, s)  → {ok}
 */
;(function () {
  'use strict'

  if (window.BudgetsService) return

  // ── Helpers ─────────────────────────────────────────────────

  function _repo() { return window.BudgetsRepository }

  function _unavailable() {
    return { ok: false, error: 'BudgetsRepository nao carregado' }
  }

  // ── getBudgets ───────────────────────────────────────────────

  async function getBudgets(leadId) {
    if (!_repo()) return _unavailable()
    return _repo().getBudgets(leadId)
  }

  // ── upsert ───────────────────────────────────────────────────

  async function upsert(budget) {
    if (!_repo()) return _unavailable()

    const result = await _repo().upsertBudget(budget)

    // Fire-and-forget: dispara regras `budget_created` apenas em novos orçamentos
    if (result.ok && !budget.id && window.RulesService) {
      window.RulesService.evaluateRules(budget.lead_id, 'budget_created', {})
        .catch(function (e) {
          console.warn('[BudgetsService] budget_created rules:', e.message)
        })
    }

    return result
  }

  // ── delete ───────────────────────────────────────────────────

  async function deleteBudget(budgetId) {
    if (!_repo()) return _unavailable()
    return _repo().deleteBudget(budgetId)
  }

  // ── updateStatus ─────────────────────────────────────────────

  async function updateStatus(budgetId, status) {
    if (!_repo()) return _unavailable()
    return _repo().updateStatus(budgetId, status)
  }

  // ── Exposição global ─────────────────────────────────────────

  window.BudgetsService = Object.freeze({
    getBudgets,
    upsert,
    delete:       deleteBudget,
    updateStatus,
  })

})()
