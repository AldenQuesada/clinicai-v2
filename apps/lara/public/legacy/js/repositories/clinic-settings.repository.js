/**
 * ClinicAI — Clinic Settings Repository
 *
 * Camada de acesso a dados para configurações da clínica.
 * Todos os métodos retornam { ok, data, error }.
 * Não contém lógica de negócio nem cache — isso é responsabilidade
 * do serviço ou do módulo clinic-settings.js.
 *
 * RPCs utilizadas (SECURITY DEFINER — validam permissão no banco):
 *   get_clinic_settings()         — lê configurações da clínica atual
 *   update_clinic_settings(...)   — salva (requer admin ou owner)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton (supabase.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiClinicSettingsRepoLoaded) return
  window._clinicaiClinicSettingsRepoLoaded = true

  // ── Acesso ao cliente Supabase ───────────────────────────────
  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  // ── Normalização de resposta ─────────────────────────────────
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  // ── get() ────────────────────────────────────────────────────
  /**
   * Lê as configurações da clínica atual via RPC.
   * Qualquer membro autenticado pode chamar.
   *
   * @returns {Promise<{ok:boolean, data:object|null, error:string|null}>}
   */
  async function get() {
    try {
      const { data, error } = await _sb().rpc('get_clinic_settings')
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── update() ─────────────────────────────────────────────────
  /**
   * Salva as configurações da clínica.
   * O banco valida que o usuário é admin ou owner.
   * name e fiscal só podem ser alterados pelo owner.
   *
   * @param {object} params
   * @param {string}  [params.name]
   * @param {string}  [params.phone]
   * @param {string}  [params.whatsapp]
   * @param {string}  [params.email]
   * @param {string}  [params.website]
   * @param {string}  [params.description]
   * @param {object}  [params.address]      — { cep, rua, num, comp, bairro, cidade, estado, maps }
   * @param {object}  [params.social]       — { instagram, facebook, tiktok, youtube, linkedin, google }
   * @param {object}  [params.fiscal]       — { cnpj, ie, im, cnae, regime, iss_pct, nfe, ... }
   * @param {object}  [params.operatingHours] — estrutura de horários por dia
   * @param {object}  [params.settings]     — dados ricos (logos, cores, responsáveis, etc.)
   * @returns {Promise<{ok:boolean, data:object|null, error:string|null}>}
   */
  async function update(params) {
    try {
      const { data, error } = await _sb().rpc('update_clinic_settings', {
        p_name:             params.name            ?? null,
        p_phone:            params.phone           ?? null,
        p_whatsapp:         params.whatsapp        ?? null,
        p_email:            params.email           ?? null,
        p_website:          params.website         ?? null,
        p_description:      params.description     ?? null,
        p_address:          params.address         ?? null,
        p_social:           params.social          ?? null,
        p_fiscal:           params.fiscal          ?? null,
        p_operating_hours:  params.operatingHours  ?? null,
        p_settings:         params.settings        ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ─────────────────────────────────────────
  window.ClinicSettingsRepository = Object.freeze({ get, update })

})()
