/**
 * ClinicAI — Birthday Service
 *
 * Logica de negocio + cache para campanhas de aniversario.
 * Padrao IIFE com cache em memoria, sync `get()`, async `load()`.
 *
 * Depende de: window.BirthdayRepository
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayServiceLoaded) return
  window._clinicaiBirthdayServiceLoaded = true

  var _stats = null
  var _upcoming = []
  var _templates = []
  var _campaigns = []
  var _loaded = false

  // ── Load all data (parallel) ───────────────────────────────

  async function loadAll() {
    var repo = window.BirthdayRepository
    if (!repo) return
    var results = await Promise.all([
      repo.stats(),
      repo.upcoming(60),
      repo.templatesList(),
      repo.list()
    ])
    _stats = results[0].ok ? results[0].data : {}
    _upcoming = results[1].ok && Array.isArray(results[1].data) ? results[1].data : []
    _templates = results[2].ok && Array.isArray(results[2].data) ? results[2].data : []
    _campaigns = results[3].ok && Array.isArray(results[3].data) ? results[3].data : []
    _loaded = true
  }

  // ── Sync getters (from cache) ──────────────────────────────

  function getStats() { return _stats || {} }
  function getUpcoming() { return _upcoming }
  function getTemplates() { return _templates }
  function getCampaigns() { return _campaigns }
  function isLoaded() { return _loaded }

  // ── Template CRUD ──────────────────────────────────────────

  async function saveTemplate(data) {
    var r = await window.BirthdayRepository.templateSave(data)
    if (r.ok) await loadAll()
    return r
  }

  async function deleteTemplate(id) {
    var r = await window.BirthdayRepository.templateDelete(id)
    if (r.ok) await loadAll()
    return r
  }

  async function toggleTemplate(id, active) {
    var t = _templates.find(function (x) { return x.id === id })
    if (!t) return { ok: false }
    return saveTemplate(Object.assign({}, t, { is_active: active }))
  }

  // ── Scanner ────────────────────────────────────────────────

  async function runScan() {
    var repo = window.BirthdayRepository
    var r1 = await repo.scan()
    var r2 = await repo.enqueue()
    await loadAll()
    return {
      campaigns_created: r1.data?.campaigns_created || 0,
      enqueued: r2.data?.enqueued || 0,
      cancelled: r2.data?.cancelled || 0
    }
  }

  async function pauseAll() {
    var r = await window.BirthdayRepository.pauseAll()
    if (r.ok) await loadAll()
    return r
  }

  async function resumeAll() {
    var r = await window.BirthdayRepository.resumeAll()
    if (r.ok) await loadAll()
    return r
  }

  function isPaused() {
    return _stats && _stats.is_paused === true
  }

  async function toggleLead(campaignId, active) {
    var r = await window.BirthdayRepository.toggleLead(campaignId, active)
    if (r.ok) await loadAll()
    return r
  }

  async function autoExclude() {
    var r = await window.BirthdayRepository.autoExclude()
    if (r.ok) await loadAll()
    return r
  }

  // ── Filtered views ─────────────────────────────────────────

  function getCampaignsBySegment(segment) {
    if (!segment) return _campaigns
    return _campaigns.filter(function (c) { return c.segment === segment })
  }

  function getUpcomingWithBudget() {
    return _upcoming.filter(function (u) { return u.has_open_budget })
  }

  function getTemplatesSorted() {
    return _templates.slice().sort(function (a, b) {
      return (a.sort_order - b.sort_order) || (b.day_offset - a.day_offset)
    })
  }

  // ── Helpers ────────────────────────────────────────────────

  function resolveVariables(content, lead) {
    var firstName = (lead.name || lead.lead_name || '').split(' ')[0] || 'você'
    var queixas = (lead.queixas || '').trim()
    var age = lead.age_turning || ''
    var budget = lead.has_open_budget && lead.budget_title
      ? lead.budget_title + ' (R$ ' + (lead.budget_total || 0) + ')'
      : ''
    var txt = content
    txt = txt.split('[nome]').join(firstName)
    txt = txt.split('[Nome]').join(firstName)

    // [queixas] inteligente: se vazio, remove a frase inteira que contem o placeholder
    if (queixas) {
      txt = txt.split('[queixas]').join(queixas)
    } else {
      // Remove linhas que contem [queixas] — a msg funciona sem elas
      txt = txt.split('\n').filter(function (line) {
        return line.indexOf('[queixas]') === -1
      }).join('\n')
      // Limpar linhas duplas vazias
      txt = txt.replace(/\n{3,}/g, '\n\n')
    }

    txt = txt.split('[idade]').join(age.toString())
    txt = txt.split('[orcamento]').join(budget)
    return txt
  }

  // ── Expose ─────────────────────────────────────────────────

  window.BirthdayService = Object.freeze({
    loadAll, getStats, getUpcoming, getTemplates, getCampaigns,
    isLoaded, saveTemplate, deleteTemplate, toggleTemplate, runScan,
    pauseAll, resumeAll, isPaused, toggleLead, autoExclude,
    getCampaignsBySegment, getUpcomingWithBudget, getTemplatesSorted,
    resolveVariables
  })
})()
