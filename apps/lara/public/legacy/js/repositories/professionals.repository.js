;(function () {
  'use strict'
  if (window._clinicaiProfessionalsRepoLoaded) return
  window._clinicaiProfessionalsRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll() {
    try {
      const { data, error } = await _sb().rpc('get_professionals')
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(prof) {
    try {
      const { data, error } = await _sb().rpc('upsert_professional', {
        p_id:           prof.id           ?? null,
        p_display_name: prof.display_name ?? null,
        p_specialty:    prof.specialty    ?? null,
        p_crm:          prof.crm          ?? null,
        p_color:        prof.color        ?? null,
        p_bio:          prof.bio          ?? null,
        p_telefone:     prof.telefone     ?? null,
        p_whatsapp:     prof.whatsapp     ?? null,
        p_cpf:          prof.cpf          ?? null,
        p_nascimento:   prof.nascimento   ?? null,
        p_endereco:     prof.endereco     ?? null,
        p_horarios:     prof.horarios     ?? null,
        p_skills:       prof.skills       ?? null,
        p_contrato:     prof.contrato     ?? null,
        p_salario:      prof.salario      ?? null,
        p_nivel:        prof.nivel        ?? null,
        p_cargo:        prof.cargo        ?? null,
        p_commissions:  prof.commissions  ?? null,
        p_goals:        prof.goals        ?? null,
        p_observacoes:  prof.observacoes  ?? null,
        p_sala_id:      prof.sala_id      ?? null,
        p_user_id:      prof.user_id      ?? null,
        p_valor_consulta: prof.valor_consulta ?? null,
        p_email:        prof.email        ?? null,
        p_agenda_enabled: prof.agenda_enabled ?? null,
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
        p_professional_id: professionalId,
        p_technology_ids:  technologyIds,
      })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_professional', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.ProfessionalsRepository = Object.freeze({ getAll, upsert, setOperadores, softDelete })
})()
