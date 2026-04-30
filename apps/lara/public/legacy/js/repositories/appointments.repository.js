/**
 * ClinicAI — Appointments Repository
 *
 * Acesso puro ao Supabase para agendamentos.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   appt_list(date_from, date_to, professional_ids?, limit?, offset?)
 *   appt_upsert(data jsonb)
 *   appt_delete(id text)
 *   appt_sync_batch(appointments jsonb)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiApptRepoLoaded) return
  window._clinicaiApptRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── listForPeriod ─────────────────────────────────────────────
  /**
   * Lista agendamentos de um intervalo de datas.
   * @param {string} dateFrom  YYYY-MM-DD
   * @param {string} dateTo    YYYY-MM-DD
   * @param {object} [opts]
   * @param {string[]|null} [opts.professionalIds]  UUIDs; null = todos visíveis
   * @param {number} [opts.limit]
   * @param {number} [opts.offset]
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function listForPeriod(dateFrom, dateTo, { professionalIds = null, limit = 500, offset = 0 } = {}) {
    try {
      const { data, error } = await _sb().rpc('appt_list', {
        p_date_from:        dateFrom,
        p_date_to:          dateTo,
        p_professional_ids: professionalIds,
        p_limit:            limit,
        p_offset:           offset,
      })
      if (error) return _err(error.message || String(error))
      return _ok(Array.isArray(data) ? data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── upsert ────────────────────────────────────────────────────
  /**
   * Cria ou atualiza um agendamento.
   * @param {object} apptData  — objeto no formato localStorage (pacienteId, data, etc.)
   * @returns {Promise<{ok, data: {id}, error}>}
   */
  async function upsert(apptData) {
    try {
      const { data, error } = await _sb().rpc('appt_upsert', { p_data: apptData })
      if (error) return _err(error.message || String(error))
      // ═ Patches complementares (RPC principal não conhece esses campos) ═
      if (apptData.id) {
        // 1. Agregados de cortesia (relatórios financeiros)
        if (apptData.valorCortesia > 0 || apptData.qtdProcsCortesia > 0) {
          try {
            await _sb().rpc('appt_set_cortesia', {
              p_id:             apptData.id,
              p_valor_cortesia: apptData.valorCortesia || 0,
              p_motivo:         apptData.motivoCortesia || null,
              p_qtd_procs:      apptData.qtdProcsCortesia || 0,
            })
          } catch (cortErr) { console.warn('[appt] set_cortesia falhou:', cortErr) }
        }
        // 2. Arrays canônicos (procedimentos + pagamentos)
        if (Array.isArray(apptData.procedimentos) || Array.isArray(apptData.pagamentos)) {
          try {
            await _sb().rpc('appt_set_canonical', {
              p_id:            apptData.id,
              p_procedimentos: apptData.procedimentos || [],
              p_pagamentos:    apptData.pagamentos || [],
            })
          } catch (canErr) { console.warn('[appt] set_canonical falhou:', canErr) }
        }
      }
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── listScheduledMessages ─────────────────────────────────────
  /**
   * Lista mensagens WhatsApp enfileiradas para um appointment.
   * Usado pelo modal para mostrar feedback de "confirmação agendada".
   */
  async function listScheduledMessages(apptId) {
    try {
      const { data, error } = await _sb().rpc('wa_outbox_list_for_appt', { p_appt_ref: apptId })
      if (error) return _err(error.message || String(error))
      return _ok(data || [])
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── remove (soft delete) ──────────────────────────────────────
  /**
   * @param {string} id  — appt_... ID
   * @returns {Promise<{ok, error}>}
   */
  async function remove(id) {
    try {
      const { data, error } = await _sb().rpc('appt_delete', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migração em lote: envia todos os agendamentos do localStorage para Supabase.
   * Idempotente — seguro para executar múltiplas vezes.
   * @param {object[]} appointments  — array do localStorage
   * @returns {Promise<{ok, data: {inserted, updated, errors}, error}>}
   */
  async function syncBatch(appointments) {
    try {
      const { data, error } = await _sb().rpc('appt_sync_batch', {
        p_appointments: appointments,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── deleteSeries ──────────────────────────────────────────────
  /**
   * Cancela uma serie inteira de agendamentos recorrentes.
   * @param {string} groupId  — recurrence_group_id
   * @returns {Promise<{ok, data, error}>}
   */
  async function deleteSeries(groupId) {
    if (!groupId) return _err('groupId obrigatorio')
    try {
      const { data, error } = await _sb().rpc('appt_delete_series', { p_group_id: groupId })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── createSeries ──────────────────────────────────────────────
  /**
   * Cria serie recorrente atomica server-side (mig 483).
   * Usado pelo Service.syncSeriesAwait — nao chamar direto da UI.
   * @param {object[]} appts  — array de appointments enriquecidos
   */
  async function createSeries(appts) {
    if (!Array.isArray(appts) || !appts.length) return _err('Array vazio')
    try {
      const { data, error } = await _sb().rpc('appt_create_series', { p_appts: appts })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error || 'Servidor rejeitou serie')
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── enqueueWAReminder ─────────────────────────────────────────
  /**
   * Enfileira mensagens WhatsApp pra um appointment (lembrete + confirmacao).
   * RPC wa_outbox_enqueue_appt internamente respeita gates LGPD (mig 806).
   * @param {object} payload  { p_appt_ref, p_phone, p_lead_id, p_data, p_hora, ... }
   */
  async function enqueueWAReminder(payload) {
    if (!payload || !payload.p_phone) return _err('p_phone obrigatorio')
    try {
      const { data, error } = await _sb().rpc('wa_outbox_enqueue_appt', payload)
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── cancelWAByAppt ────────────────────────────────────────────
  /**
   * Cancela mensagens WhatsApp pendentes pra um appointment (ex: quando
   * paciente cancela ou reagenda).
   */
  async function cancelWAByAppt(apptId) {
    if (!apptId) return _err('apptId obrigatorio')
    try {
      const { data, error } = await _sb().rpc('wa_outbox_cancel_by_appt', { p_appt_ref: apptId })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── scheduleWAAutomation ──────────────────────────────────────
  /**
   * Agenda mensagens automaticas (24h, 1h, consentimento, etc) via wa_outbox.
   * Payload espera as chaves p_phone, p_content, p_lead_id, p_lead_name e
   * pelo menos uma de p_appt_ref ou p_appt_id pra correlacionar.
   */
  async function scheduleWAAutomation(payload) {
    if (!payload || !payload.p_phone) return _err('p_phone obrigatorio')
    if (!payload.p_appt_ref && !payload.p_appt_id) return _err('p_appt_ref ou p_appt_id obrigatorio')
    try {
      const { data, error } = await _sb().rpc('wa_outbox_schedule_automation', payload)
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── tryMarkAutomationSent ─────────────────────────────────────
  /**
   * Marca automacao como enviada (idempotente — protege contra envio duplo).
   */
  async function tryMarkAutomationSent(payload) {
    try {
      const { data, error } = await _sb().rpc('wa_automation_try_mark_sent', payload)
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── listProcedures ────────────────────────────────────────────
  /**
   * Lista procedimentos da clinica (catalogo). Cacheado por sessao
   * idealmente (UI pode fazer cache-fold).
   */
  async function listProcedures() {
    try {
      const { data, error } = await _sb().from('clinic_procedimentos')
        .select('nome,tipo,duracao_min,preco_padrao')
        .eq('ativo', true)
        .order('nome')
      if (error) return _err(error.message || String(error))
      return _ok(data || [])
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── listProceduresWithPartnerPricing ──────────────────────────
  /**
   * Lista procedimentos com pricing partner-aware (VPI).
   */
  async function listProceduresWithPartnerPricing(leadId) {
    try {
      const { data, error } = await _sb().rpc('procedures_with_partner_pricing', { p_lead_id: leadId })
      if (error) return _err(error.message || String(error))
      return _ok(data || [])
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── getPartnerNameByLead ──────────────────────────────────────
  /**
   * Resolve nome da parceira VPI a partir do lead_id (pra exibir em alertas).
   */
  async function getPartnerNameByLead(leadId) {
    if (!leadId) return _ok(null)
    try {
      const { data, error } = await _sb().rpc('vpi_get_partner_name_by_lead', { p_lead_id: leadId })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) { return _err(err.message || String(err)) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AppointmentsRepository = Object.freeze({
    // Core CRUD
    listForPeriod,
    upsert,
    remove,
    syncBatch,
    // Recurrence
    createSeries,
    deleteSeries,
    // WhatsApp queue (Mira/Lara)
    enqueueWAReminder,
    cancelWAByAppt,
    scheduleWAAutomation,
    tryMarkAutomationSent,
    listScheduledMessages,
    // Catalogo
    listProcedures,
    listProceduresWithPartnerPricing,
    // VPI
    getPartnerNameByLead,
  })

})()
