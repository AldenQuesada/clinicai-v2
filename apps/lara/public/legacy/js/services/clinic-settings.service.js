/**
 * ClinicAI — Clinic Settings Service
 *
 * Lógica de negócio para configurações da clínica.
 * Gerencia sincronização bidirecional entre Supabase e localStorage,
 * com estratégia graceful-degradation: funciona sem Supabase disponível.
 *
 * Depende de:
 *   ClinicSettingsRepository  (clinic-settings.repository.js)
 *   PermissionsService        (permissions.service.js)
 *
 * API pública (window.ClinicSettingsService):
 *   load()           — carrega do Supabase, sincroniza localStorage, retorna dados
 *   save(data)       — salva no localStorage + Supabase (se permissão)
 *   canEdit()        — boolean: usuário pode salvar configurações gerais
 *   canEditOwner()   — boolean: usuário pode alterar nome/dados fiscais (owner only)
 */

;(function () {
  'use strict'

  if (window._clinicaiClinicSettingsServiceLoaded) return
  window._clinicaiClinicSettingsServiceLoaded = true

  const LOCAL_KEY = 'clinicai_clinic_settings'

  // ── Helpers ──────────────────────────────────────────────────

  function _canEdit() {
    const perms = window.PermissionsService
    return perms ? perms.can('settings:edit') : false
  }

  function _canEditOwner() {
    const perms = window.PermissionsService
    return perms ? perms.can('settings:clinic-data') : false
  }

  // Remove chaves com valor vazio/nulo do objeto — evita sobrescrever com vazio no Supabase
  function _compactObj(obj) {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue
      if (typeof v === 'string' && v === '') continue
      out[k] = v
    }
    return Object.keys(out).length ? out : null
  }

  function _localGet() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') } catch { return {} }
  }

  function _localSet(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)) } catch (_) {}
  }

  // ── Mapeamento Supabase → localStorage ───────────────────────
  // Converte o formato flat do banco para o objeto rico do localStorage.
  function _fromSupabase(row) {
    const addr     = row.address          || {}
    const social   = row.social           || {}
    const fiscal   = row.fiscal           || {}
    const settings = row.settings         || {}
    const hours    = row.operating_hours  || {}

    return {
      // campos de colunas próprias
      nome:               row.name         || '',
      telefone:           row.phone        || '',
      whatsapp:           row.whatsapp     || '',
      email:              row.email        || '',
      site:               row.website      || '',
      descricao:          row.description  || '',
      // endereço
      cep:     addr.cep     || '',
      rua:     addr.rua     || '',
      num:     addr.num     || '',
      comp:    addr.comp    || '',
      bairro:  addr.bairro  || '',
      cidade:  addr.cidade  || '',
      estado:  addr.estado  || '',
      maps:    addr.maps    || '',
      // redes sociais
      instagram: social.instagram || '',
      facebook:  social.facebook  || '',
      tiktok:    social.tiktok    || '',
      youtube:   social.youtube   || '',
      linkedin:  social.linkedin  || '',
      google:    social.google    || '',
      // fiscal
      cnpj:               fiscal.cnpj               || '',
      ie:                 fiscal.ie                 || '',
      im:                 fiscal.im                 || '',
      cnae:               fiscal.cnae               || '',
      regime_tributario:  fiscal.regime_tributario  || '',
      iss_pct:            fiscal.iss_pct            || '',
      nfe:                fiscal.nfe                || '',
      cnaes_secundarios:  fiscal.cnaes_secundarios  || [],
      bancos:             fiscal.bancos             || [],
      // horários de funcionamento
      horarios: hours,
      // dados ricos do jsonb settings
      ...settings,
      // metadado
      _syncedAt: row.updated_at || null,
    }
  }

  // ── Mapeamento localStorage → Supabase ───────────────────────
  function _toSupabase(data) {
    return {
      name:        data.nome        || null,
      phone:       data.telefone    || null,
      whatsapp:    data.whatsapp    || null,
      email:       data.email       || null,
      website:     data.site        || null,
      description: data.descricao   || null,
      address: _compactObj({
        cep:    data.cep,
        rua:    data.rua,
        num:    data.num,
        comp:   data.comp,
        bairro: data.bairro,
        cidade: data.cidade,
        estado: data.estado,
        maps:   data.maps,
      }),
      social: _compactObj({
        instagram: data.instagram,
        facebook:  data.facebook,
        tiktok:    data.tiktok,
        youtube:   data.youtube,
        linkedin:  data.linkedin,
        google:    data.google,
      }),
      fiscal: _compactObj({
        cnpj:              data.cnpj,
        ie:                data.ie,
        im:                data.im,
        cnae:              data.cnae,
        regime_tributario: data.regime_tributario,
        iss_pct:           data.iss_pct,
        nfe:               data.nfe,
        cnaes_secundarios: data.cnaes_secundarios,
        bancos:            data.bancos,
      }),
      operatingHours: data.horarios || null,
      // settings jsonb: dados ricos que não têm coluna própria
      settings: _compactObj({
        tipo:                data.tipo,
        especialidade:       data.especialidade,
        funcionarios:        data.funcionarios,
        data_fundacao:       data.data_fundacao,
        cardapio:            data.cardapio,
        duracao_padrao:      data.duracao_padrao,
        intervalo_consulta:  data.intervalo_consulta,
        antecedencia_min:    data.antecedencia_min,
        limite_agendamento:  data.limite_agendamento,
        politica_cancelamento: data.politica_cancelamento,
        termos_consentimento:  data.termos_consentimento,
        msg_boas_vindas:     data.msg_boas_vindas,
        fuso_horario:        data.fuso_horario || 'America/Sao_Paulo',
        moeda:               data.moeda        || 'BRL',
        formato_data:        data.formato_data  || 'dd/MM/yyyy',
        observacoes_internas: data.observacoes_internas,
        notif_confirmacao:   !!data.notif_confirmacao,
        notif_lembrete24:    !!data.notif_lembrete24,
        notif_lembrete1h:    !!data.notif_lembrete1h,
        responsaveis:        data.responsaveis || [],
        cores:               data.cores        || [],
        logos:               data.logos        || [],
      }),
    }
  }

  // ── load() ───────────────────────────────────────────────────
  /**
   * Carrega configurações: tenta Supabase → sincroniza localStorage.
   * Se Supabase falhar, retorna o que há no localStorage.
   *
   * @returns {Promise<object>} dados mesclados
   */
  async function load() {
    const repo = window.ClinicSettingsRepository
    if (!repo) {
      // Fallback puro localStorage
      return _localGet()
    }

    const result = await repo.get()
    if (!result.ok) {
      console.warn('[ClinicSettingsService] Supabase indisponível, usando localStorage:', result.error)
      return _localGet()
    }

    // Supabase retornou — converte e mescla sobre o localStorage
    const fromSB  = _fromSupabase(result.data)
    const local   = _localGet()

    // Supabase vence apenas quando tem valor real; localStorage completa o resto
    // Evita apagar dados locais quando Supabase retorna campos vazios/nulos
    const merged = { ...local }
    for (const [key, val] of Object.entries(fromSB)) {
      const isEmpty = val === '' || val === null || val === undefined
        || (Array.isArray(val) && val.length === 0)
        || (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0)
      if (!isEmpty) merged[key] = val
    }
    _localSet(merged)
    return merged
  }

  // ── save() ───────────────────────────────────────────────────
  /**
   * Salva as configurações.
   * 1. Sempre persiste no localStorage.
   * 2. Se PermissionsService.can('settings:edit') → envia ao Supabase.
   * 3. Se falhar no Supabase, mantém localStorage (não perde dados).
   *
   * @param {object} data
   * @returns {Promise<{ok:boolean, synced:boolean, error:string|null}>}
   */
  async function save(data) {
    // 1. localStorage sempre
    _localSet(data)

    // 2. Verifica permissão antes de tentar Supabase
    if (!_canEdit()) {
      return { ok: true, synced: false, error: null }
    }

    const repo = window.ClinicSettingsRepository
    if (!repo) {
      return { ok: true, synced: false, error: null }
    }

    // 3. Monta payload — remove campos exclusivos de owner se não for owner
    const payload = _toSupabase(data)
    if (!_canEditOwner()) {
      payload.name   = null  // não altera nome
      payload.fiscal = null  // não altera dados fiscais
    }

    const result = await repo.update(payload)
    if (!result.ok) {
      console.warn('[ClinicSettingsService] Falha ao sincronizar com Supabase:', result.error)
      return { ok: true, synced: false, error: result.error }
    }

    return { ok: true, synced: true, error: null }
  }

  // ── Exposição de helpers de permissão ────────────────────────
  function canEdit()      { return _canEdit()      }
  function canEditOwner() { return _canEditOwner() }

  // ── Exposição global ─────────────────────────────────────────
  window.ClinicSettingsService = Object.freeze({ load, save, canEdit, canEditOwner })

})()
