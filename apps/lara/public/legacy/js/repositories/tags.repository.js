/**
 * ClinicAI — Tags Repository
 *
 * Acesso puro ao Supabase para consultas de tags e atribuições.
 * Zero lógica de negócio — apenas chamadas .from() com retorno normalizado.
 *
 * Tabelas acessadas:
 *   tags             — definições de tags (slug, label, entity_type, etc.)
 *   tag_assignments  — vínculos tag ↔ entidade
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiTagsRepoLoaded) return
  window._clinicaiTagsRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)  { return { ok: true,  data: data,  error: null  } }
  function _err(e)    { return { ok: false, data: null,  error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }

  // ── getTagBySlug ──────────────────────────────────────────────
  /**
   * Busca uma tag pelo slug, retornando apenas id.
   * @param {string} slug
   * @returns {Promise<{ok, data: {id}|null, error}>}
   */
  async function getTagBySlug(slug) {
    try {
      var { data, error } = await _sb()
        .from('tags')
        .select('id')
        .eq('slug', slug)
        .single()
      if (error) return _err(error)
      return _ok(data || null)
    } catch (e) { return _err(e) }
  }

  // ── getEntityIdsByTag ─────────────────────────────────────────
  /**
   * Retorna todos os entity_ids que possuem uma tag específica.
   * @param {string} tagId
   * @param {string} entityType  — 'lead' | 'patient' | etc.
   * @returns {Promise<{ok, data: string[], error}>}
   */
  async function getEntityIdsByTag(tagId, entityType) {
    try {
      var { data, error } = await _sb()
        .from('tag_assignments')
        .select('entity_id')
        .eq('tag_id', tagId)
        .eq('entity_type', entityType)
      if (error) return _err(error)
      return _ok((data || []).map(function (r) { return r.entity_id }))
    } catch (e) { return _err(e) }
  }

  // ── listLeadTags ──────────────────────────────────────────────
  /**
   * Lista tags ativas do tipo lead (para popular selects de filtro).
   * Exclui tags de categoria 'temperatura'.
   * @returns {Promise<{ok, data: {slug, label}[], error}>}
   */
  async function listLeadTags() {
    try {
      var { data, error } = await _sb()
        .from('tags')
        .select('slug, label')
        .eq('entity_type', 'lead')
        .neq('category', 'temperatura')
        .eq('is_active', true)
        .order('label', { ascending: true })
      if (error) return _err(error)
      return _ok(data || [])
    } catch (e) { return _err(e) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.TagsRepository = Object.freeze({
    getTagBySlug,
    getEntityIdsByTag,
    listLeadTags,
  })

})()
