/**
 * ClinicAI - Retoques Service
 *
 * Camada de acesso a dados para retoque_campaigns.
 * Conversa exclusivamente com Supabase via RPCs definidas na migration
 * 20260700000150_retoque_campaigns.sql.
 *
 * Expoe window.RetoquesService:
 *   create(payload)                  -> Promise<id>
 *   updateStatus(id, status, notes)  -> Promise<bool>
 *   linkAppointment(id, apptId)      -> Promise<bool>
 *   list(filters)                    -> Promise<Array>
 *   findByLead(leadId)               -> Promise<Array>
 *   findActiveByLead(leadId)         -> Promise<Array>
 *
 * Graceful: se Supabase offline, retorna [] ou false; nao lanca para o caller.
 * Mutacoes lancam Error para o caller decidir feedback.
 */
;(function () {
  'use strict'

  if (window._retoquesServiceLoaded) return
  window._retoquesServiceLoaded = true

  function _sb() {
    return window._sbShared || (window.supabaseClient || null)
  }

  function _norm(rows) {
    return Array.isArray(rows) ? rows : (rows ? [rows] : [])
  }

  var RetoquesService = {
    /**
     * Cria nova sugestao. Payload espera:
     *   { leadId, leadName, leadPhone, sourceAppointmentId,
     *     procedureLabel, professionalId, professionalName,
     *     offsetDays, notes }
     */
    create: function (p) {
      var sb = _sb()
      if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
      return sb.rpc('retoque_create', {
        p_lead_id:               p.leadId,
        p_lead_name:             p.leadName || null,
        p_lead_phone:            p.leadPhone || null,
        p_source_appointment_id: p.sourceAppointmentId || null,
        p_procedure_label:       p.procedureLabel,
        p_professional_id:       p.professionalId || null,
        p_professional_name:     p.professionalName || null,
        p_offset_days:           p.offsetDays,
        p_notes:                 p.notes || null,
      }).then(function (res) {
        if (res.error) throw res.error
        return res.data
      })
    },

    updateStatus: function (id, newStatus, notes) {
      var sb = _sb()
      if (!sb) return Promise.resolve(false)
      return sb.rpc('retoque_update_status', {
        p_campaign_id: id,
        p_new_status:  newStatus,
        p_notes:       notes || null,
      }).then(function (res) {
        if (res.error) throw res.error
        return !!res.data
      })
    },

    linkAppointment: function (campaignId, appointmentId) {
      var sb = _sb()
      if (!sb) return Promise.resolve(false)
      return sb.rpc('retoque_link_appointment', {
        p_campaign_id:    campaignId,
        p_appointment_id: appointmentId,
      }).then(function (res) {
        if (res.error) throw res.error
        return !!res.data
      })
    },

    /**
     * Lista com filtros opcionais.
     *   filters = { status, leadId, fromDate, toDate }
     */
    list: function (filters) {
      var sb = _sb()
      if (!sb) return Promise.resolve([])
      filters = filters || {}
      return sb.rpc('retoque_list', {
        p_status_filter: filters.status   || null,
        p_lead_id:       filters.leadId   || null,
        p_from_date:     filters.fromDate || null,
        p_to_date:       filters.toDate   || null,
      }).then(function (res) {
        if (res.error) { console.warn('[Retoques] list error:', res.error); return [] }
        return _norm(res.data)
      }).catch(function (e) {
        console.warn('[Retoques] list catch:', e)
        return []
      })
    },

    findByLead: function (leadId) {
      return RetoquesService.list({ leadId: leadId })
    },

    findActiveByLead: function (leadId) {
      return RetoquesService.list({ leadId: leadId }).then(function (all) {
        var active = (window.RetoquesConfig && window.RetoquesConfig.ACTIVE_STATUSES) || ['suggested','contacted','confirmed']
        return all.filter(function (r) { return active.indexOf(r.status) >= 0 })
      })
    },
  }

  window.RetoquesService = RetoquesService
})()
