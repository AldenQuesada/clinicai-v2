/**
 * ClinicAI — SDR Service (Sprint 8)
 *
 * Camada de negócio para o módulo SDR.
 * Gerencia tags, fases e posições nos pipelines.
 * Graceful degradation: opera com cache local se Supabase indisponível.
 *
 * Depende de:
 *   SdrRepository  (sdr.repository.js)
 *
 * API pública (window.SdrService):
 *   Tags:
 *     assignTag(tagSlug, entityType, entityId)
 *     removeTag(tagSlug, entityType, entityId)
 *     setTemperature(leadId, temperature)   → exclusiva: cold | warm | hot
 *     setPriority(leadId, priority)          → exclusiva: normal | high | urgent
 *     getTags(entityType, entityId)
 *     getTagsBulk(entityType, entityIds)
 *
 *   Fase:
 *     changePhase(leadId, toPhase, reason?)
 *     getPhaseHistory(leadId)
 *
 *   Pipeline:
 *     moveLead(leadId, pipelineSlug, stageSlug)
 *     initLeadPipelines(leadId)
 *     getKanban7Dias(phase?)
 *     getKanbanEvolution(phase?)
 */

;(function () {
  'use strict'

  if (window._clinicaiSdrServiceLoaded) return
  window._clinicaiSdrServiceLoaded = true

  function _repo() { return window.SdrRepository || null }

  // Mapa de temperatura → slug da tag
  const TEMPERATURE_TAGS = {
    cold: 'lead.frio',
    warm: 'lead.morno',
    hot:  'lead.quente',
  }

  // Mapa de prioridade → slug da tag
  const PRIORITY_TAGS = {
    normal: null,               // prioridade normal não tem tag
    high:   'lead.prioridade_alta',
    urgent: 'lead.prioridade_alta',
  }

  // ── Tags ──────────────────────────────────────────────────────

  async function assignTag(tagSlug, entityType, entityId, origin = 'manual') {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    const result = await repo.assignTag(tagSlug, entityType, entityId, origin)
    if (!result.ok) {
      console.warn('[SdrService] assignTag falhou:', result.error)
    } else if (entityType === 'lead' && origin !== 'rule') {
      window.RulesService?.evaluateRules(entityId, 'tag_added', { tag_slug: tagSlug })
    }
    return result
  }

  async function removeTag(tagSlug, entityType, entityId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    const result = await repo.removeTag(tagSlug, entityType, entityId)
    if (!result.ok) {
      console.warn('[SdrService] removeTag falhou:', result.error)
    } else if (entityType === 'lead') {
      window.RulesService?.evaluateRules(entityId, 'tag_removed', { tag_slug: tagSlug })
    }
    return result
  }

  async function getTags(entityType, entityId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível', data: [] }

    return repo.getTags(entityType, entityId)
  }

  async function getTagsBulk(entityType, entityIds) {
    const repo = _repo()
    if (!repo || !entityIds?.length) return { ok: true, data: {} }

    return repo.getTagsBulk(entityType, entityIds)
  }

  // ── Temperatura (tag exclusiva por category) ──────────────────
  /**
   * Define a temperatura do lead.
   * Remove automaticamente a tag anterior da categoria 'temperatura'.
   *
   * @param {string} leadId
   * @param {'cold'|'warm'|'hot'} temperature
   */
  async function setTemperature(leadId, temperature) {
    const tagSlug = TEMPERATURE_TAGS[temperature]
    if (!tagSlug) return { ok: false, error: 'Temperatura inválida: ' + temperature }

    // A função sdr_assign_tag já remove exclusivas da mesma categoria
    return assignTag(tagSlug, 'lead', leadId, 'manual')
  }

  // ── Prioridade ────────────────────────────────────────────────
  /**
   * Define a prioridade do lead via tag.
   *
   * @param {string} leadId
   * @param {'normal'|'high'|'urgent'} priority
   */
  async function setPriority(leadId, priority) {
    const tagSlug = PRIORITY_TAGS[priority]

    if (!tagSlug) {
      // prioridade normal = remove tag de prioridade alta se existir
      return removeTag('lead.prioridade_alta', 'lead', leadId)
    }

    return assignTag(tagSlug, 'lead', leadId, 'manual')
  }

  // ── Fase ──────────────────────────────────────────────────────

  async function changePhase(leadId, toPhase, reason = null) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    const result = await repo.changePhase(leadId, toPhase, reason)
    if (!result.ok) {
      console.warn('[SdrService] changePhase falhou:', result.error)
    } else {
      _updateLeadPhaseLocal(leadId, toPhase)
      // ENGINE CANONICO: RulesService eh a unica fonte de campanhas por phase_changed.
      // O stub AutomationsEngine.dispatchCampaignForLead eh no-op (legado); nao chamar
      // para evitar qualquer double-fire futuro caso alguem re-implemente o stub.
      window.RulesService?.evaluateRules(leadId, 'phase_changed', { to_phase: toPhase })
    }
    return result
  }

  async function getPhaseHistory(leadId) {
    const repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'SdrRepository não disponível' }

    return repo.getPhaseHistory(leadId)
  }

  // ── Pipeline ──────────────────────────────────────────────────

  async function moveLead(leadId, pipelineSlug, stageSlug) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    const result = await repo.moveLead(leadId, pipelineSlug, stageSlug, 'drag')
    if (!result.ok) {
      console.warn('[SdrService] moveLead falhou:', result.error)
    }
    return result
  }

  async function initLeadPipelines(leadId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    return repo.initLeadPipelines(leadId)
  }

  async function getKanban7Dias(phase = null) {
    const repo = _repo()
    if (!repo) return { ok: false, data: { stages: [] }, error: 'SdrRepository não disponível' }

    const result = await repo.getKanban7Dias(phase)
    if (!result.ok) {
      console.warn('[SdrService] getKanban7Dias falhou:', result.error)
      return { ok: false, data: { stages: [] }, error: result.error }
    }
    return result
  }

  async function getKanbanEvolution(phase = null) {
    const repo = _repo()
    if (!repo) return { ok: false, data: { stages: [] }, error: 'SdrRepository não disponível' }

    const result = await repo.getKanbanEvolution(phase)
    if (!result.ok) {
      console.warn('[SdrService] getKanbanEvolution falhou:', result.error)
      return { ok: false, data: { stages: [] }, error: result.error }
    }
    return result
  }

  // ── Interações ───────────────────────────────────────────────

  async function addInteraction(leadId, type, content = null, outcome = null, direction = null, durationSec = null) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'SdrRepository não disponível' }

    const result = await repo.addInteraction(leadId, type, content, outcome, direction, durationSec)
    if (!result.ok) {
      console.warn('[SdrService] addInteraction falhou:', result.error)
    }
    return result
  }

  async function getInteractions(leadId, limit = 20) {
    const repo = _repo()
    if (!repo) return { ok: false, data: [], error: 'SdrRepository não disponível' }

    return repo.getInteractions(leadId, limit)
  }

  // ── advanceDayBuckets (auto-run diário) ───────────────────────
  var _ADV_KEY = 'clinicai_sdr_last_advance'

  async function advanceDayBucketsIfNeeded() {
    var repo = _repo()
    if (!repo) return

    var today = new Date().toISOString().slice(0, 10)
    var last  = localStorage.getItem(_ADV_KEY)
    if (last === today) return

    var result = await repo.advanceDayBuckets()
    if (result && result.ok) {
      localStorage.setItem(_ADV_KEY, today)
      console.info('[SdrService] Day buckets avançados:', result.data)
    }
  }

  // Dispara automaticamente após autenticação
  document.addEventListener('clinicai:auth-success', function() {
    advanceDayBucketsIfNeeded().catch(function(e) { console.warn("[sdr.service]", e.message || e) })
  })

  // ── Helper: atualizar phase do lead no localStorage ──────────
  // Delega leitura para ClinicLeadsCache (espelho do LeadsService.getLocal)
  // e escrita para store.set, mantendo timestamp LWW _ts_clinicai_leads.
  function _updateLeadPhaseLocal(leadId, newPhase) {
    try {
      var leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      var idx = leads.findIndex(function(l) { return l.id === leadId })
      if (idx >= 0) {
        leads[idx].phase = newPhase
        if (window.store && typeof window.store.set === 'function') {
          window.store.set('clinicai_leads', leads)
        } else {
          localStorage.setItem('clinicai_leads', JSON.stringify(leads))
        }
      }
    } catch (e) { /* graceful */ }
  }

  // ── onLeadScheduled — hook unificado pos-agendamento ─────────
  // Ponto unico chamado ao criar agendamento para um lead.
  // Centraliza: interacao, regras, pipeline, tudo aqui.
  async function onLeadScheduled(leadId, apptData) {
    if (!leadId) return

    var repo = _repo()
    if (!repo) return

    var desc = 'Agendamento criado'
    if (apptData) {
      var parts = []
      if (apptData.data) parts.push(apptData.data)
      if (apptData.horaInicio) parts.push('as ' + apptData.horaInicio)
      if (apptData.profissionalNome) parts.push('com ' + apptData.profissionalNome)
      if (parts.length) desc += ': ' + parts.join(' ')
    }

    // 1. Atualizar fase no localStorage (espelho do trigger SQL)
    _updateLeadPhaseLocal(leadId, 'agendado')

    // 2. Registrar interacao no historico do lead
    repo.addInteraction(leadId, 'system', desc, 'scheduled', 'outbound').catch(function(e) { console.warn("[sdr.service]", e.message || e) })

    // 3. Disparar rules engine para phase_changed → agendado
    if (window.RulesService) {
      RulesService.evaluateRules(leadId, 'phase_changed', { to_phase: 'agendado' }).catch(function(e) { console.warn("[sdr.service]", e.message || e) })
    }
  }

  // ── onLeadAttended — hook unificado pos-comparecimento ──────
  async function onLeadAttended(leadId) {
    if (!leadId || !_repo()) return

    // Atualizar fase no localStorage
    _updateLeadPhaseLocal(leadId, 'compareceu')

    // Registrar interacao
    _repo().addInteraction(leadId, 'system', 'Paciente compareceu a consulta', 'attended', null).catch(function(e) { console.warn("[sdr.service]", e.message || e) })

    // Disparar regras
    if (window.RulesService) {
      RulesService.evaluateRules(leadId, 'phase_changed', { to_phase: 'compareceu' }).catch(function(e) { console.warn("[sdr.service]", e.message || e) })
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.SdrService = Object.freeze({
    assignTag,
    removeTag,
    getTags,
    getTagsBulk,
    setTemperature,
    setPriority,
    changePhase,
    getPhaseHistory,
    moveLead,
    initLeadPipelines,
    getKanban7Dias,
    getKanbanEvolution,
    addInteraction,
    getInteractions,
    advanceDayBucketsIfNeeded,
    onLeadScheduled,
    onLeadAttended,
  })

})()
