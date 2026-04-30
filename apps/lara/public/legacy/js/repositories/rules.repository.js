/**
 * ClinicAI — Rules Repository (Sprint 9)
 *
 * Acesso puro ao Supabase para o motor de regras.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   sdr_evaluate_rules(p_lead_id, p_event, p_context?)
 *   sdr_get_rules()
 *   sdr_toggle_rule(p_rule_id, p_active)
 *   sdr_upsert_rule(p_id?, p_slug?, p_name, p_description?, ...)
 *   sdr_delete_rule(p_rule_id)
 *
 * Depende de:
 *   window._sbShared — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiRulesRepoLoaded) return
  window._clinicaiRulesRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null } }
  function _err(error) { return { ok: false, data: null, error } }

  // ── Avaliação de regras ───────────────────────────────────────

  async function evaluateRules(leadId, event, context = {}) {
    try {
      const { data, error } = await _sb().rpc('sdr_evaluate_rules', {
        p_lead_id: leadId,
        p_event:   event,
        p_context: context,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Listagem de regras ────────────────────────────────────────

  async function getRules() {
    try {
      const { data, error } = await _sb().rpc('sdr_get_rules')
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Ativar / desativar regra ──────────────────────────────────

  async function toggleRule(ruleId, active) {
    try {
      const { data, error } = await _sb().rpc('sdr_toggle_rule', {
        p_rule_id: ruleId,
        p_active:  active,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Criar / atualizar regra ───────────────────────────────────

  async function upsertRule(rule) {
    try {
      const { data, error } = await _sb().rpc('sdr_upsert_rule', {
        p_id:             rule.id             || null,
        p_slug:           rule.slug           || null,
        p_name:           rule.name,
        p_description:    rule.description    || null,
        p_trigger_event:  rule.trigger_event,
        p_conditions:     rule.conditions     || [],
        p_actions:        rule.actions        || [],
        p_is_active:      rule.is_active      ?? false,
        p_priority:       rule.priority       ?? 50,
        p_cooldown_hours: rule.cooldown_hours  || null,
        p_max_executions: rule.max_executions  || null,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.id ?? null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Excluir regra ─────────────────────────────────────────────

  async function deleteRule(ruleId) {
    try {
      const { data, error } = await _sb().rpc('sdr_delete_rule', {
        p_rule_id: ruleId,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.RulesRepository = Object.freeze({
    evaluateRules,
    getRules,
    toggleRule,
    upsertRule,
    deleteRule,
  })

})()
