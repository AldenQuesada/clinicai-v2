/**
 * ClinicAI — Leads Repository
 *
 * Acesso puro ao Supabase para leads/pacientes.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   leads_list(search?, status?, limit?, offset?)
 *   leads_upsert(data jsonb)
 *   leads_delete(id text)
 *   leads_sync_batch(leads jsonb)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiLeadsRepoLoaded) return
  window._clinicaiLeadsRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── listAll ───────────────────────────────────────────────────
  /**
   * Lista leads da clínica com filtros opcionais.
   * @param {object} [opts]
   * @param {string|null} [opts.search]   busca por nome/telefone/email
   * @param {string|null} [opts.status]   filtro de status (null = todos)
   * @param {number}      [opts.limit]
   * @param {number}      [opts.offset]
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function listAll({ search = null, status = null, limit = 2000, offset = 0 } = {}) {
    try {
      const { data, error } = await _sb().rpc('leads_list', {
        p_search: search || null,
        p_status: status || null,
        p_limit:  limit,
        p_offset: offset,
      })
      if (error) return _err(error.message || String(error))
      return _ok(Array.isArray(data) ? data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── upsert ────────────────────────────────────────────────────
  /**
   * Cria ou atualiza um lead.
   * @param {object} leadData  — objeto no formato localStorage
   * @returns {Promise<{ok, data: {id}, error}>}
   */
  async function upsert(leadData) {
    try {
      const { data, error } = await _sb().rpc('leads_upsert', { p_data: leadData })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── remove (soft delete) ──────────────────────────────────────
  /**
   * @param {string} id  — lead ID
   * @returns {Promise<{ok, error}>}
   */
  async function remove(id) {
    try {
      const { data, error } = await _sb().rpc('leads_delete', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migração em lote: envia todos os leads do localStorage para Supabase.
   * Idempotente — seguro para executar múltiplas vezes.
   * @param {object[]} leads  — array do localStorage
   * @returns {Promise<{ok, data: {inserted, updated, errors}, error}>}
   */
  async function syncBatch(leads) {
    try {
      const { data, error } = await _sb().rpc('leads_sync_batch', {
        p_leads: leads,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.LeadsRepository = Object.freeze({
    listAll,
    upsert,
    remove,
    syncBatch,
  })

})()
