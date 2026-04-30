/**
 * ClinicAI — SDR Repository (Sprint 8)
 *
 * Acesso puro ao Supabase para o módulo SDR.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   sdr_assign_tag(p_tag_slug, p_entity_type, p_entity_id, p_origin?)
 *   sdr_remove_tag(p_tag_slug, p_entity_type, p_entity_id)
 *   sdr_get_tags(p_entity_type, p_entity_id)
 *   sdr_get_tags_bulk(p_entity_type, p_entity_ids)
 *   sdr_move_lead(p_lead_id, p_pipeline_slug, p_stage_slug, p_origin?)
 *   sdr_init_lead_pipelines(p_lead_id)
 *   sdr_get_kanban_7dias(p_phase?)
 *   sdr_get_kanban_evolution(p_phase?)
 *   sdr_change_phase(p_lead_id, p_to_phase, p_reason?)
 *   sdr_get_phase_history(p_lead_id)
 *
 * Depende de:
 *   window._sbShared — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiSdrRepoLoaded) return
  window._clinicaiSdrRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null } }
  function _err(error) { return { ok: false, data: null, error } }

  // ── Tags ──────────────────────────────────────────────────────

  async function assignTag(tagSlug, entityType, entityId, origin = 'manual') {
    try {
      const { data, error } = await _sb().rpc('sdr_assign_tag', {
        p_tag_slug:    tagSlug,
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_origin:      origin,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function removeTag(tagSlug, entityType, entityId) {
    try {
      const { data, error } = await _sb().rpc('sdr_remove_tag', {
        p_tag_slug:    tagSlug,
        p_entity_type: entityType,
        p_entity_id:   entityId,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getTags(entityType, entityId) {
    try {
      const { data, error } = await _sb().rpc('sdr_get_tags', {
        p_entity_type: entityType,
        p_entity_id:   entityId,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getTagsBulk(entityType, entityIds) {
    if (!entityIds?.length) return _ok({})
    try {
      const { data, error } = await _sb().rpc('sdr_get_tags_bulk', {
        p_entity_type: entityType,
        p_entity_ids:  entityIds,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? {})
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Pipeline ──────────────────────────────────────────────────

  async function moveLead(leadId, pipelineSlug, stageSlug, origin = 'drag') {
    try {
      const { data, error } = await _sb().rpc('sdr_move_lead', {
        p_lead_id:       leadId,
        p_pipeline_slug: pipelineSlug,
        p_stage_slug:    stageSlug,
        p_origin:        origin,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function initLeadPipelines(leadId) {
    try {
      const { data, error } = await _sb().rpc('sdr_init_lead_pipelines', {
        p_lead_id: leadId,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getKanban7Dias(phase = null) {
    try {
      const params = {}
      if (phase) params.p_phase = phase
      const { data, error } = await _sb().rpc('sdr_get_kanban_7dias', params)
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? { stages: [] })
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getKanbanEvolution(phase = null) {
    try {
      const params = {}
      if (phase) params.p_phase = phase
      const { data, error } = await _sb().rpc('sdr_get_kanban_evolution', params)
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? { stages: [] })
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Interações ───────────────────────────────────────────────

  async function addInteraction(leadId, type, content = null, outcome = null, direction = null, durationSec = null) {
    try {
      const { data, error } = await _sb().rpc('sdr_add_interaction', {
        p_lead_id:      leadId,
        p_type:         type,
        p_content:      content,
        p_outcome:      outcome,
        p_direction:    direction,
        p_duration_sec: durationSec,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getInteractions(leadId, limit = 20) {
    try {
      const { data, error } = await _sb().rpc('sdr_get_interactions', {
        p_lead_id: leadId,
        p_limit:   limit,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Fase ──────────────────────────────────────────────────────

  async function changePhase(leadId, toPhase, reason = null) {
    try {
      const { data, error } = await _sb().rpc('sdr_change_phase', {
        p_lead_id:  leadId,
        p_to_phase: toPhase,
        p_reason:   reason,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getPhaseHistory(leadId) {
    try {
      const { data, error } = await _sb().rpc('sdr_get_phase_history', {
        p_lead_id: leadId,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── advanceDayBuckets ─────────────────────────────────────────
  async function advanceDayBuckets() {
    try {
      const sb = _sb()
      if (!sb) return _err('Supabase indisponível')
      const { data, error } = await sb.rpc('sdr_advance_day_buckets')
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.SdrRepository = Object.freeze({
    assignTag,
    removeTag,
    getTags,
    getTagsBulk,
    moveLead,
    initLeadPipelines,
    getKanban7Dias,
    getKanbanEvolution,
    changePhase,
    getPhaseHistory,
    addInteraction,
    getInteractions,
    advanceDayBuckets,
    getFunnelMetrics,
    getFunnelBySource,
  })

  async function getFunnelBySource(from, to) {
    try {
      const sb = _sb()
      if (!sb) return _err('Supabase indisponível')
      var params = {}
      if (from) params.p_from = from
      if (to)   params.p_to   = to
      const { data, error } = await sb.rpc('sdr_funnel_by_source', params)
      if (error) return _err(error.message || String(error))
      return data
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function getFunnelMetrics(from, to) {
    try {
      const sb = _sb()
      if (!sb) return _err('Supabase indisponível')
      var params = {}
      if (from) params.p_from = from
      if (to)   params.p_to   = to
      const { data, error } = await sb.rpc('sdr_funnel_metrics', params)
      if (error) return _err(error.message || String(error))
      return data
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

})()
