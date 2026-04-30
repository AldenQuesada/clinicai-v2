/**
 * ClinicAI — Rules Service (Sprint 9)
 *
 * Camada de negócio para o motor de regras de automação.
 * Dispara avaliações de regras de forma assíncrona (fire-and-forget)
 * sem bloquear o fluxo principal da UI.
 *
 * Depende de:
 *   RulesRepository (rules.repository.js)
 *
 * API pública (window.RulesService):
 *   evaluateRules(leadId, event, context?)  → fire-and-forget, retorna Promise
 *   getRules()                              → Promise<{ ok, data }>
 *   toggleRule(ruleId, active)              → Promise<{ ok }>
 *   upsertRule(rule)                        → Promise<{ ok, data: id }>
 *   deleteRule(ruleId)                      → Promise<{ ok }>
 */

;(function () {
  'use strict'

  if (window._clinicaiRulesServiceLoaded) return
  window._clinicaiRulesServiceLoaded = true

  function _repo() { return window.RulesRepository || null }

  // ── Avaliação de regras (fire-and-forget) ─────────────────────
  /**
   * Avalia regras ativas para o evento e lead informados.
   * Não bloqueia: erros são apenas logados no console.
   *
   * @param {string} leadId
   * @param {string} event        — ex: 'phase_changed', 'tag_added', 'tag_removed'
   * @param {object} [context]    — ex: { to_phase: 'agendamento' } ou { tag_slug: 'lead.sem_resposta' }
   * @returns {Promise<object>}
   */
  async function evaluateRules(leadId, event, context = {}) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'RulesRepository não disponível' }

    const result = await repo.evaluateRules(leadId, event, context)

    if (!result.ok) {
      console.warn('[RulesService] evaluateRules falhou:', result.error)
    } else if (result.data?.rules_fired > 0) {
      console.info(
        '[RulesService] %d regra(s) disparada(s) — evento: %s, lead: %s',
        result.data.rules_fired,
        event,
        leadId
      )
    }

    return result
  }

  // ── Listagem ──────────────────────────────────────────────────

  async function getRules() {
    const repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'RulesRepository não disponível' }

    const result = await repo.getRules()
    if (!result.ok) {
      console.warn('[RulesService] getRules falhou:', result.error)
    }
    return result
  }

  // ── Toggle ────────────────────────────────────────────────────

  async function toggleRule(ruleId, active) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'RulesRepository não disponível' }

    const result = await repo.toggleRule(ruleId, active)
    if (!result.ok) {
      console.warn('[RulesService] toggleRule falhou:', result.error)
    }
    return result
  }

  // ── Upsert ────────────────────────────────────────────────────

  /**
   * Cria ou atualiza uma regra de automação.
   * @param {object} rule — campos da regra (id opcional para edição)
   * @returns {Promise<{ ok, data: uuid|null, error? }>}
   */
  async function upsertRule(rule) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'RulesRepository não disponível' }

    const result = await repo.upsertRule(rule)
    if (!result.ok) {
      console.warn('[RulesService] upsertRule falhou:', result.error)
    }
    return result
  }

  // ── Delete ────────────────────────────────────────────────────

  /**
   * Exclui uma regra de automação.
   * @param {string} ruleId — UUID da regra
   * @returns {Promise<{ ok, error? }>}
   */
  async function deleteRule(ruleId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'RulesRepository não disponível' }

    const result = await repo.deleteRule(ruleId)
    if (!result.ok) {
      console.warn('[RulesService] deleteRule falhou:', result.error)
    }
    return result
  }

  // ── Exposição global ──────────────────────────────────────────
  window.RulesService = Object.freeze({
    evaluateRules,
    getRules,
    toggleRule,
    upsertRule,
    deleteRule,
  })

})()
