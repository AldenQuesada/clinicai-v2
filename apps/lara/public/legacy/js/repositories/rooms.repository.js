;(function () {
  'use strict'
  if (window._clinicaiRoomsRepoLoaded) return
  window._clinicaiRoomsRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll() {
    try {
      const { data, error } = await _sb().rpc('get_rooms')
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert({ id, nome, descricao, alexa_device_name }) {
    try {
      const { data, error } = await _sb().rpc('upsert_room', {
        p_id:                id                ?? null,
        p_nome:              nome              ?? null,
        p_descricao:         descricao         ?? null,
        p_alexa_device_name: alexa_device_name ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_room', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.RoomsRepository = Object.freeze({ getAll, upsert, softDelete })
})()
