;(function () {
  'use strict'
  if (window._clinicaiInjetaveisRepoLoaded) return
  window._clinicaiInjetaveisRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll(apenasAtivos = true) {
    try {
      const { data, error } = await _sb().rpc('get_injetaveis', {
        p_apenas_ativos: apenasAtivos,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(inj) {
    try {
      const { data, error } = await _sb().rpc('upsert_injetavel', {
        p_id:                   inj.id                   ?? null,
        p_nome:                 inj.nome                 ?? null,
        p_categoria:            inj.categoria            ?? null,
        p_fabricante:           inj.fabricante            ?? null,
        p_apresentacao:         inj.apresentacao          ?? null,
        p_unidade:              inj.unidade               ?? null,
        p_custo_unit:           inj.custo_unit            ?? null,
        p_preco:                inj.preco                 ?? null,
        p_margem:               inj.margem                ?? null,
        p_duracao:              inj.duracao               ?? null,
        p_downtime:             inj.downtime              ?? null,
        p_areas:                inj.areas                 ?? [],
        p_indicacoes:           inj.indicacoes            ?? [],
        p_contraindicacoes:     inj.contraindicacoes      ?? [],
        p_cuidados_pre:         inj.cuidados_pre          ?? [],
        p_cuidados_pos:         inj.cuidados_pos          ?? [],
        p_observacoes:          inj.observacoes           ?? null,
        p_estoque_qtd:          inj.estoque_qtd           ?? 0,
        p_estoque_alerta:       inj.estoque_alerta        ?? 0,
        p_ativo:                inj.ativo                 ?? true,
        p_riscos_complicacoes:  inj.riscos_complicacoes   ?? [],
        p_texto_consentimento:  inj.texto_consentimento   ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_injetavel', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function updateEstoque(id, delta) {
    try {
      const { data, error } = await _sb().rpc('update_estoque_injetavel', {
        p_id:        id,
        p_qtd_delta: delta,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.InjetaveisRepository = Object.freeze({ getAll, upsert, softDelete, updateEstoque })
})()
