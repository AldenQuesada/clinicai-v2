;(function () {
  'use strict'
  if (window._clinicaiProcedimentosRepoLoaded) return
  window._clinicaiProcedimentosRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll(apenasAtivos = true) {
    try {
      const { data, error } = await _sb().rpc('get_procedimentos', {
        p_apenas_ativos: apenasAtivos,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(proc) {
    try {
      const { data, error } = await _sb().rpc('upsert_procedimento', {
        p_id:                   proc.id                   ?? null,
        p_nome:                 proc.nome                 ?? null,
        p_categoria:            proc.categoria            ?? null,
        p_descricao:            proc.descricao            ?? null,
        p_duracao_min:          proc.duracao_min          ?? null,
        p_sessoes:              proc.sessoes              ?? null,
        p_tipo:                 proc.tipo                 ?? null,
        p_preco:                proc.preco                ?? null,
        p_preco_promo:          proc.preco_promo          ?? null,
        p_custo_estimado:       proc.custo_estimado       ?? null,
        p_margem:               proc.margem               ?? null,
        p_combo_sessoes:        proc.combo_sessoes        ?? null,
        p_combo_desconto_pct:   proc.combo_desconto_pct   ?? null,
        p_combo_valor_final:    proc.combo_valor_final    ?? null,
        p_combo_bonus:          proc.combo_bonus          ?? null,
        p_combo_descricao:      proc.combo_descricao      ?? null,
        p_usa_tecnologia:       proc.usa_tecnologia       ?? null,
        p_tecnologia_protocolo: proc.tecnologia_protocolo ?? null,
        p_tecnologia_sessoes:   proc.tecnologia_sessoes   ?? null,
        p_tecnologia_custo:     proc.tecnologia_custo     ?? null,
        p_cuidados_pre:         proc.cuidados_pre         ?? null,
        p_cuidados_pos:         proc.cuidados_pos         ?? null,
        p_contraindicacoes:     proc.contraindicacoes     ?? null,
        p_observacoes:          proc.observacoes          ?? null,
        p_insumos:              proc.insumos              ?? null,
        p_intervalo_sessoes_dias: proc.intervalo_sessoes_dias ?? null,
        p_fases:                proc.fases                ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_procedimento', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.ProcedimentosRepository = Object.freeze({ getAll, upsert, softDelete })
})()
