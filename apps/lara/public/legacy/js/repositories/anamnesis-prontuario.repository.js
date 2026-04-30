/**
 * ClinicAI — Anamnesis-Prontuário Repository (Sprint 6-D)
 *
 * Acesso puro ao Supabase para o vínculo anamnese ↔ prontuário.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   mr_get_anamnesis_link(response_id uuid)
 *     → Retorna o registro de prontuário gerado para uma resposta de anamnese
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiAnmPronRepoLoaded) return
  window._clinicaiAnmPronRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── getLink ───────────────────────────────────────────────────
  /**
   * Verifica se existe um registro de prontuário vinculado a uma
   * resposta de anamnese. Usado pela UI para exibir badges e links.
   *
   * @param {string} responseId  — UUID da anamnesis_response
   * @returns {Promise<{ok, data: {linked, recordId?, patientId?, title?, createdAt?}, error}>}
   */
  async function getLink(responseId) {
    try {
      const { data, error } = await _sb().rpc('mr_get_anamnesis_link', {
        p_response_id: responseId,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AnamnesisProntuarioRepository = Object.freeze({ getLink })

})()
