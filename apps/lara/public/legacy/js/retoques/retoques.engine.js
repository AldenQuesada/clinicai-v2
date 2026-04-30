/**
 * ClinicAI - Retoques Engine
 *
 * Regras de negocio do modulo. Camada fina entre Service (dados) e UI (modal).
 *
 * Responsabilidades:
 *   - Decidir se o popup deve aparecer apos finalize (deduplicacao)
 *   - Aplicar tag retoque_sugerido para engatar wa_agenda_automations
 *   - Mostrar feedback visual ao usuario (toast)
 *   - Logar erros sem quebrar o fluxo do finalize (fire-and-forget)
 *
 * NAO faz:
 *   - Acesso direto a Supabase (delega ao Service)
 *   - Renderizacao de DOM (delega ao Modal)
 *   - Edicao de appointments (so leitura via callbacks)
 *
 * Expoe window.RetoquesEngine:
 *   openSuggestionModal(appt)         — entry point chamado do confirmFinalize
 *   createSuggestion(payload)         — usado pelo modal apos confirmacao
 *   shouldOfferSuggestion(appt)       — guard: ja tem retoque ativo?
 */
;(function () {
  'use strict'

  if (window._retoquesEngineLoaded) return
  window._retoquesEngineLoaded = true

  function _toast(msg, type) {
    if (window.toast) return window.toast(msg, type || 'info')
    if (window.showToast) return window.showToast(msg, type || 'info')
    console.log('[Retoques toast]', type, msg)
  }

  function _extractProcedureLabel(appt) {
    if (!appt) return 'Procedimento'
    if (Array.isArray(appt.procedimentos) && appt.procedimentos.length) {
      return appt.procedimentos.map(function (p) {
        return (typeof p === 'string') ? p : (p.nome || p.label || p.id || '')
      }).filter(Boolean).join(' + ') || 'Procedimento'
    }
    return appt.procedimento || appt.tipo || appt.titulo || 'Procedimento'
  }

  function _extractLeadInfo(appt) {
    return {
      leadId:    appt.pacienteId || appt.paciente_id || appt.leadId || appt.lead_id,
      leadName:  appt.paciente   || appt.pacienteNome || appt.lead_name || appt.nome,
      leadPhone: appt.telefone   || appt.phone       || appt.lead_phone,
    }
  }

  function _extractProfessional(appt) {
    return {
      professionalId:   appt.profissionalId   || appt.professional_id   || null,
      professionalName: appt.profissional     || appt.professional_name || appt.profissionalNome || null,
    }
  }

  // Status finalizados aceitos — enum defensivo para evitar guard silencioso (H5).
  var DONE_STATUSES = ['finalizado', 'concluido', 'concluído', 'completed', 'realizado']
  function _isDone(appt) {
    if (!appt || !appt.status) return false
    return DONE_STATUSES.indexOf(String(appt.status).toLowerCase().trim()) >= 0
  }

  var RetoquesEngine = {
    /**
     * Verifica se ja existe retoque ativo para o paciente. Se existe, retorna
     * { ok:false, reason, existing } para a UI dar feedback ao inves de silencio.
     * Resolve com { ok:true } quando deve oferecer.
     */
    shouldOfferSuggestion: function (appt) {
      if (!appt) return Promise.resolve({ ok: false, reason: 'no_appointment' })
      var info = _extractLeadInfo(appt)
      if (!info.leadId) return Promise.resolve({ ok: false, reason: 'no_lead' })
      if (!window.RetoquesService) return Promise.resolve({ ok: true })
      var currentProc = String(_extractProcedureLabel(appt) || '').toLowerCase().trim()
      return window.RetoquesService.findActiveByLead(info.leadId).then(function (active) {
        if (!Array.isArray(active) || !active.length) return { ok: true }
        // Janela de deduplicacao: bloqueia apenas se ha retoque ATIVO do MESMO procedimento
        // nos ultimos 7 dias. Procedimentos diferentes podem coexistir.
        var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
        var now = Date.now()
        var blocking = active.find(function (r) {
          var label = String(r.procedure_label || r.procedureLabel || '').toLowerCase().trim()
          if (label !== currentProc) return false
          var created = r.created_at || r.createdAt
          if (!created) return true // sem data -> assume recente
          var dt = new Date(created).getTime()
          if (isNaN(dt)) return true
          return (now - dt) < SEVEN_DAYS
        })
        if (blocking) return { ok: false, reason: 'existing_same_procedure', existing: blocking }
        return { ok: true }
      }).catch(function () { return { ok: true } })
    },

    /**
     * Entry point chamado do confirmFinalize. Fire-and-forget — nunca quebra
     * o finalize, mesmo se o modal/service falhar.
     */
    openSuggestionModal: function (appt) {
      try {
        if (!_isDone(appt)) return
        if (!window.RetoquesModal || !window.RetoquesModal.open) {
          console.warn('[RetoquesEngine] Modal nao carregado')
          return
        }
        RetoquesEngine.shouldOfferSuggestion(appt).then(function (res) {
          if (res && res.ok === false) {
            // Feedback explicito em vez de silencio (C4 / growth-retoques review)
            if (res.reason === 'existing_same_procedure') {
              var dtLabel = ''
              try {
                var ex = res.existing || {}
                var dt = ex.target_date || ex.targetDate || ex.due_date
                if (dt) dtLabel = ' em ' + new Date(dt).toLocaleDateString('pt-BR')
              } catch (_) {}
              _toast('Ja existe retoque ativo para este procedimento' + dtLabel + '.', 'info')
            }
            return
          }
          window.RetoquesModal.open(appt, function (selection) {
            if (!selection || selection.skipped) return
            RetoquesEngine.createSuggestion(appt, selection)
          })
        }).catch(function (e) { console.warn('[RetoquesEngine] shouldOffer error:', e) })
      } catch (e) { console.warn('[RetoquesEngine] openSuggestionModal error:', e) }
    },

    /**
     * Cria a sugestao no banco + aplica tag para engatar mensageria.
     * Retorna Promise pra modal mostrar feedback, mas nao bloqueia finalize.
     */
    createSuggestion: function (appt, selection) {
      if (!window.RetoquesService) {
        _toast('Servico de retoques indisponivel', 'warn')
        return Promise.resolve(null)
      }
      var lead = _extractLeadInfo(appt)
      var prof = _extractProfessional(appt)
      var payload = {
        leadId:               lead.leadId,
        leadName:             lead.leadName,
        leadPhone:            lead.leadPhone,
        sourceAppointmentId:  appt.id || appt.appointment_id || null,
        procedureLabel:       _extractProcedureLabel(appt),
        professionalId:       prof.professionalId,
        professionalName:     prof.professionalName,
        offsetDays:           selection.offsetDays,
        notes:                selection.notes || null,
      }

      return window.RetoquesService.create(payload).then(function (id) {
        _toast('Retoque sugerido para ' + selection.offsetDays + ' dias', 'success')
        // Aplica tag para engatar wa_agenda_automations (se houver regra
        // configurada com trigger on_tag = retoque_sugerido).
        try {
          var tag = (window.RetoquesConfig && window.RetoquesConfig.TAG_SUGGESTED) || 'retoque_sugerido'
          if (window.TagEngine && window.TagEngine.applyTag && lead.leadId) {
            window.TagEngine.applyTag(lead.leadId, 'paciente', tag, 'retoque_engine', {
              nome: lead.leadName,
              dias: selection.offsetDays,
              data_alvo: new Date(Date.now() + selection.offsetDays * 86400000).toISOString().slice(0, 10),
              procedimento: payload.procedureLabel,
            })
          }
        } catch (e) { console.warn('[RetoquesEngine] tag apply failed:', e) }
        return id
      }).catch(function (e) {
        console.error('[RetoquesEngine] create failed:', e)
        _toast('Falha ao salvar sugestao de retoque', 'error')
        return null
      })
    },
  }

  window.RetoquesEngine = RetoquesEngine
})()
