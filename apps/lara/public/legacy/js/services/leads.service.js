/**
 * ClinicAI — Leads Service (Sprint 6-B)
 *
 * Camada de negócio para leads/pacientes.
 * Gerencia sincronização bidirecional Supabase ↔ localStorage.
 * Graceful degradation: funciona offline (só localStorage).
 *
 * Depende de:
 *   LeadsRepository  (leads.repository.js)
 *
 * API pública (window.LeadsService):
 *   loadAll()          — Supabase → merge localStorage → retorna array
 *   syncOne(lead)      — fire-and-forget: push único para Supabase
 *   softDelete(id)     — fire-and-forget: soft delete no Supabase
 *   syncBatch()        — migração completa localStorage → Supabase
 *   getLocal()         — lê localStorage sem rede (para offline/overview)
 *
 * Padrão de sync:
 *   • localStorage é escrito SEMPRE primeiro via store.set() em leads.js
 *   • Supabase é chamado como fire-and-forget (não bloqueia UI)
 *   • loadAll() é chamado no init para trazer dados de outros dispositivos
 *   • Conflito: Supabase ganha (fonte de verdade multi-dispositivo)
 *   • Dual-write: store.set() → clinic_data (legado) E LeadsService → leads (nova tabela)
 */

;(function () {
  'use strict'

  if (window._clinicaiLeadsServiceLoaded) return
  window._clinicaiLeadsServiceLoaded = true

  const LEADS_KEY = 'clinicai_leads'

  // ── Helpers de acesso ─────────────────────────────────────────
  function _repo() { return window.LeadsRepository || null }

  // ── localStorage helpers ──────────────────────────────────────
  function _readLocal() {
    try { return JSON.parse(localStorage.getItem(LEADS_KEY) || '[]') } catch { return [] }
  }

  function _writeLocal(arr) {
    try {
      localStorage.setItem(LEADS_KEY, JSON.stringify(arr))
      // Atualiza timestamp LWW usado pelo store.set (sem disparar sbSave duplo)
      localStorage.setItem(`_ts_${LEADS_KEY}`, new Date().toISOString())
    } catch (e) {
      if (e.name !== 'QuotaExceededError') console.warn('[LeadsService] localStorage:', e)
    }
  }

  // ── loadAll ───────────────────────────────────────────────────
  /**
   * Busca todos os leads no Supabase e mescla com localStorage.
   * Supabase ganha em caso de conflito (fonte de verdade multi-dispositivo).
   * Usa cache local como fallback se Supabase indisponível.
   *
   * @returns {Promise<object[]>}  array mesclado (mesmo formato localStorage)
   */
  // Achata um registro que pode estar no formato {data:{...}, updated_at}
  function _flatten(r) {
    if (r && r.data && typeof r.data === 'object' && !Array.isArray(r.data) && !r.id) {
      return { ...r.data, _sb_updated_at: r.updated_at }
    }
    return r
  }

  async function loadAll() {
    const repo  = _repo()
    const local = _readLocal().map(_flatten)

    if (!repo) return local

    const result = await repo.listAll()

    if (!result.ok) {
      console.warn('[LeadsService] Supabase indisponível, usando localStorage:', result.error)
      return local
    }

    // Achata registros do Supabase: { data: {...}, updated_at } → objeto flat
    const remote = result.data.map(_flatten)

    if (!remote.length) {
      // Nenhum dado no Supabase — retorna local (primeira vez ou clínica nova)
      return local
    }

    // Mescla: Supabase ganha por ID; registros locais ausentes no remote são mantidos
    const remoteById = {}
    remote.forEach(r => { remoteById[r.id] = r })

    const merged = [
      // Registros remotos (Supabase ganha)
      ...remote,
      // Registros locais que NÃO existem no Supabase (ainda não sincronizados)
      // Exclui leads soft-deletados ou marcados pra remocao (sumiram do remote por isso)
      ...local.filter(l => !remoteById[l.id] && !l.deleted_at && l.is_active !== false && l.active !== false),
    ]

    // Normalizar todos os leads (phase, temperature, source_type, created_at)
    if (window.normalizeLead) merged.forEach(normalizeLead)

    _writeLocal(merged)
    return merged
  }

  // ── Sync Queue (retry para falhas) ────────────────────────────
  var _SYNC_QUEUE_KEY = 'clinicai_leads_sync_queue'

  function _getSyncQueue() {
    try { return JSON.parse(localStorage.getItem(_SYNC_QUEUE_KEY) || '[]') } catch { return [] }
  }

  function _saveSyncQueue(q) {
    try { localStorage.setItem(_SYNC_QUEUE_KEY, JSON.stringify(q)) } catch {}
  }

  function _addToSyncQueue(leadId) {
    var q = _getSyncQueue()
    if (q.indexOf(leadId) === -1) { q.push(leadId); _saveSyncQueue(q) }
  }

  function _removeFromSyncQueue(leadId) {
    var q = _getSyncQueue().filter(function(id) { return id !== leadId })
    _saveSyncQueue(q)
  }

  async function _processSyncQueue() {
    var repo = _repo()
    if (!repo) return
    var q = _getSyncQueue()
    if (!q.length) return

    var local = _readLocal()
    var localById = {}
    local.forEach(function(l) { localById[l.id] = l })

    var failed = []
    for (var i = 0; i < q.length; i++) {
      var lead = localById[q[i]]
      if (!lead) continue
      try {
        var result = await repo.upsert(lead)
        if (!result.ok) failed.push(q[i])
      } catch {
        failed.push(q[i])
      }
    }
    _saveSyncQueue(failed)
    if (q.length - failed.length > 0) {
      console.info('[LeadsService] Sync queue: ' + (q.length - failed.length) + ' sincronizados, ' + failed.length + ' pendentes')
    }
  }

  // ── syncOne ───────────────────────────────────────────────────
  /**
   * Envia um lead para o Supabase.
   * Se falhar, adiciona a fila de retry para processar no proximo login.
   *
   * @param {object} lead  — lead no formato localStorage
   */
  function syncOne(lead) {
    const repo = _repo()
    if (!repo || !lead?.id) return

    repo.upsert(lead).then(function(result) {
      if (result && result.ok) {
        _removeFromSyncQueue(lead.id)
      } else {
        _addToSyncQueue(lead.id)
      }
    }).catch(function() {
      _addToSyncQueue(lead.id)
    })
  }

  // ── softDelete ────────────────────────────────────────────────
  /**
   * Dispara soft delete no Supabase (fire-and-forget).
   *
   * @param {string} id  — lead ID
   */
  function softDelete(id) {
    const repo = _repo()
    if (!repo || !id) return

    repo.remove(id).catch(err => {
      console.warn('[LeadsService] softDelete falhou silenciosamente:', err)
    })
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migra TODOS os leads do localStorage para Supabase.
   * Idempotente. Destinado à execução única na primeira integração.
   *
   * @returns {Promise<{ok, inserted, updated, errors, error?}>}
   */
  async function syncBatch() {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    const local = _readLocal()
    if (!local.length) return { ok: true, inserted: 0, updated: 0, errors: 0 }

    const result = await repo.syncBatch(local)
    if (!result.ok) return { ok: false, error: result.error }

    return { ok: true, ...result.data }
  }

  // ── getLocal ──────────────────────────────────────────────────
  /**
   * Lê leads do localStorage sem chamada de rede.
   * Usado por módulos que precisam de acesso síncrono (agenda-overview, etc.).
   *
   * @returns {object[]}
   */
  function getLocal() {
    return _readLocal()
  }

  // ── Auto-init: carrega ao autenticar ──────────────────────────
  document.addEventListener('clinicai:auth-success', () => {
    // Carrega leads do Supabase em background para popular localStorage
    loadAll().catch(e => console.warn("[leads.service]", e.message || e))
    // Processa fila de retry (leads que falharam sync anterior)
    _processSyncQueue().catch(e => console.warn("[leads.service]", e.message || e))
  })

  // ── Exposição global ──────────────────────────────────────────
  window.LeadsService = Object.freeze({
    loadAll,
    syncOne,
    softDelete,
    syncBatch,
    getLocal,
  })

})()
