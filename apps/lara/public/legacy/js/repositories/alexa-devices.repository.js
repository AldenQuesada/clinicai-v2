;(function () {
  'use strict'
  if (window._clinicaiAlexaDevicesRepoLoaded) return
  window._clinicaiAlexaDevicesRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client nao inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data: data, error: null  } }
  function _err(error){ return { ok: false, data: null, error: error } }

  async function getAll() {
    try {
      var res = await _sb().rpc('get_alexa_devices', {})
      if (res.error) return _err(res.error.message || String(res.error))
      var body = res.data
      if (body && body.ok) return _ok(body.data ?? [])
      return _err((body && body.error) || 'Resposta inesperada')
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(device) {
    try {
      var res = await _sb().rpc('upsert_alexa_device', {
        p_id:              device.id              ?? null,
        p_device_name:     device.device_name     ?? null,
        p_room_id:         device.room_id         ?? null,
        p_professional_id: device.professional_id ?? null,
        p_location_label:  device.location_label  ?? null,
        p_is_active:       device.is_active       ?? true,
      })
      if (res.error) return _err(res.error.message || String(res.error))
      var body = res.data
      if (body && body.ok) return _ok(body.data)
      return _err((body && body.error) || 'Erro ao salvar')
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function remove(id) {
    try {
      var res = await _sb().rpc('delete_alexa_device', { p_id: id })
      if (res.error) return _err(res.error.message || String(res.error))
      var body = res.data
      if (body && body.ok) return _ok(null)
      return _err((body && body.error) || 'Erro ao excluir')
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.AlexaDevicesRepository = Object.freeze({ getAll: getAll, upsert: upsert, remove: remove })
})()
