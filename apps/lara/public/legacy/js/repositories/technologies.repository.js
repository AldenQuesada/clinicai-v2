;(function () {
  'use strict'
  if (window._clinicaiTechRepoLoaded) return
  window._clinicaiTechRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll() {
    try {
      const { data, error } = await _sb().rpc('get_technologies')
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert({ id, nome, categoria, fabricante, modelo, descricao, ano, investimento, ponteiras, sala_id }) {
    try {
      const { data, error } = await _sb().rpc('upsert_technology', {
        p_id:          id          ?? null,
        p_nome:        nome        ?? null,
        p_categoria:   categoria   ?? null,
        p_fabricante:  fabricante  ?? null,
        p_modelo:      modelo      ?? null,
        p_descricao:   descricao   ?? null,
        p_ano:         ano         ?? null,
        p_investimento:investimento ?? null,
        p_ponteiras:   ponteiras   ?? null,
        p_sala_id:     sala_id     ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function setOperadores(professionalId, technologyIds) {
    try {
      const { error } = await _sb().rpc('set_professional_technologies', {
        p_professional_id:  professionalId,
        p_technology_ids:   technologyIds,
      })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function setOperadoresByTech(techId, profIds) {
    try {
      const { data, error } = await _sb().rpc('set_technology_operators', {
        p_technology_id:    techId,
        p_professional_ids: profIds,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_technology', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.TechnologiesRepository = Object.freeze({ getAll, upsert, setOperadores, setOperadoresByTech, softDelete })
})()
